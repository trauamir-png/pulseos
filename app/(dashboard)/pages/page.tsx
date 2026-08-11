import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { getPagesBreakdown } from "@/lib/dashboard/queries";

export default async function PagesPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);

  if (!site) return <p className="text-sm text-[var(--muted)]">No site selected.</p>;

  const supabase = await createClient();
  const rows = await getPagesBreakdown(supabase, site.id, range.from, range.to);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Pages</h1>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3">Page</th>
              <th className="px-5 py-3 text-right">Views</th>
              <th className="px-5 py-3 text-right">Unique visitors</th>
              <th className="px-5 py-3 text-right">Avg. engagement</th>
              <th className="px-5 py-3 text-right">Entrances</th>
              <th className="px-5 py-3 text-right">Exits</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[var(--muted)]">
                  No page views in this range.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.pathname} className="border-b border-[var(--border)] last:border-0">
                <td className="max-w-xs truncate px-5 py-3 font-medium text-[var(--foreground)]">{row.pathname}</td>
                <td className="px-5 py-3 text-right">{row.views.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.uniqueVisitors.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{formatDuration(row.avgEngagementSeconds)}</td>
                <td className="px-5 py-3 text-right">{row.entrances.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.exits.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
