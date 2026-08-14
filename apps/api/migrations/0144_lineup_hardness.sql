-- 0144: Tvrdost hry — třetí taktická osa vedle formace a taktiky.
--
-- 'fair' | 'normal' | 'hard'. Existující řádky dostanou 'normal', což znamená
-- beze změny chování — konstantní DEFAULT umí SQLite doplnit i při ADD COLUMN,
-- takže backfill není potřeba.
--
-- CHECK constraint tu záměrně není: SQLite ho na ADD COLUMN bez rebuildu tabulky
-- nepřidá a whitelist stejně řešíme v API (jako u VALID_TACTICS). Engine má navíc
-- fallback HARDNESS_MODS[x] ?? HARDNESS_MODS.normal.
--
-- Sloupec se jmenuje `hardness`, ne `aggression` — to by kolidovalo s atributem
-- hráče stejného jména a v enginu by se to pletlo.
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0144_lineup_hardness.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou.

ALTER TABLE lineups        ADD COLUMN hardness TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE lineup_presets ADD COLUMN hardness TEXT NOT NULL DEFAULT 'normal';
