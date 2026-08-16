import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFullBackfill } from "@/lib/podbean/backfill";
import { PodbeanApiError } from "@/lib/podbean/client";
import { PodbeanAuthError } from "@/lib/podbean/token";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One-time (or on-demand) full 24-month historical backfill, per podcast.
 * CRON_SECRET-protected, same convention as /api/cron/podbean-sync.
 *
 * IMPORTANT: a full backfill across ~280 episodes is on the order of a
 * thousand+ Podbean API calls even with request chunking, which does not
 * comfortably fit inside a Vercel serverless function's execution window.
 * This route is meant to be invoked against a long-running local dev server
 * (no platform timeout), not triggered against Vercel Production. Nightly
 * incremental sync (/api/cron/podbean-sync) is the one meant to run on
 * Vercel Cron.
 *
 * Body: { "podcastId": "<uuid>" } -- backfills one podcast at a time so a
 * single run's duration stays predictable.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { podcastId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.podcastId) {
    return NextResponse.json({ error: "missing_podcastId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: podcast, error } = await admin.from("podcasts").select("id, hosting_provider").eq("id", body.podcastId).maybeSingle();

  if (error || !podcast) {
    return NextResponse.json({ error: "podcast_not_found" }, { status: 404 });
  }
  // Same account-scoped-API risk as /api/cron/podbean-sync: refuse to run
  // Podbean identity resolution against a podcast that isn't Podbean-hosted.
  if (podcast.hosting_provider !== "podbean") {
    return NextResponse.json({ error: "not_podbean_hosted" }, { status: 400 });
  }

  try {
    const result = await runFullBackfill(admin, { id: podcast.id });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof PodbeanApiError || e instanceof PodbeanAuthError ? e.message : "Unexpected backfill error.";
    await admin
      .from("podcasts")
      .update({ podbean_last_synced_at: new Date().toISOString(), podbean_last_sync_status: "error", podbean_last_error: message })
      .eq("id", podcast.id);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
