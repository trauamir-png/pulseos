import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getColumnById } from "@/lib/dashboard/content-columns";
import { getAuthorById } from "@/lib/dashboard/content-authors";
import { getCategoryById } from "@/lib/dashboard/content-categories";
import { formatDate } from "@/lib/format/datetime";
import { StatusBadge } from "@/components/content/status-badge";
import { AccessDenied, NoSiteAccess } from "@/components/access-denied";
import { hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

/**
 * Internal-only preview: renders a Column exactly as it will look publicly,
 * regardless of status (draft/scheduled included). Never exposed outside the
 * authenticated dashboard -- the public Content API only ever serves
 * published/due-scheduled rows.
 */
export default async function ColumnPreviewPage({
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
  if (!(await hasPermission(supabase, site.id, PERMISSIONS.CONTENT_COLUMNS_VIEW))) {
    return <AccessDenied />;
  }
  const column = await getColumnById(supabase, site.id, id);
  const query = dashboardQueryString({ siteId: site.id, range: searchParamsResolved.range, from: searchParamsResolved.from, to: searchParamsResolved.to });

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

  const [author, category] = await Promise.all([
    getAuthorById(supabase, site.id, column.authorId),
    getCategoryById(supabase, site.id, column.categoryId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/content/columns/${column.id}${query}`} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Back to editor
        </Link>
        <StatusBadge status={column.status} />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        {column.featuredImageUrl && (
          <Image
            src={column.featuredImageUrl}
            alt=""
            width={900}
            height={420}
            className="mb-6 h-72 w-full rounded-lg object-cover"
            unoptimized
          />
        )}
        {category && <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{category.name}</p>}
        <h1 dir="auto" className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
          {column.title}
        </h1>
        {column.subtitle && (
          <p dir="auto" className="mt-2 text-lg text-[var(--muted)]">
            {column.subtitle}
          </p>
        )}
        <p className="mt-3 text-sm text-[var(--muted)]">
          {author?.name ?? "Unknown author"}
          {column.publishedAt && ` · ${formatDate(column.publishedAt, site.timezone)}`}
        </p>
        <div className="column-body mt-6" dangerouslySetInnerHTML={{ __html: column.body }} />
      </div>
    </div>
  );
}
