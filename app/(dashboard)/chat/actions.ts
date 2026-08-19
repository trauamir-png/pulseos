"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSiteAccess, requirePermission, getCurrentUser, getCurrentProfile } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

const MAX_BODY_LENGTH = 2000;

/**
 * sender_id always comes from the authenticated session (getCurrentUser),
 * never from the caller -- this Server Action doesn't even accept a sender
 * argument, so there is nothing a client could tamper with to impersonate
 * another writer. The chat_messages RLS policy's `with check (sender_id =
 * auth.uid())` enforces the same thing again at the database layer.
 */
export async function sendChatMessage(siteId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message can't be empty.");
  if (trimmed.length > MAX_BODY_LENGTH) throw new Error(`Message is too long (max ${MAX_BODY_LENGTH} characters).`);

  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);
  await requirePermission(supabase, siteId, PERMISSIONS.CHAT_WRITERS_ACCESS);

  const [user, profile] = await Promise.all([getCurrentUser(supabase), getCurrentProfile(supabase)]);
  if (!user || !profile) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ site_id: siteId, sender_id: user.id, body: trimmed })
    .select("id, created_at")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/chat");

  return { id: data.id, display_name: profile.displayName, body: trimmed, created_at: data.created_at };
}
