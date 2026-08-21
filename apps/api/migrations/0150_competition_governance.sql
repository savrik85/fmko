-- 0150: Samospráva soutěže ("Vedení soutěže").
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0150_competition_governance.sql
-- Jen CREATE TABLE / CREATE INDEX (idempotentní). Žádný ALTER, žádný backfill.
--
-- ZDROJ PRAVDY O ZŮSTATKU POKLADNY = competition_ledger (SUM(amount)).
-- competition_governance.balance_cache je jen cache pro rychlé čtení; přepočítává se
-- na každé schůzi (1x za herní týden) i při každém zápisu do ledgeru. Kdyby zápis cache
-- selhal mezi INSERTem řádku a UPDATEm, do týdne se to samo srovná.

CREATE TABLE IF NOT EXISTS competition_governance (
  league_id            TEXT PRIMARY KEY,
  enabled              INTEGER NOT NULL DEFAULT 0,
  enabled_from_season  INTEGER,
  balance_cache        INTEGER NOT NULL DEFAULT 0,
  balance_synced_at    TEXT,
  sponsor_name         TEXT,
  sponsor_amount       INTEGER NOT NULL DEFAULT 0,
  sponsor_satisfaction INTEGER NOT NULL DEFAULT 60,
  sponsor_until_season INTEGER,
  -- Název ligy před přejmenováním sponzorem. Po odchodu sponzora se vrací zpět.
  original_name        TEXT,
  -- POUZE PRO ZOBRAZENÍ. Schůzi NESPOUŠTÍ tohle pole — herní čas se při rolloveru vrací
  -- o desítky dní zpět (viz incident 47 mrtvých petic), takže absolutní datum by nikdy
  -- nenastalo. Schůzi spouští den v týdnu (středa) v daily-ticku.
  next_meeting_at      TEXT,
  last_meeting_at      TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Sazebník PLATNÝ PRO CELOU SEZÓNU. Vzniká VÝHRADNĚ při rolloveru z odhlasovaných
-- návrhů — nikdy se mid-season needituje. Tím padá celá třída chyb "změna na rozehranou".
CREATE TABLE IF NOT EXISTS competition_rules (
  id                      TEXT PRIMARY KEY,
  league_id               TEXT NOT NULL,
  season_number           INTEGER NOT NULL,
  win_bonus               INTEGER NOT NULL DEFAULT 500,
  draw_bonus              INTEGER NOT NULL DEFAULT 150,
  -- Odměna za 1. místo. Další místa = place_top * place_decay^(pos-1), floor place_floor.
  place_top               INTEGER NOT NULL DEFAULT 150000,
  place_decay             REAL    NOT NULL DEFAULT 0.80,
  place_floor             INTEGER NOT NULL DEFAULT 6000,
  entry_fee               INTEGER NOT NULL DEFAULT 15000,
  -- Odměna rozhodčímu za odpískaný ligový zápas. Platí ji soutěž, ne pořádající klub.
  referee_fee             INTEGER NOT NULL DEFAULT 1150,
  fine_mult               REAL    NOT NULL DEFAULT 1.0,
  interleague_fee_pct     INTEGER NOT NULL DEFAULT 20,
  ban_own_owner_transfers INTEGER NOT NULL DEFAULT 0,
  -- Odvody z klubových tržeb. Výchozí 0 % => spuštění nemění klubovou ekonomiku.
  levy_concession_pct     INTEGER NOT NULL DEFAULT 0,
  levy_gate_pct           INTEGER NOT NULL DEFAULT 0,
  levy_transfer_pct       INTEGER NOT NULL DEFAULT 0,
  levy_cup_pct            INTEGER NOT NULL DEFAULT 0,
  subsidy_total           INTEGER NOT NULL DEFAULT 0,
  source_proposals        TEXT,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, season_number),
  CHECK (win_bonus >= 0 AND draw_bonus >= 0 AND place_top >= 0 AND entry_fee >= 0 AND referee_fee >= 0),
  CHECK (place_decay > 0 AND place_decay < 1),
  CHECK (fine_mult >= 0),
  CHECK (interleague_fee_pct BETWEEN 0 AND 50),
  CHECK (levy_concession_pct BETWEEN 0 AND 10),
  CHECK (levy_gate_pct BETWEEN 0 AND 10),
  CHECK (levy_transfer_pct BETWEEN 0 AND 10),
  CHECK (levy_cup_pct BETWEEN 0 AND 20)
);

CREATE TABLE IF NOT EXISTS competition_proposals (
  id                    TEXT PRIMARY KEY,
  league_id             TEXT NOT NULL,
  season_number         INTEGER NOT NULL,
  kind                  TEXT NOT NULL,
  -- Gesce určuje, který předseda návrh propouští na program a dává k němu stanovisko.
  gesce                 TEXT NOT NULL DEFAULT 'soutez'
                          CHECK(gesce IN ('soutez','hospodarska','disciplinarni','rozhodcich','zadna')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL DEFAULT '',
  payload               TEXT NOT NULL DEFAULT '{}',
  proposed_by_team_id   TEXT NOT NULL,
  -- target_team_id = dotčený klub u pokut, dotací a odvolání. Ten o sobě nehlasuje.
  target_team_id        TEXT,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK(status IN ('open','passed','rejected','gatekept','withdrawn','no_quorum')),
  gate_note             TEXT,
  opinion               TEXT,
  defence               TEXT,
  evidence              TEXT,
  majority              REAL NOT NULL DEFAULT 0.5,
  quorum                REAL NOT NULL DEFAULT 0.5,
  -- HERNÍ datum otevření. Uzavírá se na první schůzi, kde opened_game_date < gameDate.
  -- Záměrně NE absolutní "meeting_at <= now" — to by po resetu herních hodin nikdy nenastalo.
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
CREATE INDEX IF NOT EXISTS idx_comp_prop_open ON competition_proposals(league_id, status, opened_game_date);
CREATE INDEX IF NOT EXISTS idx_comp_prop_eff  ON competition_proposals(league_id, effective_from_season, status);
CREATE INDEX IF NOT EXISTS idx_comp_prop_team ON competition_proposals(proposed_by_team_id, created_at);

CREATE TABLE IF NOT EXISTS competition_ballots (
  id          TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  team_id     TEXT NOT NULL,
  answer      TEXT NOT NULL CHECK(answer IN ('pro','proti','zdrzel')),
  voted_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(proposal_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_comp_ballot_team ON competition_ballots(team_id);

-- UNIQUE musí být PARTIAL. S plným UNIQUE(league_id, role, season_number) by po odvolání
-- nebo demisi nešlo ve stejné sezóně zvolit náhradníka.
CREATE TABLE IF NOT EXISTS competition_officials (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  role              TEXT NOT NULL
                      CHECK(role IN ('predseda','hospodarska','disciplinarni','rozhodcich')),
  team_id           TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK(status IN ('active','suspended','recalled','resigned','term_ended')),
  used_delay        INTEGER NOT NULL DEFAULT 0,
  used_meeting      INTEGER NOT NULL DEFAULT 0,
  used_suspend      INTEGER NOT NULL DEFAULT 0,
  used_fines        INTEGER NOT NULL DEFAULT 0,
  used_ban          INTEGER NOT NULL DEFAULT 0,
  elected_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  elected_game_date TEXT,
  ended_game_date   TEXT,
  proposal_id       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_official_active
  ON competition_officials(league_id, role, season_number)
  WHERE status IN ('active','suspended');
CREATE INDEX IF NOT EXISTS idx_comp_official_team ON competition_officials(team_id, season_number);

-- Pokladna soutěže. reference_id je JEDINÝ idempotenční mechanismus proti "aspoň jednou"
-- doručení z fronty. Vzor partial UNIQUE převzatý z 0126_reputation_log.sql.
-- balance_after je NULLABLE a informativní — autoritativní zůstatek je SUM(amount).
CREATE TABLE IF NOT EXISTS competition_ledger (
  id             TEXT PRIMARY KEY,
  league_id      TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  type           TEXT NOT NULL,
  amount         INTEGER NOT NULL,
  balance_after  INTEGER,
  description    TEXT NOT NULL DEFAULT '',
  team_id        TEXT,
  game_date      TEXT NOT NULL,
  reference_id   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_ledger_ref
  ON competition_ledger(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_ledger_league ON competition_ledger(league_id, season_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_ledger_team   ON competition_ledger(team_id, season_number);

CREATE TABLE IF NOT EXISTS competition_sanctions (
  id                 TEXT PRIMARY KEY,
  league_id          TEXT NOT NULL,
  season_number      INTEGER NOT NULL,
  team_id            TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'pokuta',
  amount             INTEGER NOT NULL DEFAULT 0,
  reason             TEXT NOT NULL DEFAULT '',
  evidence           TEXT,
  issued_by          TEXT NOT NULL DEFAULT 'disciplinarni',
  issued_by_team_id  TEXT,
  proposal_id        TEXT,
  status             TEXT NOT NULL DEFAULT 'issued'
                       CHECK(status IN ('issued','appealed','overturned','void')),
  appeal_proposal_id TEXT,
  appeal_deadline_gd TEXT,
  game_date          TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_sanction_team ON competition_sanctions(team_id, season_number);

CREATE TABLE IF NOT EXISTS competition_referee_bans (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  referee_id    TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  until_season  INTEGER,
  reason        TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'snem' CHECK(source IN ('komise','snem','auto')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, referee_id, season_number)
);

-- Vyplacené dotace, ceny a půjčky z pokladny.
CREATE TABLE IF NOT EXISTS competition_grants (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  proposal_id   TEXT,
  team_id       TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK(kind IN ('equipment','pitch','travel','award','loan','surplus')),
  amount        INTEGER NOT NULL,
  repaid        INTEGER NOT NULL DEFAULT 0,
  game_date     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_grant_team ON competition_grants(team_id, season_number);

-- Claim + zápis schůze. Jeden řádek = jedna proběhlá schůze jedné soutěže.
-- Vzor: claimTeamDay (season/team-day.ts).
CREATE TABLE IF NOT EXISTS competition_meetings (
  id               TEXT PRIMARY KEY,
  league_id        TEXT NOT NULL,
  season_number    INTEGER NOT NULL,
  game_date        TEXT NOT NULL,
  proposals_closed INTEGER NOT NULL DEFAULT 0,
  proposals_passed INTEGER NOT NULL DEFAULT 0,
  attendance       TEXT,
  balance_after    INTEGER,
  summary          TEXT,
  news_id          TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, game_date)
);
