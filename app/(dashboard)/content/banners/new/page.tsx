import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { BannerForm } from "@/components/content/banner-form";

export default async function NewBannerPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const media = await getMediaForSite(supabase, site.id);
  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">New banner</h1>
        <p className="text-sm text-[var(--muted)]">{site.name}</p>
      </div>
      <BannerForm siteId={site.id} query={query} banner={null} media={media} />
    </div>
  );
}
