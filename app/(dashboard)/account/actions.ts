"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/permissions";

// Not exported: a "use server" file's export surface may only be async
// functions (Next.js server-actions constraint) -- exporting this class
// broke the build ("no exports at all"). Kept module-private; callers just
// read e.message, same as every other action's thrown Error in this codebase.
class AvatarAccessError extends Error {
  constructor(message = "You do not have permission to change this avatar.") {
    super(message);
    this.name = "AvatarAccessError";
  }
}

// Reuses the content-media bucket rather than a new one (see
// supabase/migrations/0018_profile_avatars.sql). All avatar writes go through
// createAdminClient() -- for both Storage and the profiles row -- since
// profiles has no INSERT/UPDATE policy for `authenticated` at all (see
// lib/dashboard/users.ts's header comment); this file is the sole app-layer
// gate, exactly like every other profiles write in this codebase.
const AVATAR_BUCKET = "content-media";
const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A user may always edit their own avatar; anyone else requires Admin -- reuses the existing model, no new authorization concept. */
async function authorizeAvatarEdit(targetUserId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) throw new AvatarAccessError("Not signed in.");
  if (user.id === targetUserId) return;

  const profile = await getCurrentProfile(supabase);
  if (!profile?.isAdmin) throw new AvatarAccessError("You can only change your own avatar.");
}

function revalidateAvatarPaths(targetUserId: string): void {
  revalidatePath("/account");
  revalidatePath(`/users/${targetUserId}`);
  revalidatePath("/users");
}

/** Best-effort cleanup of a previous avatar's Storage object. Never blocks or fails the caller -- the profiles row is already the source of truth by the time this runs. */
async function removeStorageObjectByPublicUrl(admin: ReturnType<typeof createAdminClient>, publicUrl: string): Promise<void> {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const storagePath = decodeURIComponent(publicUrl.slice(idx + marker.length));
  await admin.storage.from(AVATAR_BUCKET).remove([storagePath]);
}

export async function uploadAvatar(targetUserId: string, formData: FormData): Promise<{ avatarUrl: string }> {
  await authorizeAvatarEdit(targetUserId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) throw new Error("Unsupported file type. Upload a JPEG, PNG, or WebP image.");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("File is too large (max 5MB).");

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("avatar_url").eq("id", targetUserId).maybeSingle();

  const storagePath = `avatars/${targetUserId}/${randomUUID()}.${MIME_EXTENSIONS[file.type]}`;
  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);

  const { error: updateError } = await admin.from("profiles").update({ avatar_url: publicUrlData.publicUrl }).eq("id", targetUserId);
  if (updateError) {
    await admin.storage.from(AVATAR_BUCKET).remove([storagePath]);
    throw new Error(updateError.message);
  }

  if (existing?.avatar_url) await removeStorageObjectByPublicUrl(admin, existing.avatar_url);

  revalidateAvatarPaths(targetUserId);
  return { avatarUrl: publicUrlData.publicUrl };
}

export async function removeAvatar(targetUserId: string): Promise<void> {
  await authorizeAvatarEdit(targetUserId);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("avatar_url").eq("id", targetUserId).maybeSingle();

  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", targetUserId);
  if (error) throw new Error(error.message);

  if (existing?.avatar_url) await removeStorageObjectByPublicUrl(admin, existing.avatar_url);

  revalidateAvatarPaths(targetUserId);
}
