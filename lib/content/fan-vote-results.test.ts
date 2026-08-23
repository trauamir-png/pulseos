import { describe, expect, it } from "vitest";
import { computeCandidateResults } from "./fan-vote-results";

describe("computeCandidateResults", () => {
  it("returns every candidate at zero when no votes exist yet", () => {
    const result = computeCandidateResults(["a", "b", "c"], new Map());
    expect(result.totalVotes).toBe(0);
    expect(result.candidates).toEqual([
      { candidateId: "a", voteCount: 0, percentage: 0 },
      { candidateId: "b", voteCount: 0, percentage: 0 },
      { candidateId: "c", voteCount: 0, percentage: 0 },
    ]);
  });

  it("rounds each candidate's percentage independently (Math.round, half up)", () => {
    const result = computeCandidateResults(["a", "b", "c"], new Map([["a", 1], ["b", 1], ["c", 1]]));
    expect(result.totalVotes).toBe(3);
    expect(result.candidates.map((c) => c.percentage)).toEqual([33, 33, 33]);
  });

  it("a two-way tie can round to slightly over 100 -- expected, not corrected for", () => {
    const result = computeCandidateResults(["a", "b"], new Map([["a", 1], ["b", 2]]));
    expect(result.candidates.map((c) => c.percentage)).toEqual([33, 67]);
  });

  it("a candidate absent from the counts map is treated as zero votes", () => {
    const result = computeCandidateResults(["a", "b"], new Map([["a", 5]]));
    expect(result.totalVotes).toBe(5);
    expect(result.candidates).toEqual([
      { candidateId: "a", voteCount: 5, percentage: 100 },
      { candidateId: "b", voteCount: 0, percentage: 0 },
    ]);
  });
});
