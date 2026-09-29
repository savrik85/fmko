-- Okres Český Krumlov: příjmení, sponzoři, doplnění obcí s fotbalovým klubem.
-- Idempotentní (INSERT OR IGNORE / WHERE NOT EXISTS). Aplikovat ručně:
--   npx wrangler d1 execute <db> --remote --file <tento soubor>
-- Zdroj příjmení: https://www.prijmeni.cz/oblast/3302-cesky_krumlov (ženské tvary vynechány)

-- Příjmení dle četnosti (prijmeni.cz, jen mužské tvary, 150 nejčastějších)
INSERT OR IGNORE INTO district_surnames (district, surname, frequency) VALUES
  ('Český Krumlov', 'Novák', 108), ('Český Krumlov', 'Kotlár', 96), ('Český Krumlov', 'Dvořák', 92),
  ('Český Krumlov', 'Novotný', 87), ('Český Krumlov', 'Kučera', 83), ('Český Krumlov', 'Marek', 77),
  ('Český Krumlov', 'Svoboda', 70), ('Český Krumlov', 'Čížek', 67), ('Český Krumlov', 'Procházka', 60),
  ('Český Krumlov', 'Sivák', 59), ('Český Krumlov', 'Dunka', 58), ('Český Krumlov', 'Bartoš', 57),
  ('Český Krumlov', 'Kutlák', 56), ('Český Krumlov', 'Homolka', 56), ('Český Krumlov', 'Kouba', 54),
  ('Český Krumlov', 'Němec', 52), ('Český Krumlov', 'Gondek', 52), ('Český Krumlov', 'Zeman', 51),
  ('Český Krumlov', 'Jakeš', 51), ('Český Krumlov', 'Dušek', 50), ('Český Krumlov', 'Borovka', 50),
  ('Český Krumlov', 'Štindl', 48), ('Český Krumlov', 'Kadlec', 48), ('Český Krumlov', 'Mráz', 47),
  ('Český Krumlov', 'Perník', 45), ('Český Krumlov', 'Švarc', 44), ('Český Krumlov', 'Musil', 44),
  ('Český Krumlov', 'Hrubeš', 44), ('Český Krumlov', 'Urban', 43), ('Český Krumlov', 'Schwarz', 43),
  ('Český Krumlov', 'Veselý', 42), ('Český Krumlov', 'Vávra', 42), ('Český Krumlov', 'Moravec', 42),
  ('Český Krumlov', 'Mikeš', 42), ('Český Krumlov', 'Kříž', 42), ('Český Krumlov', 'Jílek', 42),
  ('Český Krumlov', 'Král', 41), ('Český Krumlov', 'Klimeš', 41), ('Český Krumlov', 'Račák', 40),
  ('Český Krumlov', 'Kolář', 40), ('Český Krumlov', 'Horváth', 40), ('Český Krumlov', 'Anderle', 40),
  ('Český Krumlov', 'Štěpánek', 39), ('Český Krumlov', 'Šimek', 39), ('Český Krumlov', 'Bárta', 39),
  ('Český Krumlov', 'Švec', 38), ('Český Krumlov', 'Šimeček', 38), ('Český Krumlov', 'Janda', 38),
  ('Český Krumlov', 'Domin', 38), ('Český Krumlov', 'Matoušek', 37), ('Český Krumlov', 'Jakubec', 37),
  ('Český Krumlov', 'Fošum', 37), ('Český Krumlov', 'Bürger', 37), ('Český Krumlov', 'Cába', 36),
  ('Český Krumlov', 'Šesták', 35), ('Český Krumlov', 'Stropek', 35), ('Český Krumlov', 'Sojka', 35),
  ('Český Krumlov', 'Poláček', 34), ('Český Krumlov', 'Hrdlička', 34), ('Český Krumlov', 'Hála', 34),
  ('Český Krumlov', 'Gallistl', 34), ('Český Krumlov', 'Beran', 34), ('Český Krumlov', 'Soukup', 33),
  ('Český Krumlov', 'Bauer', 33), ('Český Krumlov', 'Kudláček', 32), ('Český Krumlov', 'Kozák', 32),
  ('Český Krumlov', 'Jungwirth', 32), ('Český Krumlov', 'Benda', 32), ('Český Krumlov', 'Bohdal', 31),
  ('Český Krumlov', 'Smetana', 30), ('Český Krumlov', 'Postl', 30), ('Český Krumlov', 'Maurer', 30),
  ('Český Krumlov', 'Kovář', 30), ('Český Krumlov', 'Černý', 30), ('Český Krumlov', 'Böhm', 30),
  ('Český Krumlov', 'Bednář', 30), ('Český Krumlov', 'Rolník', 29), ('Český Krumlov', 'Pokorný', 29),
  ('Český Krumlov', 'Doležal', 29), ('Český Krumlov', 'Červeňák', 29), ('Český Krumlov', 'Beránek', 29),
  ('Český Krumlov', 'Štěpán', 28), ('Český Krumlov', 'Sládek', 28), ('Český Krumlov', 'Rytíř', 28),
  ('Český Krumlov', 'Hüttner', 28), ('Český Krumlov', 'Opelka', 27), ('Český Krumlov', 'Liška', 27),
  ('Český Krumlov', 'Konečný', 27), ('Český Krumlov', 'Kalkuš', 27), ('Český Krumlov', 'Turek', 26),
  ('Český Krumlov', 'Toman', 26), ('Český Krumlov', 'Neubauer', 26), ('Český Krumlov', 'Lavička', 26),
  ('Český Krumlov', 'Kysela', 26), ('Český Krumlov', 'Kováč', 26), ('Český Krumlov', 'Klíma', 26),
  ('Český Krumlov', 'Jindra', 26), ('Český Krumlov', 'Bigas', 26), ('Český Krumlov', 'Beneš', 26),
  ('Český Krumlov', 'Vaněk', 25), ('Český Krumlov', 'Šindelář', 25), ('Český Krumlov', 'Šandera', 25),
  ('Český Krumlov', 'Rada', 25), ('Český Krumlov', 'Mašek', 25), ('Český Krumlov', 'Mareš', 25),
  ('Český Krumlov', 'Krejčí', 25), ('Český Krumlov', 'Janoušek', 25), ('Český Krumlov', 'Fučík', 25),
  ('Český Krumlov', 'Ferenc', 25), ('Český Krumlov', 'Blažek', 25), ('Český Krumlov', 'Vrba', 24),
  ('Český Krumlov', 'Valeš', 24), ('Český Krumlov', 'Tůma', 24), ('Český Krumlov', 'Sýkora', 24),
  ('Český Krumlov', 'Pavlík', 24), ('Český Krumlov', 'Churan', 24), ('Český Krumlov', 'Boháč', 24),
  ('Český Krumlov', 'Šváb', 23), ('Český Krumlov', 'Strnad', 23), ('Český Krumlov', 'Kordík', 23),
  ('Český Krumlov', 'Gábor', 23), ('Český Krumlov', 'Brož', 23), ('Český Krumlov', 'Bláha', 23),
  ('Český Krumlov', 'Augustin', 23), ('Český Krumlov', 'Žižka', 22), ('Český Krumlov', 'Velíšek', 22),
  ('Český Krumlov', 'Vácha', 22), ('Český Krumlov', 'Troják', 22), ('Český Krumlov', 'Šustr', 22),
  ('Český Krumlov', 'Sláma', 22), ('Český Krumlov', 'Růžička', 22), ('Český Krumlov', 'Müller', 22),
  ('Český Krumlov', 'Kulich', 22), ('Český Krumlov', 'Jelínek', 22), ('Český Krumlov', 'Jaroš', 22),
  ('Český Krumlov', 'Holub', 22), ('Český Krumlov', 'Dvořáček', 22), ('Český Krumlov', 'Bílý', 22),
  ('Český Krumlov', 'Zahradník', 21), ('Český Krumlov', 'Vacek', 21), ('Český Krumlov', 'Troup', 21),
  ('Český Krumlov', 'Trapl', 21), ('Český Krumlov', 'Thon', 21), ('Český Krumlov', 'Sedláček', 21),
  ('Český Krumlov', 'Salzer', 21), ('Český Krumlov', 'Pils', 21), ('Český Krumlov', 'Petrášek', 21),
  ('Český Krumlov', 'Petr', 21), ('Český Krumlov', 'Pešek', 21), ('Český Krumlov', 'Michálek', 21);

-- ═══ Sponzoři: skutečné firmy z okresu Český Krumlov (31) ═══
-- Hlavní sponzor (16 firem s monthly_min >= 3500), střední, malé. Majitele hra založí sama.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Engel', 'industry', 5500, 9000, 700, 1250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Engel');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Jihostroj', 'industry', 5200, 8500, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Jihostroj');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Stabilo', 'industry', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Stabilo');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Lipno Servis', 'hospitality', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Lipno Servis');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'GMA', 'industry', 4500, 7400, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'GMA');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Pivovar Krumlov', 'brewery', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Pivovar Krumlov');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Nejedlý', 'construction', 4200, 7000, 550, 1000
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Nejedlý');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Isotherm', 'industry', 4000, 6800, 550, 1000
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Isotherm');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Hotel Růže', 'hospitality', 4000, 6800, 550, 1000
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Hotel Růže');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'ČR Beton', 'construction', 4000, 6600, 550, 1000
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'ČR Beton');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Podkleťan', 'farm', 3800, 6400, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Podkleťan');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Repam', 'electro', 3600, 6200, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Repam');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Farma Malonty', 'farm', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Farma Malonty');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Srnín', 'bakery', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Srnín');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Maxant', 'hospitality', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Maxant');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Elint', 'electro', 3500, 5800, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Elint');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'ZD Brloh', 'farm', 2500, 5000, 350, 750
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'ZD Brloh');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'ZD Netřebice', 'farm', 2200, 4500, 300, 700
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'ZD Netřebice');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Město Kaplice', 'municipality', 2000, 4500, 300, 700
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Město Kaplice');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Camping Frymburk', 'hospitality', 1800, 4200, 250, 650
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Camping Frymburk');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Město Velešín', 'municipality', 1500, 4000, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Město Velešín');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'AUTOCK', 'car_service', 1500, 4000, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'AUTOCK');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'LS-Autoservis', 'car_service', 1200, 3500, 200, 500
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'LS-Autoservis');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'B-Elektro', 'electro', 1000, 3000, 150, 450
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'B-Elektro');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Autoopravna Švec', 'car_service', 1000, 2800, 150, 400
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Autoopravna Švec');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Elektro Kulhánek', 'electro', 900, 2500, 100, 350
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Elektro Kulhánek');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Krčma Šatlava', 'restaurant', 800, 2200, 100, 350
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Krčma Šatlava');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'U Dwau Maryí', 'restaurant', 600, 1800, 100, 300
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'U Dwau Maryí');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Na Louži', 'pub', 500, 1500, 100, 300
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Na Louži');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Laibon', 'restaurant', 500, 1500, 80, 250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Laibon');

INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Český Krumlov', 'Jezerní penzion', 'hospitality', 500, 1500, 80, 250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Český Krumlov' AND name = 'Jezerní penzion');

-- ═══ Obce s fotbalovým oddílem (OFS Český Krumlov / krajské soutěže), 10 nových → celkem 25 ═══
-- Populace a souřadnice: Wikidata (ČSÚ). Velikost: <1000 hamlet, <3000 village, <10000 town, <50000 small_city.
-- Černá v Pošumaví a Světlík hrály okresní soutěže dříve (III. třída 2015/16, II. třída), Hořice na Šumavě má obnovený TJ Šumavan (od 2021) a hřiště.
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('ck-malonty', 'Malonty', 'Český Krumlov', 'Jihočeský kraj', 1461, 'village', 48.6862, 14.5768),
('ck-kajov', 'Kájov', 'Český Krumlov', 'Jihočeský kraj', 1971, 'village', 48.8109, 14.2586),
('ck-zlata-koruna', 'Zlatá Koruna', 'Český Krumlov', 'Jihočeský kraj', 789, 'hamlet', 48.8549, 14.3695),
('ck-lipno-nad-vltavou', 'Lipno nad Vltavou', 'Český Krumlov', 'Jihočeský kraj', 686, 'hamlet', 48.6394, 14.2293),
('ck-nova-ves', 'Nová Ves', 'Český Krumlov', 'Jihočeský kraj', 407, 'hamlet', 48.9484, 14.2472),
('ck-holubov', 'Holubov', 'Český Krumlov', 'Jihočeský kraj', 1089, 'village', 48.8901, 14.3211),
('ck-horni-dvoriste', 'Horní Dvořiště', 'Český Krumlov', 'Jihočeský kraj', 440, 'hamlet', 48.6039, 14.4057),
('ck-cerna-v-posumavi', 'Černá v Pošumaví', 'Český Krumlov', 'Jihočeský kraj', 856, 'hamlet', 48.7381, 14.1105),
('ck-svetlik', 'Světlík', 'Český Krumlov', 'Jihočeský kraj', 234, 'hamlet', 48.7317, 14.2110),
('ck-horice-na-sumave', 'Hořice na Šumavě', 'Český Krumlov', 'Jihočeský kraj', 910, 'hamlet', 48.7660, 14.1784);
