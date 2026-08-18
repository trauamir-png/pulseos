"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPermissionKey } from "@/lib/auth/permission-definitions";
import { resolvePermissionClosure } from "@/lib/auth/permission-dependencies";
import { getActorContext, requireCanManageSite, UsersAccessError, listManageableSites } from "@/lib/dashboard/users";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SiteAssignmentInput {
  siteId: string;
  permissions: string[];
}

function generateTempPassword(): string {
  // 16 URL-safe characters -- shown once to the Admin/manager to relay manually (see Phase 3 report, invite-flow decision).
  return randomBytes(12).toString("base64url");
}

async function findAuthUserByEmail(admin: AdminClient, email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users.find((u) => u.email?.toLowerCase() === email) ?? null;
}

/**
 * Deletes then re-inserts the membership's permission rows. Not a SQL
 * transaction (none available via the client for these tables -- see the
 * migration's own note); safe to re-run because it's fully idempotent for a
 * given membershipId + keys, which is what every caller does on retry.
 */
async function replaceMembershipPermissions(admin: AdminClient, membershipId: string, permissionKeys: string[]): Promise<void> {
  const valid = permissionKeys.filter(isPermissionKey);
  const resolved = [...resolvePermissionClosure(valid)];

  const { error: deleteError } = await admin.from("membership_permissions").delete().eq("membership_id", membershipId);
  if (deleteError) throw new Error(`Saving permissions failed: ${deleteError.message}. Re-submitting is safe and will resume.`);

  if (resolved.length > 0) {
    const { error: insertError } = await admin
      .from("membership_permissions")
      .insert(resolved.map((key) => ({ membership_id: membershipId, permission_key: key })));
    if (insertError) throw new Error(`Saving permissions failed: ${insertError.message}. Re-submitting is safe and will resume.`);
  }
}

async function upsertSiteAssignment(admin: AdminClient, userId: string, siteId: string, permissionKeys: string[]): Promise<void> {
  const { data: membership, error: membershipError } = await admin
    .from("site_memberships")
    .upsert({ site_id: siteId, user_id: userId, active: true }, { onConflict: "site_id,user_id" })
    .select("id")
    .single();
  if (membershipError || !membership) {
    throw new Error(`Site assignment failed: ${membershipError?.message ?? "unknown error"}. Re-submitting is safe and will resume.`);
  }
  await replaceMembershipPermissions(admin, membership.id, permissionKeys);
}

function validatePermissionKeys(keys: string[]): void {
  for (const key of keys) {
    if (!isPermissionKey(key)) throw new Error(`Unknown permission "${key}".`);
  }
}

/**
 * Creates a new PulseOS user (or reuses an existing Supabase Auth account
 * with the same email) and assigns site access + permissions.
 *
 * No Supabase invite-email flow: this app has no password-set/callback page
 * today, and configuring one requires a Supabase Dashboard change outside
 * this repo (see the Phase 3 report). V1 instead creates the Auth user with
 * an Admin-relayed temporary password, returned once here and never stored.
 *
 * Multi-step (Auth user -> profile -> membership -> permissions) with no
 * real transaction available for the last three tables. Every step after
 * Auth-user creation is an idempotent upsert/replace, so if this throws
 * partway through, re-submitting the same form (same email) safely resumes
 * rather than duplicating or corrupting state.
 */
export async function createOrInviteUser(input: {
  displayName: string;
  email: string;
  assignments: SiteAssignmentInput[];
}): Promise<{ userId: string; tempPassword: string | null; reusedExistingAccount: boolean }> {
  const actor = await getActorContext();

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  if (!displayName) throw new Error("Name is required.");
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  if (input.assignments.length === 0) throw new Error("Select at least one site.");

  const manageable = new Set((await listManageableSites(actor)).map((s) => s.id));
  for (const assignment of input.assignments) {
    if (!manageable.has(assignment.siteId)) {
      throw new UsersAccessError("You cannot assign users to a site you don't manage.");
    }
    validatePermissionKeys(assignment.permissions);
  }

  const admin = createAdminClient();

  let userId: string;
  let tempPassword: string | null = null;
  let reusedExistingAccount = false;

  const candidatePassword = generateTempPassword();
  const created = await admin.auth.admin.createUser({ email, password: candidatePassword, email_confirm: true });
  if (created.error || !created.data.user) {
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) {
      throw new Error(`Could not create user: ${created.error?.message ?? "unknown error"}`);
    }
    userId = existing.id;
    reusedExistingAccount = true;
  } else {
    userId = created.data.user.id;
    tempPassword = candidatePassword;
  }

  // must_change_password is only ever set true here, for a genuinely new Auth
  // user still on the generated temp password. When reusedExistingAccount is
  // true, the field is omitted entirely -- upsert's ON CONFLICT DO UPDATE
  // only touches columns present in the payload, so an already-onboarded
  // user being assigned to another site keeps their existing flag untouched.
  const profilePayload: { id: string; display_name: string; active: boolean; must_change_password?: boolean } = {
    id: userId,
    display_name: displayName,
    active: true,
  };
  if (!reusedExistingAccount) {
    profilePayload.must_change_password = true;
  }

  const { error: profileError } = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profileError) {
    throw new Error(`User account ready, but saving the profile failed: ${profileError.message}. Re-submitting this form is safe and will resume.`);
  }

  for (const assignment of input.assignments) {
    await upsertSiteAssignment(admin, userId, assignment.siteId, assignment.permissions);
  }

  revalidatePath("/users");
  return { userId, tempPassword, reusedExistingAccount };
}

/** Add (or reactivate) one site assignment for an existing user, with its own permission set. */
export async function addSiteAssignment(userId: string, siteId: string, permissionKeys: string[]): Promise<void> {
  const actor = await getActorContext();
  await requireCanManageSite(actor, siteId);
  validatePermissionKeys(permissionKeys);

  const admin = createAdminClient();
  await upsertSiteAssignment(admin, userId, siteId, permissionKeys);

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
}

/** Replace the permission set for an existing membership. Site A's permissions are never touched by a Site B call -- scoped strictly by membershipId/siteId. */
export async function setSiteMembershipPermissions(userId: string, siteId: string, permissionKeys: string[]): Promise<void> {
  const actor = await getActorContext();
  await requireCanManageSite(actor, siteId);
  validatePermissionKeys(permissionKeys);

  const admin = createAdminClient();
  const { data: membership } = await admin.from("site_memberships").select("id").eq("site_id", siteId).eq("user_id", userId).maybeSingle();
  if (!membership) throw new Error("That user is not assigned to this site.");

  await replaceMembershipPermissions(admin, membership.id, permissionKeys);

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
}

/** Deactivates one site membership and clears its permission rows. Auth user and other sites are untouched. */
export async function removeSiteAssignment(userId: string, siteId: string): Promise<void> {
  const actor = await getActorContext();
  await requireCanManageSite(actor, siteId);

  const admin = createAdminClient();
  const { data: membership } = await admin.from("site_memberships").select("id").eq("site_id", siteId).eq("user_id", userId).maybeSingle();
  if (!membership) return;

  const { error: permError } = await admin.from("membership_permissions").delete().eq("membership_id", membership.id);
  if (permError) throw new Error(`Failed to remove site access: ${permError.message}`);

  const { error: membershipError } = await admin.from("site_memberships").update({ active: false }).eq("id", membership.id);
  if (membershipError) throw new Error(`Failed to remove site access: ${membershipError.message}`);

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
}

/** Admin-only. Renames a user's profile display name. */
export async function updateUserDisplayName(userId: string, displayName: string): Promise<void> {
  const actor = await getActorContext();
  if (!actor.isAdmin) throw new UsersAccessError("Only an Admin can rename a user.");

  const name = displayName.trim();
  if (!name) throw new Error("Name is required.");

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error) throw new Error(`Failed to update user: ${error.message}`);

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
}

/**
 * Admin-only. Disabling denies authorization everywhere (profiles.active
 * gates is_admin/has_permission at the database layer) without deleting the
 * Auth user, memberships, or any columns.created_by history. Refuses to
 * disable the last active Admin account so the app can never be left with
 * zero Admins.
 */
export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const actor = await getActorContext();
  if (!actor.isAdmin) throw new UsersAccessError("Only an Admin can disable or reactivate a user.");

  const admin = createAdminClient();

  if (!active) {
    const { data: target } = await admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    if (target?.is_admin) {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true).eq("active", true);
      if ((count ?? 0) <= 1) {
        throw new Error("Cannot disable the last active Admin account.");
      }
    }
  }

  const { error } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (error) throw new Error(`Failed to update user: ${error.message}`);

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
}
