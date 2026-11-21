-- 0318_hall_cup.sql: Vánoční sálovka (2026-11-21).
--
-- Jednodenní halový turnaj 5+1 v okresním městě. Vlastní tabulky, ne `tournaments`:
-- P-Mobile je vícedenní, `loadCurrentTournament` bere vždy poslední ročník a další
-- ročník může běžet souběžně. Přihlášky jdou přes SMS od haly (`hc-<cupId>`),
-- startovné se strhne při losu, bank si rozdělí první tři.
CREATE TABLE IF NOT EXISTS hall_cups (
  id                    TEXT PRIMARY KEY,
  district              TEXT NOT NULL,
  season_number         INTEGER NOT NULL,
  year                  INTEGER NOT NULL,
  title                 TEXT NOT NULL,
  venue                 TEXT NOT NULL,
  invite_on             TEXT NOT NULL,
  registration_deadline TEXT NOT NULL,
  plays_on              TEXT NOT NULL,
  entry_fee             INTEGER NOT NULL,
  -- planned | registration | drawn | finished | cancelled
  status                TEXT NOT NULL DEFAULT 'planned',
  invited_at            TEXT,
  drawn_at              TEXT,
  finished_at           TEXT,
  winner_team_id        TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_cups_district_year ON hall_cups (district, year);

-- Pozvaný klub. status: invited | registered | declined. roster = JSON id hráčů od trenéra
-- (nejvýš 10), NULL = přiveze nejlepší zdravé. final_place 1–3 po finále.
CREATE TABLE IF NOT EXISTS hall_cup_entries (
  cup_id      TEXT NOT NULL,
  team_id     TEXT NOT NULL,
  conv_id     TEXT,
  status      TEXT NOT NULL DEFAULT 'invited',
  answered_at TEXT,
  group_code  TEXT,
  roster      TEXT,
  final_place INTEGER,
  PRIMARY KEY (cup_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_hall_cup_entries_team ON hall_cup_entries (team_id);

-- Zápas turnaje. stage: group | qf | sf | third | final; bracket_pos = pořadí ve fázi.
-- slot = pořadí v časovém plánu dne (dvě hřiště, court 1 a 2). events = JSON góly a karty,
-- lineups = JSON jmen.
CREATE TABLE IF NOT EXISTS hall_cup_matches (
  id             TEXT PRIMARY KEY,
  cup_id         TEXT NOT NULL,
  stage          TEXT NOT NULL,
  group_code     TEXT,
  bracket_pos    INTEGER NOT NULL DEFAULT 0,
  slot           INTEGER NOT NULL,
  court          INTEGER NOT NULL DEFAULT 1,
  kickoff_at     TEXT NOT NULL,
  home_team_id   TEXT NOT NULL,
  away_team_id   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'scheduled',
  claimed_at     TEXT,
  home_score     INTEGER,
  away_score     INTEGER,
  home_pens      INTEGER,
  away_pens      INTEGER,
  winner_team_id TEXT,
  events         TEXT,
  lineups        TEXT,
  played_at      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_cup_matches_pos ON hall_cup_matches (cup_id, stage, bracket_pos);
CREATE INDEX IF NOT EXISTS idx_hall_cup_matches_due ON hall_cup_matches (status, kickoff_at);
