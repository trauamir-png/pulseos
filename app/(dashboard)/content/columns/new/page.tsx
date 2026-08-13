import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getAuthorsForSite } from "@/lib/dashboard/content-authors";
import { getCategoriesForSite } from "@/lib/dashboard/content-categories";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { ColumnForm } from "@/components/content/column-form";

export default async function NewColumnPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const [authors, categories, media] = await Promise.all([
    getAuthorsForSite(supabase, site.id),
    getCategoriesForSite(supabase, site.id),
    getMediaForSite(supabase, site.id),
  ]);
  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">New column</h1>
        <p className="text-sm text-[var(--muted)]">{site.name}</p>
      </div>
      <ColumnForm siteId={site.id} query={query} column={null} authors={authors} categories={categories} media={media} />
    </div>
  );
}
