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
  /**
   * When true and the poll is currently `draft`, transitions it to `open` in
   * the same request (the minute-65 live-eligibility call). No-op if already
   * `open` (idempotent -- repeating the same request never re-opens/re-stamps
   * `opened_at`). Never reopens a `closed` poll -- that stays fully frozen,
   * same as before this field existed.
   */
  autoOpen: z.boolean().optional(),
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
 * Upserts a poll + its candidate snapshot from Hakol's scraper output, keyed
 * on (site_id, external_fixture_id), and supports the full automatic
 * lifecycle: draft -> open (via `autoOpen`) -> live safe updates -> final
 * score/isFinal update, all on the SAME row (never a second poll for the
 * same fixture, enforced by the unique (site_id, external_fixture_id)
 * constraint + this select-before-write check).
 *
 * A `closed` poll is always fully frozen -- no field update, no candidate
 * change, no `autoOpen` reopen. That transition stays a manual dashboard-only
 * action (app/(dashboard)/content/actions.ts's closeMatchFanPoll), untouched
 * by this route.
 *
 * A `draft` poll accepts a full field update (its match identity -- date,
 * opponent, home/away, competition -- isn't public yet, so it's safe to
 * correct). Once `open`, fans may already be voting on this exact match
 * identity, so only match-state fields that can legitimately change while
 * live/after full time stay writable: `is_final`, `home_score`,
 * `away_score`. `match_date`/`opponent_name`/`competition`/`is_home` are
 * frozen the moment a poll opens, same spirit as the candidate snapshot.
 *
 * Candidates: the existing upsert on (poll_id, player_id) already gives
 * idempotent, duplicate-free, ID-stable candidate writes (an update on
 * conflict never touches the row's `id`, so any vote's
 * (candidate_id, poll_id) FK stays valid) -- this route now also runs that
 * loop for `open` polls, which is exactly what's needed to let a
 * newly-entered substitute be added mid-match. No candidate is ever deleted
 * here, so existing votes are never at risk.
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

  if (existing?.status === "closed") {
    return NextResponse.json({ ok: true, pollId: existing.id, status: "closed", snapshotFrozen: true }, { status: 200 });
  }

  let pollId = existing?.id;
  let status: "draft" | "open" = existing?.status === "open" ? "open" : "draft";

  if (pollId && status === "draft") {
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
  } else if (pollId && status === "open") {
    const { error } = await admin
      .from("match_fan_polls")
      .update({
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

  // Never runs for a closed poll -- handled by the early return above.
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

  // draft -> open only. Guarded by .eq("status", "draft") so a second
  // concurrent/idempotent request can never re-stamp opened_at once it's
  // already open, and this can never fire for a closed poll (already
  // returned above).
  if (input.autoOpen && status === "draft") {
    const { error } = await admin
      .from("match_fan_polls")
      .update({ status: "open", opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", pollId)
      .eq("status", "draft");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    status = "open";
  }

  return NextResponse.json({ ok: true, pollId, status, snapshotFrozen: false }, { status: 200 });
}
