-- Fanoušci jako samostatná entita + management občerstvení
-- - fans: satisfaction + loyalty + expected_performance + base_ticket_price override
-- - stadiums.concession_mode: 'external' (pasivní příjem) | 'self' (vlastní sklad)
-- - concession_products: sklad produktů (klobása, pivo, limonáda) pro self mode

ALTER TABLE stadiums ADD COLUMN concession_mode TEXT NOT NULL DEFAULT 'external'
  CHECK(concession_mode IN ('external','self'));

CREATE TABLE IF NOT EXISTS fans (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL UNIQUE REFERENCES teams(id),
  satisfaction INTEGER NOT NULL DEFAULT 50,           -- 0-100 hlavní skalár, čte se hot path
  loyalty INTEGER NOT NULL DEFAULT 50,                -- 0-100 pomalý baseline k němuž satisfaction driftuje
  expected_performance INTEGER NOT NULL DEFAULT 50,   -- 0-100 referenční očekávání pro vyhodnocení zápasu
  base_ticket_price INTEGER NOT NULL DEFAULT 0,       -- 0 = použít village default; > 0 = user override
  last_match_delta INTEGER NOT NULL DEFAULT 0,        -- poslední match delta (pro UI/news)
  last_match_reasons TEXT,                            -- JSON array reasons pro news/UI
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fans_team ON fans(team_id);

CREATE TABLE IF NOT EXISTS concession_products (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  product_key TEXT NOT NULL,                          -- 'sausage','beer','lemonade'
  quality_level INTEGER NOT NULL DEFAULT 1,           -- 0-3 (0 = nenabízí se)
  sell_price INTEGER NOT NULL DEFAULT 0,              -- Kč prodejní cena
  stock_quantity INTEGER NOT NULL DEFAULT 0,          -- ks na skladě
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, product_key)
);
CREATE INDEX IF NOT EXISTS idx_concession_products_team ON concession_products(team_id);
