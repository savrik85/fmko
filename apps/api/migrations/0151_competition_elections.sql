-- 0151: Volby předsedů odborů soutěže.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0151_competition_elections.sql
--
-- Volba NEJDE přes competition_ballots: ta má CHECK na 'pro'/'proti'/'zdrzel' a hlas
-- ve volbě je jméno kandidáta, ne stanovisko. Zároveň je volba TAJNÁ napořád —
-- kdyby bylo vidět, kdo koho volil, nikdo nepůjde proti favoritovi a dopadne to 14:0.

CREATE TABLE IF NOT EXISTS competition_elections (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  role              TEXT NOT NULL
                      CHECK(role IN ('predseda','hospodarska','disciplinarni','rozhodcich')),
  season_number     INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','decided','failed')),
  -- Otevírá se herním datem; uzavírá první schůze, kde opened_game_date < gameDate.
  opened_game_date  TEXT NOT NULL,
  closed_game_date  TEXT,
  winner_team_id    TEXT,
  candidates        INTEGER NOT NULL DEFAULT 0,
  votes_cast        INTEGER NOT NULL DEFAULT 0,
  result_note       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, role, season_number)
);
CREATE INDEX IF NOT EXISTS idx_comp_election_open ON competition_elections(league_id, status);

CREATE TABLE IF NOT EXISTS competition_candidacies (
  id           TEXT PRIMARY KEY,
  election_id  TEXT NOT NULL,
  team_id      TEXT NOT NULL,
  withdrawn    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(election_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_comp_candidacy_team ON competition_candidacies(team_id);

CREATE TABLE IF NOT EXISTS competition_election_ballots (
  id                TEXT PRIMARY KEY,
  election_id       TEXT NOT NULL,
  team_id           TEXT NOT NULL,
  candidate_team_id TEXT NOT NULL,
  voted_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(election_id, team_id)
);
