import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/permissions";
import { AvatarManager } from "@/components/account/avatar-manager";

/**
 * Self-service profile page for any signed-in user -- no SITE_USERS_MANAGE
 * gate, unlike /users/[id] (see lib/dashboard/users.ts's getActorContext,
 * which structurally blocks a plain panelist from that route even for their
 * own row). This is why this page exists separately rather than reusing it.
 */
export default async function AccountPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">My profile</h1>
        <p className="text-sm text-[var(--muted)]">{profile.displayName}</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <AvatarManager userId={profile.id} displayName={profile.displayName} avatarUrl={profile.avatarUrl} canEdit={true} />
      </div>
    </div>
  );
}
