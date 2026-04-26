-- Hospoda U Pralesa — denní hospodská session pro každý lidský tým.
-- Generuje se v daily-ticku, idempotentní per (team_id, game_date).
CREATE TABLE IF NOT EXISTS pub_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  game_date TEXT NOT NULL,
  attendees TEXT NOT NULL, -- JSON: [{playerId, firstName, lastName, alcohol}]
  incidents TEXT NOT NULL, -- JSON: [{type, playerIds, text}]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_session_team_date ON pub_sessions(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_pub_session_team ON pub_sessions(team_id, created_at DESC);
