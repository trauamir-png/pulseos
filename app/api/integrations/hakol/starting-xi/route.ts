import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteId } from "@/lib/content/public-api";

export const runtime = "nodejs";

/**
 * Strict on purpose: an unknown field (e.g. a voter_token, cookie, or device
 * identifier Hakol's scraper might accidentally include) fails validation
 * instead of being silently accepted and stored. PulseOS must never hold
 * anything beyond the already-aggregated counts below.
 */
const playerResultSchema = z
  .object({
    playerId: z.string().min(1),
    name: z.string().min(1),
    shirtNumber: z.number().int().nullable().optional(),
    position: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    selectionCount: z.number().int().min(0),
    selectionPercentage: z.number().min(0).max(100),
    isCurrentSquad: z.boolean(),
  })
  .strict();

const bodySchema = z
  .object({
    site: z.string().min(1),
    fixtureId: z.string().min(1),
    opponentName: z.string().min(1),
    kickoffAt: z.string().min(1),
    lockAt: z.string().min(1),
    votingStatus: z.enum(["open", "closed", "unavailable"]),
    totalSubmissions: z.number().int().min(0),
    players: z.array(playerResultSchema).default([]),
  })
  .strict();

/** Server-to-server only. Same shared-secret-header convention as fan-voting's route, with its own dedicated secret. */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.HAKOL_STARTING_XI_INTEGRATION_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-hakol-integration-secret");
  if (!provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Upserts a Starting XI snapshot + its per-player result rows, keyed on
 * (site_id, external_fixture_id) for the snapshot and (snapshot_id,
 * player_id) for each player row. Idempotent: repeating the exact same
 * payload re-upserts the same rows rather than creating duplicates.
 *
 * No player row is ever deleted. A player missing current-squad status (or
 * missing from this push entirely) simply isn't upserted this round -- their
 * existing row, including an `is_current_squad: false` already written on a
 * prior push, is left untouched. Hakol is expected to keep sending every
 * player it still wants shown (current squad or not) on each push.
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

  const { data: snapshot, error: snapshotError } = await admin
    .from("starting_xi_snapshots")
    .upsert(
      {
        site_id: siteId,
        external_fixture_id: input.fixtureId,
        opponent_name: input.opponentName,
        kickoff_at: input.kickoffAt,
        lock_at: input.lockAt,
        voting_status: input.votingStatus,
        total_submissions: input.totalSubmissions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,external_fixture_id" }
    )
    .select("id")
    .single();
  if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 });

  for (const player of input.players) {
    const { error } = await admin.from("starting_xi_player_results").upsert(
      {
        snapshot_id: snapshot.id,
        player_id: player.playerId,
        name: player.name,
        shirt_number: player.shirtNumber ?? null,
        position: player.position ?? null,
        image_url: player.imageUrl ?? null,
        selection_count: player.selectionCount,
        selection_percentage: player.selectionPercentage,
        is_current_squad: player.isCurrentSquad,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "snapshot_id,player_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshotId: snapshot.id, votingStatus: input.votingStatus }, { status: 200 });
}
