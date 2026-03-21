-- FMK-53: Skill systém v2 — 0-100 stupnice, talent cap, separátní GK skilly

-- Přidáme nové sloupce do players (SQLite nemá DROP COLUMN v některých verzích)
-- Nový přístup: skills a physical JSON sloupce už existují, změníme jen formát dat.
-- Přidáme sloupce pro talent cap a GK skilly.

ALTER TABLE players ADD COLUMN skills_max TEXT NOT NULL DEFAULT '{}';        -- JSON: hidden talent caps
ALTER TABLE players ADD COLUMN gk_skills TEXT NOT NULL DEFAULT '{}';         -- JSON: GoalkeeperSkills (current)
ALTER TABLE players ADD COLUMN gk_skills_max TEXT NOT NULL DEFAULT '{}';     -- JSON: GoalkeeperSkills (caps)
ALTER TABLE players ADD COLUMN hidden_talent INTEGER NOT NULL DEFAULT 0;     -- 0-100, hidden
ALTER TABLE players ADD COLUMN experience INTEGER NOT NULL DEFAULT 0;        -- 0-100, grows from matches

-- Season calendar (FMK-52 prep)
CREATE TABLE IF NOT EXISTS season_calendar (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  game_week INTEGER NOT NULL,
  match_day TEXT NOT NULL CHECK(match_day IN ('wednesday','saturday','sunday')),
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','lineup_locked','simulated'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_league ON season_calendar(league_id);
CREATE INDEX IF NOT EXISTS idx_calendar_scheduled ON season_calendar(scheduled_at);

-- Lineups per match
CREATE TABLE IF NOT EXISTS lineups (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  calendar_id TEXT NOT NULL REFERENCES season_calendar(id),
  formation TEXT NOT NULL DEFAULT '4-4-2',
  tactic TEXT NOT NULL DEFAULT 'balanced',
  players_data TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT,
  is_auto INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lineups_team ON lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_lineups_calendar ON lineups(calendar_id);
