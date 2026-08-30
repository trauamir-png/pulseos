import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getFieldVideoById } from "@/lib/dashboard/content-field-videos";
import { FieldVideoForm } from "@/components/content/field-video-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function EditFieldVideoPage({
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
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE))) {
    return <AccessDenied />;
  }

  const item = await getFieldVideoById(supabase, site.id, id);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!item) {
    return (
      <div className="space-y-6">
        <Link href={`/content/field-videos${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to Field Videos
        </Link>
        <p className="text-sm text-[var(--muted)]">Video not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/content/field-videos${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to Field Videos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]" dir="auto">
          {item.caption?.trim() || "(untitled)"}
        </h1>
      </div>
      <FieldVideoForm siteId={site.id} query={query} item={item} />
    </div>
  );
}
