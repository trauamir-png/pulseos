import { describe, expect, it } from "vitest";
import { deriveMatchOutcome, derivePanelPickType, panelPickLabel, matchOutcomeLabel } from "./match-result";

describe("deriveMatchOutcome / derivePanelPickType", () => {
  it("Maccabi home win: Maccabi 3-1 Opponent -> best / מצטיין המשחק", () => {
    const input = { isHome: true, homeScore: 3, awayScore: 1, isFinal: true };
    expect(deriveMatchOutcome(input)).toBe("win");
    expect(derivePanelPickType(input)).toBe("best");
    expect(panelPickLabel(derivePanelPickType(input)!)).toBe("מצטיין המשחק");
  });

  it("Maccabi away win: Opponent 1-3 Maccabi -> best", () => {
    const input = { isHome: false, homeScore: 1, awayScore: 3, isFinal: true };
    expect(deriveMatchOutcome(input)).toBe("win");
    expect(derivePanelPickType(input)).toBe("best");
  });

  it("Maccabi home loss: Maccabi 0-1 Opponent -> disappointing / מאכזב המשחק", () => {
    const input = { isHome: true, homeScore: 0, awayScore: 1, isFinal: true };
    expect(deriveMatchOutcome(input)).toBe("loss");
    expect(derivePanelPickType(input)).toBe("disappointing");
    expect(panelPickLabel(derivePanelPickType(input)!)).toBe("מאכזב המשחק");
  });

  it("Maccabi away loss: Opponent 2-0 Maccabi -> disappointing", () => {
    const input = { isHome: false, homeScore: 2, awayScore: 0, isFinal: true };
    expect(deriveMatchOutcome(input)).toBe("loss");
    expect(derivePanelPickType(input)).toBe("disappointing");
  });

  it("draw, Maccabi home: Maccabi 1-1 Opponent -> best / מצטיין המשחק", () => {
    const input = { isHome: true, homeScore: 1, awayScore: 1, isFinal: true };
    expect(deriveMatchOutcome(input)).toBe("draw");
    expect(derivePanelPickType(input)).toBe("best");
  });

  it("draw, Maccabi away: Opponent 1-1 Maccabi -> best / מצטיין המשחק", () => {
    const input = { isHome: false, homeScore: 1, awayScore: 1, isFinal: true };
    expect(deriveMatchOutcome(input)).toBe("draw");
    expect(derivePanelPickType(input)).toBe("best");
  });

  it("not final -> no derived outcome or pick type, regardless of scores present", () => {
    const input = { isHome: true, homeScore: 3, awayScore: 1, isFinal: false };
    expect(deriveMatchOutcome(input)).toBeNull();
    expect(derivePanelPickType(input)).toBeNull();
  });

  it("final but no score yet -> no derived outcome or pick type", () => {
    const input = { isHome: true, homeScore: null, awayScore: null, isFinal: true };
    expect(deriveMatchOutcome(input)).toBeNull();
    expect(derivePanelPickType(input)).toBeNull();
  });

  it("final with only one score recorded -> no derived outcome (partial data is not final data)", () => {
    const input = { isHome: true, homeScore: 2, awayScore: null, isFinal: true };
    expect(deriveMatchOutcome(input)).toBeNull();
    expect(derivePanelPickType(input)).toBeNull();
  });
});

describe("matchOutcomeLabel", () => {
  it("maps outcomes to Hebrew labels", () => {
    expect(matchOutcomeLabel("win")).toBe("ניצחון");
    expect(matchOutcomeLabel("loss")).toBe("הפסד");
    expect(matchOutcomeLabel("draw")).toBe("תיקו");
  });
});
