import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { deriveMatchOutcome, derivePanelPickType, panelPickLabel, matchOutcomeLabel, type MatchOutcome, type PanelPickType } from "@/lib/content/match-result";

type Supa = SupabaseClient<Database>;
type MatchPanelPickRow = Database["public"]["Tables"]["match_panel_picks"]["Row"];

export interface MatchPanelPickRecord {
  id: string;
  siteId: string;
  externalFixtureId: string;
  matchDate: string;
  opponentName: string;
  competition: string | null;
  isHome: boolean;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
  playerName: string;
  createdAt: string;
  updatedAt: string;
  outcome: MatchOutcome | null;
  outcomeLabel: string | null;
  pickType: PanelPickType | null;
  pickLabel: string | null;
}

function toRecord(row: MatchPanelPickRow): MatchPanelPickRecord {
  const resultInput = { isHome: row.is_home, homeScore: row.home_score, awayScore: row.away_score, isFinal: row.is_final };
  const outcome = deriveMatchOutcome(resultInput);
  const pickType = derivePanelPickType(resultInput);
  return {
    id: row.id,
    siteId: row.site_id,
    externalFixtureId: row.external_fixture_id,
    matchDate: row.match_date,
    opponentName: row.opponent_name,
    competition: row.competition,
    isHome: row.is_home,
    homeScore: row.home_score,
    awayScore: row.away_score,
    isFinal: row.is_final,
    playerName: row.player_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    outcome,
    outcomeLabel: outcome ? matchOutcomeLabel(outcome) : null,
    pickType,
    pickLabel: pickType ? panelPickLabel(pickType) : null,
  };
}

export async function getMatchPanelPicksForSite(supabase: Supa, siteId: string): Promise<MatchPanelPickRecord[]> {
  const { data } = await supabase.from("match_panel_picks").select("*").eq("site_id", siteId).order("match_date", { ascending: false });
  return (data ?? []).map(toRecord);
}

export async function getMatchPanelPickById(supabase: Supa, siteId: string, id: string): Promise<MatchPanelPickRecord | null> {
  const { data } = await supabase.from("match_panel_picks").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toRecord(data) : null;
}
