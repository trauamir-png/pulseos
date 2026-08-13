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
  language: string | null;
  author: string | null;
  rssLastSyncedAt: string | null;
  rssLastSyncStatus: string | null;
  rssLastError: string | null;
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

/** A site can have zero, one, or more podcasts -- not hardcoded to a single podcast. */
export async function getPodcastsForSite(supabase: Supa, siteId: string): Promise<PodcastRecord[]> {
  const { data } = await supabase
    .from("podcasts")
    .select("id, site_id, name, description, artwork_url, website_url, rss_url, language, author, rss_last_synced_at, rss_last_sync_status, rss_last_error")
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
    language: p.language,
    author: p.author,
    rssLastSyncedAt: p.rss_last_synced_at,
    rssLastSyncStatus: p.rss_last_sync_status,
    rssLastError: p.rss_last_error,
  }));
}

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

export async function getEpisodesForSite(supabase: Supa, siteId: string): Promise<EpisodeMeta[]> {
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
}

export async function getEpisodeById(supabase: Supa, siteId: string, episodeId: string): Promise<EpisodeMeta | null> {
  const { data: episode } = await supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle();
  if (!episode) return null;

  const { data: podcast } = await supabase.from("podcasts").select("site_id").eq("id", episode.podcast_id).maybeSingle();
  if (!podcast || podcast.site_id !== siteId) return null;

  return toEpisodeMeta(episode);
}
