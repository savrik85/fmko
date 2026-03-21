-- Sprint 1: Vidím svůj tým — initial schema

-- Villages (seed data from ČSÚ)
CREATE TABLE villages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  region TEXT NOT NULL,
  population INTEGER NOT NULL,
  size TEXT NOT NULL CHECK(size IN ('hamlet','village','town','small_city','city')),
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

CREATE INDEX idx_villages_region ON villages(region);
CREATE INDEX idx_villages_district ON villages(district);

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Teams
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  village_id TEXT NOT NULL REFERENCES villages(id),
  name TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#2D5F2D',
  secondary_color TEXT NOT NULL DEFAULT '#FFFFFF',
  budget INTEGER NOT NULL DEFAULT 40000,
  reputation INTEGER NOT NULL DEFAULT 50,
  league_id TEXT,
  naming_sponsor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Players
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL,
  position TEXT NOT NULL CHECK(position IN ('GK','DEF','MID','FWD')),
  overall_rating INTEGER NOT NULL,
  skills TEXT NOT NULL,           -- JSON: FootballSkills
  physical TEXT NOT NULL,         -- JSON: PhysicalAttributes
  personality TEXT NOT NULL,      -- JSON: PersonalityAttributes
  life_context TEXT NOT NULL,     -- JSON: LifeContext
  avatar TEXT NOT NULL,           -- JSON: AvatarConfig
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_players_team ON players(team_id);

-- Relationships
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  player_a_id TEXT NOT NULL REFERENCES players(id),
  player_b_id TEXT NOT NULL REFERENCES players(id),
  type TEXT NOT NULL CHECK(type IN ('brothers','father_son','in_laws','classmates','coworkers'))
);

CREATE INDEX idx_relationships_player_a ON relationships(player_a_id);
CREATE INDEX idx_relationships_player_b ON relationships(player_b_id);
