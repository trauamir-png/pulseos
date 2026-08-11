import { createClient } from "@/lib/supabase/server";

export interface SiteRecord {
  id: string;
  name: string;
  domain: string;
  site_key: string;
  timezone: string;
  active: boolean;
  created_at: string;
}

export async function listSites(): Promise<SiteRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("sites").select("*").order("created_at", { ascending: true });
  return data ?? [];
}

/** Resolves the site to show: the one requested via ?site=, or the first active site. */
export async function getSelectedSite(requestedId?: string): Promise<{ site: SiteRecord | null; sites: SiteRecord[] }> {
  const sites = await listSites();
  if (sites.length === 0) return { site: null, sites };

  const requested = requestedId ? sites.find((s) => s.id === requestedId) : undefined;
  return { site: requested ?? sites.find((s) => s.active) ?? sites[0], sites };
}
