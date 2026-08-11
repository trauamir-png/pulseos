import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { getSummary, getTimeseries } from "@/lib/dashboard/queries";
import { KpiCard } from "@/components/kpi-card";
import { TrafficChart } from "@/components/traffic-chart";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);

  if (!site) {
    return (
      <EmptyState />
    );
  }

  const supabase = await createClient();
  const [summary, timeseries] = await Promise.all([
    getSummary(supabase, site.id, range.from, range.to),
    getTimeseries(supabase, site.id, range.from, range.to, range.timezone, range.granularity, "visitors"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{site.name}</h1>
        <p className="text-sm text-[var(--muted)]">{site.domain}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Visitors" value={summary.visitors.toLocaleString()} />
        <KpiCard label="Sessions" value={summary.sessions.toLocaleString()} />
        <KpiCard label="Page Views" value={summary.pageViews.toLocaleString()} />
        <KpiCard label="Events" value={summary.events.toLocaleString()} />
        <KpiCard label="Conversion Rate" value={summary.conversionRate.toFixed(1)} suffix="%" />
      </div>

      <TrafficChart
        key={`${site.id}-${range.from.toISOString()}-${range.to.toISOString()}`}
        siteId={site.id}
        initialData={timeseries}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-lg font-medium text-[var(--foreground)]">No sites yet</p>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        Create your first site to start tracking. PulseOS is multi-site from day one.
      </p>
      <Link href="/sites" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        Go to Sites
      </Link>
    </div>
  );
}
