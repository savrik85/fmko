-- IV. třída okresu a obec zamčená pro nové kluby (2026-11-16).
--
-- 1) `leagues.level` má pevný výčet v CHECK a ten jde v SQLite změnit jen přestavbou tabulky.
--    Na `leagues` míří cizí klíč jen z `league_history` a z ní samotné (`parent_league_id`),
--    oba bez ON DELETE akce. Aby DROP nenarazil na cizí klíče (odložená kontrola si smazané
--    rodiče pamatuje a commit by spadl, vyzkoušeno na kopii produkce), obě vazby se na dobu
--    přestavby odloží stranou a po přejmenování vrátí.
PRAGMA defer_foreign_keys = on;

CREATE TABLE leagues_new (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  district TEXT NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'okresni_prebor' CHECK(level IN ('iv_trida','okresni_soutez','okresni_prebor','ib_trida','ia_trida','krajsky_prebor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','finished')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  league_type TEXT NOT NULL DEFAULT 'senior' CHECK(league_type IN ('senior','u21')),
  parent_league_id TEXT REFERENCES leagues(id),
  promotion_enabled INTEGER NOT NULL DEFAULT 1,
  match_weekdays TEXT,
  UNIQUE(season_id, district, level)
);

INSERT INTO leagues_new (id, season_id, district, name, level, status, created_at, league_type, parent_league_id, promotion_enabled, match_weekdays)
SELECT id, season_id, district, name, level, status, created_at, league_type, NULL, promotion_enabled, match_weekdays FROM leagues;

CREATE TABLE leagues_parent_keep AS SELECT id, parent_league_id FROM leagues WHERE parent_league_id IS NOT NULL;
UPDATE leagues SET parent_league_id = NULL WHERE parent_league_id IS NOT NULL;
CREATE TABLE league_history_keep AS SELECT * FROM league_history;
DELETE FROM league_history;

DROP TABLE leagues;
ALTER TABLE leagues_new RENAME TO leagues;

UPDATE leagues SET parent_league_id = (SELECT k.parent_league_id FROM leagues_parent_keep k WHERE k.id = leagues.id)
 WHERE id IN (SELECT id FROM leagues_parent_keep);
INSERT INTO league_history SELECT * FROM league_history_keep;
DROP TABLE leagues_parent_keep;
DROP TABLE league_history_keep;

CREATE INDEX idx_leagues_season ON leagues(season_id);
CREATE INDEX idx_leagues_district ON leagues(district);
CREATE INDEX idx_leagues_parent ON leagues(parent_league_id);

-- 2) Obec, kde už nejde založit nový klub (Vlachovo Březí má sedm lidských klubů).
ALTER TABLE villages ADD COLUMN registration_locked INTEGER NOT NULL DEFAULT 0;
UPDATE villages SET registration_locked = 1 WHERE district = 'Prachatice' AND name = 'Vlachovo Březí';
