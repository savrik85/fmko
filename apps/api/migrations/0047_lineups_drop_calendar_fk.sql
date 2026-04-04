-- Drop FK constraint on lineups.calendar_id
-- Friendly matches use match.id as calendar_id which is not in season_calendar
CREATE TABLE lineups_new (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  calendar_id TEXT NOT NULL,
  formation TEXT NOT NULL DEFAULT '4-4-2',
  tactic TEXT NOT NULL DEFAULT 'balanced',
  players_data TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT,
  is_auto INTEGER NOT NULL DEFAULT 0
);

INSERT INTO lineups_new SELECT id, team_id, calendar_id, formation, tactic, players_data, submitted_at, is_auto FROM lineups;
DROP TABLE lineups;
ALTER TABLE lineups_new RENAME TO lineups;
