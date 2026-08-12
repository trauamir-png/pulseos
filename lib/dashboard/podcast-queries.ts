import type { SupabaseClient } from "@supabase/supabase-js";
import { eachDayOfInterval, eachHourOfInterval } from "date-fns";
import { toZonedTime, fromZonedTime, format } from "date-fns-tz";
import type { Database } from "@/lib/supabase/types";
import { getEpisodesForSite, type EpisodeMeta } from "@/lib/dashboard/podcast";

type Supa = SupabaseClient<Database>;

/** Real, measured listen progress. `podcast_play` marks a listen start; the rest mark milestones within it. */
export const LISTEN_START_EVENT = "podcast_play";
export const PROGRESS_MILESTONES: Record<string, number> = {
  podcast_progress_25: 25,
  podcast_progress_50: 50,
  podcast_progress_75: 75,
  podcast_complete: 100,
};
/** Outbound platform clicks -- never counted as a listen. */
export const OUTBOUND_CLICK_EVENTS: Record<string, string> = {
  spotify_click: "Spotify",
  apple_podcasts_click: "Apple Podcasts",
  youtube_click: "YouTube",
};

export const PODCAST_ONLINE_THRESHOLD_MS = 90_000;

interface PodcastEventRow {
  event_name: string;
  session_id: string;
  episode_id: string | null;
  visitor_hash: string;
  traffic_source: string;
  occurred_at: string;
}

async function fetchPodcastEventRows(supabase: Supa, siteId: string, from: Date, to: Date, episodeId?: string): Promise<PodcastEventRow[]> {
  let query = supabase
    .from("podcast_events")
    .select("event_name, session_id, episode_id, visitor_hash, traffic_source, occurred_at")
    .eq("site_id", siteId)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .limit(100000);

  if (episodeId) query = query.eq("episode_id", episodeId);

  const { data } = await query;
  return data ?? [];
}

interface ListenGroup {
  sessionId: string;
  episodeId: string;
  visitorHash: string;
  trafficSource: string;
  playAt: string;
  maxPercent: number;
  listeningSeconds: number | null;
}

/** Groups play + progress events into one "listen" per (session, episode), estimating seconds from the furthest milestone reached. */
function computeListenGroups(rows: PodcastEventRow[], durationByEpisode: Map<string, number | null>): ListenGroup[] {
  const groups = new Map<string, { rows: PodcastEventRow[]; playRow: PodcastEventRow | null }>();

  for (const row of rows) {
    if (!row.episode_id) continue;
    if (!(row.event_name === LISTEN_START_EVENT || row.event_name in PROGRESS_MILESTONES)) continue;
    const key = `${row.session_id}:${row.episode_id}`;
    const g = groups.get(key) ?? { rows: [], playRow: null };
    g.rows.push(row);
    if (row.event_name === LISTEN_START_EVENT && (!g.playRow || row.occurred_at < g.playRow.occurred_at)) g.playRow = row;
    groups.set(key, g);
  }

  const result: ListenGroup[] = [];
  for (const [key, g] of groups.entries()) {
    if (!g.playRow) continue; // only count groups with a real listen start
    const [sessionId, episodeId] = key.split(":");
    let maxPercent = 0;
    for (const row of g.rows) {
      const p = PROGRESS_MILESTONES[row.event_name];
      if (p !== undefined && p > maxPercent) maxPercent = p;
    }
    const duration = durationByEpisode.get(episodeId) ?? null;
    result.push({
      sessionId,
      episodeId,
      visitorHash: g.playRow.visitor_hash,
      trafficSource: g.playRow.traffic_source,
      playAt: g.playRow.occurred_at,
      maxPercent,
      listeningSeconds: duration != null ? Math.round((maxPercent / 100) * duration) : null,
    });
  }
  return result;
}

async function durationMap(supabase: Supa, siteId: string): Promise<Map<string, number | null>> {
  const episodes = await getEpisodesForSite(supabase, siteId);
  return new Map(episodes.map((e) => [e.id, e.durationSeconds]));
}

export interface PodcastSummary {
  totalListens: number;
  uniqueListeners: number;
  avgListeningSeconds: number | null;
  completionRate: number;
  listeningNow: number;
}

export async function getPodcastSummary(supabase: Supa, siteId: string, from: Date, to: Date): Promise<PodcastSummary> {
  const [rows, durations, listeningNow] = await Promise.all([
    fetchPodcastEventRows(supabase, siteId, from, to),
    durationMap(supabase, siteId),
    getPodcastListeningNow(supabase, siteId),
  ]);

  const groups = computeListenGroups(rows, durations);
  const totalListens = groups.length;
  const uniqueListeners = new Set(groups.map((g) => g.visitorHash)).size;
  const completions = groups.filter((g) => g.maxPercent >= 100).length;
  const withSeconds = groups.filter((g) => g.listeningSeconds != null);
  const avgListeningSeconds = withSeconds.length > 0 ? Math.round(withSeconds.reduce((sum, g) => sum + (g.listeningSeconds ?? 0), 0) / withSeconds.length) : null;

  return {
    totalListens,
    uniqueListeners,
    avgListeningSeconds,
    completionRate: totalListens > 0 ? (completions / totalListens) * 100 : 0,
    listeningNow: listeningNow.count,
  };
}

export interface ListeningNowSnapshot {
  count: number;
  items: Array<{ episodeId: string; trafficSource: string }>;
}

export async function getPodcastListeningNow(supabase: Supa, siteId: string): Promise<ListeningNowSnapshot> {
  const cutoff = new Date(Date.now() - PODCAST_ONLINE_THRESHOLD_MS).toISOString();
  const { data } = await supabase
    .from("podcast_events")
    .select("session_id, episode_id, visitor_hash, traffic_source, event_name, occurred_at")
    .eq("site_id", siteId)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(2000);

  const rows = data ?? [];
  const latestBySession = new Map<string, PodcastEventRow>();
  for (const row of rows) {
    if (!latestBySession.has(row.session_id)) latestBySession.set(row.session_id, row);
  }

  const active = Array.from(latestBySession.values()).filter(
    (r) => r.event_name !== "podcast_pause" && r.event_name !== "podcast_complete" && r.event_name in { ...PROGRESS_MILESTONES, [LISTEN_START_EVENT]: 0, podcast_resume: 0 },
  );

  return {
    count: active.length,
    items: active.filter((r): r is PodcastEventRow & { episode_id: string } => !!r.episode_id).map((r) => ({ episodeId: r.episode_id, trafficSource: r.traffic_source })),
  };
}

interface Bucket {
  label: string;
  start: Date;
  end: Date;
}

function buildBuckets(from: Date, to: Date, timezone: string, granularity: "hour" | "day"): Bucket[] {
  const zonedFrom = toZonedTime(from, timezone);
  const zonedTo = toZonedTime(to, timezone);
  const points = granularity === "hour" ? eachHourOfInterval({ start: zonedFrom, end: zonedTo }) : eachDayOfInterval({ start: zonedFrom, end: zonedTo });

  return points.map((point) => {
    const start = fromZonedTime(point, timezone);
    const end = new Date(start.getTime() + (granularity === "hour" ? 3_600_000 : 86_400_000) - 1);
    return { label: format(point, granularity === "hour" ? "HH:mm" : "MMM d", { timeZone: timezone }), start, end };
  });
}

export type ListeningMetric = "listens" | "unique_listeners" | "listening_time";

export async function getPodcastListeningTimeseries(
  supabase: Supa,
  siteId: string,
  from: Date,
  to: Date,
  timezone: string,
  granularity: "hour" | "day",
  metric: ListeningMetric,
): Promise<Array<{ label: string; value: number }>> {
  const [rows, durations] = await Promise.all([fetchPodcastEventRows(supabase, siteId, from, to), durationMap(supabase, siteId)]);
  const groups = computeListenGroups(rows, durations);
  const buckets = buildBuckets(from, to, timezone, granularity);

  return buckets.map((bucket) => {
    const inBucket = groups.filter((g) => {
      const t = new Date(g.playAt);
      return t >= bucket.start && t <= bucket.end;
    });
    if (metric === "listens") return { label: bucket.label, value: inBucket.length };
    if (metric === "unique_listeners") return { label: bucket.label, value: new Set(inBucket.map((g) => g.visitorHash)).size };
    return { label: bucket.label, value: inBucket.reduce((sum, g) => sum + (g.listeningSeconds ?? 0), 0) };
  });
}

export interface TopEpisodeRow {
  episodeId: string;
  title: string;
  episodeNumber: number | null;
  listens: number;
  uniqueListeners: number;
  avgListeningSeconds: number | null;
  completionRate: number;
}

export async function getTopEpisodes(supabase: Supa, siteId: string, from: Date, to: Date, limit = 10): Promise<TopEpisodeRow[]> {
  const [rows, episodes] = await Promise.all([fetchPodcastEventRows(supabase, siteId, from, to), getEpisodesForSite(supabase, siteId)]);
  const durations = new Map(episodes.map((e) => [e.id, e.durationSeconds]));
  const groups = computeListenGroups(rows, durations);
  const episodeById = new Map(episodes.map((e) => [e.id, e]));

  const byEpisode = new Map<string, ListenGroup[]>();
  for (const g of groups) {
    const list = byEpisode.get(g.episodeId) ?? [];
    list.push(g);
    byEpisode.set(g.episodeId, list);
  }

  return Array.from(byEpisode.entries())
    .map(([episodeId, list]) => {
      const withSeconds = list.filter((g) => g.listeningSeconds != null);
      const completions = list.filter((g) => g.maxPercent >= 100).length;
      const meta = episodeById.get(episodeId);
      return {
        episodeId,
        title: meta?.title ?? "(deleted episode)",
        episodeNumber: meta?.episodeNumber ?? null,
        listens: list.length,
        uniqueListeners: new Set(list.map((g) => g.visitorHash)).size,
        avgListeningSeconds: withSeconds.length > 0 ? Math.round(withSeconds.reduce((sum, g) => sum + (g.listeningSeconds ?? 0), 0) / withSeconds.length) : null,
        completionRate: list.length > 0 ? (completions / list.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.listens - a.listens)
    .slice(0, limit);
}

export interface PlatformsBreakdown {
  measured: Array<{ platform: string; listens: number }>;
  outboundClicks: Array<{ platform: string; clicks: number }>;
}

export async function getPlatformsBreakdown(supabase: Supa, siteId: string, from: Date, to: Date, episodeId?: string): Promise<PlatformsBreakdown> {
  const rows = await fetchPodcastEventRows(supabase, siteId, from, to, episodeId);
  const durations = await durationMap(supabase, siteId);
  const groups = computeListenGroups(rows, durations);

  const clickCounts = new Map<string, number>();
  for (const row of rows) {
    const label = OUTBOUND_CLICK_EVENTS[row.event_name];
    if (label) clickCounts.set(label, (clickCounts.get(label) ?? 0) + 1);
  }

  return {
    measured: [{ platform: "Web Player", listens: groups.length }],
    outboundClicks: Object.values(OUTBOUND_CLICK_EVENTS).map((platform) => ({ platform, clicks: clickCounts.get(platform) ?? 0 })),
  };
}

export interface PodcastSourceRow {
  source: string;
  visitors: number;
  listenStarts: number;
  avgListeningSeconds: number | null;
  completionRate: number;
}

export async function getPodcastSourcesBreakdown(supabase: Supa, siteId: string, from: Date, to: Date, episodeId?: string): Promise<PodcastSourceRow[]> {
  const rows = await fetchPodcastEventRows(supabase, siteId, from, to, episodeId);
  const durations = await durationMap(supabase, siteId);
  const groups = computeListenGroups(rows, durations);

  const bySource = new Map<string, { visitors: Set<string>; groups: ListenGroup[] }>();
  for (const row of rows) {
    if (!bySource.has(row.traffic_source)) bySource.set(row.traffic_source, { visitors: new Set(), groups: [] });
    bySource.get(row.traffic_source)!.visitors.add(row.visitor_hash);
  }
  for (const g of groups) {
    if (!bySource.has(g.trafficSource)) bySource.set(g.trafficSource, { visitors: new Set(), groups: [] });
    bySource.get(g.trafficSource)!.groups.push(g);
  }

  return Array.from(bySource.entries())
    .map(([source, v]) => {
      const withSeconds = v.groups.filter((g) => g.listeningSeconds != null);
      const completions = v.groups.filter((g) => g.maxPercent >= 100).length;
      return {
        source,
        visitors: v.visitors.size,
        listenStarts: v.groups.length,
        avgListeningSeconds: withSeconds.length > 0 ? Math.round(withSeconds.reduce((sum, g) => sum + (g.listeningSeconds ?? 0), 0) / withSeconds.length) : null,
        completionRate: v.groups.length > 0 ? (completions / v.groups.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.listenStarts - a.listenStarts);
}

export interface EpisodeListRow extends EpisodeMeta {
  listens: number;
  uniqueListeners: number;
  avgListeningSeconds: number | null;
  completionRate: number;
  spotifyClicks: number;
  appleClicks: number;
  youtubeClicks: number;
}

export async function getEpisodesList(supabase: Supa, siteId: string, from: Date, to: Date, search?: string): Promise<EpisodeListRow[]> {
  const episodes = await getEpisodesForSite(supabase, siteId);
  const filtered = search ? episodes.filter((e) => e.title.toLowerCase().includes(search.toLowerCase())) : episodes;
  if (filtered.length === 0) return [];

  const rows = await fetchPodcastEventRows(supabase, siteId, from, to);
  const durations = new Map(episodes.map((e) => [e.id, e.durationSeconds]));
  const groups = computeListenGroups(rows, durations);

  const byEpisode = new Map<string, ListenGroup[]>();
  for (const g of groups) {
    const list = byEpisode.get(g.episodeId) ?? [];
    list.push(g);
    byEpisode.set(g.episodeId, list);
  }

  const clicksByEpisode = new Map<string, { spotify: number; apple: number; youtube: number }>();
  for (const row of rows) {
    if (!row.episode_id) continue;
    const c = clicksByEpisode.get(row.episode_id) ?? { spotify: 0, apple: 0, youtube: 0 };
    if (row.event_name === "spotify_click") c.spotify += 1;
    if (row.event_name === "apple_podcasts_click") c.apple += 1;
    if (row.event_name === "youtube_click") c.youtube += 1;
    clicksByEpisode.set(row.episode_id, c);
  }

  return filtered.map((episode) => {
    const list = byEpisode.get(episode.id) ?? [];
    const withSeconds = list.filter((g) => g.listeningSeconds != null);
    const completions = list.filter((g) => g.maxPercent >= 100).length;
    const clicks = clicksByEpisode.get(episode.id) ?? { spotify: 0, apple: 0, youtube: 0 };
    return {
      ...episode,
      listens: list.length,
      uniqueListeners: new Set(list.map((g) => g.visitorHash)).size,
      avgListeningSeconds: withSeconds.length > 0 ? Math.round(withSeconds.reduce((sum, g) => sum + (g.listeningSeconds ?? 0), 0) / withSeconds.length) : null,
      completionRate: list.length > 0 ? (completions / list.length) * 100 : 0,
      spotifyClicks: clicks.spotify,
      appleClicks: clicks.apple,
      youtubeClicks: clicks.youtube,
    };
  });
}

export interface EpisodeFunnel {
  started: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
}

export interface EpisodeDetail {
  overview: { listens: number; uniqueListeners: number; avgListeningSeconds: number | null; completionRate: number };
  funnel: EpisodeFunnel;
  sources: PodcastSourceRow[];
  platforms: PlatformsBreakdown;
  recentActivity: Array<{ eventName: string; trafficSource: string; occurredAt: string; properties: Record<string, unknown> }>;
}

export async function getEpisodeDetail(supabase: Supa, siteId: string, episodeId: string, from: Date, to: Date): Promise<EpisodeDetail> {
  const [rows, durations, sources, platforms, recent] = await Promise.all([
    fetchPodcastEventRows(supabase, siteId, from, to, episodeId),
    durationMap(supabase, siteId),
    getPodcastSourcesBreakdown(supabase, siteId, from, to, episodeId),
    getPlatformsBreakdown(supabase, siteId, from, to, episodeId),
    supabase
      .from("podcast_events")
      .select("event_name, traffic_source, occurred_at, properties")
      .eq("site_id", siteId)
      .eq("episode_id", episodeId)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  const groups = computeListenGroups(rows, durations);
  const withSeconds = groups.filter((g) => g.listeningSeconds != null);
  const completions = groups.filter((g) => g.maxPercent >= 100).length;

  return {
    overview: {
      listens: groups.length,
      uniqueListeners: new Set(groups.map((g) => g.visitorHash)).size,
      avgListeningSeconds: withSeconds.length > 0 ? Math.round(withSeconds.reduce((sum, g) => sum + (g.listeningSeconds ?? 0), 0) / withSeconds.length) : null,
      completionRate: groups.length > 0 ? (completions / groups.length) * 100 : 0,
    },
    funnel: {
      started: groups.length,
      p25: groups.filter((g) => g.maxPercent >= 25).length,
      p50: groups.filter((g) => g.maxPercent >= 50).length,
      p75: groups.filter((g) => g.maxPercent >= 75).length,
      p100: groups.filter((g) => g.maxPercent >= 100).length,
    },
    sources,
    platforms,
    recentActivity: (recent.data ?? []).map((r) => ({ eventName: r.event_name, trafficSource: r.traffic_source, occurredAt: r.occurred_at, properties: r.properties })),
  };
}
