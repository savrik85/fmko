-- Upgrade cooldowns pro equipment a stadiums
ALTER TABLE equipment ADD COLUMN upgrade_category TEXT;
ALTER TABLE equipment ADD COLUMN upgrade_completes_at TEXT;
ALTER TABLE stadiums ADD COLUMN upgrade_facility TEXT;
ALTER TABLE stadiums ADD COLUMN upgrade_completes_at TEXT;
