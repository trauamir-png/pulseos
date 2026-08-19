import Link from "next/link";
import type { StandMediaRecord } from "@/lib/dashboard/content-stand-media";
import { formatDate } from "@/lib/format/datetime";

export function StandMediaTable({
  items,
  query,
  timeZone,
}: {
  items: StandMediaRecord[];
  query: string;
  timeZone?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">TikTok URL</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Published</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                No Stand Media videos yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/content/stand-media/${item.id}${query}`} dir="auto" className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                    {item.title}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-[var(--muted)]">{item.tiktokUrl}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.status === "published" ? "bg-green-50 text-green-700" : "bg-gray-100 text-[var(--muted)]"
                    }`}
                  >
                    {item.status === "published" ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{item.publishedAt ? formatDate(item.publishedAt, timeZone) : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
