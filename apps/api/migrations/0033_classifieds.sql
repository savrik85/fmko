-- Classified ads for the newspaper (Placená inzerce)
CREATE TABLE IF NOT EXISTS classifieds (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  league_id TEXT,
  category TEXT NOT NULL DEFAULT 'general',  -- player_wanted, player_offering, equipment, match, general
  message TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 500,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_classifieds_league ON classifieds(league_id);
CREATE INDEX idx_classifieds_team ON classifieds(team_id);
