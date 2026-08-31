import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Exercises the real POST handler end-to-end (not a reimplementation of its
 * logic) against an in-memory fake of the two tables it touches
 * (match_fan_polls, match_fan_poll_candidates), following the same
 * hand-rolled query-builder-fake pattern as app/(dashboard)/users/actions.test.ts.
 * match_fan_votes is deliberately not modeled -- this route never reads or
 * writes it, so "existing votes preserved" is proven by "existing candidate
 * IDs never change", which the fake does assert.
 */

const SITE_ID = "site-1";

interface PollRow {
  id: string;
  site_id: string;
  external_fixture_id: string;
  match_date: string;
  opponent_name: string;
  competition: string | null;
  is_home: boolean;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
}

interface CandidateRow {
  id: string;
  poll_id: string;
  player_id: string;
  player_name: string;
  starter: boolean;
  entered_as_substitute: boolean;
}

interface FakeState {
  polls: Map<string, PollRow>;
  candidates: Map<string, CandidateRow>;
  nextId: number;
}

function newState(): FakeState {
  return { polls: new Map(), candidates: new Map(), nextId: 0 };
}

function seedPoll(state: FakeState, overrides: Partial<PollRow> = {}): PollRow {
  const id = overrides.id ?? `poll-${++state.nextId}`;
  const row: PollRow = {
    id,
    site_id: SITE_ID,
    external_fixture_id: "fixture-1",
    match_date: "2026-08-31",
    opponent_name: "Maccabi Haifa",
    competition: null,
    is_home: true,
    home_score: null,
    away_score: null,
    is_final: false,
    status: "draft",
    opened_at: null,
    ...overrides,
  };
  state.polls.set(id, row);
  return row;
}

function seedCandidate(state: FakeState, pollId: string, overrides: Partial<CandidateRow> = {}): CandidateRow {
  const id = overrides.id ?? `cand-${++state.nextId}`;
  const row: CandidateRow = {
    id,
    poll_id: pollId,
    player_id: "player-1",
    player_name: "Player One",
    starter: true,
    entered_as_substitute: false,
    ...overrides,
  };
  state.candidates.set(id, row);
  return row;
}

function makeAdmin(state: FakeState) {
  function builder(table: "match_fan_polls" | "match_fan_poll_candidates") {
    const rows = table === "match_fan_polls" ? state.polls : state.candidates;
    let mode: "select" | "update" | "insert" | "upsert" = "select";
    let payload: Record<string, unknown> | null = null;
    const filters: [string, unknown][] = [];

    function matches(row: Record<string, unknown>): boolean {
      return filters.every(([k, v]) => row[k] === v);
    }

    function resolve(): { data: unknown; error: null } {
      if (mode === "select") {
        return { data: [...rows.values()].filter((r) => matches(r as unknown as Record<string, unknown>)), error: null };
      }
      if (mode === "update") {
        const matched = [...rows.values()].filter((r) => matches(r as unknown as Record<string, unknown>));
        for (const r of matched) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (mode === "insert") {
        const id = `${table === "match_fan_polls" ? "poll" : "cand"}-${++state.nextId}`;
        const row = { id, ...payload };
        rows.set(id, row as never);
        return { data: row, error: null };
      }
      if (mode === "upsert" && table === "match_fan_poll_candidates") {
        const p = payload as Record<string, unknown>;
        const existing = [...state.candidates.values()].find((c) => c.poll_id === p.poll_id && c.player_id === p.player_id);
        const id = existing?.id ?? `cand-${++state.nextId}`;
        const row = { id, ...p };
        state.candidates.set(id, row as unknown as CandidateRow);
        return { data: row, error: null };
      }
      return { data: null, error: null };
    }

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return api;
      },
      update: (p: Record<string, unknown>) => {
        mode = "update";
        payload = p;
        return api;
      },
      insert: (p: Record<string, unknown>) => {
        mode = "insert";
        payload = p;
        return api;
      },
      upsert: (p: Record<string, unknown>) => {
        mode = "upsert";
        payload = p;
        return api;
      },
      maybeSingle: async () => {
        const r = resolve();
        const arr = r.data as unknown[] | null;
        return { data: Array.isArray(arr) ? (arr[0] ?? null) : arr, error: r.error };
      },
      single: async () => {
        const r = resolve();
        const arr = r.data as unknown[] | null;
        return { data: Array.isArray(arr) ? (arr[0] ?? null) : arr, error: r.error };
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(onF, onR),
    };
    return api;
  }

  return { from: (table: string) => builder(table as "match_fan_polls" | "match_fan_poll_candidates") };
}

let currentState: FakeState;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdmin(currentState),
}));
vi.mock("@/lib/content/public-api", () => ({
  resolveSiteId: async (site: string) => (site === "hakol" ? SITE_ID : null),
}));

const SECRET = "test-secret";

function makeRequest(body: unknown, headerValue: string | null = SECRET): NextRequest {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "x-hakol-integration-secret" ? headerValue : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    site: "hakol",
    fixtureId: "fixture-1",
    matchDate: "2026-08-31",
    opponentName: "Maccabi Haifa",
    isHome: true,
    isFinal: false,
    candidates: [],
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    playerId: "player-1",
    playerName: "Player One",
    starter: true,
    enteredAsSubstitute: false,
    ...overrides,
  };
}

let route: typeof import("./route");

beforeEach(async () => {
  vi.resetModules();
  currentState = newState();
  process.env.HAKOL_FAN_VOTING_INTEGRATION_SECRET = SECRET;
  route = await import("./route");
});

describe("unauthorized requests", () => {
  it("rejects a missing secret header", async () => {
    const res = await route.POST(makeRequest(baseBody(), null));
    expect(res.status).toBe(401);
    expect(currentState.polls.size).toBe(0);
  });

  it("rejects a wrong secret header", async () => {
    const res = await route.POST(makeRequest(baseBody(), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(currentState.polls.size).toBe(0);
  });
});

describe("autoOpen", () => {
  it("a brand-new live poll with autoOpen:true bootstraps as open", async () => {
    const res = await route.POST(makeRequest(baseBody({ autoOpen: true, candidates: [candidate()] })));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("open");
    expect(currentState.polls.get(body.pollId)?.status).toBe("open");
    expect(currentState.polls.get(body.pollId)?.opened_at).toBeTruthy();
  });

  it("an existing draft poll with autoOpen:true transitions to open", async () => {
    const poll = seedPoll(currentState, { status: "draft" });
    const res = await route.POST(makeRequest(baseBody({ autoOpen: true })));
    const body = await res.json();
    expect(body.status).toBe("open");
    expect(currentState.polls.get(poll.id)?.status).toBe("open");
  });

  it("repeated autoOpen requests are idempotent -- no re-open, opened_at not re-stamped", async () => {
    seedPoll(currentState, { status: "draft" });
    const first = await (await route.POST(makeRequest(baseBody({ autoOpen: true })))).json();
    const openedAtAfterFirst = currentState.polls.get(first.pollId)?.opened_at;

    const second = await (await route.POST(makeRequest(baseBody({ autoOpen: true })))).json();

    expect(second.status).toBe("open");
    expect(second.pollId).toBe(first.pollId);
    expect(currentState.polls.size).toBe(1);
    expect(currentState.polls.get(first.pollId)?.opened_at).toBe(openedAtAfterFirst);
  });
});

describe("open poll: safe live updates", () => {
  it("a newly-entered substitute is added as a new candidate on an open poll", async () => {
    const poll = seedPoll(currentState, { status: "open" });
    seedCandidate(currentState, poll.id, { player_id: "player-1", player_name: "Player One" });

    await route.POST(
      makeRequest(
        baseBody({
          candidates: [candidate({ playerId: "player-1", playerName: "Player One" }), candidate({ playerId: "sub-1", playerName: "Substitute One", starter: false, enteredAsSubstitute: true })],
        })
      )
    );

    const names = [...currentState.candidates.values()].filter((c) => c.poll_id === poll.id).map((c) => c.player_name);
    expect(names.sort()).toEqual(["Player One", "Substitute One"].sort());
  });

  it("existing candidates are preserved (never deleted) when the snapshot is updated", async () => {
    const poll = seedPoll(currentState, { status: "open" });
    seedCandidate(currentState, poll.id, { player_id: "player-1" });
    seedCandidate(currentState, poll.id, { player_id: "player-2" });

    // Hakol's snapshot in this request only lists player-1 -- player-2 must survive.
    await route.POST(makeRequest(baseBody({ candidates: [candidate({ playerId: "player-1" })] })));

    const remaining = [...currentState.candidates.values()].filter((c) => c.poll_id === poll.id);
    expect(remaining.map((c) => c.player_id).sort()).toEqual(["player-1", "player-2"]);
  });

  it("existing candidate IDs (and therefore any votes referencing them) are never replaced by a re-snapshot", async () => {
    const poll = seedPoll(currentState, { status: "open" });
    const original = seedCandidate(currentState, poll.id, { player_id: "player-1", player_name: "Old Name" });

    await route.POST(makeRequest(baseBody({ candidates: [candidate({ playerId: "player-1", playerName: "Updated Name" })] })));

    const updated = currentState.candidates.get(original.id);
    expect(updated?.id).toBe(original.id);
    expect(updated?.player_name).toBe("Updated Name");
    expect(currentState.candidates.size).toBe(1);
  });

  it("does not create a duplicate candidate row across repeated identical snapshots", async () => {
    const poll = seedPoll(currentState, { status: "open" });
    await route.POST(makeRequest(baseBody({ candidates: [candidate({ playerId: "player-1" })] })));
    await route.POST(makeRequest(baseBody({ candidates: [candidate({ playerId: "player-1" })] })));

    const forPoll = [...currentState.candidates.values()].filter((c) => c.poll_id === poll.id);
    expect(forPoll.length).toBe(1);
  });

  it("finalizing an open poll updates isFinal + final score and keeps it open", async () => {
    const poll = seedPoll(currentState, { status: "open", is_final: false, home_score: null, away_score: null });

    const res = await route.POST(makeRequest(baseBody({ isFinal: true, homeScore: 3, awayScore: 1 })));
    const body = await res.json();

    expect(body.status).toBe("open");
    const updated = currentState.polls.get(poll.id);
    expect(updated?.status).toBe("open"); // never auto-closed
    expect(updated?.is_final).toBe(true);
    expect(updated?.home_score).toBe(3);
    expect(updated?.away_score).toBe(1);
  });

  it("does not mutate frozen identity fields (opponent/date/home-away) once open", async () => {
    const poll = seedPoll(currentState, { status: "open", opponent_name: "Maccabi Haifa", match_date: "2026-08-31" });

    await route.POST(makeRequest(baseBody({ opponentName: "Someone Else FC", matchDate: "2099-01-01" })));

    const updated = currentState.polls.get(poll.id);
    expect(updated?.opponent_name).toBe("Maccabi Haifa");
    expect(updated?.match_date).toBe("2026-08-31");
  });
});

describe("closed poll: fully frozen", () => {
  it("cannot be reopened by autoOpen", async () => {
    const poll = seedPoll(currentState, { status: "closed" });
    const res = await route.POST(makeRequest(baseBody({ autoOpen: true })));
    const body = await res.json();

    expect(body.status).toBe("closed");
    expect(body.snapshotFrozen).toBe(true);
    expect(currentState.polls.get(poll.id)?.status).toBe("closed");
  });

  it("rejects candidate/result mutation -- no new candidate is added", async () => {
    const poll = seedPoll(currentState, { status: "closed" });
    await route.POST(makeRequest(baseBody({ candidates: [candidate({ playerId: "new-player" })] })));

    expect([...currentState.candidates.values()].filter((c) => c.poll_id === poll.id)).toHaveLength(0);
  });

  it("rejects a final-score update on a closed poll", async () => {
    const poll = seedPoll(currentState, { status: "closed", is_final: true, home_score: 3, away_score: 1 });
    await route.POST(makeRequest(baseBody({ isFinal: true, homeScore: 9, awayScore: 9 })));

    const updated = currentState.polls.get(poll.id);
    expect(updated?.home_score).toBe(3);
    expect(updated?.away_score).toBe(1);
  });
});

describe("draft poll: unchanged existing behavior", () => {
  it("a draft poll without autoOpen stays draft and its fields fully update", async () => {
    const poll = seedPoll(currentState, { status: "draft", opponent_name: "Old Name" });
    const res = await route.POST(makeRequest(baseBody({ opponentName: "New Name" })));
    const body = await res.json();

    expect(body.status).toBe("draft");
    expect(body.snapshotFrozen).toBe(false);
    expect(currentState.polls.get(poll.id)?.opponent_name).toBe("New Name");
  });

  it("never creates a second poll for the same (site, fixtureId)", async () => {
    seedPoll(currentState, { status: "draft" });
    await route.POST(makeRequest(baseBody()));
    await route.POST(makeRequest(baseBody()));

    expect(currentState.polls.size).toBe(1);
  });
});
