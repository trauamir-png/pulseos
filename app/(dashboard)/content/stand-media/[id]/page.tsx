import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getStandMediaById } from "@/lib/dashboard/content-stand-media";
import { StandMediaForm } from "@/components/content/stand-media-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function EditStandMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { id } = await params;
  // TEMPORARY: remove this diagnostic log once the #441 root cause is found.
  console.log("[stand-media-441] page: render entry", { id });
  const searchParamsResolved = await searchParams;
  const { site } = await resolveDashboardContext(searchParamsResolved);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE))) {
    return <AccessDenied />;
  }

  const item = await getStandMediaById(supabase, site.id, id);
  // TEMPORARY: remove this diagnostic log once the #441 root cause is found.
  console.log("[stand-media-441] page: loader returned", { id, found: !!item });
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!item) {
    return (
      <div className="space-y-6">
        <Link href={`/content/stand-media${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to Stand Media
        </Link>
        <p className="text-sm text-[var(--muted)]">Video not found.</p>
      </div>
    );
  }

  // TEMPORARY: remove this diagnostic log once the #441 root cause is found.
  console.log("[stand-media-441] page: before rendering form", { id });
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/content/stand-media${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to Stand Media
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]" dir="auto">
          {item.title}
        </h1>
      </div>
      <StandMediaForm siteId={site.id} query={query} item={item} />
    </div>
  );
}
