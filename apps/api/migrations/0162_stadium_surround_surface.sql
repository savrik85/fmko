-- Migrace 0162: Povrch areálu a výběhové zóny stadionu
ALTER TABLE stadiums ADD COLUMN surround_surface TEXT NOT NULL DEFAULT 'grass';
