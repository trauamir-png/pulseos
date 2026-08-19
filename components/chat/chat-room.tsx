"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { sendChatMessage } from "@/app/(dashboard)/chat/actions";

interface ChatMessage {
  id: string;
  display_name: string;
  body: string;
  created_at: string;
}

export function ChatRoom({ siteId, initialMessages }: { siteId: string; initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.id)));

  // Realtime only ever touches chat_messages_public -- the safe projection --
  // never the private chat_messages table.
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
              <span className="text-xs text-[var(--muted)]">
                {new Date(m.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}
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
