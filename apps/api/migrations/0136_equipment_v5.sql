-- 0136: Vybavení v5 — iontové nápoje, tombola, ozvučení, kronika.
--
--   sports_drinks — tlumí propad kondice po 70. minutě (dosud stejný pro všechny)
--   raffle        — příjem z každého diváka na domácím zápase (první vybavení, co vydělává)
--   pa_system     — zvedá spokojenost fanoušků, která násobí návštěvnost
--   trophy_case   — tlumí růst trucu hráčů po odmítnuté nabídce
--
-- POZOR: na remote aplikovat ručně, ne přes `migrations apply`:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0136_equipment_v5.sql
-- ALTER TABLE ADD COLUMN nezná IF NOT EXISTS — při opakovaném běhu je „duplicate column" v pořádku.

ALTER TABLE equipment ADD COLUMN sports_drinks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN sports_drinks_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN raffle INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN raffle_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN pa_system INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN pa_system_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN trophy_case INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN trophy_case_condition INTEGER NOT NULL DEFAULT 50;
