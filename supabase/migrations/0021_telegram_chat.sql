-- Telegram -> Panelists Chat integration V1. Lets an approved panelist post
-- into the existing chat_messages system (0016_chat_messages.sql) from a
-- private Telegram group. Deliberately introduces no new permission system --
-- chat.writers.access remains the sole authority on who may publish; this
-- migration only adds what's needed to (a) map a Telegram account to a
-- PulseOS profile and (b) guarantee a Telegram update can never produce two
-- chat_messages rows.

-- One Telegram account maps to at most one PulseOS profile. Nullable because
-- most profiles will never link a Telegram account; unique (Postgres treats
-- multiple NULLs as distinct, so this only constrains rows that do set it)
-- so the same Telegram account can never be mapped to two different profiles.
alter table profiles add column if not exists telegram_user_id bigint unique;

-- Telegram message idempotency. Telegram may retry webhook delivery for the
-- same update; the primary key here guarantees at most one chat_messages row
-- is ever created per (chat, message) -- the webhook route claims a row here
-- (insert, relying on the primary key to reject a concurrent/retried claim)
-- before it creates the chat_messages row, then backfills chat_message_id.
-- No RLS policy at all, for any role -- like match_fan_votes
-- (0020_match_fan_voting.sql), this table is written/read exclusively by the
-- service-role webhook route, never by a browser session or authenticated
-- dashboard user.
create table if not exists telegram_processed_messages (
  telegram_chat_id bigint not null,
  telegram_message_id bigint not null,
  chat_message_id uuid references chat_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (telegram_chat_id, telegram_message_id)
);

alter table telegram_processed_messages enable row level security;
