-- Migrace 0161: Vzory sekání trávníku a customizace sítí v brankách
ALTER TABLE stadiums ADD COLUMN mowing_pattern TEXT NOT NULL DEFAULT 'stripes';
ALTER TABLE stadiums ADD COLUMN net_pattern TEXT NOT NULL DEFAULT 'white';
ALTER TABLE stadiums ADD COLUMN net_style TEXT NOT NULL DEFAULT 'loose';
