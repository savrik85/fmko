-- Financial transaction ledger — tracks every budget change
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT NOT NULL,
  reference_id TEXT,
  game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_txn_team ON transactions(team_id);
CREATE INDEX idx_txn_team_date ON transactions(team_id, game_date);
CREATE INDEX idx_txn_team_type ON transactions(team_id, type);
