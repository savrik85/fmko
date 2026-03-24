-- Seasons & Leagues — proper entities with history

-- Global season registry
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','winter_break','finished')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- League instances per season per district
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  district TEXT NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'okresni_prebor' CHECK(level IN ('okresni_soutez','okresni_prebor','ib_trida','ia_trida','krajsky_prebor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','finished')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(season_id, district, level)
);

CREATE INDEX idx_leagues_season ON leagues(season_id);
CREATE INDEX idx_leagues_district ON leagues(district);

-- Historical standings snapshot per league
CREATE TABLE IF NOT EXISTS league_history (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  final_standings TEXT NOT NULL,
  promotions TEXT,
  relegations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert first season
INSERT INTO seasons (id, number, status) VALUES ('season-1', 1, 'active');

-- Migrate existing league_ids: create league records for any existing teams with league_id
-- This is a data migration — for existing data, we create league records
-- New teams will use the proper flow
