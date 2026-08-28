import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getStatusSnapshotsForSite } from "@/lib/dashboard/content-status-snapshots";
import { StatusSnapshotTable } from "@/components/content/status-snapshot-list";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function StatusSnapshotPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_VIEW))) {
    return <AccessDenied />;
  }
  const canManage = await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE);

  const items = await getStatusSnapshotsForSite(supabase, site.id);
  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">תמונת מצב</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        {canManage && (
          <Link
            href={`/content/status-snapshot/new${query}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            עדכון חדש
          </Link>
        )}
      </div>

      <StatusSnapshotTable items={items} query={query} timeZone={site.timezone} />
    </div>
  );
}
