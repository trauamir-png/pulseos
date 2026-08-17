import { describe, expect, it } from "vitest";
import {
  LISTEN_START_EVENT,
  PROGRESS_MILESTONES,
  OUTBOUND_CLICK_EVENTS,
  PODCAST_EVENT_NAMES,
} from "@/lib/analytics/podcast-events";

describe("podcast event allowlist", () => {
  it("contains exactly the five listen/milestone events plus three outbound-click events", () => {
    expect(PODCAST_EVENT_NAMES.size).toBe(8);
    expect(PODCAST_EVENT_NAMES).toEqual(
      new Set([
        "podcast_play",
        "podcast_progress_25",
        "podcast_progress_50",
        "podcast_progress_75",
        "podcast_complete",
        "spotify_click",
        "apple_podcasts_click",
        "youtube_click",
      ])
    );
  });

  it("includes the listen-start event", () => {
    expect(PODCAST_EVENT_NAMES.has(LISTEN_START_EVENT)).toBe(true);
  });

  it("includes every progress milestone key", () => {
    for (const key of Object.keys(PROGRESS_MILESTONES)) {
      expect(PODCAST_EVENT_NAMES.has(key)).toBe(true);
    }
  });

  it("includes every outbound click key", () => {
    for (const key of Object.keys(OUTBOUND_CLICK_EVENTS)) {
      expect(PODCAST_EVENT_NAMES.has(key)).toBe(true);
    }
  });
});
