-- Add season_start and season_end to teams for day tracking
ALTER TABLE teams ADD COLUMN season_start TEXT;
ALTER TABLE teams ADD COLUMN season_end TEXT;
