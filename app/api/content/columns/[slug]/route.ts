import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId, serializePublicColumns } from "@/lib/content/public-api";

export const runtime = "nodejs";

const querySchema = z.object({ site: z.string().min(1) });

function corsHeaders() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return headers;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const headers = corsHeaders();
  const { slug } = await ctx.params;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers });
  }

  const siteId = await resolveSiteId(parsed.data.site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();
  const { data: row } = await supabase.from("columns").select("*").eq("site_id", siteId).eq("slug", slug).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }

  const [data] = await serializePublicColumns(supabase, [row]);
  return NextResponse.json({ data }, { status: 200, headers });
}
