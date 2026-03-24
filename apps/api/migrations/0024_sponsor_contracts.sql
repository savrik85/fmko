-- Sponsor contracts — active deals between teams and sponsors
CREATE TABLE IF NOT EXISTS sponsor_contracts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  sponsor_name TEXT NOT NULL,
  sponsor_type TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL,
  win_bonus INTEGER NOT NULL DEFAULT 0,
  seasons_total INTEGER NOT NULL DEFAULT 1,    -- contract length (1-3 seasons)
  seasons_remaining INTEGER NOT NULL DEFAULT 1,
  early_termination_fee INTEGER NOT NULL DEFAULT 0,  -- penalty for breaking contract
  is_naming_rights INTEGER NOT NULL DEFAULT 0,       -- affects team name
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  signed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sponsor_contracts_team ON sponsor_contracts(team_id);
CREATE INDEX idx_sponsor_contracts_active ON sponsor_contracts(team_id, status);
