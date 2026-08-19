"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { sendChatMessage, deleteChatMessage } from "@/app/(dashboard)/chat/actions";

interface ChatMessage {
  id: string;
  display_name: string;
  body: string;
  created_at: string;
}

export function ChatRoom({
  siteId,
  initialMessages,
  canDeleteAny,
  ownMessageIds,
}: {
  siteId: string;
  initialMessages: ChatMessage[];
  canDeleteAny: boolean;
  ownMessageIds: string[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));
  const ownIds = useMemo(() => new Set(ownMessageIds), [ownMessageIds]);

  function canDelete(id: string) {
    return canDeleteAny || ownIds.has(id);
  }

  function handleDelete(id: string) {
    setConfirmingId(null);
    setError(null);
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteChatMessage(siteId, id);
        seenIds.current.delete(id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete message.");
      } finally {
        setDeletingId(null);
      }
    });
  }

  // Realtime only ever touches chat_messages_public -- the safe projection --
  // never the private chat_messages table. DELETE mirrors the deletion that
  // 0017_chat_message_delete.sql's cascade produces on chat_messages_public
  // whenever a chat_messages row is deleted, from any writer's tab.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-public-${siteId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages_public", filter: `site_id=eq.${siteId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => [...prev, row]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages_public", filter: `site_id=eq.${siteId}` },
        (payload) => {
          const row = payload.old as { id: string };
          seenIds.current.delete(row.id);
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [siteId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const sent = await sendChatMessage(siteId, trimmed);
        seenIds.current.add(sent.id);
        setMessages((prev) => [...prev, sent]);
        setText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send message.");
      }
    });
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-sm text-[var(--muted)]">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">{m.display_name}</span>
              <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                {new Date(m.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}
                {canDelete(m.id) &&
                  (confirmingId === m.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        disabled={deletingId === m.id}
                        className="font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === m.id ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} className="text-[var(--muted)] hover:underline">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(m.id)}
                      className="text-[var(--muted)] hover:text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  ))}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">{m.body}</p>
          </div>
        ))}
      </div>
      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}
      <div className="flex items-end gap-2 border-t border-[var(--border)] p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder="Write a message…"
          className="flex-1 resize-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          onClick={handleSend}
          disabled={isPending || !text.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
