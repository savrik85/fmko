-- Backfill formation_familiarity z historie odehraných zápasů.
-- Pro každý tým agregace lineup→matches: COUNT zápasů per formace,
-- mapováno na sehranost MAX(15, MIN(100, count*3)). Floor 15 = každý tým má aspoň základní povědomí.
--
-- Týmy bez historie dostanou default {"4-4-2": 15}.
-- Idempotentní — lze spustit opakovaně.
--
-- TEST:    npx wrangler d1 execute prales-db-test --remote --file apps/api/scripts/backfill-formation-chemistry.sql
-- PROD:    npx wrangler d1 execute prales-db-prod --remote --file apps/api/scripts/backfill-formation-chemistry.sql

UPDATE teams
SET formation_familiarity = (
  SELECT
    CASE WHEN COUNT(*) > 0 THEN json_group_object(f, fam) ELSE '{"4-4-2":15}' END
  FROM (
    SELECT l.formation AS f, MAX(15, MIN(100, COUNT(*) * 3)) AS fam
    FROM matches m
    JOIN lineups l ON l.id = m.home_lineup_id OR l.id = m.away_lineup_id
    WHERE m.status = 'simulated' AND l.team_id = teams.id AND l.formation IS NOT NULL
    GROUP BY l.formation
  )
);
