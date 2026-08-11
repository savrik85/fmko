-- 0135: Vybavení v4 — pračka, sekačka, kávovar.
--
-- Tři kusy, které se zapojují do smyček, co v daily-ticku a hospodě už běží:
--   laundry      — zpomaluje chátrání VŠEHO ostatního vybavení (jediný meta-upgrade)
--   mower        — drží trávník, na který dnes má páku jen správce hřiště
--   coffee_maker — snižuje šanci na ranní kocovinu po posezení v hospodě
--
-- POZOR: na remote aplikovat ručně, ne přes `migrations apply`:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0135_equipment_v4.sql
-- ALTER TABLE ADD COLUMN nezná IF NOT EXISTS — při opakovaném běhu je „duplicate column" v pořádku.

ALTER TABLE equipment ADD COLUMN laundry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN laundry_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN mower INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN mower_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN coffee_maker INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN coffee_maker_condition INTEGER NOT NULL DEFAULT 50;
