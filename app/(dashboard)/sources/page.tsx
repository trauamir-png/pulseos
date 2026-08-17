import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { getSourcesBreakdown } from "@/lib/dashboard/queries";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);

  if (!site) return <NoSiteAccess />;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.ANALYTICS_SOURCES_VIEW))) {
    return <AccessDenied />;
  }

  const rows = await getSourcesBreakdown(supabase, site.id, range.from, range.to);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Sources</h1>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3 text-right">Visitors</th>
              <th className="px-5 py-3 text-right">Sessions</th>
              <th className="px-5 py-3 text-right">Page Views</th>
              <th className="px-5 py-3 text-right">Conversions</th>
              <th className="px-5 py-3 text-right">Conv. rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[var(--muted)]">
                  No traffic in this range.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.source} className="border-b border-[var(--border)] last:border-0">
                <td className="px-5 py-3 font-medium capitalize text-[var(--foreground)]">{row.source}</td>
                <td className="px-5 py-3 text-right">{row.visitors.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.sessions.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.pageViews.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.conversions.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.conversionRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
