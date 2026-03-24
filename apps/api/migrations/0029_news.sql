CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  team_id TEXT,
  type TEXT NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  game_week INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
