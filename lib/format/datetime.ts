import { format } from "date-fns-tz";

/**
 * Fallback used whenever a call site has no site context in scope, mirroring
 * the site?.timezone || "UTC" convention in lib/dashboard/params.ts.
 */
export const DEFAULT_TIMEZONE = "UTC";

/**
 * date-fns-tz's format() renders with a fixed (English) locale and an
 * explicit IANA timeZone, so output is identical on server and client
 * regardless of the runtime's default locale -- unlike
 * Date.prototype.toLocaleString()/toLocaleDateString(), whose output depends
 * on the calling environment's locale and caused a real SSR/client hydration
 * mismatch (server defaulted to English, browser resolved to Hebrew).
 */
export function formatDateTime(iso: string | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return "Never";
  return format(new Date(iso), "MMM d, yyyy, h:mm a", { timeZone });
}

export function formatDate(iso: string | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return "–";
  return format(new Date(iso), "MMM d, yyyy", { timeZone });
}

export function formatShortDate(iso: string | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return "–";
  return format(new Date(iso), "MMM d", { timeZone });
}

export function formatMonthYear(iso: string | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return "–";
  return format(new Date(iso), "MMM yy", { timeZone });
}
