export type MatchOutcome = "win" | "loss" | "draw";
export type PanelPickType = "best" | "disappointing";

export interface MatchResultInput {
  isHome: boolean;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
}

/**
 * Derives Maccabi's result from scores stored exactly as displayed on the
 * source site (home team's score, away team's score) plus whether Maccabi
 * was the home team -- never from which number visually comes first, since
 * that flips depending on whether Maccabi played home or away. Returns null
 * for a not-final or not-yet-scored match so no result is ever published
 * prematurely.
 */
export function deriveMatchOutcome(input: MatchResultInput): MatchOutcome | null {
  if (!input.isFinal || input.homeScore == null || input.awayScore == null) return null;
  const maccabiScore = input.isHome ? input.homeScore : input.awayScore;
  const opponentScore = input.isHome ? input.awayScore : input.homeScore;
  if (maccabiScore === opponentScore) return "draw";
  return maccabiScore > opponentScore ? "win" : "loss";
}

/** Win or draw -> "best" (מצטיין המשחק), loss -> "disappointing" (מאכזב המשחק). Null when the outcome can't be derived yet. */
export function derivePanelPickType(input: MatchResultInput): PanelPickType | null {
  const outcome = deriveMatchOutcome(input);
  if (outcome === null) return null;
  return outcome === "loss" ? "disappointing" : "best";
}

export function panelPickLabel(type: PanelPickType): string {
  return type === "best" ? "מצטיין המשחק" : "מאכזב המשחק";
}

export function matchOutcomeLabel(outcome: MatchOutcome): string {
  if (outcome === "win") return "ניצחון";
  if (outcome === "loss") return "הפסד";
  return "תיקו";
}
