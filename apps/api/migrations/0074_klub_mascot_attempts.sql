-- Klub: mascot_attempts_used counter (stejne jako anthem) - mazani historie NEvrací pokus
ALTER TABLE teams ADD COLUMN mascot_attempts_used INTEGER DEFAULT 0;
-- Backfill z existujici historie
UPDATE teams SET mascot_attempts_used = (SELECT COUNT(*) FROM team_mascots WHERE team_mascots.team_id = teams.id);
