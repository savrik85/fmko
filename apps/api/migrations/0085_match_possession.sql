-- Persist drženi mice (possession) v zápase pro pozápasové stats.
-- Hodnota 0-100, hosté = 100 - possession_home. NULL pro staré zápasy.
ALTER TABLE matches ADD COLUMN possession_home INTEGER;
