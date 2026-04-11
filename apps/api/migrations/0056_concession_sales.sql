-- Detailní historie prodejů občerstvení per zápas per produkt
CREATE TABLE IF NOT EXISTS concession_match_sales (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT,
  gamedate TEXT NOT NULL,
  product_key TEXT NOT NULL,           -- sausage, beer, lemonade
  quality_level INTEGER NOT NULL,
  sell_price INTEGER NOT NULL,
  wholesale_price INTEGER NOT NULL,
  sold_count INTEGER NOT NULL,
  revenue INTEGER NOT NULL,
  profit INTEGER NOT NULL,
  stockout INTEGER NOT NULL DEFAULT 0, -- 1 = prázdný sklad (prodalo se vše)
  attendance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_concession_sales_team ON concession_match_sales(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concession_sales_match ON concession_match_sales(match_id);
