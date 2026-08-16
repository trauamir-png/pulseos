"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAndParseFeed, RssParseError, type ParsedEpisode } from "@/lib/rss/parse";
import { detectHostingProvider, HOSTING_PROVIDER_OPTIONS } from "@/lib/rss/hosting-provider";
import type { Database } from "@/lib/supabase/types";

const VALID_PROVIDERS = new Set(HOSTING_PROVIDER_OPTIONS.map((o) => o.value));

function normalizeHostingProvider(value: string | null | undefined): string | null {
  if (!value) return null;
  return VALID_PROVIDERS.has(value) ? value : "other";
}

type EpisodeInsert = Database["public"]["Tables"]["episodes"]["Insert"];
type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];

const COMPARE_FIELDS = [
  "title",
  "episode_number",
  "description",
  "published_at",
  "duration_seconds",
  "artwork_url",
  "page_url",
  "audio_url",
  "season_number",
  "explicit",
] as const;

function toEpisodeFields(podcastId: string, item: ParsedEpisode): Omit<EpisodeInsert, "id" | "active" | "created_at" | "updated_at"> {
  return {
    podcast_id: podcastId,
    rss_guid: item.rssGuid,
    title: item.title,
    episode_number: item.episodeNumber,
    description: item.description,
    published_at: item.publishedAt,
    duration_seconds: item.durationSeconds,
    artwork_url: item.artworkUrl,
    page_url: item.pageUrl,
    audio_url: item.audioUrl,
    season_number: item.seasonNumber,
    explicit: item.explicit,
  };
}

/** Postgres returns timestamptz columns as "+00:00"-suffixed strings, while freshly-parsed
 * feed dates are ISO "Z"-suffixed -- normalize both to epoch millis so equal instants compare equal. */
function normalizeForCompare(field: (typeof COMPARE_FIELDS)[number], value: unknown): unknown {
  if (field === "published_at" && typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? value : ms;
  }
  return value;
}

function fieldsChanged(existing: EpisodeRow, incoming: Omit<EpisodeInsert, "id" | "active" | "created_at" | "updated_at">): boolean {
  return COMPARE_FIELDS.some(
    (field) => normalizeForCompare(field, existing[field] ?? null) !== normalizeForCompare(field, incoming[field] ?? null),
  );
}

/**
 * Inserts new episodes and updates changed ones, keyed by rss_guid within
 * this podcast. Never touches episodes missing from `items` (an episode that
 * disappears from the RSS feed is left alone, per spec) and never touches
 * episode analytics -- only the episodes table's own metadata columns.
 */
export async function applyFeedEpisodes(
  supabase: SupabaseClient<Database>,
  podcastId: string,
  items: ParsedEpisode[],
): Promise<{ added: number; updated: number; unchanged: number }> {
  const { data: existingRows, error: fetchError } = await supabase
    .from("episodes")
    .select("id, rss_guid, title, episode_number, description, published_at, duration_seconds, artwork_url, page_url, audio_url, season_number, explicit")
    .eq("podcast_id", podcastId);
  if (fetchError) throw new Error(fetchError.message);

  const byGuid = new Map((existingRows ?? []).filter((r) => r.rss_guid).map((r) => [r.rss_guid as string, r as EpisodeRow]));

  const toInsert: EpisodeInsert[] = [];
  const toUpdate: EpisodeInsert[] = [];
  let unchanged = 0;

  for (const item of items) {
    const fields = toEpisodeFields(podcastId, item);
    const existing = byGuid.get(item.rssGuid);
    if (!existing) {
      toInsert.push(fields);
    } else if (fieldsChanged(existing, fields)) {
      toUpdate.push({ id: existing.id, ...fields });
    } else {
      unchanged++;
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("episodes").insert(toInsert);
    if (error) throw new Error(error.message);
  }
  if (toUpdate.length > 0) {
    const { error } = await supabase.from("episodes").upsert(toUpdate);
    if (error) throw new Error(error.message);
  }

  return { added: toInsert.length, updated: toUpdate.length, unchanged };
}

/**
 * `hostingProvider` is the user's confirmed choice from the connect form
 * (pre-filled from detectHostingProvider() as a suggestion, but always an
 * explicit value by the time it reaches here -- auto-detection is only ever
 * a default, never silently substituted for what the user picked).
 */
export async function connectPodcast(siteId: string, rssUrl: string, hostingProvider: string | null) {
  const trimmedUrl = rssUrl.trim();
  if (!trimmedUrl) throw new Error("RSS URL is required.");

  const supabase = await createClient();

  let feed;
  try {
    feed = await fetchAndParseFeed(trimmedUrl);
  } catch (e) {
    throw new Error(e instanceof RssParseError ? e.message : "Couldn't import that feed.");
  }

  const { data: podcast, error } = await supabase
    .from("podcasts")
    .insert({
      site_id: siteId,
      name: feed.podcast.name,
      description: feed.podcast.description,
      artwork_url: feed.podcast.artworkUrl,
      website_url: feed.podcast.websiteUrl,
      language: feed.podcast.language,
      author: feed.podcast.author,
      rss_url: trimmedUrl,
      hosting_provider: normalizeHostingProvider(hostingProvider ?? detectHostingProvider(trimmedUrl)),
      rss_last_synced_at: new Date().toISOString(),
      rss_last_sync_status: "success",
      rss_last_error: null,
    })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);

  const { added } = await applyFeedEpisodes(supabase, podcast.id, feed.episodes);

  revalidatePath("/podcast");
  revalidatePath("/podcast/episodes");

  return { podcastId: podcast.id, name: podcast.name, added };
}

/**
 * Fetches a podcast's saved RSS feed, upserts its episodes by GUID, and
 * refreshes the podcast's own feed-derived metadata + sync status columns.
 * Provider-agnostic and client-agnostic (works with the cookie-bound
 * dashboard client or the service-role admin client), so both the "Sync now"
 * server action below and any future cron job can share this one code path.
 *
 * Deliberately never touches hosting_provider -- that's a one-time
 * auto-detected suggestion at connect time, then a user-owned setting from
 * then on (see updatePodcastSettings). A routine RSS refresh (manual or
 * cron) must not silently revert a provider the user explicitly chose or
 * corrected.
 */
export async function syncPodcastFeed(
  supabase: SupabaseClient<Database>,
  podcast: { id: string; rss_url: string | null },
): Promise<{ added: number; updated: number; unchanged: number }> {
  if (!podcast.rss_url) throw new Error("This podcast has no RSS URL configured.");

  let feed;
  try {
    feed = await fetchAndParseFeed(podcast.rss_url);
  } catch (e) {
    const message = e instanceof RssParseError ? e.message : "Couldn't sync that feed.";
    await supabase
      .from("podcasts")
      .update({ rss_last_sync_status: "error", rss_last_error: message })
      .eq("id", podcast.id);
    throw new Error(message);
  }

  const summary = await applyFeedEpisodes(supabase, podcast.id, feed.episodes);

  const { error: updateError } = await supabase
    .from("podcasts")
    .update({
      name: feed.podcast.name,
      description: feed.podcast.description,
      artwork_url: feed.podcast.artworkUrl,
      website_url: feed.podcast.websiteUrl,
      language: feed.podcast.language,
      author: feed.podcast.author,
      rss_last_synced_at: new Date().toISOString(),
      rss_last_sync_status: "success",
      rss_last_error: null,
    })
    .eq("id", podcast.id);
  if (updateError) throw new Error(updateError.message);

  return summary;
}

/**
 * Edits an existing podcast's RSS URL and/or hosting provider. Never touches
 * episodes or RSS sync history -- switching provider (e.g. Podbean ->
 * Spotify for Creators) only changes which hosting-analytics UI/sync paths
 * apply going forward. If the new provider isn't Podbean, the podcast's
 * Podbean identity/sync-status fields are cleared so no stale Podbean state
 * (or a stale UI badge racing the update) can linger; their own analytics
 * tables (podbean_podcast_daily_downloads etc.) are left alone since they're
 * keyed by podcast_id and simply stop being queried once hosting_provider
 * no longer matches "podbean".
 */
export async function updatePodcastSettings(
  podcastId: string,
  updates: { rssUrl?: string; hostingProvider?: string | null },
) {
  const supabase = await createClient();

  const nextProvider = updates.hostingProvider !== undefined ? normalizeHostingProvider(updates.hostingProvider) : undefined;
  const nextRssUrl = updates.rssUrl?.trim();

  const patch: Database["public"]["Tables"]["podcasts"]["Update"] = {};
  if (nextRssUrl !== undefined) {
    if (!nextRssUrl) throw new Error("RSS URL is required.");
    patch.rss_url = nextRssUrl;
  }
  if (nextProvider !== undefined) {
    patch.hosting_provider = nextProvider;
    if (nextProvider !== "podbean") {
      patch.podbean_podcast_id = null;
      patch.podbean_last_synced_at = null;
      patch.podbean_last_sync_status = null;
      patch.podbean_last_error = null;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("podcasts").update(patch).eq("id", podcastId);
    if (error) throw new Error(error.message);
  }

  let summary: { added: number; updated: number; unchanged: number } | null = null;
  if (nextRssUrl !== undefined) {
    const { data: podcast, error: fetchError } = await supabase.from("podcasts").select("id, rss_url").eq("id", podcastId).single();
    if (fetchError) throw new Error(fetchError.message);
    summary = await syncPodcastFeed(supabase, podcast);
  }

  revalidatePath("/podcast");
  revalidatePath("/podcast/episodes");
  revalidatePath(`/podcast/episodes/${podcastId}`);

  return { summary };
}

export async function syncPodcastRss(podcastId: string) {
  const supabase = await createClient();

  const { data: podcast, error: fetchError } = await supabase.from("podcasts").select("id, rss_url").eq("id", podcastId).single();
  if (fetchError) throw new Error(fetchError.message);

  let summary;
  try {
    summary = await syncPodcastFeed(supabase, podcast);
  } finally {
    revalidatePath("/podcast");
  }

  revalidatePath("/podcast/episodes");
  return summary;
}
