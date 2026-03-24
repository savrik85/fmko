-- Messaging — in-game phone / SMS system
-- Konverzace: skupinová "Kabina", 1:1 s hráči, 1:1 s manažery, systémové

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  type TEXT NOT NULL CHECK(type IN ('squad_group','player','manager','system')),
  title TEXT NOT NULL,
  participant_id TEXT,             -- player_id (type=player) nebo team_id protistrany (type=manager)
  participant_avatar TEXT,         -- JSON facejs config
  last_message_text TEXT,
  last_message_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_conv_team ON conversations(team_id);
CREATE INDEX idx_conv_team_type ON conversations(team_id, type);
CREATE INDEX idx_conv_last ON conversations(team_id, last_message_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('player','manager','system','user')),
  sender_id TEXT,                  -- player_id, team_id protistrany, NULL pro system/user
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT,                   -- JSON: {type:'attendance', response:'yes'|'no'|'late'} apod.
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_msg_conv ON messages(conversation_id);
CREATE INDEX idx_msg_conv_time ON messages(conversation_id, sent_at);
CREATE INDEX idx_msg_unread ON messages(conversation_id, read);
