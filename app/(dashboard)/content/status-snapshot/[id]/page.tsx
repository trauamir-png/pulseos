import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getStatusSnapshotById } from "@/lib/dashboard/content-status-snapshots";
import { StatusSnapshotForm } from "@/components/content/status-snapshot-form";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function EditStatusSnapshotPage({
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
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE))) {
    return <AccessDenied />;
  }

  const item = await getStatusSnapshotById(supabase, site.id, id);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!item) {
    return (
      <div dir="rtl" className="space-y-6">
        <Link href={`/content/status-snapshot${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          → חזרה לתמונת מצב
        </Link>
        <p className="text-sm text-[var(--muted)]">העדכון לא נמצא.</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <Link href={`/content/status-snapshot${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          → חזרה לתמונת מצב
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]" dir="auto">
          {item.headline}
        </h1>
      </div>
      <StatusSnapshotForm siteId={site.id} query={query} item={item} />
    </div>
  );
}
