import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { ConversionEventsManager } from "@/components/conversion-events";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const sp = await searchParams;
  const { site } = await resolveDashboardContext(sp);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const conversionEvents = site
    ? (
        await supabase
          .from("site_conversion_events")
          .select("event_name")
          .eq("site_id", site.id)
          .order("event_name", { ascending: true })
      ).data ?? []
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Admin account</h2>
        <p className="text-sm text-[var(--muted)]">{user?.email ?? "Unknown"}</p>
      </div>

      {site ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--foreground)]">Conversion events — {site.name}</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Events with these names count toward the Conversion Rate KPI and per-source/per-event conversion counts. New rules apply to events recorded from now on.
          </p>
          <ConversionEventsManager siteId={site.id} events={conversionEvents.map((e) => e.event_name)} />
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">Select a site to manage its conversion events.</p>
      )}
    </div>
  );
}
