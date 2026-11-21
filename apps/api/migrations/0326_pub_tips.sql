-- 0326_pub_tips.sql: tipovačka v hospodě (2026-11-21).
--
-- Kolo = jeden den ligových zápasů seniorských soutěží okresu. Lidské kluby okresu tipují
-- výsledky na lístku v Hospodě do výkopu, s prvním tipem kola se strhne vklad. Po kole se
-- body sečtou (3 přesný výsledek, 1 tendence) a bank si rozdělí nejlepší.
CREATE TABLE IF NOT EXISTS pub_tip_rounds (
  id             TEXT PRIMARY KEY,
  district       TEXT NOT NULL,
  round_date     TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  stake          INTEGER NOT NULL,
  -- open | settling | settled
  status         TEXT NOT NULL DEFAULT 'open',
  settled_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_tip_rounds_day ON pub_tip_rounds (district, round_date);
CREATE INDEX IF NOT EXISTS idx_pub_tip_rounds_status ON pub_tip_rounds (status, round_date);

-- Účast klubu v kole: vklad, součet bodů a výhra po vyhodnocení.
CREATE TABLE IF NOT EXISTS pub_tip_entries (
  round_id   TEXT NOT NULL,
  team_id    TEXT NOT NULL,
  points     INTEGER,
  payout     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (round_id, team_id)
);

CREATE TABLE IF NOT EXISTS pub_tips (
  round_id   TEXT NOT NULL,
  team_id    TEXT NOT NULL,
  match_id   TEXT NOT NULL,
  home       INTEGER NOT NULL,
  away       INTEGER NOT NULL,
  points     INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (round_id, team_id, match_id)
);
