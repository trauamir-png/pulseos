import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId, serializePublicStandMedia } from "@/lib/content/public-api";

export const runtime = "nodejs";

const querySchema = z.object({
  site: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).optional(),
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

export async function GET(request: NextRequest) {
  const headers = corsHeaders();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers });
  }
  const { site, limit } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();
  let query = supabase
    .from("stand_media")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data } = await query;

  return NextResponse.json({ data: serializePublicStandMedia(data ?? []) }, { status: 200, headers });
}
