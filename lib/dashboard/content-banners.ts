import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type BannerRow = Database["public"]["Tables"]["banners"]["Row"];
export type BannerPlacement = BannerRow["placement"];

export interface BannerRecord {
  id: string;
  siteId: string;
  internalName: string;
  desktopImageId: string;
  desktopImageUrl: string | null;
  mobileImageId: string | null;
  mobileImageUrl: string | null;
  title: string | null;
  subtitle: string | null;
  ctaText: string | null;
  destinationUrl: string | null;
  placement: BannerPlacement;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

async function withImageUrls(supabase: Supa, rows: BannerRow[]): Promise<BannerRecord[]> {
  const imageIds = Array.from(
    new Set(rows.flatMap((r) => [r.desktop_image_id, r.mobile_image_id]).filter((id): id is string => id != null)),
  );
  const { data: images } =
    imageIds.length > 0 ? await supabase.from("media_assets").select("id, public_url").in("id", imageIds) : { data: [] };
  const urls = new Map((images ?? []).map((i) => [i.id, i.public_url]));

  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    internalName: r.internal_name,
    desktopImageId: r.desktop_image_id,
    desktopImageUrl: urls.get(r.desktop_image_id) ?? null,
    mobileImageId: r.mobile_image_id,
    mobileImageUrl: r.mobile_image_id ? (urls.get(r.mobile_image_id) ?? null) : null,
    title: r.title,
    subtitle: r.subtitle,
    ctaText: r.cta_text,
    destinationUrl: r.destination_url,
    placement: r.placement,
    active: r.active,
    startAt: r.start_at,
    endAt: r.end_at,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getBannersForSite(supabase: Supa, siteId: string): Promise<BannerRecord[]> {
  const { data } = await supabase
    .from("banners")
    .select("*")
    .eq("site_id", siteId)
    .order("placement", { ascending: true })
    .order("sort_order", { ascending: true });
  return withImageUrls(supabase, data ?? []);
}

export async function getBannerById(supabase: Supa, siteId: string, id: string): Promise<BannerRecord | null> {
  const { data } = await supabase.from("banners").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  if (!data) return null;
  const [record] = await withImageUrls(supabase, [data]);
  return record;
}
