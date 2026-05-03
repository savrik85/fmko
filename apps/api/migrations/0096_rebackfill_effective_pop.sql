-- Re-backfill team_fanbase s effective populace (diminishing returns).
-- Velká města (Praha 8000+) měla nereálně vysoký počet stálých — teď cap na realistic 100-300.
-- Aplikuje se POUZE na pasivní týmy (žádný progress) aby se nesnížil pokrok hráčů.
--
-- Effective populace formula:
--   ≤ 300:        full pop (lineární)
--   300-1500:     300 + (pop-300) × 0.7
--   1500-5000:    300 + 840 + (pop-1500) × 0.35
--   > 5000:       300 + 840 + 1225 + (pop-5000) × 0.15

UPDATE team_fanbase
SET hardcore_count = (
      SELECT CAST(
        CASE
          WHEN v.population <= 300 THEN v.population
          WHEN v.population <= 1500 THEN 300 + (v.population - 300) * 0.7
          WHEN v.population <= 5000 THEN 300 + 840 + (v.population - 1500) * 0.35
          ELSE 300 + 840 + 1225 + (v.population - 5000) * 0.15
        END * 0.010 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    ),
    regular_count = (
      SELECT CAST(
        CASE
          WHEN v.population <= 300 THEN v.population
          WHEN v.population <= 1500 THEN 300 + (v.population - 300) * 0.7
          WHEN v.population <= 5000 THEN 300 + 840 + (v.population - 1500) * 0.35
          ELSE 300 + 840 + 1225 + (v.population - 5000) * 0.15
        END * 0.040 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    ),
    casual_count = (
      SELECT CAST(
        CASE
          WHEN v.population <= 300 THEN v.population
          WHEN v.population <= 1500 THEN 300 + (v.population - 300) * 0.7
          WHEN v.population <= 5000 THEN 300 + 840 + (v.population - 1500) * 0.35
          ELSE 300 + 840 + 1225 + (v.population - 5000) * 0.15
        END * 0.070 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    )
WHERE casual_to_regular_streak = 0
  AND regular_to_hardcore_streak = 0
  AND promo_consecutive_matches = 0
  AND promo_unpromoted_streak = 0
  AND (promo_casual_count IS NULL OR promo_casual_count = 0);
