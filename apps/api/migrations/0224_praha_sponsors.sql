-- 0224: Další firmy do okresu Praha, aby si srovnatelného hlavního sponzora vybral každý ze 14 klubů
-- (dosud jen 11 firem s rozpočtem 6 000 a víc). Skutečné firmy se sídlem v Praze, jednoslovné názvy
-- kvůli délce názvu klubu. Idempotentní. Majitele hra založí sama při prvním zobrazení.
-- Aplikovat ručně: npx wrangler d1 execute <db> --remote --file apps/api/migrations/0224_praha_sponsors.sql

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'Seznam', 'it', 6000, 9500, 800, 1400
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'Seznam');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'ČEZ', 'company', 6000, 9500, 800, 1400
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'ČEZ');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'O2', 'services', 5500, 9000, 750, 1300
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'O2');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'Kooperativa', 'services', 5000, 8500, 700, 1250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'Kooperativa');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'Zásilkovna', 'ecommerce', 5000, 8000, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'Zásilkovna');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'Livesport', 'it', 5000, 8000, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'Livesport');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'Heureka', 'ecommerce', 4500, 7500, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'Heureka');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Praha', 'Mall', 'ecommerce', 4500, 7500, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Praha' AND name = 'Mall');
