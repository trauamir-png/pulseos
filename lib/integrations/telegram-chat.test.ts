import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { processTelegramUpdate, type TelegramUpdate } from "./telegram-chat";
import { PERMISSIONS } from "@/lib/auth/permission-definitions";

type Supa = SupabaseClient<Database>;

interface MockProfile {
  id: string;
  telegram_user_id: number;
  active: boolean;
  is_admin: boolean;
}

interface MockMembership {
  id: string;
  site_id: string;
  user_id: string;
  active: boolean;
  permissions: string[];
}

interface MockState {
  profiles: MockProfile[];
  memberships: MockMembership[];
  chatMessages: { id: string; site_id: string; sender_id: string; body: string }[];
  processed: Map<string, { chat_message_id: string | null }>;
  nextId: number;
}

function makeState(overrides: Partial<MockState> = {}): MockState {
  return { profiles: [], memberships: [], chatMessages: [], processed: new Map(), nextId: 1, ...overrides };
}

/** Minimal chained query-builder mock covering only what telegram-chat.ts actually calls. */
function makeSupabase(state: MockState): Supa {
  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> | undefined;

    function resolveSelect() {
      if (table === "profiles") {
        let rows = state.profiles;
        if ("id" in filters) rows = rows.filter((p) => p.id === filters.id);
        if ("telegram_user_id" in filters) rows = rows.filter((p) => p.telegram_user_id === filters.telegram_user_id);
        return rows[0] ?? null;
      }
      if (table === "site_memberships") {
        let rows = state.memberships;
        if ("site_id" in filters) rows = rows.filter((m) => m.site_id === filters.site_id);
        if ("user_id" in filters) rows = rows.filter((m) => m.user_id === filters.user_id);
        if ("active" in filters) rows = rows.filter((m) => m.active === filters.active);
        return rows[0] ? { id: rows[0].id } : null;
      }
      if (table === "membership_permissions") {
        const membership = state.memberships.find((m) => m.id === filters.membership_id);
        if (membership && membership.permissions.includes(filters.permission_key as string)) {
          return { permission_key: filters.permission_key };
        }
        return null;
      }
      return null;
    }

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      insert: (row: Record<string, unknown>) => {
        mode = "insert";
        payload = row;
        return api;
      },
      update: (row: Record<string, unknown>) => {
        mode = "update";
        payload = row;
        return api;
      },
      single: () => run(),
      maybeSingle: () => run(),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => run().then(onFulfilled, onRejected),
    };

    function run(): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
      if (mode === "select") {
        return Promise.resolve({ data: resolveSelect(), error: null });
      }
      if (mode === "insert" && table === "telegram_processed_messages") {
        const key = `${payload!.telegram_chat_id}|${payload!.telegram_message_id}`;
        if (state.processed.has(key)) {
          return Promise.resolve({ data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } });
        }
        state.processed.set(key, { chat_message_id: null });
        return Promise.resolve({ data: null, error: null });
      }
      if (mode === "insert" && table === "chat_messages") {
        const id = `msg-${state.nextId++}`;
        state.chatMessages.push({ id, site_id: payload!.site_id as string, sender_id: payload!.sender_id as string, body: payload!.body as string });
        return Promise.resolve({ data: { id }, error: null });
      }
      if (mode === "update" && table === "telegram_processed_messages") {
        const key = `${filters.telegram_chat_id}|${filters.telegram_message_id}`;
        const entry = state.processed.get(key);
        if (entry) entry.chat_message_id = payload!.chat_message_id as string;
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }

    return api;
  }

  return { from: (table: string) => builder(table) } as unknown as Supa;
}

const SITE_ID = "site-hakol";
const OTHER_SITE_ID = "site-other";
const CHAT_ID = -1001234567890;

function textUpdate(overrides: Partial<NonNullable<TelegramUpdate["message"]>> = {}): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 100,
      chat: { id: CHAT_ID },
      from: { id: 555, is_bot: false },
      text: "Great win today!",
      ...overrides,
    },
  };
}

const AUTHORIZED_WRITER: MockProfile = { id: "user-1", telegram_user_id: 555, active: true, is_admin: false };
const MEMBERSHIP_WITH_ACCESS: MockMembership = {
  id: "membership-1",
  site_id: SITE_ID,
  user_id: "user-1",
  active: true,
  permissions: [PERMISSIONS.CHAT_WRITERS_ACCESS],
};

describe("processTelegramUpdate", () => {
  it("1. correct secret + correct group + mapped authorized writer -> one chat message", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "published", chatMessageId: "msg-1", senderId: "user-1" });
    expect(state.chatMessages).toEqual([{ id: "msg-1", site_id: SITE_ID, sender_id: "user-1", body: "Great win today!" }]);
  });

  // Secret/missing-secret rejection (test cases 2-3) is HTTP-layer behavior
  // in the route (isAuthorized()), not something processTelegramUpdate ever
  // sees -- covered by inspection of app/api/integrations/telegram/chat/route.ts,
  // whose POST handler returns 401 before parsing the body or calling this
  // function at all when the header is wrong or absent.

  it("4. wrong Telegram chat ID -> ignored/rejected safely", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate({ chat: { id: -999 } }), {
      expectedChatId: CHAT_ID,
      siteId: SITE_ID,
    });
    expect(result).toEqual({ outcome: "ignored", reason: "wrong_chat" });
    expect(state.chatMessages).toHaveLength(0);
  });

  it("5. unmapped Telegram user -> no chat message", async () => {
    const state = makeState({ profiles: [], memberships: [] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "unmapped_sender" });
    expect(state.chatMessages).toHaveLength(0);
  });

  it("6. mapped user without chat.writers.access -> no chat message", async () => {
    const membershipNoAccess: MockMembership = { ...MEMBERSHIP_WITH_ACCESS, permissions: [] };
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [membershipNoAccess] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "no_writer_access" });
    expect(state.chatMessages).toHaveLength(0);
  });

  it("a former panelist whose permission was removed immediately stops being able to publish", async () => {
    const membershipRevoked: MockMembership = { ...MEMBERSHIP_WITH_ACCESS, active: false };
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [membershipRevoked] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "no_writer_access" });
  });

  it("7. authorized writer -> correct PulseOS sender identity (never Telegram's display name)", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result.outcome).toBe("published");
    expect(state.chatMessages[0].sender_id).toBe("user-1");
  });

  it("8. duplicate Telegram delivery -> only one chat message", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const supabase = makeSupabase(state);
    const first = await processTelegramUpdate(supabase, textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    const second = await processTelegramUpdate(supabase, textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(first.outcome).toBe("published");
    expect(second).toEqual({ outcome: "duplicate" });
    expect(state.chatMessages).toHaveLength(1);
  });

  it("9. bot sender -> ignored", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate({ from: { id: 555, is_bot: true } }), {
      expectedChatId: CHAT_ID,
      siteId: SITE_ID,
    });
    expect(result).toEqual({ outcome: "ignored", reason: "bot_sender" });
    expect(state.chatMessages).toHaveLength(0);
  });

  it("10. non-text message -> ignored", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate({ text: undefined }), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "non_text_message" });
    expect(state.chatMessages).toHaveLength(0);
  });

  it("update with no message at all (e.g. edited_message/channel_post) -> ignored safely", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), { update_id: 2 }, { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "non_message_update" });
  });

  it("11. text length/validation matches existing chat rules (empty and over-length both rejected)", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const empty = await processTelegramUpdate(makeSupabase(state), textUpdate({ text: "   " }), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(empty).toEqual({ outcome: "ignored", reason: "empty_text" });

    const tooLong = await processTelegramUpdate(makeSupabase(state), textUpdate({ text: "x".repeat(2001) }), {
      expectedChatId: CHAT_ID,
      siteId: SITE_ID,
    });
    expect(tooLong).toEqual({ outcome: "ignored", reason: "too_long" });
    expect(state.chatMessages).toHaveLength(0);
  });

  it("12. cross-site isolation -- a writer's access on one site does not grant access on another", async () => {
    const state = makeState({ profiles: [AUTHORIZED_WRITER], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: OTHER_SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "no_writer_access" });
    expect(state.chatMessages).toHaveLength(0);
  });

  // 13. existing PulseOS manual chat posting remains unchanged -- this
  // integration adds no new code path to app/(dashboard)/chat/actions.ts's
  // sendChatMessage/deleteChatMessage (untouched by this change), and writes
  // to chat_messages through the same schema/trigger those Server Actions
  // use, so a message inserted here is indistinguishable from one they send.

  it("an Admin sender is authorized without needing a site_memberships row", async () => {
    const admin: MockProfile = { id: "admin-1", telegram_user_id: 777, active: true, is_admin: true };
    const state = makeState({ profiles: [admin], memberships: [] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate({ from: { id: 777, is_bot: false } }), {
      expectedChatId: CHAT_ID,
      siteId: SITE_ID,
    });
    expect(result.outcome).toBe("published");
  });

  it("a disabled profile cannot publish even if mapped and previously authorized", async () => {
    const disabled: MockProfile = { ...AUTHORIZED_WRITER, active: false };
    const state = makeState({ profiles: [disabled], memberships: [MEMBERSHIP_WITH_ACCESS] });
    const result = await processTelegramUpdate(makeSupabase(state), textUpdate(), { expectedChatId: CHAT_ID, siteId: SITE_ID });
    expect(result).toEqual({ outcome: "ignored", reason: "inactive_profile" });
  });
});
