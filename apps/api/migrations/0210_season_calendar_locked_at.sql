-- 0210: Kdy se kolo zamklo.
--
-- recoverStuckRounds podle toho pozná, jestli kolo v 'lineup_locked' pořád hraje
-- konzumer (čerstvý zámek), nebo jestli simulace spadla (zámek starší než 15 minut).
-- Bez toho recovery z cronu 16:05 brala kolo zamčené v 16:00, které se ještě hrálo,
-- a zápasy se odsimulovaly dvakrát i s financemi (incident 2026-09-21).
--
-- NULL = kolo zamčené před touhle migrací, recovery ho bere jako staré.
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`) a PŘED nasazením kódu,
-- který sloupec zapisuje — jinak zámek kola spadne na neznámém sloupci a žádné kolo
-- se neodehraje:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0210_season_calendar_locked_at.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou.

ALTER TABLE season_calendar ADD COLUMN locked_at TEXT;
