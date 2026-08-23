import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveMatchOutcome, derivePanelPickType, panelPickLabel, matchOutcomeLabel, type MatchOutcome, type PanelPickType } from "@/lib/content/match-result";
import { computeCandidateResults, type CandidateResult } from "@/lib/content/fan-vote-results";

type Supa = SupabaseClient<Database>;
type PollRow = Database["public"]["Tables"]["match_fan_polls"]["Row"];
type CandidateRow = Database["public"]["Tables"]["match_fan_poll_candidates"]["Row"];

export interface MatchFanPollRecord {
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
  status: "draft" | "open" | "closed";
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outcome: MatchOutcome | null;
  outcomeLabel: string | null;
  voteType: PanelPickType | null;
  voteLabel: string | null;
}

/** vote_type/label are never stored (see 0020_match_fan_voting.sql) -- always derived here, the same way match_panel_picks derives pickType, reusing the exact same lib/content/match-result.ts functions since the win/draw/loss -> best/disappointing mapping is identical. */
function toRecord(row: PollRow): MatchFanPollRecord {
  const resultInput = { isHome: row.is_home, homeScore: row.home_score, awayScore: row.away_score, isFinal: row.is_final };
  const outcome = deriveMatchOutcome(resultInput);
  const voteType = derivePanelPickType(resultInput);
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
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    outcome,
    outcomeLabel: outcome ? matchOutcomeLabel(outcome) : null,
    voteType,
    voteLabel: voteType ? panelPickLabel(voteType) : null,
  };
}

export async function getMatchFanPollsForSite(supabase: Supa, siteId: string): Promise<MatchFanPollRecord[]> {
  const { data } = await supabase.from("match_fan_polls").select("*").eq("site_id", siteId).order("match_date", { ascending: false });
  return (data ?? []).map(toRecord);
}

export async function getMatchFanPollById(supabase: Supa, siteId: string, id: string): Promise<MatchFanPollRecord | null> {
  const { data } = await supabase.from("match_fan_polls").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toRecord(data) : null;
}

export interface MatchFanPollCandidateRecord {
  id: string;
  pollId: string;
  playerId: string;
  slug: string | null;
  playerName: string;
  profileUrl: string | null;
  imageUrl: string | null;
  shirtNumber: number | null;
  starter: boolean;
  enteredAsSubstitute: boolean;
  entryMinute: number | null;
}

function toCandidateRecord(row: CandidateRow): MatchFanPollCandidateRecord {
  return {
    id: row.id,
    pollId: row.poll_id,
    playerId: row.player_id,
    slug: row.slug,
    playerName: row.player_name,
    profileUrl: row.profile_url,
    imageUrl: row.image_url,
    shirtNumber: row.shirt_number,
    starter: row.starter,
    enteredAsSubstitute: row.entered_as_substitute,
    entryMinute: row.entry_minute,
  };
}

export async function getCandidatesForPoll(supabase: Supa, pollId: string): Promise<MatchFanPollCandidateRecord[]> {
  const { data } = await supabase
    .from("match_fan_poll_candidates")
    .select("*")
    .eq("poll_id", pollId)
    .order("starter", { ascending: false })
    .order("shirt_number", { ascending: true });
  return (data ?? []).map(toCandidateRecord);
}

/**
 * Vote counts/percentages for the dashboard "inspect results" view. Uses the
 * service-role client deliberately: match_fan_votes has no
 * anon/authenticated RLS policy at all (0020_match_fan_voting.sql), so even
 * an authenticated manager's session-bound client cannot read it directly.
 * requireSiteAccess/requirePermission are enforced by the calling Server
 * Action *before* this runs -- this function trusts its caller, the same way
 * lib/analytics/rate-limit.ts's RPC trusts its caller.
 */
export async function getPollResults(pollId: string, candidateIds: string[]): Promise<{ totalVotes: number; candidates: CandidateResult[] }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_fan_poll_results", { p_poll_id: pollId });
  if (error) throw new Error(error.message);
  const counts = new Map((data ?? []).map((row) => [row.candidate_id, Number(row.vote_count)]));
  return computeCandidateResults(candidateIds, counts);
}
