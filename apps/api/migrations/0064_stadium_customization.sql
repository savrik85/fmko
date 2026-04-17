-- Stadium customization: barvy + scoreboard + vlajka (vše vizuální)
-- NULL barva = použij default (team color nebo přednastavenou)

ALTER TABLE stadiums ADD COLUMN fence_color TEXT;
ALTER TABLE stadiums ADD COLUMN stand_color TEXT;
ALTER TABLE stadiums ADD COLUMN seat_color TEXT;
ALTER TABLE stadiums ADD COLUMN roof_color TEXT;
ALTER TABLE stadiums ADD COLUMN accent_color TEXT;

-- Scoreboard: 0=žádný, 1=dřevěná tabule (2k), 2=LED jednobarevná (8k), 3=full color LED (25k)
ALTER TABLE stadiums ADD COLUMN scoreboard_level INTEGER NOT NULL DEFAULT 0;

-- Vlajka týmu před vchodem: 0=žádná, 1=malá 3m (1.5k), 2=střední 5m (5k), 3=velká 8m (15k)
ALTER TABLE stadiums ADD COLUMN flag_size INTEGER NOT NULL DEFAULT 0;