import { createClient } from "@/lib/supabase/server";
import { getSelectedSite } from "@/lib/dashboard/site";
import { getRealtimeSnapshot } from "@/lib/dashboard/queries";
import { RealtimeView } from "@/components/realtime-view";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function RealtimePage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const params = await searchParams;
  const { site } = await getSelectedSite(params.site);

  if (!site) {
    return <NoSiteAccess />;
  }

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.ANALYTICS_REALTIME_VIEW))) {
    return <AccessDenied />;
  }

  const snapshot = await getRealtimeSnapshot(supabase, site.id);

  return <RealtimeView key={site.id} siteId={site.id} initialSnapshot={snapshot} />;
}
