import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { getEventsBreakdown } from "@/lib/dashboard/queries";

export default async function EventsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site, range } = await resolveDashboardContext(params);

  if (!site) return <p className="text-sm text-[var(--muted)]">No site selected.</p>;

  const supabase = await createClient();
  const rows = await getEventsBreakdown(supabase, site.id, range.from, range.to);
  const query = new URLSearchParams(params as Record<string, string>).toString();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Events</h1>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <th className="px-5 py-3">Event</th>
              <th className="px-5 py-3 text-right">Count</th>
              <th className="px-5 py-3 text-right">Unique visitors</th>
              <th className="px-5 py-3 text-right">Conversions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[var(--muted)]">
                  No events in this range.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.eventName} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-[var(--foreground)]">
                  <Link href={`/events/${encodeURIComponent(row.eventName)}?${query}`} className="hover:text-[var(--accent)]">
                    {row.eventName}
                  </Link>
                </td>
                <td className="px-5 py-3 text-right">{row.count.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.uniqueVisitors.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">{row.conversions.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
