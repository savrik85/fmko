-- 0159: Komisař pro integritu soutěže — pátá volená funkce v grémiu.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0159_komisar_integrity.sql
--
-- Tři tabulky mají tvrdý CHECK na roli a gesci, který SQLite neumí uvolnit
-- ALTERem. Musí se přestavět. Data se PŘENÁŠEJÍ — jsou v nich funkcionáři,
-- volby i hlasování, o která nesmíme přijít.
--
-- Po dokončení ZKONTROLOVAT počty (před migrací: officials 4, elections 8,
-- proposals 22) — v testovací DB dotazem:
--   SELECT (SELECT COUNT(*) FROM competition_officials),
--          (SELECT COUNT(*) FROM competition_elections),
--          (SELECT COUNT(*) FROM competition_proposals);

PRAGMA foreign_keys = OFF;

-- ── competition_officials ───────────────────────────────────────────────────
CREATE TABLE competition_officials_new (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  role              TEXT NOT NULL
                      CHECK(role IN ('predseda','hospodarska','disciplinarni','rozhodcich','integrita')),
  team_id           TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK(status IN ('active','suspended','recalled','resigned','term_ended')),
  used_delay        INTEGER NOT NULL DEFAULT 0,
  used_meeting      INTEGER NOT NULL DEFAULT 0,
  used_suspend      INTEGER NOT NULL DEFAULT 0,
  used_fines        INTEGER NOT NULL DEFAULT 0,
  used_ban          INTEGER NOT NULL DEFAULT 0,
  used_bet_ban      INTEGER NOT NULL DEFAULT 0,
  used_bet_void     INTEGER NOT NULL DEFAULT 0,
  elected_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  elected_game_date TEXT,
  ended_game_date   TEXT,
  proposal_id       TEXT
);
INSERT INTO competition_officials_new
  (id, league_id, role, team_id, season_number, status, used_delay, used_meeting,
   used_suspend, used_fines, used_ban, elected_at, elected_game_date, ended_game_date, proposal_id)
SELECT id, league_id, role, team_id, season_number, status, used_delay, used_meeting,
       used_suspend, used_fines, used_ban, elected_at, elected_game_date, ended_game_date, proposal_id
  FROM competition_officials;
DROP TABLE competition_officials;
ALTER TABLE competition_officials_new RENAME TO competition_officials;

-- Partial unique index je POVINNÝ: bez něj nejde po odvolání zvolit náhradníka.
CREATE UNIQUE INDEX idx_comp_official_active
  ON competition_officials(league_id, role, season_number)
  WHERE status IN ('active','suspended');
CREATE INDEX idx_comp_official_team ON competition_officials(team_id, season_number);

-- ── competition_elections ───────────────────────────────────────────────────
CREATE TABLE competition_elections_new (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  role              TEXT NOT NULL
                      CHECK(role IN ('predseda','hospodarska','disciplinarni','rozhodcich','integrita')),
  season_number     INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','decided','failed')),
  opened_game_date  TEXT NOT NULL,
  closed_game_date  TEXT,
  winner_team_id    TEXT,
  candidates        INTEGER NOT NULL DEFAULT 0,
  votes_cast        INTEGER NOT NULL DEFAULT 0,
  result_note       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, role, season_number)
);
INSERT INTO competition_elections_new SELECT * FROM competition_elections;
DROP TABLE competition_elections;
ALTER TABLE competition_elections_new RENAME TO competition_elections;
CREATE INDEX idx_comp_election_open ON competition_elections(league_id, status);

-- ── competition_proposals ───────────────────────────────────────────────────
-- Mění se jen CHECK na gesci; sloupců je hodně, proto se vypisují jménem,
-- aby se pořadí nemohlo rozejít.
CREATE TABLE competition_proposals_new (
  id                    TEXT PRIMARY KEY,
  league_id             TEXT NOT NULL,
  season_number         INTEGER NOT NULL,
  kind                  TEXT NOT NULL,
  gesce                 TEXT NOT NULL DEFAULT 'soutez'
                          CHECK(gesce IN ('soutez','hospodarska','disciplinarni','rozhodcich','integrita','zadna')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL DEFAULT '',
  payload               TEXT NOT NULL DEFAULT '{}',
  proposed_by_team_id   TEXT NOT NULL,
  target_team_id        TEXT,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK(status IN ('open','passed','rejected','gatekept','withdrawn','no_quorum')),
  gate_note             TEXT,
  opinion               TEXT,
  defence               TEXT,
  evidence              TEXT,
  majority              REAL NOT NULL DEFAULT 0.5,
  quorum                REAL NOT NULL DEFAULT 0.5,
  opened_game_date      TEXT NOT NULL,
  meeting_at            TEXT,
  deposit               INTEGER NOT NULL DEFAULT 0,
  closed_at             TEXT,
  closed_game_date      TEXT,
  votes_pro             INTEGER NOT NULL DEFAULT 0,
  votes_proti           INTEGER NOT NULL DEFAULT 0,
  votes_zdrzel          INTEGER NOT NULL DEFAULT 0,
  eligible_voters       INTEGER NOT NULL DEFAULT 0,
  decided_by            TEXT,
  result_note           TEXT,
  effective_from_season INTEGER,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
INSERT INTO competition_proposals_new
  (id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
   target_team_id, status, gate_note, opinion, defence, evidence, majority, quorum,
   opened_game_date, meeting_at, deposit, closed_at, closed_game_date,
   votes_pro, votes_proti, votes_zdrzel, eligible_voters, decided_by, result_note,
   effective_from_season, created_at)
SELECT
   id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
   target_team_id, status, gate_note, opinion, defence, evidence, majority, quorum,
   opened_game_date, meeting_at, deposit, closed_at, closed_game_date,
   votes_pro, votes_proti, votes_zdrzel, eligible_voters, decided_by, result_note,
   effective_from_season, created_at
  FROM competition_proposals;
DROP TABLE competition_proposals;
ALTER TABLE competition_proposals_new RENAME TO competition_proposals;
CREATE INDEX idx_comp_proposal_open ON competition_proposals(league_id, status);
CREATE INDEX idx_comp_proposal_season ON competition_proposals(league_id, season_number);

PRAGMA foreign_keys = ON;
