-- Deleting a PulseOS user (profiles row) must never delete content they
-- created, including chat history. chat_messages.sender_id currently
-- cascades (0016_chat_messages.sql: "sender_id uuid not null references
-- profiles (id) on delete cascade"), and chat_messages_public.id itself
-- cascades from chat_messages (id) (also 0016) -- so deleting a profile
-- would silently wipe every message that profile ever sent, and every
-- public projection row with it.
--
-- display_name/avatar_url on chat_messages_public are already a snapshot,
-- copied at send time by publish_chat_message() (0016/0018) and kept live
-- by the avatar sync trigger -- both already independent of sender_id. So
-- the only change needed is to stop the cascade at its source: sender_id
-- becomes nullable and its FK becomes ON DELETE SET NULL, matching the
-- pattern already used for created_by across columns/match_panel_picks/
-- status_snapshots/match_fan_voting (0012/0019/0020/0022).
alter table chat_messages alter column sender_id drop not null;

alter table chat_messages drop constraint chat_messages_sender_id_fkey;

alter table chat_messages
  add constraint chat_messages_sender_id_fkey
  foreign key (sender_id) references profiles (id) on delete set null;
