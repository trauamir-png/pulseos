import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId, serializePublicStatusSnapshot } from "@/lib/content/public-api";

export const runtime = "nodejs";

const querySchema = z.object({
  site: z.string().min(1),
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

/** Returns only the single latest published Status Snapshot for a site, or null -- drafts and history are never exposed here. */
export async function GET(request: NextRequest) {
  const headers = corsHeaders();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers });
  }
  const { site } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("status_snapshots")
    .select("*")
    .eq("site_id", siteId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ data: data ? serializePublicStatusSnapshot(data) : null }, { status: 200, headers });
}
