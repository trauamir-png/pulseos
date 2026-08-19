import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

function normalizeDomain(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

/**
 * Best-effort ping asking a site's public website to drop its Next.js fetch
 * cache for the given tags, so a CMS edit shows up immediately instead of
 * waiting out the fetch-level ISR window. Never throws: a missing site
 * domain, an unconfigured secret, or a failed/timed-out request just means
 * the website falls back to its normal revalidate interval, which is always
 * still eventually correct -- this is a freshness optimization, not a
 * correctness dependency.
 *
 * Reusable across content types: pass whatever cache tag(s) the website's
 * own fetch calls are tagged with (e.g. ["stand-media"], later ["columns"]).
 */
export async function revalidateWebsite(supabase: Supa, siteId: string, tags: string[]): Promise<void> {
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!secret) return;

  try {
    const { data: site } = await supabase.from("sites").select("domain").eq("id", siteId).maybeSingle();
    if (!site?.domain) return;

    await fetch(`${normalizeDomain(site.domain)}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error(`[revalidate-website] failed to revalidate site ${siteId} tags [${tags.join(", ")}]:`, error);
  }
}
