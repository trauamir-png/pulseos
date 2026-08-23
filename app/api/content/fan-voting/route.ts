import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteId, serializePublicFanVotePoll, serializePublicFanVoteCandidates } from "@/lib/content/public-api";
import { computeVoterHash } from "@/lib/content/fan-vote-token";
import { computeCandidateResults } from "@/lib/content/fan-vote-results";

export const runtime = "nodejs";

const querySchema = z.object({
  site: z.string().min(1),
  fixtureId: z.string().min(1),
  voterToken: z.string().min(1).optional(),
});

function corsHeaders() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return headers;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * Public read for a single match's fan vote poll. Percentages are withheld
 * (results: null) until the poll is closed or this voter has already voted
 * (PHASE 12 of the spec: never show percentages before voting) -- results
 * are always computed server-side from the match_fan_poll_results
 * aggregation RPC, raw votes are never shipped to the browser.
 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers });
  }
  const { site, fixtureId, voterToken } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();
  const { data: pollRow } = await supabase
    .from("match_fan_polls")
    .select("*")
    .eq("site_id", siteId)
    .eq("external_fixture_id", fixtureId)
    .maybeSingle();

  const poll = pollRow ? serializePublicFanVotePoll(pollRow) : null;
  if (!poll) {
    return NextResponse.json({ error: "poll_not_found" }, { status: 404, headers });
  }

  const { data: candidateRows } = await supabase.from("match_fan_poll_candidates").select("*").eq("poll_id", poll.id).order("starter", { ascending: false });
  const candidates = serializePublicFanVoteCandidates(candidateRows ?? []);

  let hasVoted = false;
  let selectedCandidateId: string | null = null;
  const admin = createAdminClient();

  if (voterToken) {
    const voterHash = computeVoterHash(poll.id, voterToken);
    const { data: vote } = await admin.from("match_fan_votes").select("candidate_id").eq("poll_id", poll.id).eq("voter_hash", voterHash).maybeSingle();
    if (vote) {
      hasVoted = true;
      selectedCandidateId = vote.candidate_id;
    }
  }

  let results = null;
  if (poll.status === "closed" || hasVoted) {
    const { data: counts } = await admin.rpc("match_fan_poll_results", { p_poll_id: poll.id });
    const countsMap = new Map((counts ?? []).map((row) => [row.candidate_id, Number(row.vote_count)]));
    results = computeCandidateResults(candidates.map((c) => c.id), countsMap);
  }

  return NextResponse.json({ poll, candidates, hasVoted, selectedCandidateId, results }, { status: 200, headers });
}
