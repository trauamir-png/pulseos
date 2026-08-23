import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { computeVoterHash } from "./fan-vote-token";

describe("computeVoterHash", () => {
  const originalSecret = process.env.MATCH_FAN_VOTE_TOKEN_SECRET;

  beforeEach(() => {
    process.env.MATCH_FAN_VOTE_TOKEN_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.MATCH_FAN_VOTE_TOKEN_SECRET = originalSecret;
  });

  it("is deterministic for the same poll and raw token", () => {
    expect(computeVoterHash("poll-1", "raw-token-a")).toBe(computeVoterHash("poll-1", "raw-token-a"));
  });

  it("differs for different raw tokens on the same poll", () => {
    expect(computeVoterHash("poll-1", "raw-token-a")).not.toBe(computeVoterHash("poll-1", "raw-token-b"));
  });

  it("differs for the same raw token across different polls (unlinkable across polls)", () => {
    expect(computeVoterHash("poll-1", "raw-token-a")).not.toBe(computeVoterHash("poll-2", "raw-token-a"));
  });

  it("throws if the secret is not configured", () => {
    delete process.env.MATCH_FAN_VOTE_TOKEN_SECRET;
    expect(() => computeVoterHash("poll-1", "raw-token-a")).toThrow();
  });
});
