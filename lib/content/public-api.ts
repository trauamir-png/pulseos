import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type ColumnRow = Database["public"]["Tables"]["columns"]["Row"];

/**
 * Resolves site_key -> site_id for the public Content API. Uses the
 * service-role client because `sites` has no anon SELECT policy (it
 * shouldn't -- nothing about a site's internal id/name/domain needs to be
 * public). This is the *only* admin-client use in the public API surface;
 * every actual content query below runs through the session-less (anon-role)
 * client so the new `to anon` RLS policies are the real security boundary.
 */
export async function resolveSiteId(siteKey: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("sites").select("id, active").eq("site_key", siteKey).maybeSingle();
  if (!data || !data.active) return null;
  return data.id;
}

export interface PublicAuthor {
  id: string;
  name: string;
  slug: string;
  shortBio: string | null;
  profileImageUrl: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface PublicColumn {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  body: string;
  featuredImageUrl: string | null;
  author: PublicAuthor | null;
  category: PublicCategory | null;
  tags: string[];
  status: ColumnRow["status"];
  publishedAt: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  updatedAt: string;
}

async function resolveMediaUrls(supabase: Supa, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => id != null)));
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("media_assets").select("id, public_url").in("id", unique);
  return new Map((data ?? []).map((row) => [row.id, row.public_url]));
}

/** Serializes columns for the public API, resolving images/author/category in batch (no N+1). */
export async function serializePublicColumns(supabase: Supa, rows: ColumnRow[]): Promise<PublicColumn[]> {
  if (rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const categoryIds = Array.from(new Set(rows.map((r) => r.category_id)));
  const imageIds = rows.flatMap((r) => [r.featured_image_id, r.og_image_id]);

  const [{ data: authors }, { data: categories }, imageUrls] = await Promise.all([
    supabase.from("authors").select("id, name, slug, short_bio, profile_image_id").in("id", authorIds),
    supabase.from("categories").select("id, name, slug, description").in("id", categoryIds),
    resolveMediaUrls(supabase, imageIds),
  ]);

  const authorProfileImageIds = (authors ?? []).map((a) => a.profile_image_id);
  const authorImageUrls = await resolveMediaUrls(supabase, authorProfileImageIds);

  const authorsById = new Map((authors ?? []).map((a) => [a.id, a]));
  const categoriesById = new Map((categories ?? []).map((c) => [c.id, c]));

  return rows.map((row) => {
    const author = authorsById.get(row.author_id);
    const category = categoriesById.get(row.category_id);
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      slug: row.slug,
      body: row.body,
      featuredImageUrl: row.featured_image_id ? (imageUrls.get(row.featured_image_id) ?? null) : null,
      author: author
        ? {
            id: author.id,
            name: author.name,
            slug: author.slug,
            shortBio: author.short_bio,
            profileImageUrl: author.profile_image_id ? (authorImageUrls.get(author.profile_image_id) ?? null) : null,
          }
        : null,
      category: category ? { id: category.id, name: category.name, slug: category.slug, description: category.description } : null,
      tags: row.tags,
      status: row.status,
      publishedAt: row.published_at ?? row.scheduled_at,
      seoTitle: row.seo_title,
      metaDescription: row.meta_description,
      ogImageUrl: row.og_image_id ? (imageUrls.get(row.og_image_id) ?? null) : null,
      updatedAt: row.updated_at,
    };
  });
}
