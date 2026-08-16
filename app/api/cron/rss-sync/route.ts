import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPodcastFeed } from "@/app/(dashboard)/podcast/actions";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron target (see vercel.json). Refreshes every podcast's RSS feed --
 * provider-agnostic, unlike /api/cron/podbean-sync which only touches
 * Podbean-hosted shows. Not in the authenticated dashboard session flow --
 * protected instead by CRON_SECRET, which Vercel Cron sends automatically as
 * `Authorization: Bearer <CRON_SECRET>` once that env var is set on the
 * project. Any other caller without that header is rejected.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: podcasts, error } = await admin.from("podcasts").select("id, name, rss_url").eq("active", true).not("rss_url", "is", null);

  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  const results: Array<{ podcastId: string; name: string; ok: boolean; detail: unknown }> = [];

  for (const podcast of podcasts ?? []) {
    try {
      const summary = await syncPodcastFeed(admin, podcast);
      results.push({ podcastId: podcast.id, name: podcast.name, ok: true, detail: summary });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected sync error.";
      results.push({ podcastId: podcast.id, name: podcast.name, ok: false, detail: message });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
