import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId } from "@/lib/content/public-api";

export const runtime = "nodejs";

const querySchema = z.object({
  site: z.string().min(1),
  placement: z.enum(["home_hero", "home_secondary", "columns_top", "column_top", "column_bottom"]).optional(),
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
  const { site, placement } = parsed.data;

  const siteId = await resolveSiteId(site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();
  let query = supabase.from("banners").select("*").eq("site_id", siteId).order("sort_order", { ascending: true });
  if (placement) query = query.eq("placement", placement);

  const { data: banners } = await query;

  const imageIds = Array.from(
    new Set((banners ?? []).flatMap((b) => [b.desktop_image_id, b.mobile_image_id]).filter((id): id is string => id != null)),
  );
  const { data: images } = imageIds.length > 0 ? await supabase.from("media_assets").select("id, public_url").in("id", imageIds) : { data: [] };
  const imageUrls = new Map((images ?? []).map((i) => [i.id, i.public_url]));

  const data = (banners ?? []).map((b) => ({
    id: b.id,
    placement: b.placement,
    title: b.title,
    subtitle: b.subtitle,
    ctaText: b.cta_text,
    destinationUrl: b.destination_url,
    desktopImageUrl: imageUrls.get(b.desktop_image_id) ?? null,
    mobileImageUrl: b.mobile_image_id ? (imageUrls.get(b.mobile_image_id) ?? null) : null,
    sortOrder: b.sort_order,
  }));

  return NextResponse.json({ data }, { status: 200, headers });
}
