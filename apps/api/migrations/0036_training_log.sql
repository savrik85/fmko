-- Tréninkový log — sledování vývoje atributů hráčů
CREATE TABLE IF NOT EXISTS training_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  attribute TEXT NOT NULL,
  old_value INTEGER NOT NULL,
  new_value INTEGER NOT NULL,
  change INTEGER NOT NULL,
  training_type TEXT NOT NULL,
  game_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_training_log_player ON training_log(player_id);
CREATE INDEX idx_training_log_team ON training_log(team_id);
