-- Historie váhy hráče (postava, část 2; spec docs/superpowers/specs/2026-10-08-player-body-drift-design.md).
-- Týdenní záznam z denního ticku, záznam po létě a po růstu dorostu. Čte ji trend v profilu
-- a SMS od štábu o přibírání. Jen přidává tabulku, na produkci po záloze.
CREATE TABLE IF NOT EXISTS weight_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  game_date TEXT NOT NULL,
  weight REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_weight_log_player ON weight_log(player_id, game_date);
