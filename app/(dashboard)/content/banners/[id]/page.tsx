import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getBannerById } from "@/lib/dashboard/content-banners";
import { getMediaForSite } from "@/lib/dashboard/content-media";
import { BannerForm } from "@/components/content/banner-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function EditBannerPage({
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
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_BANNERS_MANAGE))) {
    return <AccessDenied />;
  }

  const [banner, media] = await Promise.all([getBannerById(supabase, site.id, id), getMediaForSite(supabase, site.id)]);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!banner) {
    return (
      <div className="space-y-6">
        <Link href={`/content/banners${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to banners
        </Link>
        <p className="text-sm text-[var(--muted)]">Banner not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/content/banners${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to banners
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{banner.internalName}</h1>
      </div>
      <BannerForm siteId={site.id} query={query} banner={banner} media={media} />
    </div>
  );
}
