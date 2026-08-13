import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export interface AuthorRecord {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  profileImageId: string | null;
  profileImageUrl: string | null;
  shortBio: string | null;
  fullBio: string | null;
  email: string | null;
  socialLinks: Record<string, string>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

async function withProfileImageUrls(
  supabase: Supa,
  rows: Database["public"]["Tables"]["authors"]["Row"][],
): Promise<AuthorRecord[]> {
  const imageIds = Array.from(new Set(rows.map((r) => r.profile_image_id).filter((id): id is string => id != null)));
  const { data: images } =
    imageIds.length > 0 ? await supabase.from("media_assets").select("id, public_url").in("id", imageIds) : { data: [] };
  const urls = new Map((images ?? []).map((i) => [i.id, i.public_url]));

  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    slug: r.slug,
    profileImageId: r.profile_image_id,
    profileImageUrl: r.profile_image_id ? (urls.get(r.profile_image_id) ?? null) : null,
    shortBio: r.short_bio,
    fullBio: r.full_bio,
    email: r.email,
    socialLinks: r.social_links,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getAuthorsForSite(supabase: Supa, siteId: string): Promise<AuthorRecord[]> {
  const { data: rows } = await supabase.from("authors").select("*").eq("site_id", siteId).order("name", { ascending: true });
  return withProfileImageUrls(supabase, rows ?? []);
}

export async function getAuthorById(supabase: Supa, siteId: string, id: string): Promise<AuthorRecord | null> {
  const { data: row } = await supabase.from("authors").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  if (!row) return null;
  const [record] = await withProfileImageUrls(supabase, [row]);
  return record;
}

/** Backs the delete-safety UX: an Author linked to Columns can't be deleted (DB also enforces this via `references authors(id)`). */
export async function countColumnsByAuthor(supabase: Supa, siteId: string, authorId: string): Promise<number> {
  const { count } = await supabase
    .from("columns")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("author_id", authorId);
  return count ?? 0;
}
