-- 0250_tournaments.sql: Turnaj P-Mobile — každoroční turnaj přihlášených lidských klubů
-- na konci sezóny, na neutrální půdě. Etapa 1: ročník a přihlášky.
--
-- status: registration → closed → drawn → running → finished (bez CHECK, ať jde přidat
-- stav bez přestavby tabulky — viz matches.status). Hlídá se v kódu.
-- registration_deadline je skutečný čas (UTC ISO), ne herní — přihlašují se lidé.
-- league_matches = počet zápasů na tým v ligové fázi, volí admin při losu (NULL do losu).
-- city_locative = město v 6. pádě pro texty („v Táboře"), invited_at = kdy odešla pozvánka
-- (claim proti dvojímu rozeslání).
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  edition INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sponsor TEXT NOT NULL,
  city TEXT NOT NULL,
  city_locative TEXT,
  venue_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registration',
  registration_deadline TEXT NOT NULL,
  starts_on TEXT,
  point_reward INTEGER NOT NULL DEFAULT 0,
  prize_quarterfinal INTEGER NOT NULL DEFAULT 0,
  prize_semifinal INTEGER NOT NULL DEFAULT 0,
  prize_finalist INTEGER NOT NULL DEFAULT 0,
  prize_winner INTEGER NOT NULL DEFAULT 0,
  league_matches INTEGER,
  winner_team_id TEXT REFERENCES teams(id),
  invited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tournament_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_entries_team ON tournament_entries(team_id);
