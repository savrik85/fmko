-- Group chats: globální chat všech týmů + per-liga chat
-- Sdílené konverzace (NE per-team kopie jako stávající `conversations`).
-- Unread tracking je per-team přes group_chat_reads.last_read_at.

CREATE TABLE IF NOT EXISTS group_chats (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('global','league')),
  scope_id TEXT,                 -- league_id pro 'league', NULL pro 'global'
  title TEXT NOT NULL,
  last_message_text TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(scope, scope_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id TEXT PRIMARY KEY,
  group_chat_id TEXT NOT NULL REFERENCES group_chats(id),
  sender_team_id TEXT NOT NULL REFERENCES teams(id),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_gmsg_chat_time ON group_messages(group_chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmsg_sender ON group_messages(sender_team_id);

CREATE TABLE IF NOT EXISTS group_chat_reads (
  group_chat_id TEXT NOT NULL REFERENCES group_chats(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  last_read_at TEXT NOT NULL,
  PRIMARY KEY(group_chat_id, team_id)
);
