import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { UsersList } from "@/components/users/users-list";
import { getActorContext, listUsersForActor, UsersAccessError } from "@/lib/dashboard/users";

export default async function UsersPage() {
  let actor;
  try {
    actor = await getActorContext();
  } catch (e) {
    if (e instanceof UsersAccessError) return <AccessDenied message={e.message} />;
    throw e;
  }

  const users = await listUsersForActor(actor);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Users & Permissions</h1>
          <p className="text-sm text-[var(--muted)]">
            {actor.isAdmin ? "Every PulseOS user across every site." : "Users assigned to the site(s) you manage."}
          </p>
        </div>
        <Link
          href="/users/new"
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          New user
        </Link>
      </div>

      <UsersList users={users} />
    </div>
  );
}
