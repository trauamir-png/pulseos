import { describe, expect, it } from "vitest";
import { computeFansXi, sortStartingXiPlayers, type StartingXiPlayerResult } from "./starting-xi-results";

function player(overrides: Partial<StartingXiPlayerResult> = {}): StartingXiPlayerResult {
  return {
    playerId: "p1",
    name: "Player",
    shirtNumber: null,
    position: null,
    imageUrl: null,
    selectionCount: 0,
    selectionPercentage: 0,
    isCurrentSquad: true,
    ...overrides,
  };
}

describe("sortStartingXiPlayers", () => {
  it("sorts by selectionCount desc", () => {
    const a = player({ playerId: "a", name: "א", selectionCount: 5 });
    const b = player({ playerId: "b", name: "ב", selectionCount: 10 });
    expect(sortStartingXiPlayers([a, b]).map((p) => p.playerId)).toEqual(["b", "a"]);
  });

  it("breaks a selectionCount tie by selectionPercentage desc", () => {
    const a = player({ playerId: "a", name: "א", selectionCount: 5, selectionPercentage: 40 });
    const b = player({ playerId: "b", name: "ב", selectionCount: 5, selectionPercentage: 60 });
    expect(sortStartingXiPlayers([a, b]).map((p) => p.playerId)).toEqual(["b", "a"]);
  });

  it("breaks a full tie by name asc using Hebrew collation, never randomly", () => {
    const a = player({ playerId: "a", name: "דוד", selectionCount: 5, selectionPercentage: 50 });
    const b = player({ playerId: "b", name: "אבי", selectionCount: 5, selectionPercentage: 50 });
    const result1 = sortStartingXiPlayers([a, b]).map((p) => p.playerId);
    const result2 = sortStartingXiPlayers([a, b]).map((p) => p.playerId);
    expect(result1).toEqual(["b", "a"]);
    expect(result1).toEqual(result2);
  });
});

describe("computeFansXi", () => {
  it("returns only the top 11 by the sort order", () => {
    const players = Array.from({ length: 15 }, (_, i) =>
      player({ playerId: `p${i}`, name: `שחקן ${i}`, selectionCount: 15 - i })
    );
    const xi = computeFansXi(players);
    expect(xi).toHaveLength(11);
    expect(xi.map((p) => p.playerId)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
  });

  it("excludes players with isCurrentSquad=false, even if they'd otherwise rank in the top 11", () => {
    const former = player({ playerId: "former", name: "עזב", selectionCount: 999, isCurrentSquad: false });
    const current = Array.from({ length: 11 }, (_, i) => player({ playerId: `p${i}`, name: `שחקן ${i}`, selectionCount: 10 - i }));
    const xi = computeFansXi([former, ...current]);
    expect(xi.map((p) => p.playerId)).not.toContain("former");
    expect(xi).toHaveLength(11);
  });

  it("returns fewer than 11 when the current squad has fewer eligible players", () => {
    const players = [player({ playerId: "a" }), player({ playerId: "b" })];
    expect(computeFansXi(players)).toHaveLength(2);
  });
});
