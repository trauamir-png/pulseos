import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getAuthorsForSite } from "@/lib/dashboard/content-authors";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { AuthorsList } from "@/components/content/authors-list";

export default async function AuthorsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const [authors, media] = await Promise.all([getAuthorsForSite(supabase, site.id), getMediaForSite(supabase, site.id)]);

  return <AuthorsList siteId={site.id} authors={authors} media={media} />;
}
