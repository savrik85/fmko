-- 0101_u21_system.sql
-- U21 týmy + vlastní soutěž (mirror A-ligy, +24h)
-- Pendlování hráčů A↔U21 (next_match_return), symetrické transfer offers.

-- TEAMS: U21 jako varianta, propojení na parent
ALTER TABLE teams ADD COLUMN team_type TEXT NOT NULL DEFAULT 'senior'
  CHECK(team_type IN ('senior','u21'));
ALTER TABLE teams ADD COLUMN parent_team_id TEXT REFERENCES teams(id);
CREATE INDEX IF NOT EXISTS idx_teams_parent ON teams(parent_team_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_u21_per_parent
  ON teams(parent_team_id) WHERE team_type='u21';

-- LEAGUES: U21 liga jako mirror
ALTER TABLE leagues ADD COLUMN league_type TEXT NOT NULL DEFAULT 'senior'
  CHECK(league_type IN ('senior','u21'));
ALTER TABLE leagues ADD COLUMN parent_league_id TEXT REFERENCES leagues(id);
CREATE INDEX IF NOT EXISTS idx_leagues_parent ON leagues(parent_league_id);

-- PLAYERS: "vrátit do A po nejbližším U21 zápase"
ALTER TABLE players ADD COLUMN parent_club_id TEXT REFERENCES teams(id);
ALTER TABLE players ADD COLUMN next_match_return INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_players_parent_club ON players(parent_club_id);

-- MATCHES + SEASON_CALENDAR: mirror pointer pro hook
ALTER TABLE matches ADD COLUMN parent_match_id TEXT REFERENCES matches(id);
ALTER TABLE season_calendar ADD COLUMN parent_calendar_id TEXT REFERENCES season_calendar(id);
CREATE INDEX IF NOT EXISTS idx_calendar_parent ON season_calendar(parent_calendar_id);

-- TRANSFER_OFFERS: cílový squad pro symetrické nabídky
ALTER TABLE transfer_offers ADD COLUMN target_squad TEXT NOT NULL DEFAULT 'senior'
  CHECK(target_squad IN ('senior','u21'));
