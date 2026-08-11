import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { getEventDetail } from "@/lib/dashboard/queries";
import { SimpleAreaChart } from "@/components/simple-area-chart";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { name } = await params;
  const eventName = decodeURIComponent(name);
  const sp = await searchParams;
  const { site, range } = await resolveDashboardContext(sp);

  if (!site) return <p className="text-sm text-[var(--muted)]">No site selected.</p>;

  const supabase = await createClient();
  const detail = await getEventDetail(supabase, site.id, eventName, range.from, range.to, range.timezone, range.granularity);
  const query = new URLSearchParams(sp as Record<string, string>).toString();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/events?${query}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Link>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{eventName}</h1>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Over time</h2>
        <SimpleAreaChart data={detail.timeseries} label={eventName} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Top pages">
          {detail.topPages.length === 0 && <EmptyRow />}
          {detail.topPages.map((p) => (
            <Row key={p.pathname} label={p.pathname} value={p.count} />
          ))}
        </Panel>

        <Panel title="Top sources">
          {detail.topSources.length === 0 && <EmptyRow />}
          {detail.topSources.map((s) => (
            <Row key={s.source} label={s.source} value={s.count} />
          ))}
        </Panel>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Recent properties</h2>
        {detail.recentProperties.length === 0 && <p className="text-sm text-[var(--muted)]">No custom properties recorded for this event.</p>}
        <div className="space-y-2">
          {detail.recentProperties.map((p, i) => (
            <pre key={i} className="overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-[var(--foreground)]">
              {JSON.stringify(p.properties, null, 2)}
            </pre>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="truncate text-[var(--foreground)]">{label}</span>
      <span className="font-medium text-[var(--muted)]">{value}</span>
    </div>
  );
}

function EmptyRow() {
  return <p className="py-2 text-sm text-[var(--muted)]">Nothing yet.</p>;
}
