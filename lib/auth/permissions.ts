import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { type PermissionKey, isPermissionKey } from "@/lib/auth/permission-definitions";

type Supa = SupabaseClient<Database>;

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  active: boolean;
  isAdmin: boolean;
}

/**
 * Centralized authorization layer. Every check here delegates to the
 * Postgres functions defined in supabase/migrations/0012_site_permissions.sql
 * (is_admin / has_permission / permissions_for_site / accessible_site_ids) so
 * there is exactly one implementation of "what can this user do," shared
 * between application code and (once tightened, in a later phase) RLS
 * policies -- never two copies that can drift apart.
 *
 * Every RPC call below fails CLOSED: if the call errors for any reason, the
 * result is "no access," not "allow." This is a deliberate departure from
 * this codebase's usual fail-open convention for auxiliary checks (see
 * lib/analytics/rate-limit.ts, which fails open because a rate-limit hiccup
 * should never take down ingestion) -- an authorization check is exactly the
 * kind of check that must never fail open.
 */

export async function getCurrentUser(supabase: Supa): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getCurrentProfile(supabase: Supa): Promise<Profile | null> {
  const user = await getCurrentUser(supabase);
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return null;

  return { id: data.id, displayName: data.display_name, avatarUrl: data.avatar_url, active: data.active, isAdmin: data.is_admin };
}

export async function isAdmin(supabase: Supa): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

/** Every site the current user may see: every site if Admin, otherwise sites with an active membership. */
export async function getAccessibleSiteIds(supabase: Supa): Promise<string[]> {
  const { data, error } = await supabase.rpc("accessible_site_ids");
  if (error) return [];
  return data ?? [];
}

export async function canAccessSite(supabase: Supa, siteId: string): Promise<boolean> {
  const siteIds = await getAccessibleSiteIds(supabase);
  return siteIds.includes(siteId);
}

/** The full effective permission set for the current user on one site (all permissions, if Admin). */
export async function getPermissionsForSite(supabase: Supa, siteId: string): Promise<Set<PermissionKey>> {
  const { data, error } = await supabase.rpc("permissions_for_site", { p_site_id: siteId });
  if (error) return new Set();
  return new Set((data ?? []).filter(isPermissionKey));
}

export async function hasPermission(supabase: Supa, siteId: string, permission: PermissionKey): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", { p_site_id: siteId, p_permission: permission });
  if (error) return false;
  return data === true;
}

export class ForbiddenError extends Error {
  constructor(permission: PermissionKey, siteId: string) {
    super(`Missing permission "${permission}" on site "${siteId}".`);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError when the current user lacks `permission` on `siteId`. Admin always passes. */
export async function requirePermission(supabase: Supa, siteId: string, permission: PermissionKey): Promise<void> {
  if (!(await hasPermission(supabase, siteId, permission))) {
    throw new ForbiddenError(permission, siteId);
  }
}

export class SiteAccessError extends Error {
  constructor(siteId: string) {
    super(`No access to site "${siteId}".`);
    this.name = "SiteAccessError";
  }
}

/**
 * The single centralized site-context gate: (1) authenticated, (2) profile
 * active, (3) site accessible -- Admin bypasses membership, everyone else
 * needs an active site_membership row. Fails closed on every branch. Every
 * page/Server Action that receives a site ID from a query param or client
 * input must run it through here (or through `hasPermission`, which calls
 * `has_permission` and carries the same Admin-bypass) before touching that
 * site's data.
 *
 * Re-checks `profile.active` explicitly here because the underlying SQL
 * (has_permission / accessible_site_ids in 0012_site_permissions.sql) only
 * gates the Admin-bypass branch on `profiles.active` -- the membership branch
 * for ordinary users currently checks `site_memberships.active` only, not
 * `profiles.active`. This is flagged as a known gap for a future migration;
 * this app-layer check closes it for every caller that goes through
 * requireSiteAccess in the meantime.
 */
export async function requireSiteAccess(supabase: Supa, siteId: string): Promise<void> {
  const profile = await getCurrentProfile(supabase);
  if (!profile || !profile.active) throw new SiteAccessError(siteId);
  if (profile.isAdmin) return;
  if (!(await canAccessSite(supabase, siteId))) throw new SiteAccessError(siteId);
}
