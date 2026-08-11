import { fromZonedTime, toZonedTime, format } from "date-fns-tz";
import { startOfDay, endOfDay, subDays } from "date-fns";

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

export interface ResolvedRange {
  preset: RangePreset;
  from: Date;
  to: Date;
  /** Bucketing granularity for the traffic chart. */
  granularity: "hour" | "day";
  timezone: string;
}

/**
 * Resolves a date-range preset (or explicit from/to) into absolute UTC
 * instants, computed against the site's own timezone so "Today" means today
 * in Asia/Jerusalem, not UTC.
 */
export function resolveRange(
  preset: RangePreset,
  timezone: string,
  customFrom?: string | null,
  customTo?: string | null,
): ResolvedRange {
  const nowInTz = toZonedTime(new Date(), timezone);

  if (preset === "custom" && customFrom && customTo) {
    const from = fromZonedTime(startOfDay(new Date(customFrom)), timezone);
    const to = fromZonedTime(endOfDay(new Date(customTo)), timezone);
    const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
    return { preset, from, to, granularity: spanDays <= 3 ? "hour" : "day", timezone };
  }

  switch (preset) {
    case "today": {
      const from = fromZonedTime(startOfDay(nowInTz), timezone);
      const to = fromZonedTime(endOfDay(nowInTz), timezone);
      return { preset, from, to, granularity: "hour", timezone };
    }
    case "yesterday": {
      const yesterday = subDays(nowInTz, 1);
      const from = fromZonedTime(startOfDay(yesterday), timezone);
      const to = fromZonedTime(endOfDay(yesterday), timezone);
      return { preset, from, to, granularity: "hour", timezone };
    }
    case "7d": {
      const from = fromZonedTime(startOfDay(subDays(nowInTz, 6)), timezone);
      const to = fromZonedTime(endOfDay(nowInTz), timezone);
      return { preset, from, to, granularity: "day", timezone };
    }
    case "30d": {
      const from = fromZonedTime(startOfDay(subDays(nowInTz, 29)), timezone);
      const to = fromZonedTime(endOfDay(nowInTz), timezone);
      return { preset, from, to, granularity: "day", timezone };
    }
    case "90d": {
      const from = fromZonedTime(startOfDay(subDays(nowInTz, 89)), timezone);
      const to = fromZonedTime(endOfDay(nowInTz), timezone);
      return { preset, from, to, granularity: "day", timezone };
    }
    default: {
      const from = fromZonedTime(startOfDay(nowInTz), timezone);
      const to = fromZonedTime(endOfDay(nowInTz), timezone);
      return { preset: "today", from, to, granularity: "hour", timezone };
    }
  }
}

export function bucketLabel(date: Date, timezone: string, granularity: "hour" | "day"): string {
  return format(toZonedTime(date, timezone), granularity === "hour" ? "HH:mm" : "MMM d", { timeZone: timezone });
}

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  custom: "Custom range",
};
