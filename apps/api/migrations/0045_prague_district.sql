-- Prague district: městské části, příjmení, sponzoři
-- Přebor Prahy — nejnižší pražská amatérská soutěž

-- Cleanup: smazat starou Prahu (celé město) a její data
DELETE FROM players WHERE team_id IN (SELECT id FROM teams WHERE village_id = 'c7495e0e-4062-52c3-8df0-28674d14e381');
DELETE FROM matches WHERE league_id IN (SELECT id FROM leagues WHERE district = 'Praha');
DELETE FROM season_calendar WHERE league_id IN (SELECT id FROM leagues WHERE district = 'Praha');
DELETE FROM teams WHERE village_id = 'c7495e0e-4062-52c3-8df0-28674d14e381';
DELETE FROM leagues WHERE district = 'Praha';
DELETE FROM villages WHERE id = 'c7495e0e-4062-52c3-8df0-28674d14e381';

-- ═══ 1. Pražské městské části (villages) ═══
-- size = 'village' → srovnatelné s průměrem Prachatických vesnic
-- village: avgMin=20, avgMax=40, capMin=35, capMax=55

INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
  ('praha-zizkov',      'Žižkov',       'Praha', 'Hlavní město Praha', 75000,  'village', 50.0875, 14.4508),
  ('praha-hostivar',    'Hostivař',     'Praha', 'Hlavní město Praha', 30000,  'village', 50.0439, 14.5125),
  ('praha-vrsovice',    'Vršovice',     'Praha', 'Hlavní město Praha', 35000,  'village', 50.0664, 14.4483),
  ('praha-vinohrady',   'Vinohrady',    'Praha', 'Hlavní město Praha', 55000,  'village', 50.0753, 14.4439),
  ('praha-dejvice',     'Dejvice',      'Praha', 'Hlavní město Praha', 30000,  'village', 50.1003, 14.3936),
  ('praha-liben',       'Libeň',        'Praha', 'Hlavní město Praha', 40000,  'village', 50.1083, 14.4750),
  ('praha-branik',      'Braník',       'Praha', 'Hlavní město Praha', 10000,  'village', 50.0389, 14.4183),
  ('praha-stresovice',  'Střešovice',   'Praha', 'Hlavní město Praha', 12000,  'village', 50.0917, 14.3767),
  ('praha-krc',         'Krč',          'Praha', 'Hlavní město Praha', 15000,  'village', 50.0333, 14.4333),
  ('praha-chodov',      'Chodov',       'Praha', 'Hlavní město Praha', 30000,  'village', 50.0314, 14.4897),
  ('praha-prosek',      'Prosek',       'Praha', 'Hlavní město Praha', 20000,  'village', 50.1167, 14.5000),
  ('praha-kobylisy',    'Kobylisy',     'Praha', 'Hlavní město Praha', 25000,  'village', 50.1250, 14.4500),
  ('praha-suchdol',     'Suchdol',      'Praha', 'Hlavní město Praha',  8000,  'village', 50.1400, 14.3833),
  ('praha-letna',       'Letná',        'Praha', 'Hlavní město Praha', 25000,  'village', 50.0986, 14.4264),
  ('praha-smichov',     'Smíchov',      'Praha', 'Hlavní město Praha', 40000,  'village', 50.0700, 14.4000),
  ('praha-nusle',       'Nusle',        'Praha', 'Hlavní město Praha', 30000,  'village', 50.0600, 14.4350),
  ('praha-malesice',    'Malešice',     'Praha', 'Hlavní město Praha', 12000,  'village', 50.0833, 14.5000),
  ('praha-stodulky',    'Stodůlky',     'Praha', 'Hlavní město Praha', 20000,  'village', 50.0500, 14.3167),
  ('praha-reporyje',    'Řeporyje',     'Praha', 'Hlavní město Praha',  8000,  'village', 50.0250, 14.3333),
  ('praha-uhrineves',   'Uhříněves',    'Praha', 'Hlavní město Praha',  6000,  'village', 50.0167, 14.5667),
  ('praha-radotin',     'Radotín',      'Praha', 'Hlavní město Praha',  9000,  'village', 49.9833, 14.3583),
  ('praha-haje',        'Háje',         'Praha', 'Hlavní město Praha', 20000,  'village', 50.0250, 14.5083),
  ('praha-kbely',       'Kbely',        'Praha', 'Hlavní město Praha', 10000,  'village', 50.1333, 14.5333),
  ('praha-bohdalec',    'Bohdalec',     'Praha', 'Hlavní město Praha',  5000,  'village', 50.0550, 14.4650);

-- ═══ 2. Pražská příjmení ═══

INSERT OR IGNORE INTO district_surnames (district, surname, frequency) VALUES
  -- Top (celopražsky časté)
  ('Praha', 'Novák', 140),
  ('Praha', 'Dvořák', 130),
  ('Praha', 'Svoboda', 120),
  ('Praha', 'Černý', 110),
  ('Praha', 'Procházka', 105),
  ('Praha', 'Novotný', 100),
  ('Praha', 'Kučera', 90),
  ('Praha', 'Veselý', 85),
  ('Praha', 'Horák', 80),
  ('Praha', 'Němec', 78),
  -- Povinné (kamarádi)
  ('Praha', 'Kukačka', 65),
  ('Praha', 'Staš', 60),
  ('Praha', 'Jungvirt', 60),
  -- Pražské / kosmopolitní
  ('Praha', 'Hájek', 72),
  ('Praha', 'Fiala', 70),
  ('Praha', 'Pokorný', 68),
  ('Praha', 'Marek', 66),
  ('Praha', 'Jelínek', 64),
  ('Praha', 'Sedláček', 62),
  ('Praha', 'Král', 60),
  ('Praha', 'Růžička', 58),
  ('Praha', 'Beneš', 56),
  ('Praha', 'Kolář', 55),
  ('Praha', 'Urban', 54),
  ('Praha', 'Čermák', 52),
  ('Praha', 'Bartoš', 50),
  ('Praha', 'Šťastný', 48),
  ('Praha', 'Moravec', 46),
  ('Praha', 'Kříž', 45),
  ('Praha', 'Kopecký', 44),
  ('Praha', 'Beran', 43),
  ('Praha', 'Jirák', 42),
  ('Praha', 'Kohoutek', 41),
  ('Praha', 'Burián', 40),
  ('Praha', 'Vlček', 40),
  ('Praha', 'Sláma', 38),
  ('Praha', 'Sedlák', 38),
  ('Praha', 'Hovorka', 37),
  ('Praha', 'Hájný', 36),
  ('Praha', 'Šimek', 35),
  ('Praha', 'Blažek', 34),
  ('Praha', 'Vaněk', 33),
  ('Praha', 'Kratochvíl', 32),
  ('Praha', 'Malý', 31),
  ('Praha', 'Holub', 30),
  ('Praha', 'Polák', 30),
  ('Praha', 'Štěpánek', 29),
  ('Praha', 'Kadlec', 28),
  ('Praha', 'Musil', 28),
  ('Praha', 'Říha', 27),
  ('Praha', 'Tomášek', 26),
  ('Praha', 'Mareš', 26),
  ('Praha', 'Janda', 25),
  ('Praha', 'Kovář', 25),
  ('Praha', 'Čech', 24),
  ('Praha', 'Doležal', 24),
  ('Praha', 'Zeman', 23),
  ('Praha', 'Navrátil', 22),
  ('Praha', 'Pavlík', 22),
  ('Praha', 'Staněk', 21),
  ('Praha', 'Konečný', 20),
  ('Praha', 'Pospíšil', 20),
  ('Praha', 'Voráček', 19),
  ('Praha', 'Tuček', 19),
  ('Praha', 'Vávra', 18),
  ('Praha', 'Hruška', 18),
  ('Praha', 'Trojan', 17),
  ('Praha', 'Pešek', 17),
  ('Praha', 'Kubát', 16),
  ('Praha', 'Šulc', 16),
  ('Praha', 'Havel', 15),
  ('Praha', 'Brož', 15),
  ('Praha', 'Vlasák', 15),
  ('Praha', 'Tůma', 14),
  ('Praha', 'Janků', 14),
  ('Praha', 'Kolman', 13),
  ('Praha', 'Smetana', 13),
  ('Praha', 'Bílek', 12),
  ('Praha', 'Krejčí', 12),
  ('Praha', 'Hrubý', 12),
  ('Praha', 'Nejedlý', 11),
  ('Praha', 'Škoda', 11),
  ('Praha', 'Dušek', 10),
  ('Praha', 'Michálek', 10);

-- ═══ 3. Pražští sponzoři ═══

INSERT OR IGNORE INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES
  -- Bohemians téma
  ('Praha', 'Hospoda U Botiče', 'hospoda', 500, 1500, 100, 300),
  ('Praha', 'Vršovický klokánek', 'hospoda', 400, 1200, 80, 250),
  ('Praha', 'Kiosek Na Ďolíčku', 'občerstvení', 300, 800, 50, 150),
  -- Klasické pražské podniky
  ('Praha', 'Hospoda U Vystřeleného oka', 'hospoda', 500, 1500, 100, 300),
  ('Praha', 'Kebab U Ibrahima', 'fast_food', 400, 1200, 50, 200),
  ('Praha', 'Pivnice Na Roháčku', 'hospoda', 500, 1400, 100, 250),
  ('Praha', 'Autoservis Žižkov', 'autoservis', 700, 2000, 150, 400),
  ('Praha', 'Potraviny U Matička', 'potraviny', 600, 1600, 100, 300),
  ('Praha', 'Stavebniny Prosek', 'stavby', 800, 2200, 150, 400),
  ('Praha', 'Malostranská pekárna', 'pekárna', 500, 1400, 100, 250),
  ('Praha', 'Autolakovka Braník', 'autoservis', 600, 1800, 100, 300),
  ('Praha', 'Elektro Kohoutek', 'elektro', 500, 1500, 100, 300),
  ('Praha', 'Kadeřnictví Vlasta', 'sluzby', 300, 800, 50, 150),
  ('Praha', 'Truhlářství Radotín', 'truhlářství', 400, 1200, 50, 200),
  ('Praha', 'Zahradnictví Suchdol', 'zahradnictví', 400, 1000, 80, 200);
