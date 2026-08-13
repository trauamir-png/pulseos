import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSiteId } from "@/lib/content/public-api";

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

export async function GET(request: NextRequest) {
  const headers = corsHeaders();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers });
  }

  const siteId = await resolveSiteId(parsed.data.site);
  if (!siteId) {
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers });
  }

  const supabase = await createClient();
  const { data: authors } = await supabase.from("authors").select("*").eq("site_id", siteId).order("name", { ascending: true });

  const imageIds = Array.from(new Set((authors ?? []).map((a) => a.profile_image_id).filter((id): id is string => id != null)));
  const { data: images } = imageIds.length > 0 ? await supabase.from("media_assets").select("id, public_url").in("id", imageIds) : { data: [] };
  const imageUrls = new Map((images ?? []).map((i) => [i.id, i.public_url]));

  const data = (authors ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    shortBio: a.short_bio,
    fullBio: a.full_bio,
    socialLinks: a.social_links,
    profileImageUrl: a.profile_image_id ? (imageUrls.get(a.profile_image_id) ?? null) : null,
  }));

  return NextResponse.json({ data }, { status: 200, headers });
}
