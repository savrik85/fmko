-- 0243_scout_league_target.sql
-- Přidání target_league_id do scout_assignments pro skautování U21 ligy a A-ligy.
ALTER TABLE scout_assignments ADD COLUMN target_league_id TEXT;
