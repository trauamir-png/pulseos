import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface SiteRecord {
  id: string;
  name: string;
  /** null for podcast-only sites, which have no web domain to track. */
  domain: string | null;
  site_key: string;
  timezone: string;
  active: boolean;
  created_at: string;
  /** Active module keys for this site, e.g. ["web_analytics"]. */
  modules: string[];
}

/**
 * Wrapped in React's cache() so the layout's call and every page's
 * resolveDashboardContext() -> getSelectedSite() call share one query per
 * request instead of hitting Supabase twice on every navigation.
 */
export const listSites = cache(async (): Promise<SiteRecord[]> => {
  const supabase = await createClient();
  const [{ data: sites }, { data: modules }] = await Promise.all([
    supabase.from("sites").select("*").order("created_at", { ascending: true }),
    supabase.from("site_modules").select("site_id, module_key, active").eq("active", true),
  ]);

  const modulesBySite = new Map<string, string[]>();
  for (const row of modules ?? []) {
    const list = modulesBySite.get(row.site_id) ?? [];
    list.push(row.module_key);
    modulesBySite.set(row.site_id, list);
  }

  return (sites ?? []).map((site) => ({ ...site, modules: modulesBySite.get(site.id) ?? [] }));
});

/** Resolves the site to show: the one requested via ?site=, or the first active site. */
export async function getSelectedSite(requestedId?: string): Promise<{ site: SiteRecord | null; sites: SiteRecord[] }> {
  const sites = await listSites();
  if (sites.length === 0) return { site: null, sites };

  const requested = requestedId ? sites.find((s) => s.id === requestedId) : undefined;
  return { site: requested ?? sites.find((s) => s.active) ?? sites[0], sites };
}
