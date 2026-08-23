import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export type SubmitVoteError = "poll_not_found" | "poll_not_open" | "invalid_candidate";
export type SubmitVoteResult = { ok: true } | { ok: false; error: SubmitVoteError };

/**
 * The one place vote-submission rules are enforced, called from the public
 * POST /api/content/fan-voting/vote route with a service-role client (see
 * lib/supabase/admin.ts -- match_fan_votes has no anon/authenticated RLS
 * policy at all, so only this server-side path can ever write here).
 * Extracted from the route handler so it's directly unit-testable against a
 * mocked client, matching this codebase's existing Server Action test
 * convention (app/(dashboard)/content/actions.test.ts).
 *
 * Candidate name/image are never accepted here -- only `candidateId`, then
 * looked up server-side, exactly satisfying "do not trust candidate
 * name/image from the client."
 *
 * Vote change: the upsert on the (poll_id, voter_hash) unique constraint
 * updates the same row's candidate_id in place -- never inserts a second row
 * for the same voter/poll, and total voter count is unaffected by a change.
 */
export async function submitVote(supabase: Supa, params: { pollId: string; candidateId: string; voterHash: string }): Promise<SubmitVoteResult> {
  const { pollId, candidateId, voterHash } = params;

  const { data: poll } = await supabase.from("match_fan_polls").select("id, status").eq("id", pollId).maybeSingle();
  if (!poll) return { ok: false, error: "poll_not_found" };
  if (poll.status !== "open") return { ok: false, error: "poll_not_open" };

  const { data: candidate } = await supabase
    .from("match_fan_poll_candidates")
    .select("id")
    .eq("id", candidateId)
    .eq("poll_id", pollId)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "invalid_candidate" };

  const { error } = await supabase
    .from("match_fan_votes")
    .upsert({ poll_id: pollId, candidate_id: candidateId, voter_hash: voterHash, updated_at: new Date().toISOString() }, { onConflict: "poll_id,voter_hash" });
  if (error) throw new Error(error.message);

  return { ok: true };
}
