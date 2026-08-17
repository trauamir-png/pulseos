import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { MediaGrid } from "@/components/content/media-grid";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function MediaPage({ searchParams }: { searchParams: Promise<DashboardSearchParams & { q?: string }> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_MEDIA_MANAGE))) {
    return <AccessDenied />;
  }

  const media = await getMediaForSite(supabase, site.id, params.q);

  return <MediaGrid siteId={site.id} initialAssets={media} />;
}
