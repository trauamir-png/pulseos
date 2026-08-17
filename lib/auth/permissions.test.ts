import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";
import * as permissions from "@/lib/auth/permissions";
import {
  ForbiddenError,
  SiteAccessError,
  canAccessSite,
  getAccessibleSiteIds,
  getPermissionsForSite,
  hasPermission,
  isAdmin,
  requirePermission,
  requireSiteAccess,
} from "@/lib/auth/permissions";

/**
 * These are unit tests of the TS authorization wrapper's contract against a
 * mocked Supabase client -- they verify the wrapper propagates RPC results
 * correctly, fails closed on error, and never bypasses the database's
 * decision itself. They are NOT integration tests of the RLS/SQL functions
 * in supabase/migrations/0012_site_permissions.sql -- this repo has no
 * linked local Postgres/Supabase instance to run those against (see the
 * audit report), so that layer is verified separately, against Production,
 * once the migration has actually been applied.
 */

type RpcHandler = (name: string, args?: Record<string, unknown>) => { data: unknown; error: unknown };
type FakeProfile = { display_name: string; active: boolean; is_admin: boolean };

function fakeSupabase(opts: { rpc?: RpcHandler; user?: { id: string } | null; profile?: FakeProfile | null } = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null } }),
    },
    rpc: async (name: string, args?: Record<string, unknown>) =>
      opts.rpc ? opts.rpc(name, args) : { data: null, error: { message: "no handler configured" } },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.user && opts.profile !== undefined ? opts.profile : null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("isAdmin", () => {
  it("returns true when the database says the current user is Admin", async () => {
    const supabase = fakeSupabase({ rpc: () => ({ data: true, error: null }) });
    expect(await isAdmin(supabase)).toBe(true);
  });

  it("fails closed (false) when the RPC errors, never defaulting to admin access", async () => {
    const supabase = fakeSupabase({ rpc: () => ({ data: null, error: { message: "boom" } }) });
    expect(await isAdmin(supabase)).toBe(false);
  });
});

describe("hasPermission -- Admin bypass", () => {
  it("propagates a true result from has_permission regardless of which permission was asked for", async () => {
    // has_permission's admin short-circuit lives in the SQL function itself
    // (supabase/migrations/0012_site_permissions.sql); this test only checks
    // that the TS wrapper passes the DB's decision through unmodified.
    const supabase = fakeSupabase({ rpc: () => ({ data: true, error: null }) });
    expect(await hasPermission(supabase, "site-a", PERMISSIONS.SITE_SETTINGS_MANAGE)).toBe(true);
    expect(await hasPermission(supabase, "site-b", PERMISSIONS.CONTENT_COLUMNS_DELETE)).toBe(true);
  });
});

describe("hasPermission / getPermissionsForSite -- per-site isolation", () => {
  it("a permission granted on one site does not leak into a different site", async () => {
    const grantedSiteId = "site-hakol";
    const otherSiteId = "site-maccabipod";

    const supabase = fakeSupabase({
      rpc: (name, args) => {
        if (name !== "has_permission") throw new Error(`unexpected rpc ${name}`);
        const granted = args?.p_site_id === grantedSiteId && args?.p_permission === PERMISSIONS.CONTENT_COLUMNS_VIEW;
        return { data: granted, error: null };
      },
    });

    expect(await hasPermission(supabase, grantedSiteId, PERMISSIONS.CONTENT_COLUMNS_VIEW)).toBe(true);
    expect(await hasPermission(supabase, otherSiteId, PERMISSIONS.CONTENT_COLUMNS_VIEW)).toBe(false);
  });

  it("a user with an Analytics permission does not automatically receive a Content permission", async () => {
    const siteId = "site-a";
    const grantedOnly = new Set([PERMISSIONS.ANALYTICS_DASHBOARD_VIEW]);

    const supabase = fakeSupabase({
      rpc: (name, args) => {
        if (name !== "permissions_for_site" || args?.p_site_id !== siteId) throw new Error("unexpected call");
        return { data: [...grantedOnly], error: null };
      },
    });

    const granted = await getPermissionsForSite(supabase, siteId);
    expect(granted.has(PERMISSIONS.ANALYTICS_DASHBOARD_VIEW)).toBe(true);
    expect(granted.has(PERMISSIONS.CONTENT_COLUMNS_VIEW)).toBe(false);
  });

  it("getAccessibleSiteIds / canAccessSite reflect only the sites the RPC actually returns", async () => {
    const supabase = fakeSupabase({
      rpc: (name) => {
        if (name !== "accessible_site_ids") throw new Error("unexpected call");
        return { data: ["site-a"], error: null };
      },
    });

    expect(await getAccessibleSiteIds(supabase)).toEqual(["site-a"]);
    expect(await canAccessSite(supabase, "site-a")).toBe(true);
    expect(await canAccessSite(supabase, "site-b")).toBe(false);
  });

  it("fails closed (empty) when accessible_site_ids errors -- never falls back to \"all sites\"", async () => {
    const supabase = fakeSupabase({ rpc: () => ({ data: null, error: { message: "boom" } }) });
    expect(await getAccessibleSiteIds(supabase)).toEqual([]);
    expect(await canAccessSite(supabase, "site-a")).toBe(false);
  });
});

describe("edit_own vs edit_all", () => {
  it("are distinguishable, non-conflated permission keys", async () => {
    const siteId = "site-a";
    const supabase = fakeSupabase({
      rpc: (name, args) => {
        if (name !== "permissions_for_site" || args?.p_site_id !== siteId) throw new Error("unexpected call");
        return { data: [PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN], error: null };
      },
    });

    const granted = await getPermissionsForSite(supabase, siteId);
    expect(granted.has(PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN)).toBe(true);
    expect(granted.has(PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL)).toBe(false);
  });
});

describe("requirePermission", () => {
  it("throws ForbiddenError when the permission is not granted", async () => {
    const supabase = fakeSupabase({ rpc: () => ({ data: false, error: null }) });
    await expect(requirePermission(supabase, "site-a", PERMISSIONS.SITE_SETTINGS_MANAGE)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("resolves without throwing when the permission is granted", async () => {
    const supabase = fakeSupabase({ rpc: () => ({ data: true, error: null }) });
    await expect(requirePermission(supabase, "site-a", PERMISSIONS.CONTENT_COLUMNS_VIEW)).resolves.toBeUndefined();
  });
});

describe("requireSiteAccess -- the central site-context gate (Phase 2, Section 2/14)", () => {
  it("throws SiteAccessError for an unauthenticated caller", async () => {
    const supabase = fakeSupabase({ user: null });
    await expect(requireSiteAccess(supabase, "site-a")).rejects.toBeInstanceOf(SiteAccessError);
  });

  it("throws SiteAccessError when the profile is inactive, even if the RPC would otherwise grant access", async () => {
    const supabase = fakeSupabase({
      user: { id: "u1" },
      profile: { display_name: "Inactive", active: false, is_admin: false },
      rpc: () => ({ data: ["site-a"], error: null }),
    });
    await expect(requireSiteAccess(supabase, "site-a")).rejects.toBeInstanceOf(SiteAccessError);
  });

  it("Admin bypasses the membership check entirely -- no accessible_site_ids call needed to grant access", async () => {
    const supabase = fakeSupabase({
      user: { id: "admin-1" },
      profile: { display_name: "Admin", active: true, is_admin: true },
      rpc: () => {
        throw new Error("accessible_site_ids should not be called for an Admin");
      },
    });
    await expect(requireSiteAccess(supabase, "any-site-not-a-member-of")).resolves.toBeUndefined();
  });

  it("site isolation: a member of Site A is denied access to Site B, even by directly calling requireSiteAccess with Site B's id", async () => {
    const supabase = fakeSupabase({
      user: { id: "writer-1" },
      profile: { display_name: "Writer", active: true, is_admin: false },
      rpc: (name) => {
        if (name !== "accessible_site_ids") throw new Error(`unexpected rpc ${name}`);
        return { data: ["site-a"], error: null };
      },
    });
    await expect(requireSiteAccess(supabase, "site-a")).resolves.toBeUndefined();
    await expect(requireSiteAccess(supabase, "site-b")).rejects.toBeInstanceOf(SiteAccessError);
  });

  it("a non-Admin with no membership rows at all is denied every site (safe default, not open-by-default)", async () => {
    const supabase = fakeSupabase({
      user: { id: "writer-1" },
      profile: { display_name: "Writer", active: true, is_admin: false },
      rpc: () => ({ data: [], error: null }),
    });
    await expect(requireSiteAccess(supabase, "site-a")).rejects.toBeInstanceOf(SiteAccessError);
  });
});

describe("module surface", () => {
  it("exposes only read/check operations -- no function that could write is_admin, memberships, or permissions", () => {
    // Documents the intent: self-escalation is prevented primarily at the
    // RLS layer (no INSERT/UPDATE policy for `authenticated` on profiles /
    // site_memberships / membership_permissions -- see the migration), but
    // this module also never gives client code a write path to reach for.
    const writeLikeNames = Object.keys(permissions).filter((name) => /^(set|grant|update|create|insert)/i.test(name));
    expect(writeLikeNames).toEqual([]);
  });
});
