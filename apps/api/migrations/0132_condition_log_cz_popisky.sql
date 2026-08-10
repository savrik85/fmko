-- 0132: České názvy typů tréninku v záznamu o kondici.
--
-- daily-tick zapisoval `Trénink: ${todayTrainingType}` s holým anglickým klíčem,
-- takže hráč v detailu viděl „Trénink: tactics". Writer je opravený, tenhle skript
-- dorovná už zapsané řádky (condition_log má retenci 60 dní, takže je to jednorázové).
--
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0132_condition_log_cz_popisky.sql

UPDATE condition_log SET description = REPLACE(description, 'Trénink: conditioning', 'Trénink: Kondice')
  WHERE source = 'training' AND description LIKE 'Trénink: conditioning%';
UPDATE condition_log SET description = REPLACE(description, 'Trénink: technique', 'Trénink: Technika')
  WHERE source = 'training' AND description LIKE 'Trénink: technique%';
UPDATE condition_log SET description = REPLACE(description, 'Trénink: tactics', 'Trénink: Taktika')
  WHERE source = 'training' AND description LIKE 'Trénink: tactics%';
UPDATE condition_log SET description = REPLACE(description, 'Trénink: match_practice', 'Trénink: Zápasová praxe')
  WHERE source = 'training' AND description LIKE 'Trénink: match_practice%';
