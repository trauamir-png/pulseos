import { createClient } from "@/lib/supabase/server";
import { getSelectedSite } from "@/lib/dashboard/site";
import { getRealtimeSnapshot } from "@/lib/dashboard/queries";
import { RealtimeView } from "@/components/realtime-view";

export default async function RealtimePage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const params = await searchParams;
  const { site } = await getSelectedSite(params.site);

  if (!site) {
    return <p className="text-sm text-[var(--muted)]">No site selected.</p>;
  }

  const supabase = await createClient();
  const snapshot = await getRealtimeSnapshot(supabase, site.id);

  return <RealtimeView key={site.id} siteId={site.id} initialSnapshot={snapshot} />;
}
