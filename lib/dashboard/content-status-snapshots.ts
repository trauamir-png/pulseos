import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type StatusSnapshotRow = Database["public"]["Tables"]["status_snapshots"]["Row"];
export type StatusSnapshotStatus = StatusSnapshotRow["status"];

export interface StatusSnapshotRecord {
  id: string;
  siteId: string;
  headline: string;
  body: string;
  status: StatusSnapshotStatus;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: StatusSnapshotRow): StatusSnapshotRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    headline: row.headline,
    body: row.body,
    status: row.status,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getStatusSnapshotsForSite(supabase: Supa, siteId: string): Promise<StatusSnapshotRecord[]> {
  const { data } = await supabase
    .from("status_snapshots")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toRecord);
}

export async function getStatusSnapshotById(supabase: Supa, siteId: string, id: string): Promise<StatusSnapshotRecord | null> {
  const { data } = await supabase.from("status_snapshots").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toRecord(data) : null;
}
