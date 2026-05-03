-- Re-backfill team_fanbase s novými realistickými koeficienty (1%/4%/7% populace).
-- Pouze pro týmy bez aktivního progressu (= žádné konverze ještě neproběhly),
-- aby se nesnížil pokrok hráčů.

UPDATE team_fanbase
SET hardcore_count = (
      SELECT CAST(v.population * 0.010 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    ),
    regular_count = (
      SELECT CAST(v.population * 0.040 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    ),
    casual_count = (
      SELECT CAST(v.population * 0.070 AS INTEGER)
      FROM teams t JOIN villages v ON t.village_id = v.id
      WHERE t.id = team_fanbase.team_id
    )
WHERE casual_to_regular_streak = 0
  AND regular_to_hardcore_streak = 0
  AND promo_consecutive_matches = 0
  AND promo_unpromoted_streak = 0
  AND (promo_casual_count IS NULL OR promo_casual_count = 0);

-- Spůle (Čkyně) reálná populace 62 (ČSÚ 2021), v DB byla 120 jako placeholder.
UPDATE villages SET population = 62 WHERE id = 'p21';
