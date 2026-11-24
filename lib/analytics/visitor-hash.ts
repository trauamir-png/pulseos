import { createHmac, randomBytes } from "crypto";
import { toZonedTime, format } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Local calendar day (YYYY-MM-DD) for `date` in the given IANA timezone.
 * Pure and DST-safe: defers to date-fns-tz / the ICU tz database (the same
 * toZonedTime+format idiom already used in date-range.ts and
 * dashboard/queries.ts) instead of a manual UTC offset, so it stays correct
 * across a DST transition without any special-casing here.
 */
export function getSaltDayKey(date: Date, timezone: string): string {
  return format(toZonedTime(date, timezone), "yyyy-MM-dd", { timeZone: timezone });
}

/**
 * Anonymous, privacy-conscious visitor identity: HMAC(dailySalt, siteId|ip|userAgent).
 * The raw IP is never persisted — it is hashed here and discarded. The salt
 * rotates every local calendar day IN THE SITE'S OWN TIMEZONE (see
 * getSaltDayKey), so the same person is a different hash on their next local
 * day. That's a deliberate trade-off (no fingerprinting, no persistent
 * identifier) documented in supabase/migrations/0001_init.sql and
 * 0024_daily_salts_timezone.sql.
 */
export async function getDailySalt(supabase: SupabaseClient<Database>, timezone: string): Promise<string> {
  const today = getSaltDayKey(new Date(), timezone);

  const { data: existing } = await supabase
    .from("daily_salts")
    .select("salt")
    .eq("day", today)
    .eq("timezone", timezone)
    .maybeSingle();

  if (existing?.salt) return existing.salt;

  const salt = randomBytes(32).toString("hex");
  const { data: inserted } = await supabase
    .from("daily_salts")
    .insert({ day: today, timezone, salt })
    .select("salt")
    .maybeSingle();

  if (inserted?.salt) return inserted.salt;

  // Lost an insert race — another request created today's (day, timezone) row first.
  const { data: retry } = await supabase
    .from("daily_salts")
    .select("salt")
    .eq("day", today)
    .eq("timezone", timezone)
    .maybeSingle();
  return retry?.salt ?? salt;
}

export function computeVisitorHash(salt: string, siteId: string, ip: string, userAgent: string): string {
  return createHmac("sha256", salt).update(`${siteId}|${ip}|${userAgent}`).digest("hex");
}
