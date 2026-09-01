-- 0179: Pokyny na lavičce — přednastavené scénáře zápasu.
--
-- JSON pole pravidel „podmínka → akce" (max 5), které engine vyhodnocuje
-- v minutové smyčce: změna taktiky, změna tvrdosti hry, konkrétní střídání.
-- Tvar pravidla je v packages/shared/src/types/match-plan.ts.
--
-- Prázdné pole = beze změny chování, takže existující řádky nepotřebují backfill —
-- konstantní DEFAULT umí SQLite doplnit i při ADD COLUMN.
--
-- Sloupec je na obou tabulkách, protože plán patří k sestavě: preset A/B/C si ho
-- nese s sebou a při uložení sestavy na konkrétní zápas se propíše do lineups.
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0179_pokyny_na_lavicce.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou.

ALTER TABLE lineups        ADD COLUMN match_plan TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lineup_presets ADD COLUMN match_plan TEXT NOT NULL DEFAULT '[]';
