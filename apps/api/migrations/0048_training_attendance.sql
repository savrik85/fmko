-- Cumulative training attendance per player (JSON: { playerId: { attended, total } })
ALTER TABLE teams ADD COLUMN training_attendance TEXT DEFAULT '{}';
