import Link from "next/link";
import type { UserListItem } from "@/lib/dashboard/users";

export function UsersList({ users }: { users: UserListItem[] }) {
  if (users.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No users to show.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Sites</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                  {user.displayName}
                  {user.isAdmin && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                      Admin
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--muted)]">{user.email}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    user.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"
                  }`}
                >
                  {user.active ? "Active" : "Disabled"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {user.sites.length === 0 && <span className="text-[var(--muted)]">—</span>}
                  {user.sites.map((s) => (
                    <span
                      key={s.siteId}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        s.active
                          ? "border-[var(--border)] text-[var(--foreground)]"
                          : "border-[var(--border)] text-[var(--muted)] line-through"
                      }`}
                    >
                      {s.siteName}
                      <span className="ml-1 text-[var(--muted)]">· {s.permissions.length}</span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--muted)]">{new Date(user.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/users/${user.id}`} className="text-sm font-medium text-[var(--accent)] hover:underline">
                  Manage
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
