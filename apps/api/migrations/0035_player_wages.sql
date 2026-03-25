-- Player weekly wages (cestovné + odměna za zápas)
ALTER TABLE players ADD COLUMN weekly_wage INTEGER NOT NULL DEFAULT 0;

-- Backfill wages based on overall_rating: 10 + (rating/100) * 400
UPDATE players SET weekly_wage = ROUND(10 + (overall_rating / 100.0) * 400);
