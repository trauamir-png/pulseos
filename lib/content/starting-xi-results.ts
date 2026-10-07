export interface StartingXiPlayerResult {
  playerId: string;
  name: string;
  shirtNumber: number | null;
  position: string | null;
  imageUrl: string | null;
  selectionCount: number;
  selectionPercentage: number;
  isCurrentSquad: boolean;
}

const collator = new Intl.Collator("he");

/**
 * selection_count desc -> selection_percentage desc -> name asc (Hebrew
 * collation). No random tie-break -- two players tied on every field above
 * sort in a stable, deterministic alphabetical order.
 */
export function compareStartingXiPlayers(a: StartingXiPlayerResult, b: StartingXiPlayerResult): number {
  if (b.selectionCount !== a.selectionCount) return b.selectionCount - a.selectionCount;
  if (b.selectionPercentage !== a.selectionPercentage) return b.selectionPercentage - a.selectionPercentage;
  return collator.compare(a.name, b.name);
}

export function sortStartingXiPlayers(players: StartingXiPlayerResult[]): StartingXiPlayerResult[] {
  return [...players].sort(compareStartingXiPlayers);
}

/**
 * "Fans' XI": the top 11 by the same sort, computed on the fly at render
 * time -- never persisted as an array, so it always reflects the latest
 * snapshot. Only current-squad players are eligible; a player who left the
 * squad keeps their historical row (see 0026_starting_xi.sql) but can never
 * occupy a Fans' XI slot, even if they'd otherwise rank in the top 11.
 */
export function computeFansXi(players: StartingXiPlayerResult[]): StartingXiPlayerResult[] {
  return sortStartingXiPlayers(players.filter((p) => p.isCurrentSquad)).slice(0, 11);
}

export type StartingXiVotingStatus = "open" | "closed" | "unavailable";

/**
 * The stored voting_status reflects the last webhook push, which can be
 * stale by the time this renders -- a snapshot pushed as "open" stays "open"
 * in the DB until hakol-mehayatzia sends another push, even well after its
 * own lock_at has passed. Re-derive the status every render instead of
 * trusting the stored value: lock_at always wins once reached, compared as
 * an absolute instant (never the viewer's local clock/timezone), and
 * "unavailable" always wins over lock_at (there was never a vote to lock).
 */
export function getEffectiveStartingXiStatus(storedStatus: StartingXiVotingStatus, lockAt: string, now: Date): StartingXiVotingStatus {
  if (storedStatus === "unavailable") return "unavailable";
  if (now.getTime() >= new Date(lockAt).getTime()) return "closed";
  return storedStatus;
}
