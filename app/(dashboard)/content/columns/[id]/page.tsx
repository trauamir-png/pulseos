import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getColumnById } from "@/lib/dashboard/content-columns";
import { getAuthorsForSite } from "@/lib/dashboard/content-authors";
import { getCategoriesForSite } from "@/lib/dashboard/content-categories";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { ColumnForm } from "@/components/content/column-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { getCurrentUser, hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function EditColumnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { id } = await params;
  const searchParamsResolved = await searchParams;
  const { site } = await resolveDashboardContext(searchParamsResolved);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  const [column, authors, categories, media, user, canEditAll, canEditOwn, canPublish, canSchedule, canDelete] = await Promise.all([
    getColumnById(supabase, site.id, id),
    getAuthorsForSite(supabase, site.id),
    getCategoriesForSite(supabase, site.id),
    getMediaForSite(supabase, site.id),
    getCurrentUser(supabase),
    hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL),
    hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN),
    hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_PUBLISH),
    hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_SCHEDULE),
    hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_DELETE),
  ]);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (column) {
    const isOwner = user != null && column.createdBy === user.id;
    if (!canEditAll && !(canEditOwn && isOwner)) {
      return <AccessDenied />;
    }
  }

  if (!column) {
    return (
      <div className="space-y-6">
        <Link href={`/content/columns${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to columns
        </Link>
        <p className="text-sm text-[var(--muted)]">Column not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/content/columns${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to columns
        </Link>
        <h1 dir="auto" className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          {column.title}
        </h1>
      </div>
      <ColumnForm
        siteId={site.id}
        query={query}
        column={column}
        authors={authors}
        categories={categories}
        media={media}
        timeZone={site.timezone}
        canPublish={canPublish}
        canSchedule={canSchedule}
        canDelete={canDelete}
      />
    </div>
  );
}
