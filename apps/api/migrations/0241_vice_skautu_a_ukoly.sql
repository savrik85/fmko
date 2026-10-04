-- Více skautů a aktivní úkoly (hráčský a zápasový skauting).
--
-- Každý skaut smí mít nejvýše 1 aktivní úkol (dříve mohl mít jen 1 úkol celý klub).
DROP INDEX IF EXISTS idx_scout_assignments_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_assignments_staff_active ON scout_assignments(staff_id) WHERE status = 'active';

ALTER TABLE scout_assignments ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'area';
ALTER TABLE scout_assignments ADD COLUMN target_player_id TEXT;
ALTER TABLE scout_assignments ADD COLUMN target_team_id TEXT;
ALTER TABLE scout_assignments ADD COLUMN target_match_id TEXT;
ALTER TABLE scout_assignments ADD COLUMN result_data TEXT;
