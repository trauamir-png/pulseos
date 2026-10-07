import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getStartingXiSnapshotById, getPlayerResultsForSnapshot } from "@/lib/dashboard/content-starting-xi";
import { StartingXiDetail } from "@/components/content/starting-xi-detail";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

export default async function StartingXiDetailPage({
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
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_STARTING_XI_VIEW))) {
    return <AccessDenied />;
  }

  const snapshot = await getStartingXiSnapshotById(supabase, site.id, id);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <Link href={`/content/starting-xi${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to בחירת ה-11
        </Link>
        <p className="text-sm text-[var(--muted)]">Snapshot not found.</p>
      </div>
    );
  }

  const players = await getPlayerResultsForSnapshot(supabase, snapshot.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/content/starting-xi${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to בחירת ה-11
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]" dir="auto">
          {snapshot.opponentName}
        </h1>
      </div>
      <StartingXiDetail snapshot={snapshot} players={players} timeZone={site.timezone} />
    </div>
  );
}
