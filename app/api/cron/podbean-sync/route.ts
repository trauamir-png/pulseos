import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runNightlySync } from "@/lib/podbean/nightly";
import { PodbeanApiError } from "@/lib/podbean/client";
import { PodbeanAuthError } from "@/lib/podbean/token";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron target (see vercel.json). Not in the authenticated dashboard
 * session flow -- protected instead by CRON_SECRET, which Vercel Cron sends
 * automatically as `Authorization: Bearer <CRON_SECRET>` once that env var
 * is set on the project. Any other caller without that header is rejected.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Only podcasts explicitly identified as Podbean-hosted (see migration 0010) --
  // Podbean's GET /podcast is account-scoped, not feed-scoped, so running this
  // against a non-Podbean podcast would silently overwrite its podbean_podcast_id
  // with the wrong show's identity.
  const { data: podcasts, error } = await admin.from("podcasts").select("id, name").eq("active", true).eq("hosting_provider", "podbean");

  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  const results: Array<{ podcastId: string; name: string; ok: boolean; detail: unknown }> = [];

  for (const podcast of podcasts ?? []) {
    try {
      const result = await runNightlySync(admin, { id: podcast.id });
      results.push({ podcastId: podcast.id, name: podcast.name, ok: true, detail: result });
    } catch (e) {
      const message = e instanceof PodbeanApiError || e instanceof PodbeanAuthError ? e.message : "Unexpected sync error.";
      await admin
        .from("podcasts")
        .update({ podbean_last_synced_at: new Date().toISOString(), podbean_last_sync_status: "error", podbean_last_error: message })
        .eq("id", podcast.id);
      results.push({ podcastId: podcast.id, name: podcast.name, ok: false, detail: message });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
