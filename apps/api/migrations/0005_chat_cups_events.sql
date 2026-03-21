-- FMK-20: Okresní chat + notifikace
-- FMK-22: Poháry a turnaje
-- FMK-23: Sezónní eventy

-- District chat
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  team_name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chat_league ON chat_messages(league_id);
CREATE INDEX idx_chat_created ON chat_messages(created_at);

-- Notifications
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  type TEXT NOT NULL CHECK(type IN ('match_reminder','match_result','event','challenge','transfer','season','system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  action_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_team ON notifications(team_id);
CREATE INDEX idx_notifications_unread ON notifications(team_id, read);

-- Cups / tournaments
CREATE TABLE cups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  season TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('district_cup','regional_cup','winter_tournament','friendly_tournament')),
  status TEXT NOT NULL DEFAULT 'registration' CHECK(status IN ('registration','in_progress','finished')),
  bracket TEXT,                       -- JSON: tournament bracket
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cup_entries (
  id TEXT PRIMARY KEY,
  cup_id TEXT NOT NULL REFERENCES cups(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  seed INTEGER,
  eliminated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_cup_entries_cup ON cup_entries(cup_id);

-- Seasonal events (zabijačka, ples, vánoční turnaj...)
CREATE TABLE seasonal_events (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('zabijacka','ples','vanocni_turnaj','silvestr','letni_soustredeni','obecni_zpravodaj')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  effects TEXT NOT NULL,              -- JSON: [{type, value, description}]
  choices TEXT,                       -- JSON: [{id, label, effects}] — manažerská rozhodnutí
  season TEXT NOT NULL,
  game_week INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_seasonal_league ON seasonal_events(league_id);
