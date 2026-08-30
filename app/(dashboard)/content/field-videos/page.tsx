import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getFieldVideosForSite } from "@/lib/dashboard/content-field-videos";
import { FieldVideoTable } from "@/components/content/field-video-list";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function FieldVideosPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  if (!site) return <NoSiteAccess />;
  requireModule(site, "content_management");

  const supabase = await createClient();
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_FIELD_VIDEOS_VIEW))) {
    return <AccessDenied />;
  }
  const canManage = await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE);

  const items = await getFieldVideosForSite(supabase, site.id);
  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Field Videos</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        {canManage && (
          <Link
            href={`/content/field-videos/new${query}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New video
          </Link>
        )}
      </div>

      <FieldVideoTable items={items} query={query} timeZone={site.timezone} />
    </div>
  );
}
