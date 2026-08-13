import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

/**
 * Read-query layer for Podbean-sourced data (downloads, listeners,
 * engagement, countries/platforms/sources). Deliberately separate from
 * podcast-queries.ts, which reads PulseOS's own Web Player measurements --
 * a Podbean "download" and a PulseOS "listen" are different things measured
 * by different systems and must never be summed or displayed as one number.
 */

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface PodbeanDownloadsSummary {
  rangeDownloads: number;
  allTimeDownloads: number;
}

/**
 * "All-time" combines true daily rows (the trailing ~90-day window Podbean
 * actually allows) with coarser monthly-total rows (older history, backfilled
 * once via period=m). The backfill deliberately never writes a monthly row
 * for a month that overlaps the daily window, so this sum never double-counts.
 */
export async function getPodbeanDownloadsSummary(supabase: Supa, podcastId: string, from: Date, to: Date): Promise<PodbeanDownloadsSummary> {
  const [rangeRes, dailyAllRes, monthlyAllRes] = await Promise.all([
    supabase
      .from("podbean_podcast_daily_downloads")
      .select("downloads")
      .eq("podcast_id", podcastId)
      .gte("stat_date", fmtDate(from))
      .lte("stat_date", fmtDate(to)),
    supabase.from("podbean_podcast_daily_downloads").select("downloads").eq("podcast_id", podcastId),
    supabase.from("podbean_podcast_monthly_downloads").select("downloads").eq("podcast_id", podcastId),
  ]);

  const sum = (rows: Array<{ downloads: number }> | null) => (rows ?? []).reduce((s, r) => s + r.downloads, 0);

  return {
    rangeDownloads: sum(rangeRes.data),
    allTimeDownloads: sum(dailyAllRes.data) + sum(monthlyAllRes.data),
  };
}

export interface PodbeanDownloadPoint {
  date: string;
  downloads: number;
}

export async function getPodbeanDownloadsTimeseries(supabase: Supa, podcastId: string, from: Date, to: Date): Promise<PodbeanDownloadPoint[]> {
  const { data } = await supabase
    .from("podbean_podcast_daily_downloads")
    .select("stat_date, downloads")
    .eq("podcast_id", podcastId)
    .gte("stat_date", fmtDate(from))
    .lte("stat_date", fmtDate(to))
    .order("stat_date", { ascending: true });

  return (data ?? []).map((r) => ({ date: r.stat_date, downloads: r.downloads }));
}

export interface PodbeanMonthlyDownloadPoint {
  monthStart: string;
  downloads: number;
}

/** Coarser monthly-total history (older than the trailing daily window can reach) -- mirrors getPodbeanDimensionsAllTimeMonthly's granularity split. */
export async function getPodbeanMonthlyDownloadsHistory(supabase: Supa, podcastId: string): Promise<PodbeanMonthlyDownloadPoint[]> {
  const { data } = await supabase
    .from("podbean_podcast_monthly_downloads")
    .select("month_start, downloads")
    .eq("podcast_id", podcastId)
    .order("month_start", { ascending: true });

  return (data ?? []).map((r) => ({ monthStart: r.month_start, downloads: r.downloads }));
}

export interface PodbeanTopEpisodeRow {
  episodeId: string;
  title: string;
  episodeNumber: number | null;
  downloads: number;
}

export async function getPodbeanTopEpisodes(supabase: Supa, podcastId: string, from: Date, to: Date, limit = 10): Promise<PodbeanTopEpisodeRow[]> {
  const { data: downloadRows } = await supabase
    .from("podbean_episode_daily_downloads")
    .select("episode_id, downloads")
    .eq("podcast_id", podcastId)
    .gte("stat_date", fmtDate(from))
    .lte("stat_date", fmtDate(to));

  if (!downloadRows || downloadRows.length === 0) return [];

  const totals = new Map<string, number>();
  for (const row of downloadRows) {
    totals.set(row.episode_id, (totals.get(row.episode_id) ?? 0) + row.downloads);
  }

  const episodeIds = Array.from(totals.keys());
  const { data: episodes } = await supabase.from("episodes").select("id, title, episode_number").in("id", episodeIds);
  const episodeById = new Map((episodes ?? []).map((e) => [e.id, e]));

  return Array.from(totals.entries())
    .map(([episodeId, downloads]) => ({
      episodeId,
      title: episodeById.get(episodeId)?.title ?? "(deleted episode)",
      episodeNumber: episodeById.get(episodeId)?.episode_number ?? null,
      downloads,
    }))
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, limit);
}

export interface PodbeanDimensionRow {
  key: string;
  downloads: number;
}

export type PodbeanDimension = "country" | "platform" | "source";

/** Real daily breakdown summed over the given range. Sparse/empty for dates before the daily dimension sync began -- see getPodbeanDimensionsAllTimeMonthly for that older history. */
export async function getPodbeanDimensionsForRange(supabase: Supa, podcastId: string, dimension: PodbeanDimension, from: Date, to: Date): Promise<PodbeanDimensionRow[]> {
  const { data } = await supabase
    .from("podbean_dimension_stats")
    .select("dimension_key, downloads")
    .eq("podcast_id", podcastId)
    .eq("dimension", dimension)
    .eq("granularity", "day")
    .gte("bucket_start", fmtDate(from))
    .lte("bucket_start", fmtDate(to));

  return aggregateByKey(data);
}

/** Full historical breakdown at monthly resolution (the 24-month backfill), per the agreed backfill design -- coarser than the day-granularity range view above, by design. */
export async function getPodbeanDimensionsAllTimeMonthly(supabase: Supa, podcastId: string, dimension: PodbeanDimension): Promise<PodbeanDimensionRow[]> {
  const { data } = await supabase
    .from("podbean_dimension_stats")
    .select("dimension_key, downloads")
    .eq("podcast_id", podcastId)
    .eq("dimension", dimension)
    .eq("granularity", "month");

  return aggregateByKey(data);
}

function aggregateByKey(rows: Array<{ dimension_key: string; downloads: number }> | null): PodbeanDimensionRow[] {
  const totals = new Map<string, number>();
  for (const row of rows ?? []) {
    totals.set(row.dimension_key, (totals.get(row.dimension_key) ?? 0) + row.downloads);
  }
  return Array.from(totals.entries())
    .map(([key, downloads]) => ({ key, downloads }))
    .sort((a, b) => b.downloads - a.downloads);
}

export interface PodbeanEngagementSummary {
  listeners: number;
  engagedListeners: number;
  avgConsumptionRate: number | null;
  statDate: string | null;
}

/** Sum of each mapped episode's most recent engagement snapshot -- Podbean's engagementStats endpoint is cumulative (all_time), not a per-day delta, so this reads "as of the latest snapshot" rather than "activity in this range." */
export async function getPodbeanEngagementSummary(supabase: Supa, podcastId: string): Promise<PodbeanEngagementSummary> {
  const { data } = await supabase
    .from("podbean_episode_engagement_daily")
    .select("episode_id, stat_date, listeners, engaged_listeners, average_consumption_rate")
    .eq("podcast_id", podcastId)
    .order("stat_date", { ascending: false });

  if (!data || data.length === 0) {
    return { listeners: 0, engagedListeners: 0, avgConsumptionRate: null, statDate: null };
  }

  const latestByEpisode = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    if (!latestByEpisode.has(row.episode_id)) latestByEpisode.set(row.episode_id, row);
  }

  const rows = Array.from(latestByEpisode.values());
  const listeners = rows.reduce((s, r) => s + r.listeners, 0);
  const engagedListeners = rows.reduce((s, r) => s + r.engaged_listeners, 0);
  const withRate = rows.filter((r) => r.average_consumption_rate != null);
  const avgConsumptionRate = withRate.length > 0 ? withRate.reduce((s, r) => s + (r.average_consumption_rate ?? 0), 0) / withRate.length : null;
  const statDate = rows.reduce((latest, r) => (r.stat_date > latest ? r.stat_date : latest), rows[0].stat_date);

  return { listeners, engagedListeners, avgConsumptionRate, statDate };
}
