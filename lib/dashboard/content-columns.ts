import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type ColumnRow = Database["public"]["Tables"]["columns"]["Row"];
export type ColumnStatus = ColumnRow["status"];

export interface ColumnListItem {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  status: ColumnStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  updatedAt: string;
  authorId: string;
  authorName: string | null;
  categoryId: string;
  categoryName: string | null;
}

export interface ColumnDetail {
  id: string;
  siteId: string;
  title: string;
  subtitle: string | null;
  slug: string;
  body: string;
  featuredImageId: string | null;
  featuredImageUrl: string | null;
  authorId: string;
  categoryId: string;
  tags: string[];
  status: ColumnStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  ogImageId: string | null;
  ogImageUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnFilters {
  q?: string;
  status?: string;
  categoryId?: string;
}

const LIST_COLUMNS = "id, site_id, title, slug, status, published_at, scheduled_at, updated_at, author_id, category_id";

export async function getColumnsForSite(supabase: Supa, siteId: string, filters: ColumnFilters = {}): Promise<ColumnListItem[]> {
  let query = supabase.from("columns").select(LIST_COLUMNS).eq("site_id", siteId).order("updated_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status as ColumnStatus);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const categoryIds = Array.from(new Set(rows.map((r) => r.category_id)));

  const [{ data: authors }, { data: categories }] = await Promise.all([
    supabase.from("authors").select("id, name").in("id", authorIds),
    supabase.from("categories").select("id, name").in("id", categoryIds),
  ]);

  const authorNames = new Map((authors ?? []).map((a) => [a.id, a.name]));
  const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    publishedAt: r.published_at,
    scheduledAt: r.scheduled_at,
    updatedAt: r.updated_at,
    authorId: r.author_id,
    authorName: authorNames.get(r.author_id) ?? null,
    categoryId: r.category_id,
    categoryName: categoryNames.get(r.category_id) ?? null,
  }));
}

async function resolveImageUrl(supabase: Supa, mediaId: string | null): Promise<string | null> {
  if (!mediaId) return null;
  const { data } = await supabase.from("media_assets").select("public_url").eq("id", mediaId).maybeSingle();
  return data?.public_url ?? null;
}

function toColumnDetail(row: ColumnRow, featuredImageUrl: string | null, ogImageUrl: string | null): ColumnDetail {
  return {
    id: row.id,
    siteId: row.site_id,
    title: row.title,
    subtitle: row.subtitle,
    slug: row.slug,
    body: row.body,
    featuredImageId: row.featured_image_id,
    featuredImageUrl,
    authorId: row.author_id,
    categoryId: row.category_id,
    tags: row.tags,
    status: row.status,
    publishedAt: row.published_at,
    scheduledAt: row.scheduled_at,
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    ogImageId: row.og_image_id,
    ogImageUrl,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ColumnOwnership {
  status: ColumnStatus;
  createdBy: string | null;
}

/** Lightweight fetch for Server Action authorization checks -- avoids resolving image URLs just to check ownership/status. */
export async function getColumnOwnership(supabase: Supa, siteId: string, id: string): Promise<ColumnOwnership | null> {
  const { data: row } = await supabase.from("columns").select("status, created_by").eq("id", id).eq("site_id", siteId).maybeSingle();
  if (!row) return null;
  return { status: row.status, createdBy: row.created_by };
}

/** Every Content table carries site_id directly, so isolation is a single dual-filtered query -- no two-step lookup needed. */
export async function getColumnById(supabase: Supa, siteId: string, id: string): Promise<ColumnDetail | null> {
  const { data: row } = await supabase.from("columns").select("*").eq("id", id).eq("site_id", siteId).maybeSingle();
  if (!row) return null;

  const [featuredImageUrl, ogImageUrl] = await Promise.all([
    resolveImageUrl(supabase, row.featured_image_id),
    resolveImageUrl(supabase, row.og_image_id),
  ]);

  return toColumnDetail(row, featuredImageUrl, ogImageUrl);
}

export async function getColumnBySlug(supabase: Supa, siteId: string, slug: string): Promise<ColumnDetail | null> {
  const { data: row } = await supabase.from("columns").select("*").eq("slug", slug).eq("site_id", siteId).maybeSingle();
  if (!row) return null;

  const [featuredImageUrl, ogImageUrl] = await Promise.all([
    resolveImageUrl(supabase, row.featured_image_id),
    resolveImageUrl(supabase, row.og_image_id),
  ]);

  return toColumnDetail(row, featuredImageUrl, ogImageUrl);
}
