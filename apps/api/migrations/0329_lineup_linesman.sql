-- 0329: Domácí pomezní s praporkem (F15).
--
-- Domácí klub smí na svůj zápas postavit vlastního pomezního: hráče, který nehraje
-- (třeba zraněného), nebo vůdce kotle. JSON {kind: 'player'|'fan_leader', id, style: 'fair'|'homer'}.
-- NULL = bez domácího pomezního, zápas běží jako dřív. Vzor je `hardness` (0144).
--
-- CHECK záměrně není (SQLite ho na ADD COLUMN nepřidá); tvar hlídá API
-- (`referees/linesman.ts`, `parseLinesman`) a nečitelná hodnota znamená „bez pomezního".
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0329_lineup_linesman.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní, spouštět jen jednou.

ALTER TABLE lineups        ADD COLUMN linesman TEXT;
ALTER TABLE lineup_presets ADD COLUMN linesman TEXT;
