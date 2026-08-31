import { describe, expect, it } from "vitest";
import { serializePublicFanVotePoll } from "./public-api";
import type { Database } from "@/lib/supabase/types";

type MatchFanPollRow = Database["public"]["Tables"]["match_fan_polls"]["Row"];

function makeRow(overrides: Partial<MatchFanPollRow>): MatchFanPollRow {
  return {
    id: "poll-1",
    site_id: "site-1",
    external_fixture_id: "fixture-1",
    match_date: "2026-08-31",
    opponent_name: "Opponent FC",
    competition: null,
    is_home: true,
    home_score: null,
    away_score: null,
    is_final: false,
    status: "draft",
    opened_at: null,
    closed_at: null,
    created_by: null,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    ...overrides,
  };
}

describe("serializePublicFanVotePoll", () => {
  it("draft poll is never serialized (should never reach here in practice, but stays defensive)", () => {
    expect(serializePublicFanVotePoll(makeRow({ status: "draft" }))).toBeNull();
  });

  it("live poll (open, not final) serializes with voteType 'live', without faking a result", () => {
    const result = serializePublicFanVotePoll(makeRow({ status: "open", is_final: false, home_score: null, away_score: null }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe("open");
    expect(result!.voteType).toBe("live");
    expect(result!.label).toBe("הצבעה חיה");
  });

  it("live poll with partial in-progress scores still serializes as 'live', not a real outcome", () => {
    const result = serializePublicFanVotePoll(makeRow({ status: "open", is_final: false, home_score: 1, away_score: 0 }));
    expect(result!.voteType).toBe("live");
  });

  it("open poll for a final win serializes with the existing derived voteType (unchanged)", () => {
    const result = serializePublicFanVotePoll(makeRow({ status: "open", is_final: true, is_home: true, home_score: 2, away_score: 0 }));
    expect(result!.voteType).toBe("best");
    expect(result!.label).toBe("מצטיין המשחק");
  });

  it("closed poll for a final loss serializes with the existing derived voteType (unchanged)", () => {
    const result = serializePublicFanVotePoll(makeRow({ status: "closed", is_final: true, is_home: true, home_score: 0, away_score: 1 }));
    expect(result!.voteType).toBe("disappointing");
    expect(result!.label).toBe("מאכזב המשחק");
  });

  it("closed poll that is somehow not final/unscored is still filtered out defensively (unchanged)", () => {
    expect(serializePublicFanVotePoll(makeRow({ status: "closed", is_final: false }))).toBeNull();
  });
});
