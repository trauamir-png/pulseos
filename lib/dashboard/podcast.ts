import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export interface PodcastRecord {
  id: string;
  siteId: string;
  name: string;
  description: string | null;
  artworkUrl: string | null;
  websiteUrl: string | null;
  rssUrl: string | null;
  hostingProvider: string | null;
  language: string | null;
  author: string | null;
  rssLastSyncedAt: string | null;
  rssLastSyncStatus: string | null;
  rssLastError: string | null;
  podbeanPodcastId: string | null;
  podbeanLastSyncedAt: string | null;
  podbeanLastSyncStatus: string | null;
  podbeanLastError: string | null;
}

export interface EpisodeMeta {
  id: string;
  podcastId: string;
  title: string;
  episodeNumber: number | null;
  description: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  artworkUrl: string | null;
  pageUrl: string | null;
  audioUrl: string | null;
  spotifyUrl: string | null;
  applePodcastsUrl: string | null;
  youtubeUrl: string | null;
  seasonNumber: number | null;
  explicit: boolean | null;
}

/**
 * A site can have zero, one, or more podcasts -- not hardcoded to a single
 * podcast. Wrapped in React's cache() because a single page render can call
 * this (directly, and indirectly via getEpisodesForSite/durationMap in
 * podcast-queries.ts) several times over with the same (supabase, siteId)
 * pair -- e.g. the Podcast Overview page's Promise.all of summary/timeseries
 * /topEpisodes/platforms/sources each trigger it independently.
 */
export const getPodcastsForSite = cache(async (supabase: Supa, siteId: string): Promise<PodcastRecord[]> => {
  const { data } = await supabase
    .from("podcasts")
    .select(
      "id, site_id, name, description, artwork_url, website_url, rss_url, hosting_provider, language, author, rss_last_synced_at, rss_last_sync_status, rss_last_error, podbean_podcast_id, podbean_last_synced_at, podbean_last_sync_status, podbean_last_error",
    )
    .eq("site_id", siteId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  return (data ?? []).map((p) => ({
    id: p.id,
    siteId: p.site_id,
    name: p.name,
    description: p.description,
    artworkUrl: p.artwork_url,
    websiteUrl: p.website_url,
    rssUrl: p.rss_url,
    hostingProvider: p.hosting_provider,
    language: p.language,
    author: p.author,
    rssLastSyncedAt: p.rss_last_synced_at,
    rssLastSyncStatus: p.rss_last_sync_status,
    rssLastError: p.rss_last_error,
    podbeanPodcastId: p.podbean_podcast_id,
    podbeanLastSyncedAt: p.podbean_last_synced_at,
    podbeanLastSyncStatus: p.podbean_last_sync_status,
    podbeanLastError: p.podbean_last_error,
  }));
});

function toEpisodeMeta(e: Database["public"]["Tables"]["episodes"]["Row"]): EpisodeMeta {
  return {
    id: e.id,
    podcastId: e.podcast_id,
    title: e.title,
    episodeNumber: e.episode_number,
    description: e.description,
    publishedAt: e.published_at,
    durationSeconds: e.duration_seconds,
    artworkUrl: e.artwork_url,
    pageUrl: e.page_url,
    audioUrl: e.audio_url,
    spotifyUrl: e.spotify_url,
    applePodcastsUrl: e.apple_podcasts_url,
    youtubeUrl: e.youtube_url,
    seasonNumber: e.season_number,
    explicit: e.explicit,
  };
}

/**
 * Wrapped in React's cache() for the same reason as getPodcastsForSite --
 * podcast-queries.ts's durationMap() calls this from five different
 * functions (getPodcastSummary, getPodcastListeningTimeseries, getTopEpisodes,
 * getPlatformsBreakdown, getPodcastSourcesBreakdown, getEpisodeDetail), all of
 * which run inside the same page's Promise.all with the same (supabase,
 * siteId) pair.
 */
export const getEpisodesForSite = cache(async (supabase: Supa, siteId: string): Promise<EpisodeMeta[]> => {
  const podcasts = await getPodcastsForSite(supabase, siteId);
  if (podcasts.length === 0) return [];

  const { data } = await supabase
    .from("episodes")
    .select("*")
    .in(
      "podcast_id",
      podcasts.map((p) => p.id),
    )
    .eq("active", true)
    .order("published_at", { ascending: false });

  return (data ?? []).map(toEpisodeMeta);
});

export async function getEpisodeById(supabase: Supa, siteId: string, episodeId: string): Promise<EpisodeMeta | null> {
  const { data: episode } = await supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle();
  if (!episode) return null;

  const { data: podcast } = await supabase.from("podcasts").select("site_id").eq("id", episode.podcast_id).maybeSingle();
  if (!podcast || podcast.site_id !== siteId) return null;

  return toEpisodeMeta(episode);
}
