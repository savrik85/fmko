-- District-specific surnames and sponsors in DB (not hardcoded files)

CREATE TABLE IF NOT EXISTS district_surnames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district TEXT NOT NULL,
  surname TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  UNIQUE(district, surname)
);

CREATE INDEX idx_district_surnames ON district_surnames(district);

CREATE TABLE IF NOT EXISTS district_sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  monthly_min INTEGER NOT NULL,
  monthly_max INTEGER NOT NULL,
  win_bonus_min INTEGER NOT NULL,
  win_bonus_max INTEGER NOT NULL
);

CREATE INDEX idx_district_sponsors ON district_sponsors(district);

-- ═══════════════════════════════════════
-- SEED: Okres Prachatice (prijmeni.cz ID 3306)
-- ═══════════════════════════════════════

-- Příjmení dle četnosti
INSERT INTO district_surnames (district, surname, frequency) VALUES
  ('Prachatice', 'Novák', 160), ('Prachatice', 'Mráz', 117), ('Prachatice', 'Pešek', 98),
  ('Prachatice', 'Turek', 77), ('Prachatice', 'Bárta', 69), ('Prachatice', 'Mikeš', 67),
  ('Prachatice', 'Dvořák', 63), ('Prachatice', 'Růžička', 63), ('Prachatice', 'Kouba', 61),
  ('Prachatice', 'Černý', 61), ('Prachatice', 'Ludačka', 61), ('Prachatice', 'Kubička', 56),
  ('Prachatice', 'Soukup', 55), ('Prachatice', 'Petrášek', 55), ('Prachatice', 'Novotný', 54),
  ('Prachatice', 'Šanda', 53), ('Prachatice', 'Janoušek', 52), ('Prachatice', 'Toušek', 47),
  ('Prachatice', 'Kovář', 47), ('Prachatice', 'Dejmek', 46), ('Prachatice', 'Nachlinger', 44),
  ('Prachatice', 'Král', 43), ('Prachatice', 'Zíka', 40), ('Prachatice', 'Švec', 40),
  ('Prachatice', 'Šandera', 38), ('Prachatice', 'Sýkora', 38), ('Prachatice', 'Říha', 38),
  ('Prachatice', 'Šopek', 37), ('Prachatice', 'Pavlík', 39), ('Prachatice', 'Hodina', 37),
  ('Prachatice', 'Grill', 37), ('Prachatice', 'Beneš', 37), ('Prachatice', 'Holub', 36),
  ('Prachatice', 'Čížek', 36), ('Prachatice', 'Vávra', 35), ('Prachatice', 'Pokorný', 35),
  ('Prachatice', 'Kuneš', 35), ('Prachatice', 'Kříž', 35), ('Prachatice', 'Bláha', 35),
  ('Prachatice', 'Tůma', 34);

-- Reální sponzoři
INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES
  ('Prachatice', 'Jednota Vimperk', 'potraviny', 1200, 3000, 200, 500),
  ('Prachatice', 'Řeznictví Polák', 'řeznictví', 600, 1800, 100, 300),
  ('Prachatice', 'Autoservis Leština', 'autoservis', 800, 2000, 150, 400),
  ('Prachatice', 'DOMUS Projekt s.r.o.', 'stavby', 1000, 2500, 200, 500),
  ('Prachatice', 'StavKlíč', 'stavby', 800, 2000, 150, 400),
  ('Prachatice', 'KH Střechy s.r.o.', 'dřevo', 700, 1800, 100, 300),
  ('Prachatice', 'Truhlářství Vlček', 'truhlářství', 500, 1500, 100, 250),
  ('Prachatice', 'STŘECHY-HŘEBEJK', 'střechy', 600, 1600, 100, 300),
  ('Prachatice', 'Zahradnictví Pokorný', 'zahrada', 400, 1200, 50, 200),
  ('Prachatice', 'Elektromotory Těsnohlídek', 'elektro', 800, 2200, 150, 400),
  ('Prachatice', 'Farma Šumava s.r.o.', 'farma', 1000, 3000, 200, 600),
  ('Prachatice', 'Agrokomplex Šumava', 'farma', 1500, 4000, 300, 800),
  ('Prachatice', 'ZEFA Volary s.r.o.', 'farma', 800, 2500, 150, 500),
  ('Prachatice', 'Pila Prachatice', 'pila', 700, 2000, 100, 400),
  ('Prachatice', 'Matulka Voda-Topení', 'instalace', 500, 1500, 100, 300),
  ('Prachatice', 'Zednictví Karas', 'stavby', 600, 1600, 100, 300),
  ('Prachatice', 'Malířství Staněk', 'malíř', 400, 1000, 50, 200),
  ('Prachatice', 'Podlahářství Wágner', 'podlahy', 500, 1400, 100, 250);
