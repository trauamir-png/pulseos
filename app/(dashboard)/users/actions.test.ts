import { describe, expect, it, vi, beforeEach } from "vitest";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permission-definitions";
import type { SiteRecord } from "@/lib/dashboard/site";

/**
 * Phase 3 spec Section 19 testing matrix, exercised against the real
 * lib/dashboard/users.ts + app/(dashboard)/users/actions.ts code paths (not
 * a reimplementation of them). Two backends are faked:
 *  - the normal cookie-bound client (@/lib/supabase/server createClient),
 *    used only by getActorContext() for is_admin / has_permission / the
 *    caller's own profile row -- mirrors content/actions.test.ts's pattern.
 *  - the service-role client (@/lib/supabase/admin createAdminClient), used
 *    for every actual users/memberships/permissions read and write, plus
 *    Supabase Auth Admin (createUser / listUsers) -- an in-memory fake
 *    keyed by the same state object so effects are observable across calls
 *    within one test.
 * @/lib/dashboard/site is mocked directly so both SITE_A and SITE_B are
 * always visible in principle; per-site manageability is still governed by
 * the has_permission rpc fake, exactly like the real authorization split.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const SITE_A = "site-a";
const SITE_B = "site-b";
const SITE_RECORDS: SiteRecord[] = [
  { id: SITE_A, name: "Site A", domain: null, site_key: "a", timezone: "UTC", active: true, created_at: "2026-01-01", modules: [] },
  { id: SITE_B, name: "Site B", domain: null, site_key: "b", timezone: "UTC", active: true, created_at: "2026-01-01", modules: [] },
];
vi.mock("@/lib/dashboard/site", () => ({
  listAccessibleSites: async () => SITE_RECORDS,
}));

interface CallerState {
  isAdmin: boolean;
  userId: string | null;
  profileActive: boolean;
  /** The single site this non-Admin caller holds permissions on (matches content/actions.test.ts's single-site model). */
  siteId: string;
  permissions: Set<PermissionKey>;
}

function makeSupabase(state: CallerState) {
  return {
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "is_admin") return { data: state.isAdmin, error: null };
      if (name === "has_permission") {
        if (state.isAdmin) return { data: true, error: null };
        if (args?.p_site_id !== state.siteId) return { data: false, error: null };
        return { data: state.permissions.has(args?.p_permission as PermissionKey), error: null };
      }
      return { data: null, error: { message: `unhandled rpc ${name}` } };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table !== "profiles" || !state.userId) return { data: null, error: null };
            return { data: { id: state.userId, display_name: "Actor", active: state.profileActive, is_admin: state.isAdmin }, error: null };
          },
        }),
      }),
    }),
  };
}

let currentSupabase: ReturnType<typeof makeSupabase>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

interface AuthUser {
  id: string;
  email: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  id: string;
  site_id: string;
  user_id: string;
  active: boolean;
}

interface AdminState {
  authUsers: Map<string, AuthUser>;
  profiles: Map<string, ProfileRow>;
  memberships: Map<string, MembershipRow>;
  membershipPermissions: Map<string, Set<string>>;
}

function newAdminState(): AdminState {
  return { authUsers: new Map(), profiles: new Map(), memberships: new Map(), membershipPermissions: new Map() };
}

function seedAdmin(id: string, email: string, overrides: Partial<ProfileRow> = {}) {
  currentAdminState.authUsers.set(id, { id, email });
  currentAdminState.profiles.set(id, {
    id,
    display_name: "Admin",
    active: true,
    is_admin: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });
}

function seedMembership(id: string, siteId: string, userId: string, permissionKeys: PermissionKey[] = [], active = true) {
  currentAdminState.memberships.set(id, { id, site_id: siteId, user_id: userId, active });
  currentAdminState.membershipPermissions.set(id, new Set(permissionKeys));
}

function makeAdmin(state: AdminState) {
  function rowsFor(table: string): Record<string, unknown>[] {
    if (table === "profiles") return [...state.profiles.values()] as unknown as Record<string, unknown>[];
    if (table === "site_memberships") return [...state.memberships.values()] as unknown as Record<string, unknown>[];
    if (table === "membership_permissions") {
      const out: { membership_id: string; permission_key: string }[] = [];
      for (const [mid, keys] of state.membershipPermissions) {
        for (const key of keys) out.push({ membership_id: mid, permission_key: key });
      }
      return out;
    }
    return [];
  }

  function builder(table: string) {
    const eqFilters: Record<string, unknown> = {};
    const inFilters: Record<string, unknown[]> = {};
    let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
    let countMode = false;

    function matches(row: Record<string, unknown>): boolean {
      for (const [k, v] of Object.entries(eqFilters)) if (row[k] !== v) return false;
      for (const [k, v] of Object.entries(inFilters)) if (!v.includes(row[k])) return false;
      return true;
    }

    async function resolve(): Promise<{ data: unknown; error: { message: string } | null; count?: number }> {
      if (mode === "upsert" && table === "profiles") {
        const p = payload as Record<string, unknown>;
        const existing = state.profiles.get(p.id as string);
        const row: ProfileRow = {
          id: p.id as string,
          display_name: (p.display_name as string) ?? existing?.display_name ?? "",
          active: (p.active as boolean) ?? existing?.active ?? true,
          is_admin: existing?.is_admin ?? false,
          created_at: existing?.created_at ?? "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        };
        state.profiles.set(row.id, row);
        return { data: row, error: null };
      }
      if (mode === "upsert" && table === "site_memberships") {
        const p = payload as Record<string, unknown>;
        const existing = [...state.memberships.values()].find((m) => m.site_id === p.site_id && m.user_id === p.user_id);
        const id = existing?.id ?? `${p.site_id}:${p.user_id}`;
        const row: MembershipRow = { id, site_id: p.site_id as string, user_id: p.user_id as string, active: (p.active as boolean) ?? true };
        state.memberships.set(id, row);
        return { data: row, error: null };
      }
      if (mode === "insert" && table === "membership_permissions") {
        for (const p of payload as { membership_id: string; permission_key: string }[]) {
          const set = state.membershipPermissions.get(p.membership_id) ?? new Set<string>();
          set.add(p.permission_key);
          state.membershipPermissions.set(p.membership_id, set);
        }
        return { data: null, error: null };
      }
      if (mode === "delete" && table === "membership_permissions") {
        state.membershipPermissions.delete(eqFilters.membership_id as string);
        return { data: null, error: null };
      }
      if (mode === "update") {
        const matched = rowsFor(table).filter(matches);
        for (const row of matched) Object.assign(row, payload);
        return { data: null, error: null };
      }
      // select
      if (countMode) return { data: null, error: null, count: rowsFor(table).filter(matches).length };
      return { data: rowsFor(table).filter(matches), error: null };
    }

    const api = {
      select: (_fields?: string, opts?: { count?: string }) => {
        if (opts?.count) countMode = true;
        return api;
      },
      eq: (col: string, val: unknown) => {
        eqFilters[col] = val;
        return api;
      },
      in: (col: string, vals: unknown[]) => {
        inFilters[col] = vals;
        return api;
      },
      order: () => api,
      upsert: (data: Record<string, unknown>) => {
        mode = "upsert";
        payload = data;
        return api;
      },
      update: (data: Record<string, unknown>) => {
        mode = "update";
        payload = data;
        return api;
      },
      insert: (data: Record<string, unknown>[]) => {
        mode = "insert";
        payload = data;
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      maybeSingle: async () => {
        const r = await resolve();
        const arr = r.data as unknown[] | null;
        return { data: Array.isArray(arr) ? (arr[0] ?? null) : arr, error: r.error };
      },
      single: async () => {
        const r = await resolve();
        const arr = r.data as unknown[] | null;
        return { data: Array.isArray(arr) ? (arr[0] ?? null) : arr, error: r.error };
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => resolve().then(onF, onR),
    };
    return api;
  }

  return {
    auth: {
      admin: {
        createUser: async ({ email }: { email: string; password: string; email_confirm: boolean }) => {
          const existing = [...state.authUsers.values()].find((u) => u.email === email);
          if (existing) return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
          const id = `auth-${state.authUsers.size + 1}`;
          const user = { id, email };
          state.authUsers.set(id, user);
          return { data: { user }, error: null };
        },
        listUsers: async () => ({ data: { users: [...state.authUsers.values()] }, error: null }),
      },
    },
    from: (table: string) => builder(table),
  };
}

let currentAdminState: AdminState;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdmin(currentAdminState),
}));

function callerState(overrides: Partial<CallerState> = {}): CallerState {
  return { isAdmin: false, userId: "actor-1", profileActive: true, siteId: SITE_A, permissions: new Set(), ...overrides };
}

let actions: typeof import("./actions");
let usersLib: typeof import("@/lib/dashboard/users");

beforeEach(async () => {
  vi.resetModules();
  currentAdminState = newAdminState();
  actions = await import("./actions");
  usersLib = await import("@/lib/dashboard/users");
});

describe("createOrInviteUser", () => {
  it("creates a brand-new Auth user, profile, membership, and permissions for a manager on their own site", async () => {
    seedAdmin("actor-1", "manager@example.com", { is_admin: false });
    currentSupabase = makeSupabase(callerState({ permissions: new Set([PERMISSIONS.SITE_USERS_MANAGE]) }));

    const result = await actions.createOrInviteUser({
      displayName: "New Writer",
      email: "writer@example.com",
      assignments: [{ siteId: SITE_A, permissions: [PERMISSIONS.CONTENT_COLUMNS_CREATE] }],
    });

    expect(result.reusedExistingAccount).toBe(false);
    expect(result.tempPassword).toBeTruthy();
    expect(currentAdminState.profiles.get(result.userId)?.display_name).toBe("New Writer");

    const membership = [...currentAdminState.memberships.values()].find((m) => m.user_id === result.userId && m.site_id === SITE_A);
    expect(membership?.active).toBe(true);
    const perms = currentAdminState.membershipPermissions.get(membership!.id);
    // content.columns.create depends on content.columns.view (Option A auto-require) -- both must be present.
    expect(perms?.has(PERMISSIONS.CONTENT_COLUMNS_CREATE)).toBe(true);
    expect(perms?.has(PERMISSIONS.CONTENT_COLUMNS_VIEW)).toBe(true);
  });

  it("reuses an existing Supabase Auth account with the same email instead of creating a duplicate", async () => {
    seedAdmin("actor-1", "admin@example.com");
    seedAdmin("existing-user", "existing@example.com", { is_admin: false, display_name: "Existing" });
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));

    const result = await actions.createOrInviteUser({
      displayName: "Existing Renamed",
      email: "existing@example.com",
      assignments: [{ siteId: SITE_A, permissions: [] }],
    });

    expect(result.reusedExistingAccount).toBe(true);
    expect(result.tempPassword).toBeNull();
    expect(result.userId).toBe("existing-user");
    expect(currentAdminState.authUsers.size).toBe(2);
    expect(currentAdminState.profiles.get("existing-user")?.display_name).toBe("Existing Renamed");
  });

  it("rejects assigning a site the caller does not manage, and never creates a partial account", async () => {
    seedAdmin("actor-1", "manager@example.com", { is_admin: false });
    currentSupabase = makeSupabase(callerState({ permissions: new Set([PERMISSIONS.SITE_USERS_MANAGE]) })); // only manages SITE_A

    await expect(
      actions.createOrInviteUser({
        displayName: "Someone",
        email: "someone@example.com",
        assignments: [{ siteId: SITE_B, permissions: [] }],
      }),
    ).rejects.toThrow();

    expect(currentAdminState.authUsers.size).toBe(1); // only the seeded actor -- no orphaned Auth user was created
  });

  it("rejects an invalid permission key without writing anything", async () => {
    seedAdmin("actor-1", "admin@example.com");
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));

    await expect(
      actions.createOrInviteUser({
        displayName: "Someone",
        email: "someone@example.com",
        assignments: [{ siteId: SITE_A, permissions: ["not.a.real.permission"] }],
      }),
    ).rejects.toThrow();

    expect(currentAdminState.authUsers.size).toBe(1);
  });

  it("rejects a non-Admin, non-site-manager caller entirely", async () => {
    seedAdmin("actor-1", "nobody@example.com", { is_admin: false });
    currentSupabase = makeSupabase(callerState({ permissions: new Set() }));

    await expect(
      actions.createOrInviteUser({ displayName: "Someone", email: "someone@example.com", assignments: [{ siteId: SITE_A, permissions: [] }] }),
    ).rejects.toThrow();
  });
});

describe("site isolation -- editing Site A never touches Site B", () => {
  it("setSiteMembershipPermissions on Site A leaves the same user's Site B permissions untouched", async () => {
    seedAdmin("actor-1", "admin@example.com");
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));
    seedAdmin("target", "target@example.com", { is_admin: false });
    seedMembership("m-a", SITE_A, "target", [PERMISSIONS.CONTENT_COLUMNS_VIEW]);
    seedMembership("m-b", SITE_B, "target", [PERMISSIONS.PODCAST_OVERVIEW_VIEW]);

    await actions.setSiteMembershipPermissions("target", SITE_A, [PERMISSIONS.CONTENT_COLUMNS_PUBLISH]);

    const permsA = currentAdminState.membershipPermissions.get("m-a");
    const permsB = currentAdminState.membershipPermissions.get("m-b");
    expect([...(permsA ?? [])].sort()).toEqual([PERMISSIONS.CONTENT_COLUMNS_PUBLISH, PERMISSIONS.CONTENT_COLUMNS_VIEW].sort());
    expect([...(permsB ?? [])]).toEqual([PERMISSIONS.PODCAST_OVERVIEW_VIEW]);
  });

  it("a manager scoped to Site A cannot modify permissions on Site B for the same user", async () => {
    seedAdmin("actor-1", "manager@example.com", { is_admin: false });
    currentSupabase = makeSupabase(callerState({ permissions: new Set([PERMISSIONS.SITE_USERS_MANAGE]) })); // SITE_A only
    seedAdmin("target", "target@example.com", { is_admin: false });
    seedMembership("m-a", SITE_A, "target", []);
    seedMembership("m-b", SITE_B, "target", [PERMISSIONS.PODCAST_OVERVIEW_VIEW]);

    await expect(actions.setSiteMembershipPermissions("target", SITE_B, [PERMISSIONS.PODCAST_EPISODES_VIEW])).rejects.toThrow();
    expect([...(currentAdminState.membershipPermissions.get("m-b") ?? [])]).toEqual([PERMISSIONS.PODCAST_OVERVIEW_VIEW]);
  });

  it("removeSiteAssignment deactivates only the targeted site's membership and clears only its permissions", async () => {
    seedAdmin("actor-1", "admin@example.com");
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));
    seedAdmin("target", "target@example.com", { is_admin: false });
    seedMembership("m-a", SITE_A, "target", [PERMISSIONS.CONTENT_COLUMNS_VIEW]);
    seedMembership("m-b", SITE_B, "target", [PERMISSIONS.PODCAST_OVERVIEW_VIEW]);

    await actions.removeSiteAssignment("target", SITE_A);

    expect(currentAdminState.memberships.get("m-a")?.active).toBe(false);
    expect(currentAdminState.membershipPermissions.has("m-a")).toBe(false);
    expect(currentAdminState.memberships.get("m-b")?.active).toBe(true);
    expect([...(currentAdminState.membershipPermissions.get("m-b") ?? [])]).toEqual([PERMISSIONS.PODCAST_OVERVIEW_VIEW]);
  });
});

describe("setUserActive -- last-Admin safeguard", () => {
  it("refuses to disable the only active Admin account", async () => {
    seedAdmin("actor-1", "only-admin@example.com", { is_admin: true, active: true });
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));

    await expect(actions.setUserActive("actor-1", false)).rejects.toThrow(/last active Admin/);
    expect(currentAdminState.profiles.get("actor-1")?.active).toBe(true);
  });

  it("allows disabling an Admin when another active Admin still exists", async () => {
    seedAdmin("actor-1", "admin-one@example.com", { is_admin: true, active: true });
    seedAdmin("actor-2", "admin-two@example.com", { is_admin: true, active: true });
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));

    await actions.setUserActive("actor-2", false);
    expect(currentAdminState.profiles.get("actor-2")?.active).toBe(false);
  });

  it("is Admin-only -- a site-scoped manager cannot disable any user", async () => {
    seedAdmin("actor-1", "manager@example.com", { is_admin: false });
    seedAdmin("target", "target@example.com", { is_admin: false, active: true });
    currentSupabase = makeSupabase(callerState({ permissions: new Set([PERMISSIONS.SITE_USERS_MANAGE]) }));

    await expect(actions.setUserActive("target", false)).rejects.toThrow();
    expect(currentAdminState.profiles.get("target")?.active).toBe(true);
  });
});

describe("listUsersForActor -- visibility scoping", () => {
  it("Admin sees every user regardless of site", async () => {
    seedAdmin("actor-1", "admin@example.com");
    seedAdmin("user-a", "user-a@example.com", { is_admin: false });
    seedAdmin("user-b", "user-b@example.com", { is_admin: false });
    seedMembership("m-a", SITE_A, "user-a", []);
    seedMembership("m-b", SITE_B, "user-b", []);
    currentSupabase = makeSupabase(callerState({ isAdmin: true }));

    const actor = await usersLib.getActorContext();
    const list = await usersLib.listUsersForActor(actor);
    expect(list.map((u) => u.id).sort()).toEqual(["actor-1", "user-a", "user-b"].sort());
  });

  it("a site-scoped manager sees only users with a membership in their own site", async () => {
    seedAdmin("actor-1", "manager@example.com", { is_admin: false });
    seedAdmin("user-a", "user-a@example.com", { is_admin: false });
    seedAdmin("user-b", "user-b@example.com", { is_admin: false });
    seedMembership("m-a", SITE_A, "user-a", []);
    seedMembership("m-b", SITE_B, "user-b", []);
    currentSupabase = makeSupabase(callerState({ permissions: new Set([PERMISSIONS.SITE_USERS_MANAGE]) })); // SITE_A only

    const actor = await usersLib.getActorContext();
    const list = await usersLib.listUsersForActor(actor);
    expect(list.map((u) => u.id)).toEqual(["user-a"]);
  });

  it("getUserDetail hides a user who has no membership on any site the manager manages", async () => {
    seedAdmin("actor-1", "manager@example.com", { is_admin: false });
    seedAdmin("user-b", "user-b@example.com", { is_admin: false });
    seedMembership("m-b", SITE_B, "user-b", []);
    currentSupabase = makeSupabase(callerState({ permissions: new Set([PERMISSIONS.SITE_USERS_MANAGE]) })); // SITE_A only

    const actor = await usersLib.getActorContext();
    await expect(usersLib.getUserDetail(actor, "user-b")).rejects.toThrow();
  });
});
