import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type StandMediaRow = Database["public"]["Tables"]["stand_media"]["Row"];
export type StandMediaStatus = StandMediaRow["status"];

export interface StandMediaRecord {
  id: string;
  siteId: string;
  tiktokUrl: string;
  title: string;
  status: StandMediaStatus;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: StandMediaRow): StandMediaRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    tiktokUrl: row.tiktok_url,
    title: row.title,
    status: row.status,
    publishedAt: row.published_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getStandMediaForSite(supabase: Supa, siteId: string): Promise<StandMediaRecord[]> {
  const { data } = await supabase
    .from("stand_media")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []).map(toRecord);
}

export async function getStandMediaById(supabase: Supa, siteId: string, id: string): Promise<StandMediaRecord | null> {
  // TEMPORARY: remove this diagnostic block once the #441 root cause is found.
  console.log("[stand-media-441] getStandMediaById: entry", { siteId, id });
  const { data, error } = await supabase.from("stand_media").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  if (error) {
    console.error("[stand-media-441] getStandMediaById: query failed", { siteId, id, errorMessage: error.message });
  } else {
    console.log("[stand-media-441] getStandMediaById: query result", { siteId, id, found: !!data });
  }
  return data ? toRecord(data) : null;
}
