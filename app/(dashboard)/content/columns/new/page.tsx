import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getAuthorsForSite } from "@/lib/dashboard/content-authors";
import { getCategoriesForSite } from "@/lib/dashboard/content-categories";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { ColumnForm } from "@/components/content/column-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function NewColumnPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_CREATE))) {
    return <AccessDenied />;
  }

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
