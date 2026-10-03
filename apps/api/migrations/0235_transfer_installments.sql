-- Přestup na splátky a procenta z příštího přestupu (spec 2026-10-03).
-- Podmínky aktuálního návrhu v nabídce a v každém kroku vyjednávání; staré řádky = jednorázově.
ALTER TABLE transfer_offers ADD COLUMN upfront_pct INTEGER NOT NULL DEFAULT 100;
ALTER TABLE transfer_offers ADD COLUMN installments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transfer_offers ADD COLUMN sell_on_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transfer_offer_events ADD COLUMN upfront_pct INTEGER;
ALTER TABLE transfer_offer_events ADD COLUMN installments INTEGER;
ALTER TABLE transfer_offer_events ADD COLUMN sell_on_pct INTEGER;
-- Splátková dohoda. Bez FK na players: odchod hráče řádek hráče maže (removePlayer).
CREATE TABLE IF NOT EXISTS transfer_installments (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  buyer_team_id TEXT NOT NULL,
  seller_team_id TEXT NOT NULL,
  -- Jméno cizího klubu z trhu (seller_team_id = 'cpu'), u lidských klubů NULL.
  seller_name TEXT,
  total_amount INTEGER NOT NULL,
  upfront_amount INTEGER NOT NULL,
  installment_amount INTEGER NOT NULL,
  installments_total INTEGER NOT NULL,
  installments_paid INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','settled')),
  created_game_date TEXT,
  -- Herní den poslední splátky: dva běhy téhož pondělí nesmí strhnout dvě splátky.
  last_paid_game_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_transfer_installments_buyer ON transfer_installments(buyer_team_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_installments_seller ON transfer_installments(seller_team_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_installments_player ON transfer_installments(player_id, status);
-- Procenta z příštího přestupu: platí pro nejbližší prodej hráče jeho dnešním majitelem.
CREATE TABLE IF NOT EXISTS sell_on_clauses (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  beneficiary_team_id TEXT NOT NULL,
  owner_team_id TEXT NOT NULL,
  pct INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','lapsed')),
  paid_amount INTEGER,
  paid_offer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sell_on_owner ON sell_on_clauses(owner_team_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_on_beneficiary ON sell_on_clauses(beneficiary_team_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_on_player ON sell_on_clauses(player_id, status);
