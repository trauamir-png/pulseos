import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteId } from "@/lib/content/public-api";

export const runtime = "nodejs";

const candidateSchema = z.object({
  playerId: z.string().min(1),
  slug: z.string().nullable().optional(),
  playerName: z.string().min(1),
  profileUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  shirtNumber: z.number().int().nullable().optional(),
  starter: z.boolean(),
  enteredAsSubstitute: z.boolean(),
  entryMinute: z.number().int().nullable().optional(),
});

const bodySchema = z.object({
  site: z.string().min(1),
  fixtureId: z.string().min(1),
  matchDate: z.string().min(1),
  opponentName: z.string().min(1),
  competition: z.string().nullable().optional(),
  isHome: z.boolean(),
  homeScore: z.number().int().nullable().optional(),
  awayScore: z.number().int().nullable().optional(),
  isFinal: z.boolean(),
  candidates: z.array(candidateSchema).default([]),
});

/**
 * Server-to-server only. Reuses this codebase's existing shared-secret-header
 * convention (lib/content/revalidate-website.ts's x-revalidate-secret, sent
 * the opposite direction there) rather than inventing a new auth mechanism --
 * PHASE 8 of the spec required either reusing an existing trusted pattern or
 * stopping to report, and this is the only server-to-server auth pattern
 * already in the codebase. Never exposes the service-role key itself to
 * Hakol -- Hakol only ever holds this one shared secret string.
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.HAKOL_FAN_VOTING_INTEGRATION_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-hakol-integration-secret");
  if (!provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Upserts a draft poll + its candidate snapshot from Hakol's scraper output,
 * keyed on (site_id, external_fixture_id). Deliberately a no-op on the match
 * fields and candidates once the poll is no longer `draft` -- an open or
 * closed poll is a frozen snapshot (PHASE 4/5 of the spec: a later scrape
 * must never alter an active or historical vote). A PulseOS manager still
 * has to open voting by hand; this endpoint never changes `status` itself.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const siteId = await resolveSiteId(input.site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("match_fan_polls")
    .select("id, status")
    .eq("site_id", siteId)
    .eq("external_fixture_id", input.fixtureId)
    .maybeSingle();

  if (existing && existing.status !== "draft") {
    return NextResponse.json({ ok: true, pollId: existing.id, status: existing.status, snapshotFrozen: true }, { status: 200 });
  }

  let pollId = existing?.id;
  if (pollId) {
    const { error } = await admin
      .from("match_fan_polls")
      .update({
        match_date: input.matchDate,
        opponent_name: input.opponentName,
        competition: input.competition ?? null,
        is_home: input.isHome,
        home_score: input.homeScore ?? null,
        away_score: input.awayScore ?? null,
        is_final: input.isFinal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pollId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await admin
      .from("match_fan_polls")
      .insert({
        site_id: siteId,
        external_fixture_id: input.fixtureId,
        match_date: input.matchDate,
        opponent_name: input.opponentName,
        competition: input.competition ?? null,
        is_home: input.isHome,
        home_score: input.homeScore ?? null,
        away_score: input.awayScore ?? null,
        is_final: input.isFinal,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    pollId = data.id;
  }

  for (const candidate of input.candidates) {
    const { error } = await admin.from("match_fan_poll_candidates").upsert(
      {
        poll_id: pollId,
        player_id: candidate.playerId,
        slug: candidate.slug ?? null,
        player_name: candidate.playerName,
        profile_url: candidate.profileUrl ?? null,
        image_url: candidate.imageUrl ?? null,
        shirt_number: candidate.shirtNumber ?? null,
        starter: candidate.starter,
        entered_as_substitute: candidate.enteredAsSubstitute,
        entry_minute: candidate.entryMinute ?? null,
      },
      { onConflict: "poll_id,player_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pollId, status: "draft", snapshotFrozen: false }, { status: 200 });
}
