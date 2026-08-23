import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteId } from "@/lib/content/public-api";
import { computeVoterHash } from "@/lib/content/fan-vote-token";
import { submitVote } from "@/lib/content/fan-vote-submit";
import { computeCandidateResults } from "@/lib/content/fan-vote-results";
import { isRateLimited } from "@/lib/analytics/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  site: z.string().min(1),
  fixtureId: z.string().min(1),
  candidateId: z.string().uuid(),
  voterToken: z.string().min(8).max(200),
});

function corsHeaders() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return headers;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * Public vote submission. Only `candidateId` is ever trusted from the client
 * -- name/image come solely from the server-side candidate lookup inside
 * submitVote(). Returns freshly computed results directly in the response
 * (PHASE 17: no Realtime -- this is the immediate-feedback path for the
 * voter who just voted; anyone else refetches GET on demand).
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400, headers });
  }
  const { site, fixtureId, candidateId, voterToken } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const admin = createAdminClient();

  if (await isRateLimited(admin, siteId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }

  const { data: poll } = await admin
    .from("match_fan_polls")
    .select("id, status")
    .eq("site_id", siteId)
    .eq("external_fixture_id", fixtureId)
    .maybeSingle();
  if (!poll || poll.status === "draft") {
    return NextResponse.json({ error: "poll_not_found" }, { status: 404, headers });
  }

  const voterHash = computeVoterHash(poll.id, voterToken);
  const result = await submitVote(admin, { pollId: poll.id, candidateId, voterHash });
  if (!result.ok) {
    const status = result.error === "poll_not_found" ? 404 : result.error === "poll_not_open" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status, headers });
  }

  const { data: candidateRows } = await admin.from("match_fan_poll_candidates").select("id").eq("poll_id", poll.id);
  const candidateIds = (candidateRows ?? []).map((c) => c.id);
  const { data: counts } = await admin.rpc("match_fan_poll_results", { p_poll_id: poll.id });
  const countsMap = new Map((counts ?? []).map((row) => [row.candidate_id, Number(row.vote_count)]));
  const results = computeCandidateResults(candidateIds, countsMap);

  return NextResponse.json({ ok: true, selectedCandidateId: candidateId, results }, { status: 200, headers });
}
