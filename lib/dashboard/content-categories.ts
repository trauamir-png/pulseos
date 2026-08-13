import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export interface CategoryRecord {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

function toCategoryRecord(row: Database["public"]["Tables"]["categories"]["Row"]): CategoryRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: row.active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCategoriesForSite(supabase: Supa, siteId: string): Promise<CategoryRecord[]> {
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("site_id", siteId)
    .order("display_order", { ascending: true });
  return (data ?? []).map(toCategoryRecord);
}

export async function getCategoryById(supabase: Supa, siteId: string, id: string): Promise<CategoryRecord | null> {
  const { data } = await supabase.from("categories").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  return data ? toCategoryRecord(data) : null;
}

/** Backs the delete-safety UX: a Category linked to Columns can't be deleted (DB also enforces this via `references categories(id)`). */
export async function countColumnsByCategory(supabase: Supa, siteId: string, categoryId: string): Promise<number> {
  const { count } = await supabase
    .from("columns")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("category_id", categoryId);
  return count ?? 0;
}
