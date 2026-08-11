import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const REQUESTS_PER_MINUTE = 600;

/** Cheap DB-backed per-site throttle for the ingestion endpoint — no external service. */
export async function isRateLimited(supabase: SupabaseClient<Database>, siteId: string): Promise<boolean> {
  const minuteBucket = new Date();
  minuteBucket.setSeconds(0, 0);

  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_site_id: siteId,
    p_minute_bucket: minuteBucket.toISOString(),
  });

  if (error) {
    // Fail open — never let a rate-limit hiccup take down ingestion.
    return false;
  }

  return (data as number) > REQUESTS_PER_MINUTE;
}
