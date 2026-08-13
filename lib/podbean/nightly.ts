import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEpisodeMapping, resolvePodcastIdentity, getMappedEpisodes } from "@/lib/podbean/mapping";
import { fmtDate, syncDimensionsForDay, syncEngagementSnapshot, syncEpisodeDownloads, syncPodcastDownloads } from "@/lib/podbean/sync";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

// Re-covers the trailing week on every run so late corrections Podbean makes
// to a prior day's numbers (per the user's own requirement #8) get picked up
// automatically, not just the newest day. Upserts underneath make this safe
// to re-run daily without ever duplicating a row.
const CATCH_UP_DAYS = 7;

export interface NightlySyncResult {
  podbeanPodcastId: string;
  episodesMapped: { matched: number; scanned: number; pages: number };
  podcastDownloadRows: number;
  episodeDownloadRows: number;
  dimensionRows: number;
  engagementSnapshots: number;
  engagementErrors: number;
}

/**
 * Nightly incremental sync: re-syncs the trailing catch-up window of daily
 * downloads and dimension breakdowns, plus today's engagement snapshot for
 * every mapped episode. Safe to run as a Vercel Cron job -- unlike the full
 * 24-month backfill, this only ever touches a handful of days per run.
 */
export async function runNightlySync(admin: Admin, podcast: { id: string }, throttleMs = 120): Promise<NightlySyncResult> {
  const identity = await resolvePodcastIdentity(admin, podcast);
  const episodesMapped = await resolveEpisodeMapping(admin, podcast.id);
  const mappedEpisodes = await getMappedEpisodes(admin, podcast.id);

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (CATCH_UP_DAYS - 1));

  const podcastDownloadRows = await syncPodcastDownloads(admin, podcast.id, start, end, throttleMs);

  let episodeDownloadRows = 0;
  for (const ep of mappedEpisodes) {
    episodeDownloadRows += await syncEpisodeDownloads(admin, podcast.id, ep.id, ep.podbeanEpisodeId, start, end, throttleMs);
  }

  let dimensionRows = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dimensionRows += await syncDimensionsForDay(admin, podcast.id, d, throttleMs);
  }

  const todayStr = fmtDate(end);
  let engagementSnapshots = 0;
  let engagementErrors = 0;
  for (const ep of mappedEpisodes) {
    try {
      await syncEngagementSnapshot(admin, podcast.id, ep.id, ep.podbeanEpisodeId, todayStr);
      engagementSnapshots++;
    } catch {
      // One episode's engagement call failing shouldn't abort the whole nightly run.
      engagementErrors++;
    }
    await new Promise((resolve) => setTimeout(resolve, throttleMs));
  }

  const anyErrors = engagementErrors > 0;
  await admin
    .from("podcasts")
    .update({
      podbean_last_synced_at: new Date().toISOString(),
      podbean_last_sync_status: anyErrors ? "partial" : "success",
      podbean_last_error: anyErrors ? `${engagementErrors} engagement snapshot(s) failed` : null,
    })
    .eq("id", podcast.id);

  return {
    podbeanPodcastId: identity.podbeanPodcastId,
    episodesMapped,
    podcastDownloadRows,
    episodeDownloadRows,
    dimensionRows,
    engagementSnapshots,
    engagementErrors,
  };
}
