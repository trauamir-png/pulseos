import Link from "next/link";
import type { MatchFanPollRecord } from "@/lib/dashboard/content-match-fan-voting";
import { formatDate } from "@/lib/format/datetime";

const OUTCOME_STYLES: Record<string, string> = {
  win: "bg-green-50 text-green-700",
  draw: "bg-gray-100 text-[var(--muted)]",
  loss: "bg-red-50 text-red-700",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-[var(--muted)]",
  open: "bg-green-50 text-green-700",
  closed: "bg-blue-50 text-blue-700",
};

export function MatchFanPollTable({
  items,
  query,
  timeZone,
}: {
  items: MatchFanPollRecord[];
  query: string;
  timeZone?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <th className="px-4 py-3">Match</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Vote</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                No fan vote polls yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/content/match-fan-voting/${item.id}${query}`} dir="auto" className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
                    {item.opponentName}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">
                    {formatDate(item.matchDate, timeZone)}
                    {item.competition ? ` · ${item.competition}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {item.homeScore != null && item.awayScore != null ? `${item.homeScore}–${item.awayScore}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {item.outcome ? (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${OUTCOME_STYLES[item.outcome]}`}>{item.outcomeLabel}</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-[var(--muted)]">Not final</span>
                  )}
                </td>
                <td className="px-4 py-3" dir="rtl">
                  {item.voteLabel ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[item.status]}`}>{item.status}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
