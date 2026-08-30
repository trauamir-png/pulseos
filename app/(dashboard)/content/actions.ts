"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeColumnBody } from "@/lib/content/sanitize";
import { slugify } from "@/lib/content/slug";
import { countColumnsByAuthor } from "@/lib/dashboard/content-authors";
import { countColumnsByCategory } from "@/lib/dashboard/content-categories";
import { getColumnOwnership, type ColumnStatus } from "@/lib/dashboard/content-columns";
import type { BannerPlacement } from "@/lib/dashboard/content-banners";
import type { Database } from "@/lib/supabase/types";
import { requireSiteAccess, requirePermission, getCurrentUser, hasPermission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";
import { revalidateWebsite } from "@/lib/content/revalidate-website";

const CONTENT_PATHS = [
  "/content/columns",
  "/content/authors",
  "/content/categories",
  "/content/media",
  "/content/banners",
  "/content/stand-media",
  "/content/match-panel-picks",
  "/content/match-fan-voting",
  "/content/status-snapshot",
  "/content/field-videos",
];

function revalidateContent() {
  for (const path of CONTENT_PATHS) revalidatePath(path);
}

async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "columns" | "authors" | "categories",
  siteId: string,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(desired);
  let candidate = base;
  let attempt = 1;
  for (;;) {
    let query = supabase.from(table).select("id").eq("site_id", siteId).eq("slug", candidate);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export interface ColumnInput {
  title: string;
  subtitle: string;
  slug: string;
  body: string;
  featuredImageId: string | null;
  authorId: string;
  categoryId: string;
  tags: string[];
  seoTitle: string;
  metaDescription: string;
  ogImageId: string | null;
}

export async function createColumn(siteId: string, input: ColumnInput) {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.authorId) throw new Error("Author is required.");
  if (!input.categoryId) throw new Error("Category is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_CREATE);

  const slug = await uniqueSlug(supabase, "columns", siteId, input.slug || input.title);
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("columns")
    .insert({
      site_id: siteId,
      title: input.title.trim(),
      subtitle: input.subtitle.trim() || null,
      slug,
      body: sanitizeColumnBody(input.body),
      featured_image_id: input.featuredImageId,
      author_id: input.authorId,
      category_id: input.categoryId,
      tags: input.tags,
      status: "draft",
      seo_title: input.seoTitle.trim() || null,
      meta_description: input.metaDescription.trim() || null,
      og_image_id: input.ogImageId,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["columns"]);
  return { id: data.id };
}

export async function updateColumn(siteId: string, id: string, input: ColumnInput) {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.authorId) throw new Error("Author is required.");
  if (!input.categoryId) throw new Error("Category is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);

  const existing = await getColumnOwnership(supabase, siteId, id);
  if (!existing) throw new Error("Column not found.");

  const [user, canEditAll, canEditOwn] = await Promise.all([
    getCurrentUser(supabase),
    hasPermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL),
    hasPermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN),
  ]);
  const isOwner = user != null && existing.createdBy === user.id;
  if (!canEditAll && !(canEditOwn && isOwner)) {
    throw new Error("You do not have permission to edit this column.");
  }

  const slug = await uniqueSlug(supabase, "columns", siteId, input.slug || input.title, id);

  const { error } = await supabase
    .from("columns")
    .update({
      title: input.title.trim(),
      subtitle: input.subtitle.trim() || null,
      slug,
      body: sanitizeColumnBody(input.body),
      featured_image_id: input.featuredImageId,
      author_id: input.authorId,
      category_id: input.categoryId,
      tags: input.tags,
      seo_title: input.seoTitle.trim() || null,
      meta_description: input.metaDescription.trim() || null,
      og_image_id: input.ogImageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["columns"]);
}

export async function setColumnStatus(siteId: string, id: string, status: ColumnStatus, scheduledAt?: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);

  const existing = await getColumnOwnership(supabase, siteId, id);
  if (!existing) throw new Error("Column not found.");

  if (status === "published") {
    await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_PUBLISH);
  } else if (status === "scheduled") {
    await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_SCHEDULE);
  } else if (existing.status === "published") {
    // Unpublishing back to draft requires the same permission as publishing.
    await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_PUBLISH);
  } else if (existing.status === "scheduled") {
    // Cancelling a schedule requires the same permission as scheduling.
    await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_SCHEDULE);
  }

  const patch: Database["public"]["Tables"]["columns"]["Update"] = { status, updated_at: new Date().toISOString() };

  if (status === "published") {
    const { data: existing } = await supabase.from("columns").select("published_at").eq("id", id).eq("site_id", siteId).maybeSingle();
    patch.published_at = existing?.published_at ?? new Date().toISOString();
    patch.scheduled_at = null;
  } else if (status === "scheduled") {
    if (!scheduledAt) throw new Error("A schedule date/time is required.");
    if (new Date(scheduledAt).getTime() <= Date.now()) throw new Error("Scheduled time must be in the future.");
    patch.scheduled_at = scheduledAt;
  } else {
    patch.scheduled_at = null;
  }

  const { error } = await supabase.from("columns").update(patch).eq("id", id).eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["columns"]);
}

export async function deleteColumn(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_COLUMNS_DELETE);

  const { data, error } = await supabase.from("columns").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["columns"]);
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

export interface AuthorInput {
  name: string;
  slug: string;
  profileImageId: string | null;
  shortBio: string;
  fullBio: string;
  email: string;
  socialLinks: Record<string, string>;
  active: boolean;
}

export async function createAuthor(siteId: string, input: AuthorInput) {
  if (!input.name.trim()) throw new Error("Name is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_AUTHORS_MANAGE);

  const slug = await uniqueSlug(supabase, "authors", siteId, input.slug || input.name);

  const { error } = await supabase.from("authors").insert({
    site_id: siteId,
    name: input.name.trim(),
    slug,
    profile_image_id: input.profileImageId,
    short_bio: input.shortBio.trim() || null,
    full_bio: input.fullBio.trim() || null,
    email: input.email.trim() || null,
    social_links: input.socialLinks,
    active: input.active,
  });
  if (error) throw new Error(error.message);

  revalidateContent();
}

export async function updateAuthor(siteId: string, id: string, input: AuthorInput) {
  if (!input.name.trim()) throw new Error("Name is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_AUTHORS_MANAGE);

  const slug = await uniqueSlug(supabase, "authors", siteId, input.slug || input.name, id);

  const { error } = await supabase
    .from("authors")
    .update({
      name: input.name.trim(),
      slug,
      profile_image_id: input.profileImageId,
      short_bio: input.shortBio.trim() || null,
      full_bio: input.fullBio.trim() || null,
      email: input.email.trim() || null,
      social_links: input.socialLinks,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
}

export async function deleteAuthor(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_AUTHORS_MANAGE);

  const linked = await countColumnsByAuthor(supabase, siteId, id);
  if (linked > 0) {
    throw new Error(`This author is linked to ${linked} column${linked === 1 ? "" : "s"}. Reassign or delete those columns first.`);
  }

  const { data, error } = await supabase.from("authors").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryInput {
  name: string;
  slug: string;
  description: string;
  active: boolean;
}

export async function createCategory(siteId: string, input: CategoryInput) {
  if (!input.name.trim()) throw new Error("Name is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_CATEGORIES_MANAGE);

  const slug = await uniqueSlug(supabase, "categories", siteId, input.slug || input.name);

  const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("site_id", siteId);

  const { error } = await supabase.from("categories").insert({
    site_id: siteId,
    name: input.name.trim(),
    slug,
    description: input.description.trim() || null,
    active: input.active,
    display_order: count ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidateContent();
}

export async function updateCategory(siteId: string, id: string, input: CategoryInput) {
  if (!input.name.trim()) throw new Error("Name is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_CATEGORIES_MANAGE);

  const slug = await uniqueSlug(supabase, "categories", siteId, input.slug || input.name, id);

  const { error } = await supabase
    .from("categories")
    .update({
      name: input.name.trim(),
      slug,
      description: input.description.trim() || null,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
}

export async function reorderCategories(siteId: string, orderedIds: string[]) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_CATEGORIES_MANAGE);

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("categories").update({ display_order: index, updated_at: new Date().toISOString() }).eq("id", id).eq("site_id", siteId),
    ),
  );
  revalidateContent();
}

export async function deleteCategory(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_CATEGORIES_MANAGE);

  const linked = await countColumnsByCategory(supabase, siteId, id);
  if (linked > 0) {
    throw new Error(`This category is linked to ${linked} column${linked === 1 ? "" : "s"}. Reassign or delete those columns first.`);
  }

  const { data, error } = await supabase.from("categories").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const MEDIA_BUCKET = "content-media";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]+/g, "-").slice(-120);
}

export async function uploadMedia(siteId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error("Unsupported file type. Upload a JPEG, PNG, WebP, GIF, or SVG image.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is too large (max 8MB).");

  const altText = String(formData.get("altText") || "").trim();
  const title = String(formData.get("title") || "").trim();

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MEDIA_MANAGE);

  const storagePath = `${siteId}/${randomUUID()}-${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      site_id: siteId,
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      original_filename: file.name,
      alt_text: altText || null,
      title: title || null,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select("id, public_url")
    .single();
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }

  revalidateContent();
  return { id: data.id, publicUrl: data.public_url };
}

export async function updateMediaMeta(siteId: string, id: string, altText: string, title: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MEDIA_MANAGE);

  const { error } = await supabase
    .from("media_assets")
    .update({ alt_text: altText.trim() || null, title: title.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);
  revalidateContent();
}

export async function deleteMedia(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MEDIA_MANAGE);

  const { data: asset, error: fetchError } = await supabase
    .from("media_assets")
    .select("storage_path")
    .eq("id", id)
    .eq("site_id", siteId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!asset) throw new Error("Media asset not found.");

  const { data, error } = await supabase.from("media_assets").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  await supabase.storage.from(MEDIA_BUCKET).remove([asset.storage_path]);

  revalidateContent();
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export interface BannerInput {
  internalName: string;
  desktopImageId: string;
  mobileImageId: string | null;
  title: string;
  subtitle: string;
  ctaText: string;
  destinationUrl: string;
  placement: BannerPlacement;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
}

export async function createBanner(siteId: string, input: BannerInput) {
  if (!input.internalName.trim()) throw new Error("Internal name is required.");
  if (!input.desktopImageId) throw new Error("A desktop image is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_BANNERS_MANAGE);

  const { error } = await supabase.from("banners").insert({
    site_id: siteId,
    internal_name: input.internalName.trim(),
    desktop_image_id: input.desktopImageId,
    mobile_image_id: input.mobileImageId,
    title: input.title.trim() || null,
    subtitle: input.subtitle.trim() || null,
    cta_text: input.ctaText.trim() || null,
    destination_url: input.destinationUrl.trim() || null,
    placement: input.placement,
    active: input.active,
    start_at: input.startAt,
    end_at: input.endAt,
    sort_order: input.sortOrder,
  });
  if (error) throw new Error(error.message);

  revalidateContent();
}

export async function updateBanner(siteId: string, id: string, input: BannerInput) {
  if (!input.internalName.trim()) throw new Error("Internal name is required.");
  if (!input.desktopImageId) throw new Error("A desktop image is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_BANNERS_MANAGE);

  const { error } = await supabase
    .from("banners")
    .update({
      internal_name: input.internalName.trim(),
      desktop_image_id: input.desktopImageId,
      mobile_image_id: input.mobileImageId,
      title: input.title.trim() || null,
      subtitle: input.subtitle.trim() || null,
      cta_text: input.ctaText.trim() || null,
      destination_url: input.destinationUrl.trim() || null,
      placement: input.placement,
      active: input.active,
      start_at: input.startAt,
      end_at: input.endAt,
      sort_order: input.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
}

export async function deleteBanner(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_BANNERS_MANAGE);

  const { data, error } = await supabase.from("banners").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
}

// ---------------------------------------------------------------------------
// Stand Media ("מדיה מהיציע")
// ---------------------------------------------------------------------------

export interface StandMediaInput {
  title: string;
  tiktokUrl: string;
  sortOrder: number;
}

function validateStandMediaInput(input: StandMediaInput) {
  if (!input.title.trim()) throw new Error("Title is required.");
  const url = input.tiktokUrl.trim();
  if (!url) throw new Error("A TikTok video URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid TikTok video URL.");
  }
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) {
    throw new Error("That doesn't look like a TikTok URL.");
  }
}

export async function createStandMedia(siteId: string, input: StandMediaInput) {
  validateStandMediaInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE);

  const { data, error } = await supabase
    .from("stand_media")
    .insert({
      site_id: siteId,
      title: input.title.trim(),
      tiktok_url: input.tiktokUrl.trim(),
      sort_order: input.sortOrder,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["stand-media"]);
  return { id: data.id };
}

export async function updateStandMedia(siteId: string, id: string, input: StandMediaInput) {
  validateStandMediaInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE);

  // Content-only update -- status/published_at are deliberately untouched so
  // saving a Published item's title keeps it Published on the website.
  const { error } = await supabase
    .from("stand_media")
    .update({
      title: input.title.trim(),
      tiktok_url: input.tiktokUrl.trim(),
      sort_order: input.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["stand-media"]);
}

export async function setStandMediaStatus(siteId: string, id: string, status: "draft" | "published") {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE);

  const patch: Database["public"]["Tables"]["stand_media"]["Update"] = { status, updated_at: new Date().toISOString() };
  if (status === "published") {
    const { data: existing } = await supabase.from("stand_media").select("published_at").eq("id", id).eq("site_id", siteId).maybeSingle();
    patch.published_at = existing?.published_at ?? new Date().toISOString();
  }

  const { error } = await supabase.from("stand_media").update(patch).eq("id", id).eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["stand-media"]);
}

export async function deleteStandMedia(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STAND_MEDIA_MANAGE);

  const { data, error } = await supabase.from("stand_media").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["stand-media"]);
}

// ---------------------------------------------------------------------------
// Status Snapshot ("תמונת מצב")
// ---------------------------------------------------------------------------

export interface StatusSnapshotInput {
  headline: string;
  body: string;
}

function validateStatusSnapshotInput(input: StatusSnapshotInput) {
  if (!input.headline.trim()) throw new Error("Headline is required.");
  if (!input.body.trim()) throw new Error("Summary is required.");
}

export async function createStatusSnapshot(siteId: string, input: StatusSnapshotInput) {
  validateStatusSnapshotInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE);

  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("status_snapshots")
    .insert({
      site_id: siteId,
      headline: input.headline.trim(),
      body: input.body.trim(),
      status: "draft",
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["status-snapshot"]);
  return { id: data.id };
}

export async function updateStatusSnapshot(siteId: string, id: string, input: StatusSnapshotInput) {
  validateStatusSnapshotInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE);

  // Content-only update -- status/published_at are deliberately untouched so
  // saving a Published update's text keeps it Published on the website.
  const { error } = await supabase
    .from("status_snapshots")
    .update({
      headline: input.headline.trim(),
      body: input.body.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["status-snapshot"]);
}

export async function setStatusSnapshotStatus(siteId: string, id: string, status: "draft" | "published") {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE);

  const patch: Database["public"]["Tables"]["status_snapshots"]["Update"] = { status, updated_at: new Date().toISOString() };
  if (status === "published") {
    const { data: existing } = await supabase.from("status_snapshots").select("published_at").eq("id", id).eq("site_id", siteId).maybeSingle();
    patch.published_at = existing?.published_at ?? new Date().toISOString();
  }

  const { error } = await supabase.from("status_snapshots").update(patch).eq("id", id).eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["status-snapshot"]);
}

export async function deleteStatusSnapshot(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_STATUS_SNAPSHOTS_MANAGE);

  const { data, error } = await supabase.from("status_snapshots").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["status-snapshot"]);
}

// ---------------------------------------------------------------------------
// Match Panel Picks
// ---------------------------------------------------------------------------

export interface MatchPanelPickInput {
  externalFixtureId: string;
  matchDate: string;
  opponentName: string;
  competition: string;
  isHome: boolean;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
  playerName: string;
}

function validateMatchPanelPickInput(input: MatchPanelPickInput) {
  if (!input.externalFixtureId.trim()) throw new Error("A fixture id is required.");
  if (!input.matchDate.trim()) throw new Error("A match date is required.");
  if (!input.opponentName.trim()) throw new Error("An opponent name is required.");
  if (!input.playerName.trim()) throw new Error("A player is required.");
  if (input.homeScore != null && input.homeScore < 0) throw new Error("Home score can't be negative.");
  if (input.awayScore != null && input.awayScore < 0) throw new Error("Away score can't be negative.");
}

export async function createMatchPanelPick(siteId: string, input: MatchPanelPickInput) {
  validateMatchPanelPickInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_MANAGE);
  const user = await getCurrentUser(supabase);

  const { data, error } = await supabase
    .from("match_panel_picks")
    .insert({
      site_id: siteId,
      external_fixture_id: input.externalFixtureId.trim(),
      match_date: input.matchDate,
      opponent_name: input.opponentName.trim(),
      competition: input.competition.trim() || null,
      is_home: input.isHome,
      home_score: input.homeScore,
      away_score: input.awayScore,
      is_final: input.isFinal,
      player_name: input.playerName.trim(),
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A panel pick for this fixture id already exists on this site.");
    throw new Error(error.message);
  }

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["match-panel-picks"]);
  return { id: data.id };
}

export async function updateMatchPanelPick(siteId: string, id: string, input: MatchPanelPickInput) {
  validateMatchPanelPickInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_MANAGE);

  const { error } = await supabase
    .from("match_panel_picks")
    .update({
      external_fixture_id: input.externalFixtureId.trim(),
      match_date: input.matchDate,
      opponent_name: input.opponentName.trim(),
      competition: input.competition.trim() || null,
      is_home: input.isHome,
      home_score: input.homeScore,
      away_score: input.awayScore,
      is_final: input.isFinal,
      player_name: input.playerName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) {
    if (error.code === "23505") throw new Error("A panel pick for this fixture id already exists on this site.");
    throw new Error(error.message);
  }

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["match-panel-picks"]);
}

export async function deleteMatchPanelPick(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_PANEL_PICKS_MANAGE);

  const { data, error } = await supabase.from("match_panel_picks").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["match-panel-picks"]);
}

// ---------------------------------------------------------------------------
// Fan Match Voting -- distinct from Match Panel Picks above: this is the
// audience's vote (מצטיין/מאכזב המשחק), not the podcast panel's own
// selection. The two models are deliberately kept independent (separate
// tables, separate permissions) even though they describe the same match.
// ---------------------------------------------------------------------------

export interface MatchFanPollInput {
  externalFixtureId: string;
  matchDate: string;
  opponentName: string;
  competition: string;
  isHome: boolean;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
}

function validateMatchFanPollInput(input: MatchFanPollInput) {
  if (!input.externalFixtureId.trim()) throw new Error("A fixture id is required.");
  if (!input.matchDate.trim()) throw new Error("A match date is required.");
  if (!input.opponentName.trim()) throw new Error("An opponent name is required.");
  if (input.homeScore != null && input.homeScore < 0) throw new Error("Home score can't be negative.");
  if (input.awayScore != null && input.awayScore < 0) throw new Error("Away score can't be negative.");
}

async function getOwnFanPollOrThrow(supabase: Awaited<ReturnType<typeof createClient>>, siteId: string, pollId: string) {
  const { data } = await supabase.from("match_fan_polls").select("id, status").eq("id", pollId).eq("site_id", siteId).maybeSingle();
  if (!data) throw new Error("Poll not found.");
  return data;
}

export async function createMatchFanPoll(siteId: string, input: MatchFanPollInput) {
  validateMatchFanPollInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);
  const user = await getCurrentUser(supabase);

  const { data, error } = await supabase
    .from("match_fan_polls")
    .insert({
      site_id: siteId,
      external_fixture_id: input.externalFixtureId.trim(),
      match_date: input.matchDate,
      opponent_name: input.opponentName.trim(),
      competition: input.competition.trim() || null,
      is_home: input.isHome,
      home_score: input.homeScore,
      away_score: input.awayScore,
      is_final: input.isFinal,
      status: "draft",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A fan vote poll for this fixture id already exists on this site.");
    throw new Error(error.message);
  }

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["fan-voting"]);
  return { id: data.id };
}

/** Metadata is only editable in `draft` -- once opened, the poll is a snapshot (see PHASE 4/5 of the spec): later edits must never alter an active or historical vote. */
export async function updateMatchFanPoll(siteId: string, id: string, input: MatchFanPollInput) {
  validateMatchFanPollInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);

  const existing = await getOwnFanPollOrThrow(supabase, siteId, id);
  if (existing.status !== "draft") throw new Error("This poll is no longer a draft and can't be edited.");

  const { error } = await supabase
    .from("match_fan_polls")
    .update({
      external_fixture_id: input.externalFixtureId.trim(),
      match_date: input.matchDate,
      opponent_name: input.opponentName.trim(),
      competition: input.competition.trim() || null,
      is_home: input.isHome,
      home_score: input.homeScore,
      away_score: input.awayScore,
      is_final: input.isFinal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) {
    if (error.code === "23505") throw new Error("A fan vote poll for this fixture id already exists on this site.");
    throw new Error(error.message);
  }

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["fan-voting"]);
}

export interface MatchFanPollCandidateInput {
  playerId: string;
  slug: string;
  playerName: string;
  profileUrl: string;
  imageUrl: string;
  shirtNumber: number | null;
  starter: boolean;
  enteredAsSubstitute: boolean;
  entryMinute: number | null;
}

/** Candidates can only be added/removed while the poll is `draft` -- once open, the candidate snapshot is frozen (PHASE 3/4 of the spec: a later roster edit must never alter an already-open or historical vote). */
export async function addMatchFanPollCandidate(siteId: string, pollId: string, input: MatchFanPollCandidateInput) {
  if (!input.playerId.trim()) throw new Error("A player id is required.");
  if (!input.playerName.trim()) throw new Error("A player name is required.");

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);

  const poll = await getOwnFanPollOrThrow(supabase, siteId, pollId);
  if (poll.status !== "draft") throw new Error("Candidates can only be edited while the poll is a draft.");

  const { error } = await supabase.from("match_fan_poll_candidates").insert({
    poll_id: pollId,
    player_id: input.playerId.trim(),
    slug: input.slug.trim() || null,
    player_name: input.playerName.trim(),
    profile_url: input.profileUrl.trim() || null,
    image_url: input.imageUrl.trim() || null,
    shirt_number: input.shirtNumber,
    starter: input.starter,
    entered_as_substitute: input.enteredAsSubstitute,
    entry_minute: input.entryMinute,
  });
  if (error) {
    if (error.code === "23505") throw new Error("This player is already a candidate for this poll.");
    throw new Error(error.message);
  }

  revalidateContent();
}

export async function removeMatchFanPollCandidate(siteId: string, pollId: string, candidateId: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);

  const poll = await getOwnFanPollOrThrow(supabase, siteId, pollId);
  if (poll.status !== "draft") throw new Error("Candidates can only be edited while the poll is a draft.");

  const { data, error } = await supabase.from("match_fan_poll_candidates").delete().eq("id", candidateId).eq("poll_id", pollId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
}

/** draft -> open. Requires a final result (a poll can't open for an unfinished match) and at least one candidate. */
export async function openMatchFanPoll(siteId: string, pollId: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);

  const { data: poll } = await supabase
    .from("match_fan_polls")
    .select("id, status, is_final, home_score, away_score")
    .eq("id", pollId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!poll) throw new Error("Poll not found.");
  if (poll.status !== "draft") throw new Error("Only a draft poll can be opened.");
  if (!poll.is_final || poll.home_score == null || poll.away_score == null) {
    throw new Error("The match must be marked final with both scores set before opening voting.");
  }

  const { count } = await supabase.from("match_fan_poll_candidates").select("id", { count: "exact", head: true }).eq("poll_id", pollId);
  if (!count || count === 0) throw new Error("Add at least one candidate before opening voting.");

  const { error } = await supabase
    .from("match_fan_polls")
    .update({ status: "open", opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", pollId)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["fan-voting"]);
}

/** open -> closed. Votes are never deleted -- results remain publicly readable (PHASE 5/20 of the spec). */
export async function closeMatchFanPoll(siteId: string, pollId: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);

  const existing = await getOwnFanPollOrThrow(supabase, siteId, pollId);
  if (existing.status !== "open") throw new Error("Only an open poll can be closed.");

  const { error } = await supabase
    .from("match_fan_polls")
    .update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", pollId)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["fan-voting"]);
}

/** closed -> open, for correcting an accidental early close. */
export async function reopenMatchFanPoll(siteId: string, pollId: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_MATCH_VOTING_MANAGE);

  const existing = await getOwnFanPollOrThrow(supabase, siteId, pollId);
  if (existing.status !== "closed") throw new Error("Only a closed poll can be reopened.");

  const { error } = await supabase
    .from("match_fan_polls")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", pollId)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["fan-voting"]);
}

// ---------------------------------------------------------------------------
// Field Videos ("סרטונים מהשטח -- הקול מהיציע") -- distinct from Stand Media
// ("מדיה מהיציע") above: a separate table/homepage section, deliberately not
// mixed with it despite the identical TikTok-URL shape.
// ---------------------------------------------------------------------------

export interface FieldVideoInput {
  caption: string;
  tiktokUrl: string;
  sortOrder: number;
}

function validateFieldVideoInput(input: FieldVideoInput) {
  const url = input.tiktokUrl.trim();
  if (!url) throw new Error("A TikTok video URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid TikTok video URL.");
  }
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) {
    throw new Error("That doesn't look like a TikTok URL.");
  }
}

export async function createFieldVideo(siteId: string, input: FieldVideoInput) {
  validateFieldVideoInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE);

  const { data, error } = await supabase
    .from("field_videos")
    .insert({
      site_id: siteId,
      caption: input.caption.trim() || null,
      tiktok_url: input.tiktokUrl.trim(),
      sort_order: input.sortOrder,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["field-videos"]);
  return { id: data.id };
}

export async function updateFieldVideo(siteId: string, id: string, input: FieldVideoInput) {
  validateFieldVideoInput(input);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE);

  // Content-only update -- status/published_at are deliberately untouched so
  // saving a Published item's caption keeps it Published on the website.
  const { error } = await supabase
    .from("field_videos")
    .update({
      caption: input.caption.trim() || null,
      tiktok_url: input.tiktokUrl.trim(),
      sort_order: input.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["field-videos"]);
}

export async function setFieldVideoStatus(siteId: string, id: string, status: "draft" | "published") {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE);

  const patch: Database["public"]["Tables"]["field_videos"]["Update"] = { status, updated_at: new Date().toISOString() };
  if (status === "published") {
    const { data: existing } = await supabase.from("field_videos").select("published_at").eq("id", id).eq("site_id", siteId).maybeSingle();
    patch.published_at = existing?.published_at ?? new Date().toISOString();
  }

  const { error } = await supabase.from("field_videos").update(patch).eq("id", id).eq("site_id", siteId);
  if (error) throw new Error(error.message);

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["field-videos"]);
}

export async function deleteFieldVideo(siteId: string, id: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CONTENT_FIELD_VIDEOS_MANAGE);

  const { data, error } = await supabase.from("field_videos").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
  await revalidateWebsite(supabase, siteId, ["field-videos"]);
}
