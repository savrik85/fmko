-- Klub: krok 8c - historie hymen (max 3 per team, 1 is_selected)
-- Drive bylo teams.anthem_* = jen ta aktualni, teď tabulka historie.
-- teams.anthem_url/title/lyrics zustavaji jako mirror vybraneho zaznamu.

CREATE TABLE IF NOT EXISTS team_anthems (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  title TEXT NOT NULL,
  lyrics TEXT NOT NULL,
  style TEXT NOT NULL,
  url TEXT,
  suno_task_id TEXT,
  is_selected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_anthems_team ON team_anthems(team_id);
