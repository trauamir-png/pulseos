/**
 * Canonical podcast event-name allowlist. Single source of truth shared by
 * the ingestion path (app/api/collect/route.ts) and the read/aggregation
 * path (lib/dashboard/podcast-queries.ts) so they can never drift apart.
 */

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

/**
 * Fired once per player session after >=30s of *actual* accumulated
 * playback (wall-clock time while genuinely playing -- paused and seeked-
 * over time don't count). This is a stricter, separate notion of "listener"
 * than LISTEN_START_EVENT (which fires immediately on play) -- it's what
 * backs the "מאזינים באתר" column, not the general listen funnel.
 */
export const WEB_LISTENER_EVENT = "podcast_listen_30s";

export const PODCAST_EVENT_NAMES: ReadonlySet<string> = new Set([
  LISTEN_START_EVENT,
  ...Object.keys(PROGRESS_MILESTONES),
  ...Object.keys(OUTBOUND_CLICK_EVENTS),
  WEB_LISTENER_EVENT,
]);
