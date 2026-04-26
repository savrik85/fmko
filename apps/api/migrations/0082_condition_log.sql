-- Log změn kondice hráčů — pro timeline v detailu hráče.
-- Source: training, recovery, facility, match, hangover, pub, event, friendly
CREATE TABLE IF NOT EXISTS condition_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  old_value INTEGER NOT NULL,
  new_value INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  source TEXT NOT NULL,
  description TEXT,
  game_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_condition_log_player ON condition_log(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_condition_log_team ON condition_log(team_id, created_at DESC);
