import { AccessDenied } from "@/components/access-denied";
import { NewUserForm } from "@/components/users/new-user-form";
import { getActorContext, listManageableSites, UsersAccessError } from "@/lib/dashboard/users";

export default async function NewUserPage() {
  let actor;
  try {
    actor = await getActorContext();
  } catch (e) {
    if (e instanceof UsersAccessError) return <AccessDenied message={e.message} />;
    throw e;
  }

  const sites = await listManageableSites(actor);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">New user</h1>
        <p className="text-sm text-[var(--muted)]">Assign one or more sites, and pick permissions for each.</p>
      </div>

      <NewUserForm sites={sites} />
    </div>
  );
}
