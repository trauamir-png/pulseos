import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId, serializePublicColumns } from "@/lib/content/public-api";

export const runtime = "nodejs";

const querySchema = z.object({
  site: z.string().min(1),
  category: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
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
  const { site, category, tag, limit, offset } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();

  let query = supabase
    .from("columns")
    .select("*", { count: "exact" })
    .eq("site_id", siteId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (category) {
    const { data: categoryRow } = await supabase.from("categories").select("id").eq("site_id", siteId).eq("slug", category).maybeSingle();
    if (!categoryRow) {
      return NextResponse.json({ data: [], meta: { total: 0, limit, offset } }, { status: 200, headers });
    }
    query = query.eq("category_id", categoryRow.id);
  }
  if (tag) query = query.contains("tags", [tag]);

  const { data: rows, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500, headers });
  }

  const data = await serializePublicColumns(supabase, rows ?? []);
  return NextResponse.json({ data, meta: { total: count ?? data.length, limit, offset } }, { status: 200, headers });
}
