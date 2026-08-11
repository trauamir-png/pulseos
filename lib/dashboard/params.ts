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
