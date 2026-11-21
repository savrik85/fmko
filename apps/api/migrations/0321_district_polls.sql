-- 0321_district_polls.sql: ankety okresu (2026-11-21), první je Fotbalista okresu.
--
-- Obecný modul, použije ho i výběr okresu. Redaktor nominuje deset hráčů z odehrané
-- sezóny, trenéři hlasují přes SMS (předpona po-<pollId>), AI kluby a kotle přes model
-- při uzávěrce. Hlas kotle váží polovinu.
CREATE TABLE IF NOT EXISTS district_polls (
  id                TEXT PRIMARY KEY,
  district          TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  -- voting | closing | closed
  status            TEXT NOT NULL DEFAULT 'voting',
  editor_name       TEXT NOT NULL,
  closes_on         TEXT NOT NULL,
  opened_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  closed_at         TEXT,
  winner_player_id  TEXT,
  news_id           TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_district_polls_unique ON district_polls (district, season_number, kind);
CREATE INDEX IF NOT EXISTS idx_district_polls_status ON district_polls (status, closes_on);

CREATE TABLE IF NOT EXISTS district_poll_candidates (
  poll_id    TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  team_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  team_name  TEXT NOT NULL,
  position   TEXT NOT NULL,
  blurb      TEXT NOT NULL,
  rank       INTEGER NOT NULL,
  PRIMARY KEY (poll_id, player_id)
);

-- Hlasující: voter_kind team | fan_group. player_id NULL = pozvaný, ještě nehlasoval.
-- Druhý hlas přepíše první (jeden řádek na hlasujícího).
CREATE TABLE IF NOT EXISTS district_poll_ballots (
  poll_id     TEXT NOT NULL,
  voter_kind  TEXT NOT NULL,
  voter_id    TEXT NOT NULL,
  voter_team_id TEXT,
  conv_id     TEXT,
  player_id   TEXT,
  weight      REAL NOT NULL DEFAULT 1,
  voted_at    TEXT,
  -- Odpověď redaktora chodí s prodlevou jako od člověka (v noci ráno), doručí ji hodinový běh.
  pending_reply TEXT,
  reply_due_at  TEXT,
  PRIMARY KEY (poll_id, voter_kind, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_district_poll_ballots_conv ON district_poll_ballots (conv_id);

