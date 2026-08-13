import type { SupabaseClient } from "@supabase/supabase-js";
import { podbeanGet } from "@/lib/podbean/client";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

/**
 * Server-side only. Core upsert primitives for Podbean data. Every write here
 * is keyed on a natural (id, date[, dimension]) key with onConflict upsert,
 * so re-running any of these for the same period is always safe and never
 * creates duplicates -- that's what makes nightly re-sync of a trailing
 * catch-up window, and re-running backfill after a partial failure, both
 * idempotent by construction rather than by tracked progress state.
 */

const DAY_MS = 86_400_000;
const MAX_DAILY_RANGE_DAYS = 85; // Podbean's own cap is 90 days per call; kept a small margin.

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Splits [start, end] into <=85-day chunks (Podbean's own per-call cap for daily download stats is 90 days). */
export function chunkDateRange(start: Date, end: Date, maxDays = MAX_DAILY_RANGE_DAYS): Array<{ start: Date; end: Date }> {
  const chunks: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + (maxDays - 1) * DAY_MS, end.getTime()));
    chunks.push({ start: new Date(cursor), end: chunkEnd });
    cursor = new Date(chunkEnd.getTime() + DAY_MS);
  }
  return chunks;
}

/** Returns the first-of-month Date for each calendar month from `start` through `end`, inclusive. */
export function monthBuckets(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET /podcastStats/stats without episode_id -- podcast-wide daily downloads, chunked to <=85 days per call. */
export async function syncPodcastDownloads(admin: Admin, podcastId: string, start: Date, end: Date, throttleMs = 120): Promise<number> {
  let rowCount = 0;
  for (const chunk of chunkDateRange(start, end)) {
    const data = await podbeanGet<Record<string, number>>("/podcastStats/stats", {
      start: fmtDate(chunk.start),
      end: fmtDate(chunk.end),
      period: "d",
    });
    const rows = Object.entries(data).map(([stat_date, downloads]) => ({ podcast_id: podcastId, stat_date, downloads }));
    if (rows.length > 0) {
      const { error } = await admin.from("podbean_podcast_daily_downloads").upsert(rows, { onConflict: "podcast_id,stat_date" });
      if (error) throw new Error(`podbean_podcast_daily_downloads upsert failed: ${error.message}`);
      rowCount += rows.length;
    }
    await sleep(throttleMs);
  }
  return rowCount;
}

/** GET /podcastStats/stats with episode_id -- one episode's daily downloads, chunked to <=85 days per call. */
export async function syncEpisodeDownloads(
  admin: Admin,
  podcastId: string,
  episodeId: string,
  podbeanEpisodeId: string,
  start: Date,
  end: Date,
  throttleMs = 120,
): Promise<number> {
  let rowCount = 0;
  for (const chunk of chunkDateRange(start, end)) {
    const data = await podbeanGet<Record<string, number>>("/podcastStats/stats", {
      episode_id: podbeanEpisodeId,
      start: fmtDate(chunk.start),
      end: fmtDate(chunk.end),
      period: "d",
    });
    const rows = Object.entries(data).map(([stat_date, downloads]) => ({ episode_id: episodeId, podcast_id: podcastId, stat_date, downloads }));
    if (rows.length > 0) {
      const { error } = await admin.from("podbean_episode_daily_downloads").upsert(rows, { onConflict: "episode_id,stat_date" });
      if (error) throw new Error(`podbean_episode_daily_downloads upsert failed: ${error.message}`);
      rowCount += rows.length;
    }
    await sleep(throttleMs);
  }
  return rowCount;
}

/** GET /podcastStats/stats, period=m -- coarser monthly download total, used only for history older than syncPodcastDownloads' ~90-day reach. */
export async function syncPodcastMonthlyDownloads(admin: Admin, podcastId: string, monthStart: Date, throttleMs = 120): Promise<number> {
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const now = new Date();
  const effectiveEnd = monthEnd > now ? now : monthEnd;
  const startStr = fmtDate(monthStart);
  const data = await podbeanGet<Record<string, number>>("/podcastStats/stats", { start: startStr, end: fmtDate(effectiveEnd), period: "m" });
  const downloads = data[Object.keys(data)[0]] ?? 0;
  const { error } = await admin
    .from("podbean_podcast_monthly_downloads")
    .upsert({ podcast_id: podcastId, month_start: startStr, downloads }, { onConflict: "podcast_id,month_start" });
  if (error) throw new Error(`podbean_podcast_monthly_downloads upsert failed: ${error.message}`);
  await sleep(throttleMs);
  return 1;
}

/** GET /podcastStats/stats with episode_id, period=m -- one episode's coarser monthly download total, same historical-only purpose as syncPodcastMonthlyDownloads. */
export async function syncEpisodeMonthlyDownloads(
  admin: Admin,
  podcastId: string,
  episodeId: string,
  podbeanEpisodeId: string,
  monthStart: Date,
  throttleMs = 120,
): Promise<number> {
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const now = new Date();
  const effectiveEnd = monthEnd > now ? now : monthEnd;
  const startStr = fmtDate(monthStart);
  const data = await podbeanGet<Record<string, number>>("/podcastStats/stats", {
    episode_id: podbeanEpisodeId,
    start: startStr,
    end: fmtDate(effectiveEnd),
    period: "m",
  });
  const downloads = data[Object.keys(data)[0]] ?? 0;
  const { error } = await admin
    .from("podbean_episode_monthly_downloads")
    .upsert({ episode_id: episodeId, podcast_id: podcastId, month_start: startStr, downloads }, { onConflict: "episode_id,month_start" });
  if (error) throw new Error(`podbean_episode_monthly_downloads upsert failed: ${error.message}`);
  await sleep(throttleMs);
  return 1;
}

const DIMENSION_ENDPOINTS = {
  country: "/podcastStats/countries",
  platform: "/podcastStats/platforms",
  source: "/podcastStats/sources",
} as const;

type Dimension = keyof typeof DIMENSION_ENDPOINTS;

async function upsertDimensionRows(
  admin: Admin,
  podcastId: string,
  dimension: Dimension,
  granularity: "day" | "month",
  bucketStart: string,
  data: Record<string, number>,
): Promise<number> {
  const rows = Object.entries(data).map(([dimension_key, downloads]) => ({
    podcast_id: podcastId,
    dimension,
    dimension_key,
    granularity,
    bucket_start: bucketStart,
    downloads,
  }));
  if (rows.length === 0) return 0;
  const { error } = await admin
    .from("podbean_dimension_stats")
    .upsert(rows, { onConflict: "podcast_id,dimension,dimension_key,granularity,bucket_start" });
  if (error) throw new Error(`podbean_dimension_stats upsert failed: ${error.message}`);
  return rows.length;
}

/** Real daily country/platform/source breakdown for a single day (one call per dimension -- Podbean has no per-day-in-one-call variant for these). */
export async function syncDimensionsForDay(admin: Admin, podcastId: string, date: Date, throttleMs = 120): Promise<number> {
  const dateStr = fmtDate(date);
  let total = 0;
  for (const dimension of Object.keys(DIMENSION_ENDPOINTS) as Dimension[]) {
    const data = await podbeanGet<Record<string, number>>(DIMENSION_ENDPOINTS[dimension], { start: dateStr, end: dateStr, period: "d" });
    total += await upsertDimensionRows(admin, podcastId, dimension, "day", dateStr, data);
    await sleep(throttleMs);
  }
  return total;
}

/** Coarser monthly-bucket country/platform/source breakdown, used only for historical backfill beyond what's covered by real daily rows. */
export async function syncDimensionsForMonth(admin: Admin, podcastId: string, monthStart: Date, throttleMs = 120): Promise<number> {
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const now = new Date();
  const effectiveEnd = monthEnd > now ? now : monthEnd;
  const startStr = fmtDate(monthStart);
  const endStr = fmtDate(effectiveEnd);
  let total = 0;
  for (const dimension of Object.keys(DIMENSION_ENDPOINTS) as Dimension[]) {
    const data = await podbeanGet<Record<string, number>>(DIMENSION_ENDPOINTS[dimension], { start: startStr, end: endStr, period: "m" });
    total += await upsertDimensionRows(admin, podcastId, dimension, "month", startStr, data);
    await sleep(throttleMs);
  }
  return total;
}

/** Dated snapshot of engagementStats/stats (all_time) for one episode -- Podbean has no historical time series for this endpoint, so this only ever captures "today's" cumulative state. */
export async function syncEngagementSnapshot(
  admin: Admin,
  podcastId: string,
  episodeId: string,
  podbeanEpisodeId: string,
  statDate: string,
): Promise<void> {
  const data = await podbeanGet<{
    listeners: number;
    engaged_listeners: number;
    average_consumption_rate: number | null;
    average_consumption_time: number | null;
  }>("/engagementStats/stats", { episode_id: podbeanEpisodeId, period: "all_time" });

  const { error } = await admin.from("podbean_episode_engagement_daily").upsert(
    {
      episode_id: episodeId,
      podcast_id: podcastId,
      stat_date: statDate,
      listeners: data.listeners,
      engaged_listeners: data.engaged_listeners,
      average_consumption_rate: data.average_consumption_rate,
      average_consumption_time_seconds: data.average_consumption_time,
    },
    { onConflict: "episode_id,stat_date" },
  );
  if (error) throw new Error(`podbean_episode_engagement_daily upsert failed: ${error.message}`);
}
