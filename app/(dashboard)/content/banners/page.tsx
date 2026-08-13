import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveDashboardContext, dashboardQueryString, type DashboardSearchParams } from "@/lib/dashboard/params";
import { requireModule } from "@/lib/dashboard/modules";
import { getBannersForSite } from "@/lib/dashboard/content-banners";
import { BannersTable } from "@/components/content/banners-list";

export default async function BannersPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const params = await searchParams;
  const { site } = await resolveDashboardContext(params);
  requireModule(site, "content_management");

  const supabase = await createClient();
  const banners = await getBannersForSite(supabase, site.id);
  const query = dashboardQueryString({ siteId: site.id, range: params.range, from: params.from, to: params.to });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Banners</h1>
          <p className="text-sm text-[var(--muted)]">{site.name}</p>
        </div>
        <Link
          href={`/content/banners/new${query}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New banner
        </Link>
      </div>

      <BannersTable banners={banners} query={query} />
    </div>
  );
}
