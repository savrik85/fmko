-- Přestupový systém: volní hráči, nabídky, trh, bidy

-- Pool volných hráčů (generovaní + propuštění + odchody)
CREATE TABLE IF NOT EXISTS free_agents (
  id TEXT PRIMARY KEY,
  district TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT,
  age INTEGER NOT NULL,
  position TEXT NOT NULL CHECK(position IN ('GK','DEF','MID','FWD')),
  overall_rating INTEGER NOT NULL DEFAULT 50,
  skills TEXT NOT NULL DEFAULT '{}',
  physical TEXT NOT NULL DEFAULT '{}',
  personality TEXT NOT NULL DEFAULT '{}',
  life_context TEXT NOT NULL DEFAULT '{}',
  avatar TEXT NOT NULL DEFAULT '{}',
  hidden_talent REAL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  weekly_wage INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'generated' CHECK(source IN ('generated','released','quit')),
  released_from_team_id TEXT,
  village_id TEXT,
  rejected_by TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fa_district ON free_agents(district);
CREATE INDEX idx_fa_expires ON free_agents(expires_at);

-- Nabídky mezi lidskými týmy
CREATE TABLE IF NOT EXISTS transfer_offers (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  from_team_id TEXT NOT NULL,
  to_team_id TEXT NOT NULL,
  offer_amount INTEGER NOT NULL,
  counter_amount INTEGER,
  message TEXT,
  reject_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','countered','withdrawn','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX idx_to_from ON transfer_offers(from_team_id, status);
CREATE INDEX idx_to_to ON transfer_offers(to_team_id, status);

-- Hráči na přestupovém trhu
CREATE TABLE IF NOT EXISTS transfer_listings (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  asking_price INTEGER NOT NULL,
  league_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','sold','withdrawn','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tl_league ON transfer_listings(league_id, status);
CREATE INDEX idx_tl_team ON transfer_listings(team_id);

-- Nabídky na hráče na trhu
CREATE TABLE IF NOT EXISTS transfer_bids (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tb_listing ON transfer_bids(listing_id, status);
CREATE INDEX idx_tb_team ON transfer_bids(team_id);

-- Status hráče (active = hraje, quit = odmítá chodit)
ALTER TABLE players ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
