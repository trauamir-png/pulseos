import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { derivePanelPickType, panelPickLabel } from "@/lib/content/match-result";

type Supa = SupabaseClient<Database>;
type ColumnRow = Database["public"]["Tables"]["columns"]["Row"];
type StandMediaRow = Database["public"]["Tables"]["stand_media"]["Row"];
type StatusSnapshotRow = Database["public"]["Tables"]["status_snapshots"]["Row"];
type FieldVideoRow = Database["public"]["Tables"]["field_videos"]["Row"];
type ChatMessagePublicRow = Database["public"]["Tables"]["chat_messages_public"]["Row"];
type MatchPanelPickRow = Database["public"]["Tables"]["match_panel_picks"]["Row"];
type MatchFanPollRow = Database["public"]["Tables"]["match_fan_polls"]["Row"];
type MatchFanPollCandidateRow = Database["public"]["Tables"]["match_fan_poll_candidates"]["Row"];

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

export interface PublicStatusSnapshot {
  id: string;
  headline: string;
  body: string;
  publishedAt: string | null;
}

/**
 * Only ever called with the single latest published row (the route orders by
 * published_at desc and limits to 1) -- created_by/status/timestamps beyond
 * publishedAt are intentionally never exposed, same as stand media.
 */
export function serializePublicStatusSnapshot(row: StatusSnapshotRow): PublicStatusSnapshot {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    publishedAt: row.published_at,
  };
}

export interface PublicFieldVideo {
  id: string;
  caption: string | null;
  tiktokUrl: string;
  sortOrder: number;
  publishedAt: string | null;
}

/**
 * Separate content type from Stand Media ("מדיה מהיציע") despite the
 * identical shape -- this is the "Videos from the field" homepage section,
 * a different table entirely (field_videos, 0023_field_videos.sql). No
 * related entities to batch-resolve, same as Stand Media.
 */
export function serializePublicFieldVideos(rows: FieldVideoRow[]): PublicFieldVideo[] {
  return rows.map((row) => ({
    id: row.id,
    caption: row.caption,
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

export interface PublicMatchPanelPick {
  fixtureId: string;
  matchDate: string;
  opponentName: string;
  isHome: boolean;
  playerName: string;
  pickType: "best" | "disappointing";
  label: string;
}

/**
 * pickType/label are always derived here from is_home/home_score/away_score/
 * is_final, never trusted from a stored value -- a row can only reach here at
 * all via the `anon read final match_panel_picks` RLS policy (is_final = true
 * and both scores set), but a not-final or unscored row is still filtered out
 * defensively in case that policy is ever loosened. created_by is
 * intentionally never selected/mapped -- nothing about who created a pick is
 * public.
 */
export function serializePublicMatchPanelPicks(rows: MatchPanelPickRow[]): PublicMatchPanelPick[] {
  const result: PublicMatchPanelPick[] = [];
  for (const row of rows) {
    const pickType = derivePanelPickType({ isHome: row.is_home, homeScore: row.home_score, awayScore: row.away_score, isFinal: row.is_final });
    if (!pickType) continue;
    result.push({
      fixtureId: row.external_fixture_id,
      matchDate: row.match_date,
      opponentName: row.opponent_name,
      isHome: row.is_home,
      playerName: row.player_name,
      pickType,
      label: panelPickLabel(pickType),
    });
  }
  return result;
}

export interface PublicFanVotePoll {
  id: string;
  fixtureId: string;
  matchDate: string;
  opponentName: string;
  competition: string | null;
  isHome: boolean;
  status: "open" | "closed";
  voteType: "best" | "disappointing";
  label: string;
}

/**
 * A row only reaches here via the `anon read open/closed match_fan_polls`
 * RLS policy (see supabase/migrations/0020_match_fan_voting.sql), which
 * already excludes `draft` -- a draft poll's row is simply never returned by
 * the query this feeds, so it's indistinguishable from a nonexistent poll to
 * the public API (an intentional, conservative reading of "don't leak an
 * unopened poll's existence"). vote_type/label are derived, never stored,
 * same as match_panel_picks. A not-final/unscored row is filtered out
 * defensively even though status open/closed should imply is_final=true.
 */
export function serializePublicFanVotePoll(row: MatchFanPollRow): PublicFanVotePoll | null {
  if (row.status !== "open" && row.status !== "closed") return null;
  const voteType = derivePanelPickType({ isHome: row.is_home, homeScore: row.home_score, awayScore: row.away_score, isFinal: row.is_final });
  if (!voteType) return null;
  return {
    id: row.id,
    fixtureId: row.external_fixture_id,
    matchDate: row.match_date,
    opponentName: row.opponent_name,
    competition: row.competition,
    isHome: row.is_home,
    status: row.status,
    voteType,
    label: panelPickLabel(voteType),
  };
}

export interface PublicFanVoteCandidate {
  id: string;
  playerId: string;
  slug: string | null;
  playerName: string;
  profileUrl: string | null;
  imageUrl: string | null;
  shirtNumber: number | null;
  starter: boolean;
  enteredAsSubstitute: boolean;
  entryMinute: number | null;
}

/** `id` here is match_fan_poll_candidates.id -- the value the client must send back as `candidateId` when voting. Nothing about created_by/poll internals is exposed. */
export function serializePublicFanVoteCandidates(rows: MatchFanPollCandidateRow[]): PublicFanVoteCandidate[] {
  return rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    slug: row.slug,
    playerName: row.player_name,
    profileUrl: row.profile_url,
    imageUrl: row.image_url,
    shirtNumber: row.shirt_number,
    starter: row.starter,
    enteredAsSubstitute: row.entered_as_substitute,
    entryMinute: row.entry_minute,
  }));
}
