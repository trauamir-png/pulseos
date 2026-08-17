import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getCategoriesForSite } from "@/lib/dashboard/content-categories";
import { CategoriesList } from "@/components/content/categories-list";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_CATEGORIES_MANAGE))) {
    return <AccessDenied />;
  }

  const categories = await getCategoriesForSite(supabase, site.id);

  return <CategoriesList siteId={site.id} categories={categories} />;
}
