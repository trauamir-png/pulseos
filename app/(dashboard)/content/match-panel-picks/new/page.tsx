import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { MatchPanelPickForm } from "@/components/content/match-panel-pick-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function NewMatchPanelPickPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_MANAGE))) {
    return <AccessDenied />;
  }

  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">New panel pick</h1>
        <p className="text-sm text-[var(--muted)]">{site.name}</p>
      </div>
      <MatchPanelPickForm siteId={site.id} query={query} item={null} />
    </div>
  );
}
