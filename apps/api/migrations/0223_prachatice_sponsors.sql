-- 0223: Další místní firmy do okresu Prachatice, aby si hlavního sponzora mohl vybrat každý
-- ze 14 klubů (dosud jen 16 firem na úrovni hlavního sponzora). Skutečné firmy z okresu.
-- Idempotentní: firmu přidá jen jednou. Majitele firmám hra založí sama při prvním zobrazení.
-- Aplikovat ručně: npx wrangler d1 execute <db> --remote --file apps/api/migrations/0223_prachatice_sponsors.sql

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Greenwatt', 'electro', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Greenwatt');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Rotadent', 'industry', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Rotadent');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Strojírna Vimperk', 'industry', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Strojírna Vimperk');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Lesotrans', 'woodwork', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Lesotrans');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'FORPSI', 'it', 5500, 9000, 700, 1250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'FORPSI');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'STS Prachatice', 'industry', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'STS Prachatice');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'GRW', 'industry', 4500, 7400, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'GRW');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Inticom', 'electro', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Inticom');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Prima Agri', 'farm', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Prima Agri');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Prachatice', 'Resort Markéta', 'hospitality', 1500, 4000, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Prachatice' AND name = 'Resort Markéta');
