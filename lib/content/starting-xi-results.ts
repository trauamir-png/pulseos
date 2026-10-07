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
