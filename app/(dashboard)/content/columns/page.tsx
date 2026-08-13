import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getColumnsForSite } from "@/lib/dashboard/content-columns";
import { getCategoriesForSite } from "@/lib/dashboard/content-categories";
import { ColumnsFilterBar, ColumnsTable } from "@/components/content/columns-list";

export default async function ColumnsPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams & { q?: string; status?: string; category?: string }>;
}) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const [columns, categories] = await Promise.all([
    getColumnsForSite(supabase, site.id, { q: params.q, status: params.status, categoryId: params.category }),
    getCategoriesForSite(supabase, site.id),
  ]);
  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Columns</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        <Link
          href={`/content/columns/new${query}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New column
        </Link>
      </div>

      <ColumnsFilterBar categories={categories} />
      <ColumnsTable columns={columns} query={query} />
    </div>
  );
}
