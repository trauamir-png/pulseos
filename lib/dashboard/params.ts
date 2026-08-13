import { resolveRange, type RangePreset } from "@/lib/analytics/date-range";
import { getSelectedSite } from "@/lib/dashboard/site";

export interface DashboardSearchParams {
  site?: string;
  range?: string;
  from?: string;
  to?: string;
}

/** Shared resolution of ?site=&range=&from=&to= into a concrete site + date range, used by every dashboard page. */
export async function resolveDashboardContext(searchParams: DashboardSearchParams) {
  const { site, sites } = await getSelectedSite(searchParams.site);
  const preset = (searchParams.range as RangePreset) || "7d";
  const timezone = site?.timezone || "UTC";
  const range = resolveRange(preset, timezone, searchParams.from, searchParams.to);

  return { site, sites, range };
}

/**
 * Query string to append to same-dashboard links so navigating between pages
 * (e.g. an Episodes row -> Episode Detail) keeps the same site/range context.
 * Without this, a page that re-resolves its own site from a bare `?site=`
 * silently falls back to "first active site" -- which 404s (via
 * requireModule) or 500 anything gated behind a module the fallback site
 * doesn't have. `siteId` is required and always explicit (not read off
 * incoming params) so the destination page can't drift onto a different site
 * than the one the link was rendered for.
 */
export function dashboardQueryString(params: { siteId: string; range?: string; from?: string; to?: string }): string {
  const qs = new URLSearchParams();
  qs.set("site", params.siteId);
  if (params.range) qs.set("range", params.range);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const s = qs.toString();
  return s ? `?${s}` : "";
}
