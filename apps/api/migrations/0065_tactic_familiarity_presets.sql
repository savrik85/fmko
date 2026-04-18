-- Sehranost taktik a formací — JSON mapy {tactic_key: 0..100}
ALTER TABLE teams ADD COLUMN tactic_familiarity TEXT DEFAULT '{}';
ALTER TABLE teams ADD COLUMN formation_familiarity TEXT DEFAULT '{}';

-- Presety sestav — fixní 3 sloty A/B/C per tým
CREATE TABLE lineup_presets (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('A','B','C')),
  formation TEXT NOT NULL,
  tactic TEXT NOT NULL,
  captain_id TEXT,
  players_data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (team_id, slot)
);
