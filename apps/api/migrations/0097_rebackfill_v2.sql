-- Re-backfill v2 — silnější diminishing pro velká města (Praha čtvrti).
-- Realistický český okresní klub má 100-400 diváků bez ohledu na velikost čtvrti.
--
-- Effective populace formula:
--   ≤ 300:        pop
--   300-1000:     300 + (pop-300) × 0.6
--   1000-3000:    300 + 420 + (pop-1000) × 0.25
--   > 3000:       300 + 420 + 500 + (pop-3000) × 0.05

UPDATE team_fanbase
SET hardcore_count = (
      SELECT CAST(
        CASE
          WHEN v.population <= 300 THEN v.population
          WHEN v.population <= 1000 THEN 300 + (v.population - 300) * 0.6
          WHEN v.population <= 3000 THEN 300 + 420 + (v.population - 1000) * 0.25
          ELSE 300 + 420 + 500 + (v.population - 3000) * 0.05
        END * 0.010 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    ),
    regular_count = (
      SELECT CAST(
        CASE
          WHEN v.population <= 300 THEN v.population
          WHEN v.population <= 1000 THEN 300 + (v.population - 300) * 0.6
          WHEN v.population <= 3000 THEN 300 + 420 + (v.population - 1000) * 0.25
          ELSE 300 + 420 + 500 + (v.population - 3000) * 0.05
        END * 0.040 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    ),
    casual_count = (
      SELECT CAST(
        CASE
          WHEN v.population <= 300 THEN v.population
          WHEN v.population <= 1000 THEN 300 + (v.population - 300) * 0.6
          WHEN v.population <= 3000 THEN 300 + 420 + (v.population - 1000) * 0.25
          ELSE 300 + 420 + 500 + (v.population - 3000) * 0.05
        END * 0.070 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    )
WHERE casual_to_regular_streak = 0
  AND regular_to_hardcore_streak = 0
  AND promo_consecutive_matches = 0
  AND promo_unpromoted_streak = 0
  AND (promo_casual_count IS NULL OR promo_casual_count = 0);
