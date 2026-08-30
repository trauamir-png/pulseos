import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type FieldVideoRow = Database["public"]["Tables"]["field_videos"]["Row"];
export type FieldVideoStatus = FieldVideoRow["status"];

export interface FieldVideoRecord {
  id: string;
  siteId: string;
  tiktokUrl: string;
  caption: string | null;
  status: FieldVideoStatus;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: FieldVideoRow): FieldVideoRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    tiktokUrl: row.tiktok_url,
    caption: row.caption,
    status: row.status,
    publishedAt: row.published_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getFieldVideosForSite(supabase: Supa, siteId: string): Promise<FieldVideoRecord[]> {
  const { data } = await supabase
    .from("field_videos")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []).map(toRecord);
}

export async function getFieldVideoById(supabase: Supa, siteId: string, id: string): Promise<FieldVideoRecord | null> {
  const { data } = await supabase.from("field_videos").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toRecord(data) : null;
}
