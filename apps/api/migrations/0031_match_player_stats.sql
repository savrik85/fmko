-- Per-match, per-player statistics for FM-style match history
CREATE TABLE IF NOT EXISTS match_player_stats (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  started INTEGER NOT NULL DEFAULT 1,
  position TEXT NOT NULL DEFAULT 'MID',
  minutes_played INTEGER NOT NULL DEFAULT 90,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 6.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(match_id, player_id)
);

CREATE INDEX idx_mps_player ON match_player_stats(player_id);
CREATE INDEX idx_mps_match ON match_player_stats(match_id);
CREATE INDEX idx_mps_team ON match_player_stats(team_id);
