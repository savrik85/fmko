-- Okres Strakonice: obce, příjmení a místní sponzoři pro novou okresní ligu.
-- Zdroje (staženo 2026-09-29):
--  * Obce s klubem: tabulky soutěží 2025/26 a 2026/27 (fotbalunas.cz: Krajský přebor, I.A sk. A, I.B sk. B,
--    OP Strakonice, III. třída; Strakonický deník – fotbalový servis 30. 5. 2026), cs.wikipedia
--    (II./III./IV. třída okresu Strakonice – vítězové), ISCUS/ČUS registr sportovních subjektů.
--  * Počet obyvatel a souřadnice obcí: Wikidata (ČSÚ, stav k 1. 1. 2025).
--    Velikost: <1000 hamlet, <3000 village, <10000 town, <20000 small_city, jinak city (jako u dosavadních řádků).
--  * Příjmení: prijmeni.cz, oblast 3307-strakonice (stránky 1–20), jen mužské tvary, četnost podle webu.
--    Příjmení se shodným tvarem pro obě pohlaví (Krejčí, Kočí, Hořejší) mají četnost obou dohromady.
--  * Sponzoři: skutečné firmy z okresu (katalog zaměstnavatelů pracestrakonice.cz z dat MPSV, obchodní rejstřík,
--    firmy.cz). Názvy krátké kvůli délce názvu klubu (FK <sponzor> <obec>).
-- Idempotentní: INSERT OR IGNORE / WHERE NOT EXISTS.

-- ═══ OBCE (30 + Bavorov) ═══
-- Bavorov leží v okrese Strakonice; dřív byl omylem veden pod Prachaticemi (id p10, žádný tým).
UPDATE villages SET district = 'Strakonice', region = 'Jihočeský kraj' WHERE id = 'p10' AND district = 'Prachatice';

--   Strakonice: SK Strakonice 1908 (KP), FK Junior Strakonice, TJ Balvani, TJ Dražejov
--   Blatná: TJ Blatná (I.B)
--   Vodňany: FK Vodňany (I.A)
--   Volyně: SK Slavoj Volyně (I.A)
--   Bavorov: TJ Sokol Bavorov (I.A)
--   Katovice: SK Otava Katovice (I.A)
--   Osek: TJ Osek (KP)
--   Štěkeň: TJ Otavan Štěkeň (I.B)
--   Bělčice: TJ Sokol Bělčice (I.B)
--   Drahonice: TJ Drahonice (I.B)
--   Sousedovice: FC Znakon Sousedovice (I.B)
--   Sedlice: TJ Sokol Sedlice (I.B)
--   Chelčice: FK Chelčice (I.B)
--   Cehnice: Sokol Cehnice (OP)
--   Lom: TJ Lom (OP)
--   Střelské Hoštice: TJ Sokol Střelské Hoštice (OP)
--   Doubravice: TJ Sokol Doubravice (OP)
--   Číčenice: TJ ŽS Blata Číčenice (OP)
--   Malenice: TJ Sokol Malenice (OP)
--   Mnichov: Sokol Mnichov (III. tř.)
--   Kladruby: Sokol Kladruby (III. tř.)
--   Radošovice: TJ Radošovice (III. tř.)
--   Čestice: TJ Čestice (III. tř.)
--   Lnáře: TJ Sokol Lnáře (III. tř.)
--   Hoslovice: FC Ekochov Hoslovice (III. tř.)
--   Horní Poříčí: TJ Otavan Poříčí (III. tř., sídlo Dolní Poříčí, obec Horní Poříčí)
--   Rovná: SK CIVA Trans Rovná (III. tř. 2011/12, klub dohledatelný)
--   Libějovice: Sokol Libějovice (vítěz III. tř. sk. B 2015/16)
--   Předslavice: ZD Předslavice (III. tř., IV. tř. – starší ročníky)
--   Záboří: TJ ZD Záboří (ČUS: fotbalový oddíl, jen 5 členů)
--   Přešťovice: FC PROTOM Přešťovice (B tým vítěz II. tř. 2005/06; aktuální účast neověřena)
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('st-strakonice', 'Strakonice', 'Strakonice', 'Jihočeský kraj', 22355, 'city', 49.2615, 13.9024),
('st-blatna', 'Blatná', 'Strakonice', 'Jihočeský kraj', 6669, 'town', 49.4250, 13.8818),
('st-vodnany', 'Vodňany', 'Strakonice', 'Jihočeský kraj', 7383, 'town', 49.1480, 14.1751),
('st-volyne', 'Volyně', 'Strakonice', 'Jihočeský kraj', 3036, 'town', 49.1659, 13.8863),
('st-katovice', 'Katovice', 'Strakonice', 'Jihočeský kraj', 1331, 'village', 49.2736, 13.8304),
('st-osek', 'Osek', 'Strakonice', 'Jihočeský kraj', 661, 'hamlet', 49.3184, 13.9632),
('st-steken', 'Štěkeň', 'Strakonice', 'Jihočeský kraj', 889, 'hamlet', 49.2672, 14.0059),
('st-belcice', 'Bělčice', 'Strakonice', 'Jihočeský kraj', 1024, 'village', 49.5025, 13.8758),
('st-drahonice', 'Drahonice', 'Strakonice', 'Jihočeský kraj', 413, 'hamlet', 49.2008, 14.0746),
('st-sousedovice', 'Sousedovice', 'Strakonice', 'Jihočeský kraj', 349, 'hamlet', 49.2321, 13.8685),
('st-sedlice', 'Sedlice', 'Strakonice', 'Jihočeský kraj', 1276, 'village', 49.3772, 13.9390),
('st-chelcice', 'Chelčice', 'Strakonice', 'Jihočeský kraj', 398, 'hamlet', 49.1219, 14.1691),
('st-cehnice', 'Cehnice', 'Strakonice', 'Jihočeský kraj', 511, 'hamlet', 49.2152, 14.0294),
('st-lom', 'Lom', 'Strakonice', 'Jihočeský kraj', 112, 'hamlet', 49.4105, 13.9890),
('st-strelske-hostice', 'Střelské Hoštice', 'Strakonice', 'Jihočeský kraj', 905, 'hamlet', 49.2977, 13.7560),
('st-doubravice', 'Doubravice', 'Strakonice', 'Jihočeský kraj', 253, 'hamlet', 49.3521, 13.8620),
('st-cicenice', 'Číčenice', 'Strakonice', 'Jihočeský kraj', 476, 'hamlet', 49.1531, 14.2309),
('st-malenice', 'Malenice', 'Strakonice', 'Jihočeský kraj', 729, 'hamlet', 49.1265, 13.8828),
('st-mnichov', 'Mnichov', 'Strakonice', 'Jihočeský kraj', 251, 'hamlet', 49.3022, 13.8301),
('st-kladruby', 'Kladruby', 'Strakonice', 'Jihočeský kraj', 130, 'hamlet', 49.2688, 13.7635),
('st-radosovice', 'Radošovice', 'Strakonice', 'Jihočeský kraj', 632, 'hamlet', 49.2336, 13.8986),
('st-cestice', 'Čestice', 'Strakonice', 'Jihočeský kraj', 907, 'hamlet', 49.1679, 13.8037),
('st-lnare', 'Lnáře', 'Strakonice', 'Jihočeský kraj', 717, 'hamlet', 49.4580, 13.7841),
('st-hoslovice', 'Hoslovice', 'Strakonice', 'Jihočeský kraj', 172, 'hamlet', 49.1913, 13.7631),
('st-horni-porici', 'Horní Poříčí', 'Strakonice', 'Jihočeský kraj', 307, 'hamlet', 49.2860, 13.7828),
('st-rovna', 'Rovná', 'Strakonice', 'Jihočeský kraj', 247, 'hamlet', 49.2864, 13.9540),
('st-libejovice', 'Libějovice', 'Strakonice', 'Jihočeský kraj', 485, 'hamlet', 49.1144, 14.1934),
('st-predslavice', 'Předslavice', 'Strakonice', 'Jihočeský kraj', 243, 'hamlet', 49.1321, 13.9351),
('st-zabori', 'Záboří', 'Strakonice', 'Jihočeský kraj', 340, 'hamlet', 49.3789, 13.8270),
('st-prestovice', 'Přešťovice', 'Strakonice', 'Jihočeský kraj', 479, 'hamlet', 49.2773, 13.9744);

-- ═══ PŘÍJMENÍ (150, prijmeni.cz ID 3307) ═══
INSERT OR IGNORE INTO district_surnames (district, surname, frequency) VALUES
  ('Strakonice', 'Novák', 189), ('Strakonice', 'Soukup', 107), ('Strakonice', 'Krejčí', 104),
  ('Strakonice', 'Novotný', 98), ('Strakonice', 'Němec', 91), ('Strakonice', 'Kovář', 91),
  ('Strakonice', 'Staněk', 88), ('Strakonice', 'Mráz', 88), ('Strakonice', 'Kučera', 84),
  ('Strakonice', 'Švec', 78), ('Strakonice', 'Kouba', 78), ('Strakonice', 'Beneš', 78),
  ('Strakonice', 'Pešek', 74), ('Strakonice', 'Vávra', 73), ('Strakonice', 'Marek', 70),
  ('Strakonice', 'Mareš', 69), ('Strakonice', 'Král', 69), ('Strakonice', 'Křivanec', 68),
  ('Strakonice', 'Švehla', 62), ('Strakonice', 'Samec', 62), ('Strakonice', 'Černý', 60),
  ('Strakonice', 'Bláha', 60), ('Strakonice', 'Procházka', 59), ('Strakonice', 'Mašek', 59),
  ('Strakonice', 'Kadlec', 59), ('Strakonice', 'Kuneš', 58), ('Strakonice', 'Dvořák', 57),
  ('Strakonice', 'Uhlík', 56), ('Strakonice', 'Kříž', 56), ('Strakonice', 'Mikeš', 54),
  ('Strakonice', 'Svoboda', 53), ('Strakonice', 'Hájek', 53), ('Strakonice', 'Kozák', 52),
  ('Strakonice', 'Štěpánek', 51), ('Strakonice', 'Šíma', 51), ('Strakonice', 'Maroušek', 51),
  ('Strakonice', 'Čapek', 51), ('Strakonice', 'Vlk', 50), ('Strakonice', 'Vaněček', 50),
  ('Strakonice', 'Kohout', 49), ('Strakonice', 'Nový', 48), ('Strakonice', 'Vlček', 46),
  ('Strakonice', 'Toman', 46), ('Strakonice', 'Sivák', 46), ('Strakonice', 'Lukeš', 46),
  ('Strakonice', 'Brabec', 46), ('Strakonice', 'Majer', 45), ('Strakonice', 'Janda', 45),
  ('Strakonice', 'Sokol', 44), ('Strakonice', 'Polák', 44), ('Strakonice', 'Jedlička', 44),
  ('Strakonice', 'Tesař', 43), ('Strakonice', 'Malý', 43), ('Strakonice', 'Kočí', 43),
  ('Strakonice', 'Diviš', 43), ('Strakonice', 'Turek', 42), ('Strakonice', 'Sosna', 42),
  ('Strakonice', 'Martínek', 42), ('Strakonice', 'Šíp', 41), ('Strakonice', 'Klečka', 41),
  ('Strakonice', 'Havlík', 41), ('Strakonice', 'Pavlík', 40), ('Strakonice', 'Zábranský', 39),
  ('Strakonice', 'Matějka', 39), ('Strakonice', 'Chvosta', 39), ('Strakonice', 'Blažek', 39),
  ('Strakonice', 'Vojta', 38), ('Strakonice', 'Trojan', 38), ('Strakonice', 'Slavík', 38),
  ('Strakonice', 'Rod', 38), ('Strakonice', 'Vrba', 37), ('Strakonice', 'Rejšek', 37),
  ('Strakonice', 'Kroupa', 37), ('Strakonice', 'Jirsa', 37), ('Strakonice', 'Dunovský', 37),
  ('Strakonice', 'Bečvář', 37), ('Strakonice', 'Strnad', 36), ('Strakonice', 'Rychtář', 36),
  ('Strakonice', 'Němeček', 36), ('Strakonice', 'Mrázek', 36), ('Strakonice', 'Matoušek', 36),
  ('Strakonice', 'Zemen', 35), ('Strakonice', 'Polan', 35), ('Strakonice', 'Straka', 34),
  ('Strakonice', 'Raba', 34), ('Strakonice', 'Veselý', 33), ('Strakonice', 'Tůma', 33),
  ('Strakonice', 'Ouředník', 33), ('Strakonice', 'Fišer', 33), ('Strakonice', 'Bublík', 33),
  ('Strakonice', 'Zeman', 32), ('Strakonice', 'Zdeněk', 32), ('Strakonice', 'Šťastný', 32),
  ('Strakonice', 'Šesták', 32), ('Strakonice', 'Sládek', 32), ('Strakonice', 'Slavíček', 32),
  ('Strakonice', 'Pechlát', 32), ('Strakonice', 'Kubička', 32), ('Strakonice', 'Irdza', 32),
  ('Strakonice', 'Holub', 32), ('Strakonice', 'Brož', 32), ('Strakonice', 'Bártík', 32),
  ('Strakonice', 'Šindelář', 31), ('Strakonice', 'Rataj', 31), ('Strakonice', 'Mařík', 31),
  ('Strakonice', 'Lebeda', 31), ('Strakonice', 'Koubek', 31), ('Strakonice', 'Komrska', 31),
  ('Strakonice', 'Votava', 30), ('Strakonice', 'Tomášek', 30), ('Strakonice', 'Švarc', 30),
  ('Strakonice', 'Říha', 30), ('Strakonice', 'Řehoř', 30), ('Strakonice', 'Kolář', 30),
  ('Strakonice', 'Klas', 30), ('Strakonice', 'Hrdina', 30), ('Strakonice', 'Hanzlík', 30),
  ('Strakonice', 'Hanuš', 30), ('Strakonice', 'Fiala', 30), ('Strakonice', 'Babka', 30),
  ('Strakonice', 'Žák', 29), ('Strakonice', 'Vojík', 29), ('Strakonice', 'Šmíd', 29),
  ('Strakonice', 'Smola', 29), ('Strakonice', 'Rezek', 29), ('Strakonice', 'Peterka', 29),
  ('Strakonice', 'Miklas', 29), ('Strakonice', 'Lenc', 29), ('Strakonice', 'Kuncl', 29),
  ('Strakonice', 'Kloud', 29), ('Strakonice', 'Hruška', 29), ('Strakonice', 'Homolka', 29),
  ('Strakonice', 'Vlasák', 28), ('Strakonice', 'Hradecký', 28), ('Strakonice', 'Havelec', 28),
  ('Strakonice', 'Šimek', 27), ('Strakonice', 'Růžička', 27), ('Strakonice', 'Pavlíček', 27),
  ('Strakonice', 'Kubeš', 27), ('Strakonice', 'Čížek', 27), ('Strakonice', 'Zelenka', 26),
  ('Strakonice', 'Zach', 26), ('Strakonice', 'Voldřich', 26), ('Strakonice', 'Vaněk', 26),
  ('Strakonice', 'Petřík', 26), ('Strakonice', 'Moravec', 26), ('Strakonice', 'Linhart', 26),
  ('Strakonice', 'Janeček', 26), ('Strakonice', 'Hynek', 26), ('Strakonice', 'Hořejší', 26);

-- ═══ SPONZOŘI (31; prvních 15 na úrovni hlavního sponzora, monthly_max 6400–9000) ═══
-- ČZ a.s., Strakonice (vysokozdvižné vozíky, díly pro auta)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'ČZ', 'industry', 5500, 9000, 700, 1250
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'ČZ');

-- DUDÁK – Měšťanský pivovar Strakonice a.s.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Dudák', 'brewery', 5200, 8500, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Dudák');

-- Vodňanská drůbež, a.s., Vodňany
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Vodňanská drůbež', 'industry', 5200, 8500, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Vodňanská drůbež');

-- A. Pöttinger, spol. s r.o., Vodňany
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Pöttinger', 'industry', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Pöttinger');

-- Linamar Structures Czechia s.r.o., Strakonice (dříve DURA Automotive)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Linamar', 'industry', 5000, 8200, 650, 1150
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Linamar');

-- TONAK a.s. (Fezko), Strakonice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Tonak', 'industry', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Tonak');

-- TESLA BLATNÁ, a.s.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Tesla Blatná', 'electro', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Tesla Blatná');

-- VAFO Production s.r.o., závody Chelčice a Číčenice (krmiva Brit)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Vafo', 'company', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Vafo');

-- ZNAKON, a.s., Sousedovice (silniční stavby)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Znakon', 'construction', 4800, 7800, 600, 1100
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Znakon');

-- LEIFHEIT s.r.o., Blatná
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Leifheit', 'industry', 4500, 7400, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Leifheit');

-- JATKY Hradský, s.r.o., Strakonice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Jatky Hradský', 'butcher', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Jatky Hradský');

-- Keibel Maschinenbau s.r.o., Radošovice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Keibel', 'industry', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Keibel');

-- Teplárna Strakonice, a.s.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Teplárna', 'company', 4500, 7200, 600, 1050
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Teplárna');

-- EM POLAR k.s., Blatná (průmyslové pece)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'EM Polar', 'industry', 4000, 6800, 550, 1000
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'EM Polar');

-- STRAKON CZ s.r.o., Strakonice (betonová schodiště)
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Strakon', 'construction', 3800, 6400, 500, 950
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Strakon');

-- ELEKTROSTAV STRAKONICE s.r.o.
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Elektrostav', 'electro', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Elektrostav');

-- AGROKAT spol. s r.o., Katovice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Agrokat', 'farm', 3500, 6000, 450, 900
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Agrokat');

-- Pila Bečvář s.r.o., Vodňany
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Pila Bečvář', 'woodwork', 3200, 5600, 400, 850
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Pila Bečvář');

-- STRAVBYT s.r.o., Strakonicko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Stravbyt', 'construction', 3000, 5500, 400, 800
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Stravbyt');

-- Blatenská ryba, spol. s r.o., Blatná
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Blatenská ryba', 'farm', 3000, 5500, 400, 800
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Blatenská ryba');

-- Zemědělské družstvo Lnáře
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'ZD Lnáře', 'farm', 3000, 5200, 400, 800
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'ZD Lnáře');

-- Zemědělské družstvo Přešťovice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'ZD Přešťovice', 'farm', 2800, 5000, 350, 750
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'ZD Přešťovice');

-- Zemědělské obchodní družstvo Němětice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'ZOD Němětice', 'farm', 2800, 5000, 350, 750
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'ZOD Němětice');

-- Jednota, spotřební družstvo ve Volyni
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Jednota Volyně', 'grocery', 2000, 4500, 300, 650
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Jednota Volyně');

-- Pekárna a cukrárna Šimák a.s., Volyně
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Šimák', 'bakery', 2000, 4200, 300, 650
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Šimák');

-- Jihočeské pekařství (Galaxie spol. s r.o.), Strakonice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Jihočeské pekařství', 'bakery', 1800, 4000, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Jihočeské pekařství');

-- Pneu Tiger s.r.o., Strakonicko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Pneu Tiger', 'car_service', 1500, 3800, 250, 600
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Pneu Tiger');

-- Pekařství U Hrocha, Volyně
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'U Hrocha', 'bakery', 1500, 3500, 250, 550
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'U Hrocha');

-- AUTOSERVIS Sulán s.r.o., Strakonicko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Sulán', 'car_service', 1500, 3500, 250, 550
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Sulán');

-- TZ AUTOSERVIS s.r.o., Strakonicko
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'TZ Autoservis', 'car_service', 1200, 3200, 200, 500
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'TZ Autoservis');

-- Restaurace Jiskra (Jiskra Gastro s.r.o.), Strakonice
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
SELECT 'Strakonice', 'Jiskra', 'restaurant', 1200, 3000, 200, 500
WHERE NOT EXISTS (SELECT 1 FROM district_sponsors WHERE district = 'Strakonice' AND name = 'Jiskra');
