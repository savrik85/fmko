-- Rozbité vybavení stadionu po výtržnosti
--
-- Dosud „poškození zařízení" jen strhlo pár tisíc z rozpočtu a tím to skončilo:
-- sociálky, které někdo vykopl, fungovaly dál. Teď se zařízení opravdu srazí
-- o úroveň a dokud ho klub neopraví, nefunguje.
--
-- Úroveň se sráží PŘÍMO ve `stadiums`, ne přes odvozený sloupec. Zařízení čte
-- deset různých míst (návštěvnost, tržby, riziko výtržností, 3D scéna) a každé
-- by muselo o poškození vědět zvlášť. Takhle o něm nemusí vědět ani jedno.
-- Co se má vrátit při opravě, si pamatuje tahle tabulka.

CREATE TABLE IF NOT EXISTS stadium_damage (
  id           TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL,
  -- Klíč zařízení ze `stadium-generator.ts` (toilets, stands, fence, …).
  facility     TEXT NOT NULL,
  -- O kolik úrovní se srazilo. Oprava vrátí přesně tolik.
  levels       INTEGER NOT NULL DEFAULT 1,
  repair_cost  INTEGER NOT NULL DEFAULT 0,
  -- Z jaké výtržnosti to vzešlo — kvůli dohledání a idempotenci.
  incident_id  TEXT,
  popis        TEXT NOT NULL DEFAULT '',
  game_date    TEXT,
  repaired_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Jedna výtržnost rozbije jednu věc jednou, i když se zápas přepočítá.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stadium_damage_incident
  ON stadium_damage(incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stadium_damage_team
  ON stadium_damage(team_id, repaired_at);
