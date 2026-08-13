import type { SupabaseClient } from "@supabase/supabase-js";
import { podbeanGet } from "@/lib/podbean/client";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

/**
 * Server-side only. Resolves Podbean's own IDs for a PulseOS podcast and its
 * episodes, so the rest of the sync code never has to guess an ID mapping.
 */

interface PodbeanEpisodeObject {
  id: string;
  media_url: string | null;
  permalink_url: string | null;
}

/** GET /podcast once, and records Podbean's podcast id on the matching PulseOS podcast row. */
export async function resolvePodcastIdentity(
  admin: Admin,
  podcast: { id: string },
): Promise<{ podbeanPodcastId: string; title: string }> {
  const { podcast: podbeanPodcast } = await podbeanGet<{ podcast: { id: string; title: string } }>("/podcast");

  await admin
    .from("podcasts")
    .update({ podbean_podcast_id: podbeanPodcast.id })
    .eq("id", podcast.id);

  return { podbeanPodcastId: podbeanPodcast.id, title: podbeanPodcast.title };
}

/**
 * Fills in `episodes.podbean_episode_id` for any episode that doesn't have
 * one yet, by paginating Podbean's own /episodes list and matching each
 * entry's media_url/permalink_url against our RSS-derived audio_url/page_url
 * (verified to match exactly on real data -- audio_url takes priority,
 * page_url is the fallback when audio_url doesn't match, per the agreed
 * mapping priority). episode_number is deliberately never used here -- it's
 * only a display label, not a stable identifier.
 */
export async function resolveEpisodeMapping(admin: Admin, podcastId: string): Promise<{ matched: number; scanned: number; pages: number }> {
  const { data: unmapped } = await admin
    .from("episodes")
    .select("id, audio_url, page_url")
    .eq("podcast_id", podcastId)
    .is("podbean_episode_id", null);

  if (!unmapped || unmapped.length === 0) return { matched: 0, scanned: 0, pages: 0 };

  const byAudioUrl = new Map<string, string>();
  const byPageUrl = new Map<string, string>();
  for (const ep of unmapped) {
    if (ep.audio_url) byAudioUrl.set(ep.audio_url, ep.id);
    if (ep.page_url) byPageUrl.set(ep.page_url, ep.id);
  }

  let offset = 0;
  const limit = 100;
  const maxPages = 50; // safety cap; 100/page covers 5,000 episodes
  let pages = 0;
  let scanned = 0;
  const updates: Array<{ id: string; podbean_episode_id: string }> = [];
  const matchedPulseOsIds = new Set<string>();

  while (pages < maxPages) {
    const page = await podbeanGet<{ episodes: PodbeanEpisodeObject[]; has_more: boolean }>("/episodes", {
      offset: String(offset),
      limit: String(limit),
    });
    pages++;
    scanned += page.episodes.length;

    for (const ep of page.episodes) {
      const pulseOsId = (ep.media_url && byAudioUrl.get(ep.media_url)) || (ep.permalink_url && byPageUrl.get(ep.permalink_url));
      if (pulseOsId && !matchedPulseOsIds.has(pulseOsId)) {
        matchedPulseOsIds.add(pulseOsId);
        updates.push({ id: pulseOsId, podbean_episode_id: ep.id });
      }
    }

    if (!page.has_more || matchedPulseOsIds.size === unmapped.length) break;
    offset += limit;
  }

  for (const u of updates) {
    await admin.from("episodes").update({ podbean_episode_id: u.podbean_episode_id }).eq("id", u.id);
  }

  return { matched: updates.length, scanned, pages };
}

/** All episodes for a podcast that have a resolved Podbean episode id. */
export async function getMappedEpisodes(admin: Admin, podcastId: string): Promise<Array<{ id: string; podbeanEpisodeId: string }>> {
  const { data } = await admin
    .from("episodes")
    .select("id, podbean_episode_id")
    .eq("podcast_id", podcastId)
    .not("podbean_episode_id", "is", null);

  return (data ?? []).map((e) => ({ id: e.id, podbeanEpisodeId: e.podbean_episode_id as string }));
}
