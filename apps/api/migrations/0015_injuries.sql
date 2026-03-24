-- Injury tracking system
CREATE TABLE IF NOT EXISTS injuries (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  type TEXT NOT NULL CHECK(type IN ('sval','kotnік','koleno','zada','hlava','zebra','achilovka','tříselný','rameno','obecne')),
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('lehke','stredni','tezke')),
  days_remaining INTEGER NOT NULL,         -- countdown, -1 per daily tick
  days_total INTEGER NOT NULL,             -- original duration
  match_id TEXT REFERENCES matches(id),    -- which match caused it (NULL if training)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_injuries_player ON injuries(player_id);
CREATE INDEX idx_injuries_team ON injuries(team_id);
CREATE INDEX idx_injuries_active ON injuries(team_id, days_remaining);