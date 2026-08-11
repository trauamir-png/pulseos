import { createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Anonymous, privacy-conscious visitor identity: HMAC(dailySalt, siteId|ip|userAgent).
 * The raw IP is never persisted — it is hashed here and discarded. The salt
 * rotates every UTC day, so the same person is a different hash tomorrow.
 * That's a deliberate trade-off (no fingerprinting, no persistent identifier)
 * documented in supabase/migrations/0001_init.sql.
 */
export async function getDailySalt(supabase: SupabaseClient<Database>): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase.from("daily_salts").select("salt").eq("day", today).maybeSingle();

  if (existing?.salt) return existing.salt;

  const salt = randomBytes(32).toString("hex");
  const { data: inserted } = await supabase
    .from("daily_salts")
    .insert({ day: today, salt })
    .select("salt")
    .maybeSingle();

  if (inserted?.salt) return inserted.salt;

  // Lost an insert race — another request created today's row first.
  const { data: retry } = await supabase.from("daily_salts").select("salt").eq("day", today).maybeSingle();
  return retry?.salt ?? salt;
}

export function computeVisitorHash(salt: string, siteId: string, ip: string, userAgent: string): string {
  return createHmac("sha256", salt).update(`${siteId}|${ip}|${userAgent}`).digest("hex");
}
