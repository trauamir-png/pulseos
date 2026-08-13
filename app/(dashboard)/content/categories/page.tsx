import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getCategoriesForSite } from "@/lib/dashboard/content-categories";
import { CategoriesList } from "@/components/content/categories-list";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const categories = await getCategoriesForSite(supabase, site.id);

  return <CategoriesList siteId={site.id} categories={categories} />;
}
