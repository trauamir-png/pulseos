import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type ColumnRow = Database["public"]["Tables"]["columns"]["Row"];
type StandMediaRow = Database["public"]["Tables"]["stand_media"]["Row"];
type ChatMessagePublicRow = Database["public"]["Tables"]["chat_messages_public"]["Row"];

const EXCERPT_MAX_LENGTH = 200;
const WORDS_PER_MINUTE = 200;

/** Strips tags/entities from the sanitized body HTML down to plain text, for excerpt/reading-time derivation only -- never used to mutate the stored body. */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function makeExcerpt(bodyHtml: string, maxLength = EXCERPT_MAX_LENGTH): string {
  const plain = stripHtmlToText(bodyHtml);
  if (plain.length <= maxLength) return plain;
  const truncated = plain.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const clean = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${clean.trimEnd()}…`;
}

function calculateReadingTimeMinutes(bodyHtml: string): number {
  const plain = stripHtmlToText(bodyHtml);
  if (!plain) return 0;
  const wordCount = plain.split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

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
  excerpt: string;
  readingTimeMinutes: number;
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
      excerpt: makeExcerpt(row.body),
      readingTimeMinutes: calculateReadingTimeMinutes(row.body),
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

export interface PublicStandMedia {
  id: string;
  title: string;
  tiktokUrl: string;
  sortOrder: number;
  publishedAt: string | null;
}

/** No related entities to batch-resolve -- unlike columns, a Stand Media row is already public-shaped, so this is a straight field mapping. */
export function serializePublicStandMedia(rows: StandMediaRow[]): PublicStandMedia[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    tiktokUrl: row.tiktok_url,
    sortOrder: row.sort_order,
    publishedAt: row.published_at,
  }));
}

export interface PublicChatMessage {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
}

/**
 * chat_messages_public already contains only the fields safe to publish
 * (see supabase/migrations/0016_chat_messages.sql, extended with avatar_url
 * in 0018_profile_avatars.sql) -- this is a straight field mapping, same as
 * stand media, never anything from chat_messages itself (which this API
 * never queries).
 */
export function serializePublicChatMessages(rows: ChatMessagePublicRow[]): PublicChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    body: row.body,
    createdAt: row.created_at,
  }));
}
