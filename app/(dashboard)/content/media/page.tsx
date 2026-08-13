import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { MediaGrid } from "@/components/content/media-grid";

export default async function MediaPage({ searchParams }: { searchParams: Promise<DashboardSearchParams & { q?: string }> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const media = await getMediaForSite(supabase, site.id, params.q);

  return <MediaGrid siteId={site.id} initialAssets={media} />;
}
