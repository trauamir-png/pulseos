import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export interface MediaAssetRecord {
  id: string;
  siteId: string;
  storagePath: string;
  publicUrl: string;
  originalFilename: string;
  altText: string | null;
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
}

function toMediaRecord(row: Database["public"]["Tables"]["media_assets"]["Row"]): MediaAssetRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    originalFilename: row.original_filename,
    altText: row.alt_text,
    title: row.title,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMediaForSite(supabase: Supa, siteId: string, q?: string): Promise<MediaAssetRecord[]> {
  let query = supabase.from("media_assets").select("*").eq("site_id", siteId).order("created_at", { ascending: false });
  if (q) query = query.ilike("original_filename", `%${q}%`);
  const { data } = await query;
  return (data ?? []).map(toMediaRecord);
}

export async function getMediaById(supabase: Supa, siteId: string, id: string): Promise<MediaAssetRecord | null> {
  const { data } = await supabase.from("media_assets").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toMediaRecord(data) : null;
}

/**
 * Informational, not blocking: every reference to media_assets is `on delete
 * set null`, so deleting a still-used image never breaks a Column/Author/
 * Banner -- this just lets the UI warn "used in N places" before deleting.
 */
export async function countUsagesOfMedia(supabase: Supa, siteId: string, mediaId: string): Promise<number> {
  const [featured, og, profile, desktop, mobile] = await Promise.all([
    supabase.from("columns").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("featured_image_id", mediaId),
    supabase.from("columns").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("og_image_id", mediaId),
    supabase.from("authors").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("profile_image_id", mediaId),
    supabase.from("banners").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("desktop_image_id", mediaId),
    supabase.from("banners").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("mobile_image_id", mediaId),
  ]);
  return (featured.count ?? 0) + (og.count ?? 0) + (profile.count ?? 0) + (desktop.count ?? 0) + (mobile.count ?? 0);
}
