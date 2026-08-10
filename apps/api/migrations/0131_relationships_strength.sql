-- 0131: Síla vztahů (strength) — dorovnání existujících záznamů.
--
-- INSERTy vztahů sloupec strength vynechávaly, takže všechny záznamy padly na DB
-- default 50 a pečlivě navržené rozsahy generátoru (bratři 70–95, rivalové 20–50…)
-- byly mrtvé. Kód je opraven (teams.ts, insert-ai-teams.ts); tento skript dorovná
-- existující řádky náhodnou hodnotou ve stejném rozsahu, jaký používá generátor
-- (generators/relationships.ts). Dotkne se jen řádků s defaultem 50.
--
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0131_relationships_strength.sql
-- PROD: nejdřív záloha + výslovný souhlas.

UPDATE relationships SET strength = CASE type
  WHEN 'brothers'         THEN 70 + abs(random()) % 26   -- 70–95
  WHEN 'father_son'       THEN 60 + abs(random()) % 31   -- 60–90
  WHEN 'in_laws'          THEN 40 + abs(random()) % 31   -- 40–70
  WHEN 'classmates'       THEN 30 + abs(random()) % 31   -- 30–60
  WHEN 'coworkers'        THEN 20 + abs(random()) % 31   -- 20–50
  WHEN 'drinking_buddies' THEN 35 + abs(random()) % 31   -- 35–65
  WHEN 'mentor_pupil'     THEN 40 + abs(random()) % 31   -- 40–70
  WHEN 'rivals'           THEN 20 + abs(random()) % 31   -- 20–50
  WHEN 'neighbors'        THEN 35 + abs(random()) % 26   -- 35–60
  ELSE strength END
WHERE strength = 50;
