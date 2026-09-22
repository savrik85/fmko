-- 0213: Trenérské licence (Bez licence, C, UEFA B, UEFA A, UEFA Pro).
--
-- Licence určuje strop vlastností trenéra (60 / 70 / 80 / 90 / 99), odemyká pokročilé
-- kurzy a lepší zaměstnance a soutěž si může odhlasovat minimální licenci.
-- Dnešním trenérům se licence odvodí z nejvyšší vlastnosti, aby nikdo o nic nepřišel
-- (licence_source = 'derived', „uznaná praxe").
--
-- Aplikovat MANUÁLNĚ a PŘED nasazením kódu fáze 3: competition_rules se čte přes
-- SELECT sloupců z DEFAULT_RULES a bez nového sloupce by spadlo načtení pravidel soutěže.
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0213_coach_licence.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou.

ALTER TABLE managers ADD COLUMN licence_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE managers ADD COLUMN licence_source TEXT NOT NULL DEFAULT 'derived';
ALTER TABLE managers ADD COLUMN licence_obtained_at TEXT;

UPDATE managers SET licence_level = CASE
  WHEN MAX(coaching, motivation, tactics, youth_development, discipline) <= 60 THEN 0
  WHEN MAX(coaching, motivation, tactics, youth_development, discipline) <= 70 THEN 1
  WHEN MAX(coaching, motivation, tactics, youth_development, discipline) <= 80 THEN 2
  WHEN MAX(coaching, motivation, tactics, youth_development, discipline) <= 90 THEN 3
  ELSE 4
END;

ALTER TABLE competition_rules ADD COLUMN min_coach_licence INTEGER NOT NULL DEFAULT 0;
