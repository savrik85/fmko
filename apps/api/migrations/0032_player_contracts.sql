-- Player contract history — tracks which club a player belonged to and when
CREATE TABLE IF NOT EXISTS player_contracts (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT,
  join_type TEXT NOT NULL DEFAULT 'generated',  -- generated, transfer, free_agent, youth
  leave_type TEXT,                                -- transfer, released, retired, NULL=still active
  fee INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pc_player ON player_contracts(player_id);
CREATE INDEX idx_pc_team ON player_contracts(team_id);
CREATE INDEX idx_pc_active ON player_contracts(player_id, is_active);
