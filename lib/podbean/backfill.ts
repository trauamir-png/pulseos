import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEpisodeMapping, resolvePodcastIdentity, getMappedEpisodes } from "@/lib/podbean/mapping";
import {
  monthBuckets,
  syncDimensionsForMonth,
  syncEpisodeDownloads,
  syncEpisodeMonthlyDownloads,
  syncPodcastDownloads,
  syncPodcastMonthlyDownloads,
} from "@/lib/podbean/sync";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

const BACKFILL_MONTHS = 24;
// Podbean's period=d (true daily downloads) only works within a trailing
// window ending TODAY -- confirmed live, the exact cap is 90 days back from
// today, not a repositionable 90-day window. 89 keeps a 1-day margin.
const DAILY_BACKFILL_DAYS = 89;
// Podbean's period=m (monthly totals) only works within a trailing 24
// months of TODAY -- also confirmed live. A start date even a few days
// before that boundary is rejected, so pad it by a few days.
const MONTHLY_BOUNDARY_PAD_DAYS = 5;

export interface BackfillResult {
  podbeanPodcastId: string;
  episodesMapped: { matched: number; scanned: number; pages: number };
  episodesBackfilled: number;
  podcastDownloadRows: number;
  episodeDownloadRows: number;
  podcastMonthlyDownloadRows: number;
  episodeMonthlyDownloadRows: number;
  dimensionRows: number;
}

/**
 * One-time (or on-demand re-run) full historical backfill. Idempotent by
 * construction -- every write underneath is a natural-key upsert, so running
 * this again (e.g. after a partial failure) just re-fills the same rows with
 * fresh values, never duplicates.
 *
 * Downloads use two granularities, exactly like dimensions already do:
 * true daily rows for the trailing ~90 days (all Podbean will give us),
 * and coarser monthly-total rows for the ~21 months of history before that
 * window. The monthly loop deliberately skips any month that overlaps the
 * daily window, so summing daily + monthly rows for an "all-time" total
 * never double-counts.
 *
 * Deliberately NOT designed to run inside a single Vercel serverless request
 * -- with ~280 episodes x (1 daily call + ~21 monthly calls) for downloads
 * plus 24 monthly dimension buckets, this is well over a thousand Podbean
 * API calls, each with a throttle delay. That's built to be run as a
 * long-lived local process (e.g. against `localhost:3000` with no platform
 * request timeout), not as an HTTP request to a deployed Vercel function.
 */
export async function runFullBackfill(admin: Admin, podcast: { id: string }, throttleMs = 120): Promise<BackfillResult> {
  const identity = await resolvePodcastIdentity(admin, podcast);
  const episodesMapped = await resolveEpisodeMapping(admin, podcast.id);
  const mappedEpisodes = await getMappedEpisodes(admin, podcast.id);

  const now = new Date();

  const dailyStart = new Date(now);
  dailyStart.setUTCDate(dailyStart.getUTCDate() - (DAILY_BACKFILL_DAYS - 1));

  // Raw 24-month lookback, NOT yet padded -- monthBuckets() below rounds any
  // start date down to the 1st of its month, which would silently erase a
  // pad applied here. The pad has to be applied per-bucket instead (see
  // monthCutoff below), after that rounding has already happened.
  const historyStart = new Date(now);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - BACKFILL_MONTHS);
  const monthCutoff = new Date(historyStart);
  monthCutoff.setUTCDate(monthCutoff.getUTCDate() + MONTHLY_BOUNDARY_PAD_DAYS);

  const podcastDownloadRows = await syncPodcastDownloads(admin, podcast.id, dailyStart, now, throttleMs);

  let episodeDownloadRows = 0;
  for (const ep of mappedEpisodes) {
    episodeDownloadRows += await syncEpisodeDownloads(admin, podcast.id, ep.id, ep.podbeanEpisodeId, dailyStart, now, throttleMs);
  }

  // Monthly totals only for months (a) old enough not to overlap the true-daily window, and
  // (b) recent enough to be inside Podbean's own 24-month cap on period=m (with a safety pad).
  let podcastMonthlyDownloadRows = 0;
  let episodeMonthlyDownloadRows = 0;
  for (const month of monthBuckets(historyStart, now)) {
    if (month < monthCutoff) continue;
    const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
    if (monthEnd >= dailyStart) continue;
    podcastMonthlyDownloadRows += await syncPodcastMonthlyDownloads(admin, podcast.id, month, throttleMs);
    for (const ep of mappedEpisodes) {
      episodeMonthlyDownloadRows += await syncEpisodeMonthlyDownloads(admin, podcast.id, ep.id, ep.podbeanEpisodeId, month, throttleMs);
    }
  }

  let dimensionRows = 0;
  for (const month of monthBuckets(historyStart, now)) {
    if (month < monthCutoff) continue;
    dimensionRows += await syncDimensionsForMonth(admin, podcast.id, month, throttleMs);
  }

  await admin
    .from("podcasts")
    .update({ podbean_last_synced_at: new Date().toISOString(), podbean_last_sync_status: "success", podbean_last_error: null })
    .eq("id", podcast.id);

  return {
    podbeanPodcastId: identity.podbeanPodcastId,
    episodesMapped,
    episodesBackfilled: mappedEpisodes.length,
    podcastDownloadRows,
    episodeDownloadRows,
    podcastMonthlyDownloadRows,
    episodeMonthlyDownloadRows,
    dimensionRows,
  };
}
