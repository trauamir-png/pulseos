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
  // TEMPORARY: remove this diagnostic block once the #441 root cause is found.
  // JSX is deliberately never constructed inside this try -- ESLint's
  // react-hooks/error-boundaries rule flags that as unsound anyway, since JSX
  // creation is lazy and a render-phase throw would happen after this
  // function returns, outside the try. This block only wraps the async data
  // calls, so it can only catch a throw from context/permission/fetch logic,
  // not from React actually rendering the returned tree.
  console.log("[STATUS_SNAPSHOT_DEBUG] page: render entered");

  const { id } = await params;
  const searchParamsResolved = await searchParams;

  let site: Awaited<ReturnType<typeof resolveDashboardContext>>["site"] = null;
  let permitted = false;
  let item: Awaited<ReturnType<typeof getStatusSnapshotById>> = null;

  try {
    const ctx = await resolveDashboardContext(searchParamsResolved);
    site = ctx.site;
    console.log("[STATUS_SNAPSHOT_DEBUG] page: dashboard context resolved", { hasSite: !!site, siteId: site?.id ?? null });

    if (site) {
      requireModule(site, "content_management");

      const supabase = await createClient();
      permitted = await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE);
      console.log("[STATUS_SNAPSHOT_DEBUG] page: permission check passed", { permitted });

      if (permitted) {
        console.log("[STATUS_SNAPSHOT_DEBUG] page: snapshot fetch started", { id, siteId: site.id });
        item = await getStatusSnapshotById(supabase, site.id, id);
        console.log("[STATUS_SNAPSHOT_DEBUG] page: snapshot fetch result", { found: !!item });
      }
    }
  } catch (err) {
    const e = err as (Error & { digest?: string }) | null;
    console.error("[STATUS_SNAPSHOT_DEBUG] page: caught error", {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      digest: e?.digest,
    });
    throw err;
  }

  if (!site) return <NoSiteAccess />;
  if (!permitted) return <AccessDenied />;

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

  console.log("[STATUS_SNAPSHOT_DEBUG] page: before rendering StatusSnapshotForm");
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
