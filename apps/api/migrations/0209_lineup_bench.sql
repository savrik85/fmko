-- 0209: Lavička, kterou si manažer sestaví sám.
--
-- JSON pole id hráčů (nejvýš 7), kteří pojedou na zápas jako náhradníci.
-- NULL = manažer lavičku nesestavoval a náhradníky vybere automat podle ratingu
-- (dosavadní chování), takže existující řádky nepotřebují backfill.
--
-- Sloupec je na obou tabulkách stejně jako match_plan: preset A/B/C si lavičku
-- nese s sebou a při uložení sestavy na konkrétní zápas se propíše do lineups.
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`) a PŘED nasazením kódu,
-- který sloupec čte — jinak načtení sestavy v match-runneru spadne na neznámém sloupci:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0209_lineup_bench.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou.

ALTER TABLE lineups        ADD COLUMN bench_data TEXT;
ALTER TABLE lineup_presets ADD COLUMN bench_data TEXT;
