-- 0133: Bazar vybavení a zastavárna.
--
-- Vybavení bylo dosud jednosměrka — koupíš level, opotřebí se, opravíš, koupíš vyšší.
-- Zbavit se ho nešlo. Teď jsou dvě cesty ven: inzerát v bazaru pro kluby ze stejné
-- ligy, nebo okamžitý výkup v zastavárně za nejméně výhodnou cenu. Co jde do
-- zastavárny, mizí ze hry; co jde do bazaru, mění majitele i se svým opotřebením.
--
-- POZOR: na remote aplikovat ručně, ne přes `migrations apply`:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0133_equipment_market.sql

CREATE TABLE IF NOT EXISTS equipment_listings (
  id                   TEXT PRIMARY KEY,
  team_id              TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_id            TEXT NOT NULL,
  -- Kategorie ZÁMĚRNĚ bez CHECK: whitelist drží CATEGORIES v equipment-generator.ts.
  -- CHECK by při přidání kategorie vynutil rebuild tabulky (viz bolest s notifications.type).
  category             TEXT NOT NULL,
  level                INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
  -- Snapshot pro historii a pro cenu. Živý stav se čte z equipment — prodávající
  -- vybavení používá dál, dokud se neprodá, takže mu mezitím chátrá.
  condition_at_listing INTEGER NOT NULL,
  price                INTEGER NOT NULL CHECK(price > 0),
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK(status IN ('active','sold','pawned','withdrawn','expired')),
  buyer_team_id        TEXT REFERENCES teams(id) ON DELETE SET NULL,
  sold_price           INTEGER,
  sold_condition       INTEGER,   -- stav, který kupující reálně dostal
  expires_at           TEXT,      -- NULL u řádků 'pawned' — ty nikdy nebyly aktivní
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_eqlist_league_status ON equipment_listings(league_id, status);
CREATE INDEX IF NOT EXISTS idx_eqlist_team          ON equipment_listings(team_id, status);
CREATE INDEX IF NOT EXISTS idx_eqlist_expiry        ON equipment_listings(status, expires_at);

-- Tvrdá pojistka proti dvojímu vystavení téže kategorie — chytne i souběh a dvojklik,
-- na které by aplikační kontrola „už je vystaveno" nestačila.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eqlist_one_active
  ON equipment_listings(team_id, category) WHERE status = 'active';
