import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId, serializePublicChatMessages } from "@/lib/content/public-api";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 20;

const querySchema = z.object({
  site: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).optional(),
  before: z.string().datetime().optional(),
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

/**
 * Public, read-only, anonymous-safe chat feed for one site. Reads only from
 * chat_messages_public (never chat_messages) -- see the migration's comment
 * block for why that table exists. Newest-first; pass `before` (an ISO
 * timestamp from a previous response's nextCursor) to page further back
 * into history instead of loading it all in one request.
 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers });
  }
  const { site, limit, before } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const pageSize = limit ?? DEFAULT_PAGE_SIZE;
  const supabase = await createClient();
  let query = supabase
    .from("chat_messages_public")
    .select("id, site_id, display_name, body, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(pageSize);
  if (before) query = query.lt("created_at", before);

  const { data } = await query;
  const rows = data ?? [];
  const nextCursor = rows.length === pageSize ? rows[rows.length - 1].created_at : null;

  return NextResponse.json({ data: serializePublicChatMessages(rows), nextCursor }, { status: 200, headers });
}
