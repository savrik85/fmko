-- Team customization: jersey pattern, badge, stadium
ALTER TABLE teams ADD COLUMN jersey_pattern TEXT NOT NULL DEFAULT 'solid';
ALTER TABLE teams ADD COLUMN badge_pattern TEXT NOT NULL DEFAULT 'shield';
ALTER TABLE teams ADD COLUMN stadium_name TEXT;
