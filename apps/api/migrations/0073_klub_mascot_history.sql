-- Klub: krok 9 - historie maskotu (max 3 per team, 1 is_selected)
CREATE TABLE IF NOT EXISTS team_mascots (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  animal TEXT NOT NULL,
  style TEXT NOT NULL,
  story TEXT,
  image_url TEXT,
  is_selected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_mascots_team ON team_mascots(team_id);
