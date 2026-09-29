-- Okres Písek: obce s fotbalovými kluby, příjmení podle četnosti a skutečné místní firmy jako sponzoři.
-- Připraveno 2026-09-29. Zdroje:
--   * obce/kluby: soutěže OFS Písek a krajské soutěže JčKFS 2026/27 (ofspisek.cz, fotbalunas.cz,
--     pisecky.denik.cz), cs.wikipedia.org (II. třída okresu Písek, Okres Písek);
--     počet obyvatel a souřadnice: Wikidata (obce k 1. 1. 2025, části obcí SLDB 2021).
--     Posledních 6 řádků jsou ČÁSTI obcí, které mají vlastní klub (Hradiště, Semice, Krč,
--     Milenovice, Hrazánky, Podolí II) – nejsou to samostatné obce.
--   * příjmení: prijmeni.cz, oblast 3305-pisek (stránky 1–25), jen mužské tvary, 150 nejčastějších.
--   * sponzoři: skutečné firmy se sídlem/provozem v okrese Písek (podnikamevpisku.cz, firmy.cz,
--     obchodní rejstřík, weby firem). Názvy krátké kvůli délce názvu klubu (FK <sponzor> <obec>).
--     Úroveň hlavního sponzora = monthly_max >= 6000 (17 firem).
-- Idempotentní: villages přes INSERT OR IGNORE, příjmení přes UNIQUE(district, surname),
-- sponzoři přes WHERE NOT EXISTS. Majitele firmám hra založí sama při prvním zobrazení.

-- ═══ OBCE (31) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('pi-pisek', 'Písek', 'Písek', 'Jihočeský kraj', 31121, 'city', 49.3089, 14.1475),  -- FC Písek
('pi-milevsko', 'Milevsko', 'Písek', 'Jihočeský kraj', 7950, 'town', 49.4510, 14.3600),  -- FC ZVVZ Milevsko
('pi-protivin', 'Protivín', 'Písek', 'Jihočeský kraj', 4764, 'town', 49.1996, 14.2172),  -- FK Protivín
('pi-mirovice', 'Mirovice', 'Písek', 'Jihočeský kraj', 1623, 'village', 49.5156, 14.0359),  -- SK Mirovice
('pi-kovarov', 'Kovářov', 'Písek', 'Jihočeský kraj', 1474, 'village', 49.5177, 14.2781),  -- TJ ZD Kovářov
('pi-bernartice', 'Bernartice', 'Písek', 'Jihočeský kraj', 1405, 'village', 49.3690, 14.3810),  -- TJ Sokol Bernartice
('pi-cizova', 'Čížová', 'Písek', 'Jihočeský kraj', 1366, 'village', 49.3568, 14.0931),  -- TJ Sokol Čížová
('pi-sepekov', 'Sepekov', 'Písek', 'Jihočeský kraj', 1356, 'village', 49.4287, 14.4182),  -- TJ Sokol Sepekov
('pi-mirotice', 'Mirotice', 'Písek', 'Jihočeský kraj', 1232, 'village', 49.4292, 14.0370),  -- FK Mirotice
('pi-chysky', 'Chyšky', 'Písek', 'Jihočeský kraj', 1061, 'village', 49.5235, 14.4276),  -- FC Chyšky
('pi-albrechtice-nad-vltavou', 'Albrechtice nad Vltavou', 'Písek', 'Jihočeský kraj', 1027, 'village', 49.2533, 14.3029),  -- TJ Albrechtice nad Vltavou
('pi-cimelice', 'Čimelice', 'Písek', 'Jihočeský kraj', 1017, 'village', 49.4657, 14.0693),  -- SK SIKO Čimelice
('pi-zahori', 'Záhoří', 'Písek', 'Jihočeský kraj', 802, 'hamlet', 49.3498, 14.2138),  -- TJ Sokol Záhoří
('pi-kestrany', 'Kestřany', 'Písek', 'Jihočeský kraj', 726, 'hamlet', 49.2691, 14.0726),  -- FK IPD service Kestřany
('pi-kluky', 'Kluky', 'Písek', 'Jihočeský kraj', 615, 'hamlet', 49.3169, 14.2453),  -- 1. FC Boston Kluky
('pi-putim', 'Putim', 'Písek', 'Jihočeský kraj', 552, 'hamlet', 49.2646, 14.1191),  -- TJ Sokol Putim
('pi-kostelec-nad-vltavou', 'Kostelec nad Vltavou', 'Písek', 'Jihočeský kraj', 394, 'hamlet', 49.5000, 14.2118),  -- TJ Kostelec nad Vltavou
('pi-bozetice', 'Božetice', 'Písek', 'Jihočeský kraj', 347, 'hamlet', 49.4512, 14.4439),  -- TJ Božetice
('pi-oslov', 'Oslov', 'Písek', 'Jihočeský kraj', 336, 'hamlet', 49.3993, 14.2120),  -- SK Oslov
('pi-vraz', 'Vráž', 'Písek', 'Jihočeský kraj', 320, 'hamlet', 49.3906, 14.1286),  -- FK SDH Vráž
('pi-skaly', 'Skály', 'Písek', 'Jihočeský kraj', 318, 'hamlet', 49.2199, 14.1602),  -- SK Skály
('pi-branice', 'Branice', 'Písek', 'Jihočeský kraj', 308, 'hamlet', 49.4025, 14.3396),  -- spol. Bernartice B/Branice
('pi-smetanova-lhota', 'Smetanova Lhota', 'Písek', 'Jihočeský kraj', 272, 'hamlet', 49.4477, 14.0872),  -- AFK Smetanova Lhota
('pi-borovany', 'Borovany', 'Písek', 'Jihočeský kraj', 207, 'hamlet', 49.3431, 14.3925),  -- TJ Borovany
('pi-kralova-lhota', 'Králova Lhota', 'Písek', 'Jihočeský kraj', 198, 'hamlet', 49.4958, 14.1106),  -- TJ Králova Lhota
('pi-hradiste', 'Hradiště', 'Písek', 'Jihočeský kraj', 2016, 'village', 49.2978, 14.1228),  -- TJ Hradiště; část města Písek
('pi-semice', 'Semice', 'Písek', 'Jihočeský kraj', 425, 'hamlet', 49.2864, 14.1797),  -- FC Semice; část města Písek
('pi-krc', 'Krč', 'Písek', 'Jihočeský kraj', 195, 'hamlet', 49.1984, 14.2470),  -- TJ Sokol Krč; část města Protivín
('pi-milenovice', 'Milenovice', 'Písek', 'Jihočeský kraj', 169, 'hamlet', 49.1736, 14.2190),  -- TJ Blaník Milenovice; část města Protivín
('pi-hrazanky', 'Hrazánky', 'Písek', 'Jihočeský kraj', 105, 'hamlet', 49.5169, 14.3383),  -- TJ Sokol Hrazánky; část obce Hrazany
('pi-podoli-ii', 'Podolí II', 'Písek', 'Jihočeský kraj', 39, 'hamlet', 49.3714, 14.0439);  -- TJ Podolí II; část obce Předotice

-- ═══ PŘÍJMENÍ (150, prijmeni.cz oblast 3305) ═══
INSERT OR IGNORE INTO district_surnames (district, surname, frequency) VALUES
  ('Písek', 'Novák', 207), ('Písek', 'Procházka', 164), ('Písek', 'Kolář', 123),
  ('Písek', 'Svoboda', 120), ('Písek', 'Kučera', 110), ('Písek', 'Novotný', 109),
  ('Písek', 'Zeman', 108), ('Písek', 'Marek', 97), ('Písek', 'Říha', 93),
  ('Písek', 'Bláha', 91), ('Písek', 'Dvořák', 89), ('Písek', 'Mareš', 85),
  ('Písek', 'Veselý', 84), ('Písek', 'Volf', 83), ('Písek', 'Král', 83),
  ('Písek', 'Žák', 79), ('Písek', 'Černý', 76), ('Písek', 'Bican', 74),
  ('Písek', 'Staněk', 70), ('Písek', 'Růžička', 65), ('Písek', 'Mašek', 63),
  ('Písek', 'Němec', 62), ('Písek', 'Krejčí', 61), ('Písek', 'Kovář', 61),
  ('Písek', 'Soukup', 60), ('Písek', 'Pavlíček', 60), ('Písek', 'Němeček', 60),
  ('Písek', 'Houdek', 60), ('Písek', 'Čapek', 60), ('Písek', 'Mařík', 59),
  ('Písek', 'Šindelář', 58), ('Písek', 'Smola', 56), ('Písek', 'Hanzlík', 56),
  ('Písek', 'Toman', 54), ('Písek', 'Kozák', 54), ('Písek', 'Jelínek', 54),
  ('Písek', 'Hronek', 54), ('Písek', 'Pešek', 53), ('Písek', 'Hesoun', 50),
  ('Písek', 'Hanus', 50), ('Písek', 'Velek', 48), ('Písek', 'Pokorný', 48),
  ('Písek', 'Malý', 48), ('Písek', 'Keclík', 48), ('Písek', 'Holub', 47),
  ('Písek', 'Pixa', 46), ('Písek', 'Hrdlička', 46), ('Písek', 'Švec', 45),
  ('Písek', 'Skala', 45), ('Písek', 'Řehoř', 45), ('Písek', 'Janda', 45),
  ('Písek', 'Bílek', 45), ('Písek', 'Liška', 44), ('Písek', 'Hájek', 44),
  ('Písek', 'Slavík', 43), ('Písek', 'Klíma', 43), ('Písek', 'Dušek', 43),
  ('Písek', 'Zelenka', 42), ('Písek', 'Müller', 42), ('Písek', 'Bečvář', 42),
  ('Písek', 'Vaněček', 41), ('Písek', 'Souhrada', 41), ('Písek', 'Jaroš', 41),
  ('Písek', 'Žižka', 40), ('Písek', 'Brůžek', 40), ('Písek', 'Vlk', 39),
  ('Písek', 'Šťastný', 39), ('Písek', 'Strnad', 39), ('Písek', 'Červeňák', 38),
  ('Písek', 'Kříž', 37), ('Písek', 'Kašpar', 37), ('Písek', 'Zobal', 36),
  ('Písek', 'Vokatý', 36), ('Písek', 'Šíma', 36), ('Písek', 'Kouba', 36),
  ('Písek', 'Kadlec', 36), ('Písek', 'Sláma', 35), ('Písek', 'Průša', 35),
  ('Písek', 'Košatka', 35), ('Písek', 'Kostohryz', 35), ('Písek', 'Brož', 35),
  ('Písek', 'Beneš', 35), ('Písek', 'Průcha', 34), ('Písek', 'Kunt', 34),
  ('Písek', 'Urban', 33), ('Písek', 'Starý', 33), ('Písek', 'Nováček', 33),
  ('Písek', 'Hrdina', 33), ('Písek', 'Horák', 33), ('Písek', 'Dunka', 33),
  ('Písek', 'Zborník', 32), ('Písek', 'Polanský', 32), ('Písek', 'Maroušek', 32),
  ('Písek', 'Fiala', 32), ('Písek', 'Bartoš', 32), ('Písek', 'Vrba', 31),
  ('Písek', 'Vlášek', 31), ('Písek', 'Vaněk', 31), ('Písek', 'Uhlík', 31),
  ('Písek', 'Šimek', 31), ('Písek', 'Šefránek', 31), ('Písek', 'Šálek', 31),
  ('Písek', 'Suchan', 31), ('Písek', 'Sedláček', 31), ('Písek', 'Moravec', 31),
  ('Písek', 'Hašek', 31), ('Písek', 'Červenka', 31), ('Písek', 'Blažek', 31),
  ('Písek', 'Viktora', 30), ('Písek', 'Sládek', 30), ('Písek', 'Peterka', 30),
  ('Písek', 'Málek', 30), ('Písek', 'Kovářík', 30), ('Písek', 'Horník', 30),
  ('Písek', 'Čížek', 30), ('Písek', 'Bílý', 30), ('Písek', 'Vlček', 29),
  ('Písek', 'Štěpán', 29), ('Písek', 'Stropnický', 29), ('Písek', 'Stehlík', 29),
  ('Písek', 'Mára', 29), ('Písek', 'Lid', 29), ('Písek', 'Kroupa', 29),
  ('Písek', 'Kačírek', 29), ('Písek', 'Hynouš', 29), ('Písek', 'Humpál', 29),
  ('Písek', 'Hrach', 29), ('Písek', 'Brabec', 29), ('Písek', 'Bárta', 28),
  ('Písek', 'Vlasatý', 27), ('Písek', 'Vlach', 27), ('Písek', 'Váňa', 27),
  ('Písek', 'Turek', 27), ('Písek', 'Slabý', 27), ('Písek', 'Rybák', 27),
  ('Písek', 'Kvěch', 27), ('Písek', 'Klimeš', 27), ('Písek', 'Jedlička', 27),
  ('Písek', 'Charvát', 27), ('Písek', 'Dubský', 27), ('Písek', 'Brousil', 27),
  ('Písek', 'Velíšek', 26), ('Písek', 'Valenta', 26), ('Písek', 'Tůma', 26),
  ('Písek', 'Švehla', 26), ('Písek', 'Sup', 26), ('Písek', 'Řeřicha', 26),
  ('Písek', 'Peroutka', 26), ('Písek', 'Kofroň', 26), ('Písek', 'Kalina', 26);

-- ═══ SPONZOŘI (33) ═══
-- Jitex Písek a.s., textilka, Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Jitex', 'industry', 5500, 9000, 700, 1250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Jitex');

-- AISIN Europe Manufacturing Czech, průmyslová zóna Písek-sever
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'AISIN', 'industry', 5500, 9000, 700, 1250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'AISIN');

-- SIKO KOUPELNY a.s., centrála a prodejna Čimelice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'SIKO', 'shop', 5200, 8500, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'SIKO');

-- Schneider Electric, závod Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Schneider', 'electro', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Schneider');

-- ZVVZ MACHINERY a.s., Milevsko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'ZVVZ', 'industry', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'ZVVZ');

-- Pivovar Protivín (značka Platan)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Platan', 'brewery', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Platan');

-- Faurecia Components, průmyslová zóna Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Faurecia', 'industry', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Faurecia');

-- AGPI a.s., Vrcovice u Písku, zemědělství a třídírna vajec
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Agpi', 'farm', 4500, 7400, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Agpi');

-- Interplex Precision Engineering Czech Republic, Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Interplex', 'industry', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Interplex');

-- Stavební společnost Švec s.r.o., Dobev
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Švec', 'construction', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Švec');

-- AGROMIL CZ a.s., Sepekov
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Agromil', 'farm', 4200, 7000, 550, 1000
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Agromil');

-- UNIGRANIT Písek a.s., zpracování kamene
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Unigranit', 'industry', 4000, 6600, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Unigranit');

-- Hüwa CZ a.s., průmyslová zóna Písek-sever
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Hüwa', 'industry', 4000, 6600, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Hüwa');

-- MÚÚÚ – MASO UZENINY Písek a.s.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'MÚÚÚ', 'butcher', 4000, 6500, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'MÚÚÚ');

-- Václav Kápl ml., autorizovaný prodejce Škoda, pobočka Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Kápl', 'car_dealer', 3800, 6400, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Kápl');

-- Lesy města Písku s.r.o.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Lesy Písek', 'woodwork', 3800, 6200, 500, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Lesy Písek');

-- Zemědělské družstvo Kovářov
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'ZD Kovářov', 'farm', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'ZD Kovářov');

-- RE-ING CZ s.r.o., stavební firma Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'RE-ING', 'construction', 3000, 5500, 400, 800
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'RE-ING');

-- Jihokámen v.d., Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Jihokámen', 'industry', 3000, 5200, 400, 800
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Jihokámen');

-- HS Auto Staněk s.r.o., autosalon Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Staněk', 'car_dealer', 3000, 5200, 400, 800
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Staněk');

-- Zemědělské družstvo Čížová
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'ZD Čížová', 'farm', 2800, 5000, 350, 750
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'ZD Čížová');

-- IPD service a.s., Kestřany
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'IPD', 'services', 2800, 5000, 350, 750
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'IPD');

-- Zemědělské družstvo Kestřany
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'ZD Kestřany', 'farm', 2500, 4800, 350, 700
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'ZD Kestřany');

-- Cyklošvec s.r.o., Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Cyklošvec', 'shop', 2500, 4800, 350, 700
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Cyklošvec');

-- I-Services s.r.o., Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'I-Services', 'it', 2500, 4800, 350, 700
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'I-Services');

-- Hotel Bílá růže, Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Bílá růže', 'hospitality', 1800, 4200, 250, 650
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Bílá růže');

-- BOMA Milevsko s.r.o., voda-topení
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'BOMA', 'construction', 1800, 4000, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'BOMA');

-- Pekárna KLAS, Písek a Protivín
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Klas', 'bakery', 1500, 3800, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Klas');

-- Pekárna, cukrárna a kavárna Mozart, Protivín
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Mozart', 'bakery', 1500, 3500, 200, 550
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Mozart');

-- Pivnice a restaurace U Broučka, Milevsko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'U Broučka', 'pub', 1500, 3500, 200, 550
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'U Broučka');

-- CALTA ELEKTRO, Milevsko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Calta', 'electro', 1500, 3500, 200, 550
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Calta');

-- Penzion U Kloudů, Písek
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'U Kloudů', 'hospitality', 1500, 3500, 200, 550
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'U Kloudů');

-- Pivnice Na Starý, Milevsko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Písek', 'Na Starý', 'pub', 1200, 3000, 150, 500
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Písek' AND name = 'Na Starý');
