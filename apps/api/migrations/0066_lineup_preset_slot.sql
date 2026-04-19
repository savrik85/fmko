-- Per-lineup pamatování si který preset (A/B/C) byl pro daný zápas vybrán.
-- Umožňuje různé sestavy pro různé zápasy v upcoming strip.
ALTER TABLE lineups ADD COLUMN preset_slot TEXT;
