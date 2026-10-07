import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { StartingXiPlayerResult } from "@/lib/content/starting-xi-results";

type Supa = SupabaseClient<Database>;
type SnapshotRow = Database["public"]["Tables"]["starting_xi_snapshots"]["Row"];
type PlayerResultRow = Database["public"]["Tables"]["starting_xi_player_results"]["Row"];

export interface StartingXiSnapshotRecord {
  id: string;
  siteId: string;
  externalFixtureId: string;
  opponentName: string;
  kickoffAt: string;
  lockAt: string;
  votingStatus: "open" | "closed" | "unavailable";
  totalSubmissions: number;
  updatedAt: string;
}

function toSnapshotRecord(row: SnapshotRow): StartingXiSnapshotRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    externalFixtureId: row.external_fixture_id,
    opponentName: row.opponent_name,
    kickoffAt: row.kickoff_at,
    lockAt: row.lock_at,
    votingStatus: row.voting_status,
    totalSubmissions: row.total_submissions,
    updatedAt: row.updated_at,
  };
}

function toPlayerResult(row: PlayerResultRow): StartingXiPlayerResult {
  return {
    playerId: row.player_id,
    name: row.name,
    shirtNumber: row.shirt_number,
    position: row.position,
    imageUrl: row.image_url,
    selectionCount: row.selection_count,
    selectionPercentage: Number(row.selection_percentage),
    isCurrentSquad: row.is_current_squad,
  };
}

export async function getStartingXiSnapshotsForSite(supabase: Supa, siteId: string): Promise<StartingXiSnapshotRecord[]> {
  const { data } = await supabase.from("starting_xi_snapshots").select("*").eq("site_id", siteId).order("kickoff_at", { ascending: false });
  return (data ?? []).map(toSnapshotRecord);
}

export async function getStartingXiSnapshotById(supabase: Supa, siteId: string, id: string): Promise<StartingXiSnapshotRecord | null> {
  const { data } = await supabase.from("starting_xi_snapshots").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toSnapshotRecord(data) : null;
}

export async function getPlayerResultsForSnapshot(supabase: Supa, snapshotId: string): Promise<StartingXiPlayerResult[]> {
  const { data } = await supabase.from("starting_xi_player_results").select("*").eq("snapshot_id", snapshotId);
  return (data ?? []).map(toPlayerResult);
}
