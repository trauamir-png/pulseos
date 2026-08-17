import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getAuthorsForSite } from "@/lib/dashboard/content-authors";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { AuthorsList } from "@/components/content/authors-list";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function AuthorsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_AUTHORS_MANAGE))) {
    return <AccessDenied />;
  }

  const [authors, media] = await Promise.all([getAuthorsForSite(supabase, site.id), getMediaForSite(supabase, site.id)]);

  return <AuthorsList siteId={site.id} authors={authors} media={media} />;
}
