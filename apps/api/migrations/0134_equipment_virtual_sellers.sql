-- 0134: Virtuální prodejci v bazaru vybavení.
--
-- Bazar se plnil jen z AI klubů ve vlastní lize. V lize, kde jsou všichni manažeři
-- lidi (třeba Okresní přebor Prachatice — 14 týmů, 14 lidí), tak nevzniklo nic.
--
-- Řešení stejné jako u přestupů: virtuální klub ze sousedního okresu. Tam se inzerát
-- zakládá s team_id = 'virtual_ai' (transfer_listings nemá na team_id cizí klíč),
-- tady ale klíč je, takže team_id musí umět NULL. To v SQLite nejde přes ALTER,
-- proto přestavba tabulky.
--
-- POZOR: na remote aplikovat ručně:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0134_equipment_virtual_sellers.sql

CREATE TABLE equipment_listings_new (
  id                   TEXT PRIMARY KEY,
  -- NULL = virtuální prodejce z jiného okresu, jméno je v seller_name.
  team_id              TEXT REFERENCES teams(id) ON DELETE CASCADE,
  league_id            TEXT NOT NULL,
  category             TEXT NOT NULL,
  level                INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
  condition_at_listing INTEGER NOT NULL,
  price                INTEGER NOT NULL CHECK(price > 0),
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active','sold','pawned','withdrawn','expired')),
  buyer_team_id        TEXT REFERENCES teams(id) ON DELETE SET NULL,
  sold_price           INTEGER,
  sold_condition       INTEGER,
  expires_at           TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at          TEXT,
  is_ai_listing        INTEGER NOT NULL DEFAULT 0,
  seller_name          TEXT
);

INSERT INTO equipment_listings_new
  (id, team_id, league_id, category, level, condition_at_listing, price, status,
   buyer_team_id, sold_price, sold_condition, expires_at, created_at, resolved_at)
SELECT id, team_id, league_id, category, level, condition_at_listing, price, status,
       buyer_team_id, sold_price, sold_condition, expires_at, created_at, resolved_at
  FROM equipment_listings;

DROP TABLE equipment_listings;
ALTER TABLE equipment_listings_new RENAME TO equipment_listings;

CREATE INDEX IF NOT EXISTS idx_eqlist_league_status ON equipment_listings(league_id, status);
CREATE INDEX IF NOT EXISTS idx_eqlist_team          ON equipment_listings(team_id, status);
CREATE INDEX IF NOT EXISTS idx_eqlist_expiry        ON equipment_listings(status, expires_at);

-- Partial unique drží jen pro reálné kluby. U virtuálních je team_id NULL a NULL se
-- v SQLite unique indexu chová jako odlišná hodnota, takže jich může běžet víc.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eqlist_one_active
  ON equipment_listings(team_id, category) WHERE status = 'active';
