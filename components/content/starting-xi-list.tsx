import Link from "next/link";
import type { StartingXiSnapshotRecord } from "@/lib/dashboard/content-starting-xi";
import { formatDateTime } from "@/lib/format/datetime";

const STATUS_STYLES: Record<StartingXiSnapshotRecord["votingStatus"], string> = {
  open: "bg-green-50 text-green-700",
  closed: "bg-blue-50 text-blue-700",
  unavailable: "bg-gray-100 text-[var(--muted)]",
};

const STATUS_LABELS: Record<StartingXiSnapshotRecord["votingStatus"], string> = {
  open: "Open",
  closed: "Closed",
  unavailable: "Unavailable",
};

export function StartingXiTable({
  items,
  query,
  timeZone,
}: {
  items: StartingXiSnapshotRecord[];
  query: string;
  timeZone?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3">Match</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Submissions</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                No Starting XI snapshots yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/content/starting-xi/${item.id}${query}`} dir="auto" className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                    {item.opponentName}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">{formatDateTime(item.kickoffAt, timeZone)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[item.votingStatus]}`}>
                    {STATUS_LABELS[item.votingStatus]}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{item.totalSubmissions}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatDateTime(item.updatedAt, timeZone)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
