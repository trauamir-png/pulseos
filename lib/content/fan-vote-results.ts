export interface CandidateResult {
  candidateId: string;
  voteCount: number;
  percentage: number;
}

/**
 * Turns raw per-candidate counts (from the match_fan_poll_results DB
 * aggregation, see supabase/migrations/0020_match_fan_voting.sql) into
 * public-facing percentages. Every candidate in `candidateIds` is included
 * even with zero votes, so a poll with no votes yet still returns a full
 * (all-zero) breakdown rather than an empty list.
 *
 * Rounding: each percentage is independently rounded to the nearest whole
 * number (Math.round, half rounds up). This is the simplest option and
 * matches the spec's "totals should approximately sum to 100%" bar -- with
 * enough candidates or a near-tie, the rounded percentages can sum to
 * slightly under or over 100, which is expected and not corrected for.
 */
export function computeCandidateResults(candidateIds: string[], counts: Map<string, number>): { totalVotes: number; candidates: CandidateResult[] } {
  const totalVotes = candidateIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
  const candidates = candidateIds.map((candidateId) => {
    const voteCount = counts.get(candidateId) ?? 0;
    const percentage = totalVotes === 0 ? 0 : Math.round((voteCount / totalVotes) * 100);
    return { candidateId, voteCount, percentage };
  });
  return { totalVotes, candidates };
}
