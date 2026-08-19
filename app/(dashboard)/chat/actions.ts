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

/**
 * Authorization is enforced entirely by the chat_messages DELETE RLS policy
 * (0017_chat_message_delete.sql: own message + chat.writers.access, OR
 * chat.messages.delete_any, which Admin also satisfies via has_permission's
 * built-in bypass) -- this action does not re-implement that three-tier
 * logic in application code, on purpose, so there is exactly one place the
 * rule can drift. requireSiteAccess below is only a fail-fast/UX check, not
 * the security boundary.
 *
 * A delete blocked by RLS does not error -- Postgres/PostgREST report it as
 * a successful delete of zero rows. Selecting the deleted id back is what
 * lets us tell "deleted" apart from "silently denied."
 */
export async function deleteChatMessage(siteId: string, messageId: string) {
  const supabase = await createClient();
  await requireSiteAccess(supabase, siteId);

  const { data, error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("id", messageId)
    .eq("site_id", siteId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not authorized to delete this message.");

  revalidatePath("/chat");
}
