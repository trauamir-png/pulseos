import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

type Supa = SupabaseClient<Database>;

// Mirrors app/(dashboard)/chat/actions.ts's MAX_BODY_LENGTH -- a message
// relayed from Telegram must pass the same length rule a message typed
// directly into PulseOS would.
const MAX_BODY_LENGTH = 2000;

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; is_bot?: boolean };
    text?: string;
  };
  // edited_message / channel_post / etc. are intentionally left unmodeled --
  // the absence of `message` alone is enough to safely ignore them (see
  // "non_message_update" below).
}

export type TelegramIgnoreReason =
  | "non_message_update"
  | "non_text_message"
  | "bot_sender"
  | "wrong_chat"
  | "missing_sender"
  | "empty_text"
  | "too_long"
  | "unmapped_sender"
  | "inactive_profile"
  | "no_writer_access";

export type TelegramProcessResult =
  | { outcome: "ignored"; reason: TelegramIgnoreReason }
  | { outcome: "duplicate" }
  | { outcome: "published"; chatMessageId: string; senderId: string };

/**
 * Replicates has_permission(site_id, 'chat.writers.access')
 * (supabase/migrations/0012_site_permissions.sql) against a service-role
 * client instead of an authenticated session -- Telegram has none. Kept as
 * its own function, applying the exact same admin-bypass / active-membership
 * / permission-key rules as the SQL function, rather than re-deriving them
 * ad hoc, so the two can be compared and kept in sync by inspection.
 */
async function hasChatWriterAccess(admin: Supa, userId: string, siteId: string): Promise<boolean> {
  const { data: profile } = await admin.from("profiles").select("is_admin, active").eq("id", userId).maybeSingle();
  if (!profile || !profile.active) return false;
  if (profile.is_admin) return true;

  const { data: membership } = await admin
    .from("site_memberships")
    .select("id")
    .eq("site_id", siteId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) return false;

  const { data: perm } = await admin
    .from("membership_permissions")
    .select("permission_key")
    .eq("membership_id", membership.id)
    .eq("permission_key", PERMISSIONS.CHAT_WRITERS_ACCESS)
    .maybeSingle();
  return !!perm;
}

/**
 * The one place an incoming Telegram update is turned into (at most) one
 * chat_messages row. Called from POST /api/integrations/telegram/chat with a
 * service-role client, after the route has already verified the webhook
 * secret. Extracted from the route handler so it's directly unit-testable
 * against a mocked client, matching this codebase's existing convention
 * (lib/content/fan-vote-submit.ts / .test.ts).
 *
 * `expectedChatId` and `siteId` are resolved once by the caller (from
 * TELEGRAM_CHAT_ID and resolveSiteId respectively) rather than inside this
 * function, so tests can exercise cross-site/cross-chat isolation without
 * needing a live env var or a real sites row.
 */
export async function processTelegramUpdate(
  admin: Supa,
  update: TelegramUpdate,
  opts: { expectedChatId: number; siteId: string },
): Promise<TelegramProcessResult> {
  const message = update.message;
  if (!message) return { outcome: "ignored", reason: "non_message_update" };
  if (message.chat.id !== opts.expectedChatId) return { outcome: "ignored", reason: "wrong_chat" };
  if (message.from?.is_bot) return { outcome: "ignored", reason: "bot_sender" };
  if (typeof message.text !== "string") return { outcome: "ignored", reason: "non_text_message" };

  const telegramUserId = message.from?.id;
  if (typeof telegramUserId !== "number") return { outcome: "ignored", reason: "missing_sender" };

  const trimmed = message.text.trim();
  if (!trimmed) return { outcome: "ignored", reason: "empty_text" };
  if (trimmed.length > MAX_BODY_LENGTH) return { outcome: "ignored", reason: "too_long" };

  const { data: profile } = await admin.from("profiles").select("id, active").eq("telegram_user_id", telegramUserId).maybeSingle();
  if (!profile) return { outcome: "ignored", reason: "unmapped_sender" };
  if (!profile.active) return { outcome: "ignored", reason: "inactive_profile" };

  const authorized = await hasChatWriterAccess(admin, profile.id, opts.siteId);
  if (!authorized) return { outcome: "ignored", reason: "no_writer_access" };

  // Claim this (chat, message) pair first -- the primary key on
  // telegram_processed_messages rejects a second claim for the same update
  // (a Telegram retry, or a genuinely concurrent duplicate delivery) before
  // any chat_messages row is created, which is what makes this race-safe
  // rather than just "usually fine."
  const { error: claimError } = await admin
    .from("telegram_processed_messages")
    .insert({ telegram_chat_id: message.chat.id, telegram_message_id: message.message_id });
  if (claimError) {
    if (claimError.code === "23505") return { outcome: "duplicate" };
    throw new Error(claimError.message);
  }

  // sender_id is always the resolved PulseOS profile -- never anything
  // derived from Telegram's from.first_name/username -- so display_name and
  // avatar shown in chat stay exactly what the existing sendChatMessage path
  // would show for this same user.
  const { data: chatMessage, error: insertError } = await admin
    .from("chat_messages")
    .insert({ site_id: opts.siteId, sender_id: profile.id, body: trimmed })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  await admin
    .from("telegram_processed_messages")
    .update({ chat_message_id: chatMessage.id })
    .eq("telegram_chat_id", message.chat.id)
    .eq("telegram_message_id", message.message_id);

  return { outcome: "published", chatMessageId: chatMessage.id, senderId: profile.id };
}
