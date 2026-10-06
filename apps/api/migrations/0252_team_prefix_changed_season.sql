-- 0252_team_prefix_changed_season.sql: klub si může změnit zkratku názvu (FK, SK, AC…)
-- jednou za sezónu. Sloupec drží číslo sezóny poslední změny (NULL = ještě neměnil).
ALTER TABLE teams ADD COLUMN prefix_changed_season INTEGER;
