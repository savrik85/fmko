-- 0333_district_selection.sql: výběr okresu (2026-11-21).
--
-- Zápas výběrů dvou okresů vypisuje admin (jako okresní akci). Nominace jde přes modul
-- anket (district_polls kind='selection'): OFS pošle trenérům kandidáty, každý napíše až tři
-- hráče z cizích klubů (picks), 16 nejvíc jmenovaných jede. Výběr nemá vlastní řádek
-- v teams, sestava se skládá přímo z hráčů klubů a nemíchá se do tabulek ani trhu.
ALTER TABLE district_poll_ballots ADD COLUMN picks TEXT;
ALTER TABLE district_polls ADD COLUMN result TEXT;

CREATE TABLE IF NOT EXISTS district_selection_matches (
  id             TEXT PRIMARY KEY,
  home_district  TEXT NOT NULL,
  away_district  TEXT NOT NULL,
  venue          TEXT NOT NULL,
  match_date     TEXT NOT NULL,
  kickoff_at     TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  -- nominating | ready | playing | played | cancelled
  status         TEXT NOT NULL DEFAULT 'nominating',
  home_poll_id   TEXT,
  away_poll_id   TEXT,
  home_score     INTEGER,
  away_score     INTEGER,
  events         TEXT,
  lineups        TEXT,
  news_id        TEXT,
  claimed_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_district_selection_status ON district_selection_matches (status, kickoff_at);
