"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeColumnBody } from "@/lib/content/sanitize";
import { slugify } from "@/lib/content/slug";
import { countColumnsByAuthor } from "@/lib/dashboard/content-authors";
import { countColumnsByCategory } from "@/lib/dashboard/content-categories";
import type { ColumnStatus } from "@/lib/dashboard/content-columns";
import type { BannerPlacement } from "@/lib/dashboard/content-banners";
import type { Database } from "@/lib/supabase/types";

const CONTENT_PATHS = ["/content/columns", "/content/authors", "/content/categories", "/content/media", "/content/banners"];

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
  return { id: data.id };
}

export async function updateColumn(siteId: string, id: string, input: ColumnInput) {
  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.authorId) throw new Error("Author is required.");
  if (!input.categoryId) throw new Error("Category is required.");

  const supabase = await createClient();
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
}

export async function setColumnStatus(siteId: string, id: string, status: ColumnStatus, scheduledAt?: string) {
  const supabase = await createClient();

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
}

export async function deleteColumn(siteId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("columns").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
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
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("categories").update({ display_order: index, updated_at: new Date().toISOString() }).eq("id", id).eq("site_id", siteId),
    ),
  );
  revalidateContent();
}

export async function deleteCategory(siteId: string, id: string) {
  const supabase = await createClient();

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
  const { data, error } = await supabase.from("banners").delete().eq("id", id).eq("site_id", siteId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Delete did not go through. Nothing was deleted.");

  revalidateContent();
}
