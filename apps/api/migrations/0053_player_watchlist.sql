-- Seznam sledovaných hráčů (scout watchlist)
CREATE TABLE IF NOT EXISTS player_watchlist (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_team ON player_watchlist(team_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_player ON player_watchlist(player_id);
