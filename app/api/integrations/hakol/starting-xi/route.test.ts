import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Exercises the real POST handler end-to-end against an in-memory fake of
 * the two tables it touches (starting_xi_snapshots, starting_xi_player_results),
 * following the same hand-rolled query-builder-fake pattern as
 * app/api/integrations/hakol/fan-voting/route.test.ts.
 */

const SITE_ID = "site-1";

interface SnapshotRow {
  id: string;
  site_id: string;
  external_fixture_id: string;
  opponent_name: string;
  kickoff_at: string;
  lock_at: string;
  voting_status: "open" | "closed" | "unavailable";
  total_submissions: number;
}

interface PlayerRow {
  id: string;
  snapshot_id: string;
  player_id: string;
  name: string;
  selection_count: number;
  selection_percentage: number;
  is_current_squad: boolean;
}

interface FakeState {
  snapshots: Map<string, SnapshotRow>;
  players: Map<string, PlayerRow>;
  nextId: number;
}

function newState(): FakeState {
  return { snapshots: new Map(), players: new Map(), nextId: 0 };
}

function makeAdmin(state: FakeState) {
  function builder(table: "starting_xi_snapshots" | "starting_xi_player_results") {
    let mode: "upsert" | null = null;
    let payload: Record<string, unknown> | null = null;

    function upsertSnapshot(p: Record<string, unknown>): SnapshotRow {
      const existing = [...state.snapshots.values()].find((r) => r.site_id === p.site_id && r.external_fixture_id === p.external_fixture_id);
      const id = existing?.id ?? `snapshot-${++state.nextId}`;
      const row = { ...(existing ?? {}), ...p, id } as SnapshotRow;
      state.snapshots.set(id, row);
      return row;
    }

    function upsertPlayer(p: Record<string, unknown>): PlayerRow {
      const existing = [...state.players.values()].find((r) => r.snapshot_id === p.snapshot_id && r.player_id === p.player_id);
      const id = existing?.id ?? `player-${++state.nextId}`;
      const row = { ...(existing ?? {}), ...p, id } as PlayerRow;
      state.players.set(id, row);
      return row;
    }

    function resolve(): { data: unknown; error: null } {
      if (mode === "upsert" && payload) {
        const row = table === "starting_xi_snapshots" ? upsertSnapshot(payload) : upsertPlayer(payload);
        return { data: row, error: null };
      }
      return { data: null, error: null };
    }

    const api = {
      upsert: (p: Record<string, unknown>) => {
        mode = "upsert";
        payload = p;
        return api;
      },
      select: () => api,
      single: async () => resolve(),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(onF, onR),
    };
    return api;
  }

  return { from: (table: string) => builder(table as "starting_xi_snapshots" | "starting_xi_player_results") };
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
    opponentName: "Maccabi Haifa",
    kickoffAt: "2026-08-31T18:00:00Z",
    lockAt: "2026-08-31T17:00:00Z",
    votingStatus: "open",
    totalSubmissions: 0,
    players: [],
    ...overrides,
  };
}

function playerPayload(overrides: Record<string, unknown> = {}) {
  return {
    playerId: "player-1",
    name: "Player One",
    selectionCount: 10,
    selectionPercentage: 50,
    isCurrentSquad: true,
    ...overrides,
  };
}

let route: typeof import("./route");

beforeEach(async () => {
  vi.resetModules();
  currentState = newState();
  process.env.HAKOL_STARTING_XI_INTEGRATION_SECRET = SECRET;
  route = await import("./route");
});

describe("unauthorized requests", () => {
  it("rejects a missing secret header", async () => {
    const res = await route.POST(makeRequest(baseBody(), null));
    expect(res.status).toBe(401);
    expect(currentState.snapshots.size).toBe(0);
  });

  it("rejects a wrong secret header", async () => {
    const res = await route.POST(makeRequest(baseBody(), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(currentState.snapshots.size).toBe(0);
  });
});

describe("validation", () => {
  it("accepts a well-formed payload", async () => {
    const res = await route.POST(makeRequest(baseBody({ players: [playerPayload()] })));
    expect(res.status).toBe(200);
  });

  it("rejects a payload with an unrecognized field due to the strict schema (e.g. a stray voter_token)", async () => {
    const res = await route.POST(makeRequest({ ...baseBody(), voterToken: "abc123" }));
    expect(res.status).toBe(400);
    expect(currentState.snapshots.size).toBe(0);
  });

  it("rejects a player payload carrying an unrecognized field", async () => {
    const res = await route.POST(
      makeRequest(
        baseBody({
          players: [{ ...playerPayload(), cookie: "session=abc" }],
        })
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid votingStatus value", async () => {
    const res = await route.POST(makeRequest(baseBody({ votingStatus: "live" })));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown site", async () => {
    const res = await route.POST(makeRequest(baseBody({ site: "not-a-real-site" })));
    expect(res.status).toBe(404);
  });
});

describe("upsert / idempotency", () => {
  it("creates exactly one snapshot row, keyed on (site, fixtureId), across repeated pushes", async () => {
    await route.POST(makeRequest(baseBody()));
    await route.POST(makeRequest(baseBody({ totalSubmissions: 42 })));
    await route.POST(makeRequest(baseBody({ totalSubmissions: 99 })));

    expect(currentState.snapshots.size).toBe(1);
    const [snapshot] = [...currentState.snapshots.values()];
    expect(snapshot.total_submissions).toBe(99);
  });

  it("upserts a player row keyed on (snapshot_id, player_id) rather than duplicating it", async () => {
    await route.POST(makeRequest(baseBody({ players: [playerPayload({ selectionCount: 5 })] })));
    await route.POST(makeRequest(baseBody({ players: [playerPayload({ selectionCount: 20 })] })));

    expect(currentState.players.size).toBe(1);
    const [player] = [...currentState.players.values()];
    expect(player.selection_count).toBe(20);
  });

  it("is a pure no-op response on repeat with an identical payload (no duplicate rows at all)", async () => {
    const body = baseBody({ players: [playerPayload(), playerPayload({ playerId: "player-2", name: "Player Two" })] });
    await route.POST(makeRequest(body));
    await route.POST(makeRequest(body));

    expect(currentState.snapshots.size).toBe(1);
    expect(currentState.players.size).toBe(2);
  });
});

describe("players are never deleted", () => {
  it("a player omitted from a later push keeps their existing row untouched", async () => {
    await route.POST(makeRequest(baseBody({ players: [playerPayload({ playerId: "player-1" }), playerPayload({ playerId: "player-2", name: "Player Two" })] })));
    expect(currentState.players.size).toBe(2);

    // Second push only mentions player-1 -- player-2 must survive.
    await route.POST(makeRequest(baseBody({ players: [playerPayload({ playerId: "player-1" })] })));

    expect(currentState.players.size).toBe(2);
    expect([...currentState.players.values()].map((p) => p.player_id).sort()).toEqual(["player-1", "player-2"]);
  });

  it("a player who leaves the squad is kept with is_current_squad=false, not deleted", async () => {
    await route.POST(makeRequest(baseBody({ players: [playerPayload({ playerId: "player-1", isCurrentSquad: true })] })));
    await route.POST(makeRequest(baseBody({ players: [playerPayload({ playerId: "player-1", isCurrentSquad: false })] })));

    expect(currentState.players.size).toBe(1);
    expect([...currentState.players.values()][0].is_current_squad).toBe(false);
  });
});
