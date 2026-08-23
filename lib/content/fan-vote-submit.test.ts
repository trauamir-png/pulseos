import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { submitVote } from "./fan-vote-submit";

type Supa = SupabaseClient<Database>;

interface MockState {
  poll: { id: string; status: string } | null;
  candidateIds: Set<string>;
  votes: Map<string, { candidate_id: string }>;
}

function makeSupabase(state: MockState) {
  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "upsert" = "select";
    let upsertPayload: { poll_id: string; candidate_id: string; voter_hash: string } | undefined;

    function resolve() {
      if (mode === "upsert" && upsertPayload) {
        state.votes.set(`${upsertPayload.poll_id}|${upsertPayload.voter_hash}`, { candidate_id: upsertPayload.candidate_id });
        return Promise.resolve({ data: null, error: null });
      }
      if (table === "match_fan_polls") {
        if (state.poll && state.poll.id === filters.id) return Promise.resolve({ data: state.poll, error: null });
        return Promise.resolve({ data: null, error: null });
      }
      if (table === "match_fan_poll_candidates") {
        const id = filters.id as string | undefined;
        if (id && state.candidateIds.has(id) && filters.poll_id === state.poll?.id) {
          return Promise.resolve({ data: { id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      upsert: (payload: typeof upsertPayload) => {
        mode = "upsert";
        upsertPayload = payload;
        return api;
      },
      maybeSingle: () => resolve(),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => resolve().then(onFulfilled, onRejected),
    };
    return api;
  }

  return { from: (table: string) => builder(table) } as unknown as Supa;
}

describe("submitVote", () => {
  it("rejects a nonexistent poll", async () => {
    const state: MockState = { poll: null, candidateIds: new Set(), votes: new Map() };
    const result = await submitVote(makeSupabase(state), { pollId: "p1", candidateId: "c1", voterHash: "h1" });
    expect(result).toEqual({ ok: false, error: "poll_not_found" });
  });

  it("rejects voting on a poll that isn't open", async () => {
    const state: MockState = { poll: { id: "p1", status: "draft" }, candidateIds: new Set(["c1"]), votes: new Map() };
    const result = await submitVote(makeSupabase(state), { pollId: "p1", candidateId: "c1", voterHash: "h1" });
    expect(result).toEqual({ ok: false, error: "poll_not_open" });
  });

  it("rejects a candidate that doesn't belong to this poll", async () => {
    const state: MockState = { poll: { id: "p1", status: "open" }, candidateIds: new Set(), votes: new Map() };
    const result = await submitVote(makeSupabase(state), { pollId: "p1", candidateId: "wrong-poll-candidate", voterHash: "h1" });
    expect(result).toEqual({ ok: false, error: "invalid_candidate" });
  });

  it("records a first vote", async () => {
    const state: MockState = { poll: { id: "p1", status: "open" }, candidateIds: new Set(["c1"]), votes: new Map() };
    const supabase = makeSupabase(state);
    const result = await submitVote(supabase, { pollId: "p1", candidateId: "c1", voterHash: "h1" });
    expect(result).toEqual({ ok: true });
    expect(state.votes.get("p1|h1")).toEqual({ candidate_id: "c1" });
  });

  it("a repeat vote from the same voter changes the same row instead of adding a second one", async () => {
    const state: MockState = { poll: { id: "p1", status: "open" }, candidateIds: new Set(["c1", "c2"]), votes: new Map() };
    const supabase = makeSupabase(state);
    await submitVote(supabase, { pollId: "p1", candidateId: "c1", voterHash: "h1" });
    const second = await submitVote(supabase, { pollId: "p1", candidateId: "c2", voterHash: "h1" });
    expect(second).toEqual({ ok: true });
    expect(state.votes.size).toBe(1);
    expect(state.votes.get("p1|h1")).toEqual({ candidate_id: "c2" });
  });
});
