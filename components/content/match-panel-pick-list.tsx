import Link from "next/link";
import type { MatchPanelPickRecord } from "@/lib/dashboard/content-match-panel-picks";
import { formatDate } from "@/lib/format/datetime";

const OUTCOME_STYLES: Record<string, string> = {
  win: "bg-green-50 text-green-700",
  draw: "bg-gray-100 text-[var(--muted)]",
  loss: "bg-red-50 text-red-700",
};

export function MatchPanelPickTable({
  items,
  query,
  timeZone,
}: {
  items: MatchPanelPickRecord[];
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
            <th className="px-4 py-3">H/A</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Panel Pick</th>
            <th className="px-4 py-3">Player</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                No panel picks yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/content/match-panel-picks/${item.id}${query}`} dir="auto" className="font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
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
                <td className="px-4 py-3 text-[var(--muted)]">{item.isHome ? "Home" : "Away"}</td>
                <td className="px-4 py-3">
                  {item.outcome ? (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${OUTCOME_STYLES[item.outcome]}`}>{item.outcomeLabel}</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-[var(--muted)]">Not final</span>
                  )}
                </td>
                <td className="px-4 py-3" dir="rtl">
                  {item.pickLabel ?? "—"}
                </td>
                <td className="px-4 py-3 text-[var(--foreground)]" dir="auto">
                  {item.playerName}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
