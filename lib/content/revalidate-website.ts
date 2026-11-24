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
 * Returns whether the website actually confirmed the refresh (a 2xx
 * response), so callers that want to tell the editor the website may be
 * stale can do so -- the underlying publish/revalidate mechanism and its
 * non-throwing contract are unchanged.
 *
 * Reusable across content types: pass whatever cache tag(s) the website's
 * own fetch calls are tagged with (e.g. ["stand-media"], later ["columns"]).
 */
export async function revalidateWebsite(supabase: Supa, siteId: string, tags: string[]): Promise<boolean> {
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!secret) return false;

  try {
    const { data: site } = await supabase.from("sites").select("domain").eq("id", siteId).maybeSingle();
    if (!site?.domain) return false;

    const response = await fetch(`${normalizeDomain(site.domain)}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`[revalidate-website] site ${siteId} tags [${tags.join(", ")}] responded with status ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[revalidate-website] failed to revalidate site ${siteId} tags [${tags.join(", ")}]:`, error);
    return false;
  }
}
