import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isAdmin as checkIsAdmin, hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS, isPermissionKey, type PermissionKey } from "@/lib/auth/permission-definitions";
import { listAccessibleSites, type SiteRecord } from "@/lib/dashboard/site";

/**
 * profiles / site_memberships / membership_permissions have NO write policy
 * for `authenticated` (see supabase/migrations/0012_site_permissions.sql) --
 * every write goes through createAdminClient(). Their read policies are also
 * "own row or Admin" only, which blocks a legitimate site-scoped manager from
 * reading a *different* user's profile/membership/permissions even for a
 * site they're authorized to manage. So this module reads through the admin
 * client too, everywhere -- but never before an app-layer authorization check
 * (getActorContext / requireCanManageSite) has run against the caller's own
 * session via the normal cookie-bound client. The admin client itself enforces
 * nothing; every guarantee here is enforced in this file, not the database.
 */

export class UsersAccessError extends Error {
  constructor(message = "You do not have permission to manage users.") {
    super(message);
    this.name = "UsersAccessError";
  }
}

export interface ActorContext {
  actorId: string;
  isAdmin: boolean;
  /** Sites this actor may manage users/permissions for: all sites for Admin, else sites where they hold site.users.manage. */
  manageableSiteIds: string[];
}

/** The single entry gate for every Users & Permissions page and Server Action. Fails closed. */
export async function getActorContext(): Promise<ActorContext> {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) throw new UsersAccessError("Not signed in.");

  const [admin, sites] = await Promise.all([checkIsAdmin(supabase), listAccessibleSites()]);

  let manageableSiteIds: string[];
  if (admin) {
    manageableSiteIds = sites.map((s) => s.id);
  } else {
    const checks = await Promise.all(
      sites.map(async (site) => [site.id, await hasPermission(supabase, site.id, PERMISSIONS.SITE_USERS_MANAGE)] as const),
    );
    manageableSiteIds = checks.filter(([, allowed]) => allowed).map(([id]) => id);
  }

  if (!admin && manageableSiteIds.length === 0) {
    throw new UsersAccessError("You do not manage users for any site.");
  }

  return { actorId: user.id, isAdmin: admin, manageableSiteIds };
}

export async function requireCanManageSite(actor: ActorContext, siteId: string): Promise<void> {
  if (actor.isAdmin) return;
  if (!actor.manageableSiteIds.includes(siteId)) {
    throw new UsersAccessError("You do not manage this site.");
  }
}

/** Sites the current actor may assign users to -- source for the New User / Add site pickers. */
export async function listManageableSites(actor: ActorContext): Promise<SiteRecord[]> {
  const sites = await listAccessibleSites();
  const allowed = new Set(actor.manageableSiteIds);
  return sites.filter((s) => allowed.has(s.id));
}

/**
 * Maps auth user id -> email. Supabase's admin API has no getUserByEmail /
 * server-side filter, so this pages through listUsers() once. A single 1000-
 * row page comfortably covers this app's user base; if that ever stops being
 * true, paginate here rather than at each call site.
 */
async function fetchEmailMap(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, string>> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const map = new Map<string, string>();
  for (const u of data?.users ?? []) {
    if (u.email) map.set(u.id, u.email);
  }
  return map;
}

export interface UserSiteAssignment {
  siteId: string;
  siteName: string;
  membershipId: string;
  active: boolean;
  permissions: PermissionKey[];
}

export interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  isAdmin: boolean;
  createdAt: string;
  /** Only sites the current actor may see: all sites for Admin, only manageableSiteIds otherwise. */
  sites: UserSiteAssignment[];
}

interface ProfileRow {
  id: string;
  display_name: string;
  active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

async function loadAssignments(
  admin: ReturnType<typeof createAdminClient>,
  siteIds: string[],
  userIds?: string[],
): Promise<{ byUser: Map<string, UserSiteAssignment[]>; membershipUserById: Map<string, string> }> {
  const siteNameById = new Map((await listAccessibleSites()).map((s) => [s.id, s.name]));

  let query = admin.from("site_memberships").select("id, site_id, user_id, active").in("site_id", siteIds);
  if (userIds) query = query.in("user_id", userIds);
  const { data: memberships } = await query;

  const membershipIds = (memberships ?? []).map((m) => m.id);
  const { data: perms } =
    membershipIds.length > 0
      ? await admin.from("membership_permissions").select("membership_id, permission_key").in("membership_id", membershipIds)
      : { data: [] as { membership_id: string; permission_key: string }[] };

  const permsByMembership = new Map<string, PermissionKey[]>();
  for (const row of perms ?? []) {
    if (!isPermissionKey(row.permission_key)) continue;
    const list = permsByMembership.get(row.membership_id) ?? [];
    list.push(row.permission_key);
    permsByMembership.set(row.membership_id, list);
  }

  const byUser = new Map<string, UserSiteAssignment[]>();
  const membershipUserById = new Map<string, string>();
  for (const m of memberships ?? []) {
    membershipUserById.set(m.id, m.user_id);
    const assignment: UserSiteAssignment = {
      siteId: m.site_id,
      siteName: siteNameById.get(m.site_id) ?? "Unknown site",
      membershipId: m.id,
      active: m.active,
      permissions: permsByMembership.get(m.id) ?? [],
    };
    const list = byUser.get(m.user_id) ?? [];
    list.push(assignment);
    byUser.set(m.user_id, list);
  }

  return { byUser, membershipUserById };
}

/** Admin: every PulseOS user. Site-scoped manager: only users with a membership (active or not) in a site they manage. */
export async function listUsersForActor(actor: ActorContext): Promise<UserListItem[]> {
  const admin = createAdminClient();
  const [emails, { byUser }] = await Promise.all([fetchEmailMap(admin), loadAssignments(admin, actor.manageableSiteIds)]);

  let profiles: ProfileRow[];
  if (actor.isAdmin) {
    const { data } = await admin.from("profiles").select("*").order("created_at", { ascending: true });
    profiles = data ?? [];
  } else {
    const userIds = [...byUser.keys()];
    if (userIds.length === 0) return [];
    const { data } = await admin.from("profiles").select("*").in("id", userIds).order("created_at", { ascending: true });
    profiles = data ?? [];
  }

  return profiles.map((p) => ({
    id: p.id,
    email: emails.get(p.id) ?? "(no auth email on file)",
    displayName: p.display_name,
    active: p.active,
    isAdmin: p.is_admin,
    createdAt: p.created_at,
    sites: byUser.get(p.id) ?? [],
  }));
}

/** Single-user detail for the Edit User page. Throws UsersAccessError if a site-scoped manager has no shared site with this user. */
export async function getUserDetail(actor: ActorContext, userId: string): Promise<UserListItem> {
  const admin = createAdminClient();
  const [emails, { byUser }] = await Promise.all([fetchEmailMap(admin), loadAssignments(admin, actor.manageableSiteIds, [userId])]);

  const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) throw new UsersAccessError("User not found.");

  const sites = byUser.get(userId) ?? [];
  if (!actor.isAdmin && sites.length === 0) {
    // Not a member of any site this actor manages -- don't leak existence.
    throw new UsersAccessError("User not found.");
  }

  return {
    id: profile.id,
    email: emails.get(profile.id) ?? "(no auth email on file)",
    displayName: profile.display_name,
    active: profile.active,
    isAdmin: profile.is_admin,
    createdAt: profile.created_at,
    sites,
  };
}
