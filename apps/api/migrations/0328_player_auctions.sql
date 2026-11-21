-- 0328_player_auctions.sql: dražba hráčů z opuštěných klubů (2026-11-21).
--
-- Když nová registrace přepíše AI klub, nejlepších pět hráčů se nesmaže, ale jde přes
-- volné hráče do dražby na 48 hodin (start 50 % tržní ceny, příhoz aspoň +10 %, příhoz
-- v posledních 10 minutách dražbu prodlouží). Po skončení bere nejvyšší příhoz, kdo má
-- na zaplacení; neprodaný hráč zůstane mezi volnými.
CREATE TABLE IF NOT EXISTS player_auctions (
  id               TEXT PRIMARY KEY,
  free_agent_id    TEXT NOT NULL,
  source_team_id   TEXT NOT NULL,
  source_team_name TEXT NOT NULL,
  district         TEXT NOT NULL,
  player_name      TEXT NOT NULL,
  position         TEXT NOT NULL,
  age              INTEGER NOT NULL,
  start_price      INTEGER NOT NULL,
  current_bid      INTEGER,
  current_team_id  TEXT,
  ends_at          TEXT NOT NULL,
  -- open | closing | sold | unsold
  status           TEXT NOT NULL DEFAULT 'open',
  winner_team_id   TEXT,
  sold_price       INTEGER,
  closed_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_auctions_fa ON player_auctions (free_agent_id);
CREATE INDEX IF NOT EXISTS idx_player_auctions_status ON player_auctions (status, ends_at);

CREATE TABLE IF NOT EXISTS auction_bids (
  id          TEXT PRIMARY KEY,
  auction_id  TEXT NOT NULL,
  team_id     TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids (auction_id, amount);
