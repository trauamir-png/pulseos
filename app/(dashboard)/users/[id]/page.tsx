import { AccessDenied } from "@/components/access-denied";
import { ProfilePanel, SiteMembershipCard, AddSiteForm } from "@/components/users/edit-user-ui";
import { getActorContext, getUserDetail, listManageableSites, UsersAccessError } from "@/lib/dashboard/users";
import { formatDate } from "@/lib/format/datetime";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let actor;
  try {
    actor = await getActorContext();
  } catch (e) {
    if (e instanceof UsersAccessError) return <AccessDenied message={e.message} />;
    throw e;
  }

  let user;
  try {
    user = await getUserDetail(actor, id);
  } catch (e) {
    if (e instanceof UsersAccessError) return <AccessDenied message={e.message} />;
    throw e;
  }

  const manageableSites = await listManageableSites(actor);
  const activeSiteIds = new Set(user.sites.filter((s) => s.active).map((s) => s.siteId));
  const availableSites = manageableSites.filter((s) => !activeSiteIds.has(s.id));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{user.displayName}</h1>
        <p className="text-sm text-[var(--muted)]">
          {user.email} · Joined {formatDate(user.createdAt)}
        </p>
      </div>

      <ProfilePanel userId={user.id} displayName={user.displayName} active={user.active} isAdmin={user.isAdmin} canEdit={actor.isAdmin} />

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Site access</h2>
        {user.sites.length === 0 && <p className="text-sm text-[var(--muted)]">No site access assigned yet.</p>}
        {user.sites.map((assignment) => (
          <SiteMembershipCard
            key={assignment.siteId}
            userId={user.id}
            siteId={assignment.siteId}
            siteName={assignment.siteName}
            initialPermissions={assignment.active ? assignment.permissions : []}
          />
        ))}
        <AddSiteForm userId={user.id} availableSites={availableSites} />
      </div>
    </div>
  );
}
