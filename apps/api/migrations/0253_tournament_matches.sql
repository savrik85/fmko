-- 0253_tournament_matches.sql: Turnaj P-Mobile, etapa 2 — hřiště, zápasy, turnajové stopky.
--
-- Hřiště turnaje patří městu, ne klubu (stadiums je 1:1 s týmem). look = vzhled pro 3D
-- (úrovně tribun, střechy, světel… a barvy), stejné klíče jako sloupce tabulky stadiums.
CREATE TABLE IF NOT EXISTS tournament_venues (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  is_main INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  look TEXT NOT NULL DEFAULT '{}'
);

-- „Domácí" je u turnaje jen pořadí v zápisu, výhoda domácích se nepočítá (neutrální půda).
-- stage: league | qf | sf | final; day = hrací den turnaje (1 = starts_on).
CREATE TABLE IF NOT EXISTS tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  stage TEXT NOT NULL,
  day INTEGER NOT NULL,
  bracket_pos INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL,
  venue_id TEXT REFERENCES tournament_venues(id),
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'scheduled',
  claimed_at TEXT,
  home_score INTEGER,
  away_score INTEGER,
  home_pens INTEGER,
  away_pens INTEGER,
  winner_team_id TEXT,
  events TEXT,
  commentary TEXT,
  attendance INTEGER,
  stadium_name TEXT,
  pitch_condition INTEGER,
  weather TEXT,
  home_lineup_data TEXT,
  away_lineup_data TEXT,
  absences TEXT,
  player_ratings TEXT,
  referee_id TEXT,
  referee_snapshot TEXT,
  referee_incidents TEXT,
  referee_grade REAL,
  simulated_at TEXT,
  home_seen INTEGER NOT NULL DEFAULT 0,
  away_seen INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_matches_slot ON tournament_matches(tournament_id, stage, day, bracket_pos);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_due ON tournament_matches(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_home ON tournament_matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_away ON tournament_matches(away_team_id);

-- Karty platí jen v turnaji: vlastní stopky, players.suspended_matches (liga, pohár) se nemění.
CREATE TABLE IF NOT EXISTS tournament_suspensions (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id TEXT NOT NULL,
  matches_remaining INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, player_id)
);

ALTER TABLE tournaments ADD COLUMN drawn_at TEXT;
ALTER TABLE tournaments ADD COLUMN league_days INTEGER;
