-- 0244_seed_scouts_for_districts.sql — Doplnění volných skautů na trh pro okresy Prachatice, Praha a České Budějovice.
-- Zajišťuje, aby si každý klub mohl pořídit až dva skauty bez vyčerpání trhu.
-- Idempotentní: INSERT OR IGNORE s fixními ID.

INSERT OR IGNORE INTO staff_members
  (id, district, team_id, role, profession, first_name, last_name, gender, age,
   coaching, medicine, maintenance, judgement, communication, work_rate, charm,
   weekly_wage, signing_fee, avatar, description, listed_until)
VALUES
  -- Okres Prachatice (14 volných skautů)
  ('scout-seed-prachatice-01', 'Prachatice', NULL, NULL, 'skaut', 'Miloš', 'Pavelec', 'm', 38,
   3, 4, 3, 11, 8, 6, 4, 210, 840,
   '{"head":"head1","hair":"shaggy1","hairColor":"#3b2214","eyes":"eye1","nose":"nose1","mouth":"straight","skinColor":"#f2d6cb"}',
   'objede tři zápasy za sobotu', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-02', 'Prachatice', NULL, NULL, 'skaut', 'Jaromír', 'Vondrák', 'm', 44,
   4, 3, 2, 10, 9, 5, 5, 200, 800,
   '{"head":"head3","hair":"short1","hairColor":"#5b3a1a","eyes":"eye3","nose":"nose2","mouth":"smile3","skinColor":"#ddb7a0"}',
   'má oko na talenty', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-03', 'Prachatice', NULL, NULL, 'skaut', 'Kamil', 'Kortus', 'm', 29,
   3, 2, 4, 9, 7, 7, 6, 180, 720,
   '{"head":"head6","hair":"shaggy1","hairColor":"#8b6e3e","eyes":"eye6","nose":"nose6","mouth":"mouth","skinColor":"#e8c4a0"}',
   'zapisuje si poznámky do sešitu', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-04', 'Prachatice', NULL, NULL, 'skaut', 'Stanislav', 'Štefl', 'm', 52,
   5, 3, 3, 12, 10, 6, 5, 230, 920,
   '{"head":"head8","hair":"short1","hairColor":"#8e8e8e","eyes":"eye9","nose":"nose9","mouth":"mouth2","skinColor":"#f5d5c0"}',
   'pamatuje dorostence z celého Pošumaví', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-05', 'Prachatice', NULL, NULL, 'skaut', 'Václav', 'Pecháček', 'm', 35,
   3, 4, 3, 11, 7, 5, 4, 205, 820,
   '{"head":"head9","hair":"short1","hairColor":"#2a1a0e","eyes":"eye11","nose":"nose13","mouth":"straight","skinColor":"#f2d6cb"}',
   'vidí každého kluka v okresním přeboru', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-06', 'Prachatice', NULL, NULL, 'skaut', 'Bohumil', 'Trojan', 'm', 47,
   4, 2, 4, 10, 8, 6, 5, 195, 780,
   '{"head":"head11","hair":"short1","hairColor":"#b0b0b0","eyes":"eye1","nose":"nose1","mouth":"mouth3","skinColor":"#ddb7a0"}',
   'v neděli ráno je na žácích, odpoledne na áčku', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-07', 'Prachatice', NULL, NULL, 'skaut', 'Zdeněk', 'Mráz', 'm', 33,
   2, 3, 3, 8, 6, 5, 4, 165, 660,
   '{"head":"head13","hair":"shaggy1","hairColor":"#3b2214","eyes":"eye3","nose":"nose2","mouth":"smile3","skinColor":"#e8c4a0"}',
   'má v autě mapu všech hřišť v okrese', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-08', 'Prachatice', NULL, NULL, 'skaut', 'Martin', 'Benda', 'm', 41,
   3, 3, 2, 12, 9, 6, 5, 225, 900,
   '{"head":"head1","hair":"short1","hairColor":"#6b4a2a","eyes":"eye6","nose":"nose6","mouth":"mouth","skinColor":"#f2d6cb"}',
   'pozná fotbalistu po prvním doteku s míčem', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-09', 'Prachatice', NULL, NULL, 'skaut', 'Roman', 'Chval', 'm', 28,
   3, 4, 3, 9, 8, 7, 5, 185, 740,
   '{"head":"head3","hair":"shaggy1","hairColor":"#5b3a1a","eyes":"eye9","nose":"nose9","mouth":"mouth2","skinColor":"#ddb7a0"}',
   'jezdí i na tréninky soupeřů za tmy', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-10', 'Prachatice', NULL, NULL, 'skaut', 'Petr', 'Kandl', 'm', 46,
   4, 3, 3, 11, 8, 5, 4, 210, 840,
   '{"head":"head6","hair":"short1","hairColor":"#8e8e8e","eyes":"eye11","nose":"nose13","mouth":"straight","skinColor":"#f5d5c0"}',
   'z každého zápasu má popsané dvě stránky', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-11', 'Prachatice', NULL, NULL, 'skaut', 'Aleš', 'Sova', 'm', 39,
   3, 2, 4, 13, 11, 6, 5, 255, 1020,
   '{"head":"head8","hair":"shaggy1","hairColor":"#3b2214","eyes":"eye1","nose":"nose1","mouth":"smile3","skinColor":"#f2d6cb"}',
   'má skvělý přehled o krajských talentech', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-12', 'Prachatice', NULL, NULL, 'skaut', 'Jiří', 'Bárta', 'm', 43,
   4, 3, 3, 14, 11, 7, 6, 275, 1100,
   '{"head":"head9","hair":"short1","hairColor":"#5b3a1a","eyes":"eye3","nose":"nose2","mouth":"mouth","skinColor":"#ddb7a0"}',
   'bývalý divizní skaut, co se vrátil na Šumavu', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-13', 'Prachatice', NULL, NULL, 'skaut', 'Tomáš', 'Kubeš', 'm', 31,
   3, 3, 2, 10, 7, 6, 5, 190, 760,
   '{"head":"head11","hair":"shaggy1","hairColor":"#8b6e3e","eyes":"eye6","nose":"nose6","mouth":"straight","skinColor":"#e8c4a0"}',
   'objede tři zápasy za sobotu', '2027-12-31T23:59:59Z'),

  ('scout-seed-prachatice-14', 'Prachatice', NULL, NULL, 'skaut', 'Ladislav', 'Kůs', 'm', 50,
   4, 3, 3, 12, 10, 5, 5, 230, 920,
   '{"head":"head13","hair":"short1","hairColor":"#b0b0b0","eyes":"eye9","nose":"nose9","mouth":"mouth3","skinColor":"#f2d6cb"}',
   'nepustí ze zřetele žádného mladého střelce', '2027-12-31T23:59:59Z'),

  -- Okres Praha (12 volných skautů)
  ('scout-seed-praha-01', 'Praha', NULL, NULL, 'skaut', 'Filip', 'Čermák', 'm', 32,
   3, 3, 2, 11, 9, 6, 5, 215, 860,
   '{"head":"head1","hair":"shaggy1","hairColor":"#3b2214","eyes":"eye1","nose":"nose1","mouth":"smile3","skinColor":"#f2d6cb"}',
   'zná všechny pražské umělky i škváry', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-02', 'Praha', NULL, NULL, 'skaut', 'Ondřej', 'Kratochvíl', 'm', 36,
   4, 2, 3, 12, 10, 6, 6, 235, 940,
   '{"head":"head3","hair":"short1","hairColor":"#5b3a1a","eyes":"eye3","nose":"nose2","mouth":"mouth","skinColor":"#ddb7a0"}',
   'sleduje přebor i dorostenecké divize', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-03', 'Praha', NULL, NULL, 'skaut', 'Vojtěch', 'Havel', 'm', 27,
   2, 3, 4, 10, 8, 7, 5, 195, 780,
   '{"head":"head6","hair":"shaggy1","hairColor":"#2a1a0e","eyes":"eye6","nose":"nose6","mouth":"straight","skinColor":"#e8c4a0"}',
   'zapisuje si poznámky do mobilu i sešitu', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-04', 'Praha', NULL, NULL, 'skaut', 'Marek', 'Beneš', 'm', 45,
   3, 4, 3, 12, 9, 5, 4, 225, 900,
   '{"head":"head8","hair":"short1","hairColor":"#8e8e8e","eyes":"eye9","nose":"nose9","mouth":"mouth2","skinColor":"#f5d5c0"}',
   'objede tři zápasy za sobotu', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-05', 'Praha', NULL, NULL, 'skaut', 'Daniel', 'Moravec', 'm', 34,
   4, 3, 2, 11, 8, 6, 5, 210, 840,
   '{"head":"head9","hair":"short1","hairColor":"#6b4a2a","eyes":"eye11","nose":"nose13","mouth":"smile3","skinColor":"#f2d6cb"}',
   'má oko na talenty z pražských předměstí', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-06', 'Praha', NULL, NULL, 'skaut', 'Radek', 'Urban', 'm', 39,
   3, 2, 3, 9, 7, 6, 4, 180, 720,
   '{"head":"head11","hair":"shaggy1","hairColor":"#5b3a1a","eyes":"eye1","nose":"nose1","mouth":"straight","skinColor":"#ddb7a0"}',
   'v tramvaji si prohlíží statistiky ze zápisů', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-07', 'Praha', NULL, NULL, 'skaut', 'Jan', 'Stejskal', 'm', 48,
   4, 3, 4, 12, 10, 6, 5, 230, 920,
   '{"head":"head13","hair":"short1","hairColor":"#b0b0b0","eyes":"eye3","nose":"nose2","mouth":"mouth3","skinColor":"#f2d6cb"}',
   'pozná kvalitu i v blátě a dešti', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-08', 'Praha', NULL, NULL, 'skaut', 'Michal', 'Doležal', 'm', 31,
   3, 3, 2, 10, 8, 6, 5, 195, 780,
   '{"head":"head1","hair":"shaggy1","hairColor":"#3b2214","eyes":"eye6","nose":"nose6","mouth":"mouth","skinColor":"#e8c4a0"}',
   'má přehled o všech dorostencích v přeboru', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-09', 'Praha', NULL, NULL, 'skaut', 'Lukáš', 'Blažek', 'm', 42,
   4, 2, 3, 11, 9, 5, 5, 215, 860,
   '{"head":"head3","hair":"short1","hairColor":"#8e8e8e","eyes":"eye9","nose":"nose9","mouth":"smile3","skinColor":"#f5d5c0"}',
   'zapisuje si poznámky do sešitu', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-10', 'Praha', NULL, NULL, 'skaut', 'Adam', 'Vlček', 'm', 37,
   3, 4, 3, 13, 11, 6, 5, 255, 1020,
   '{"head":"head6","hair":"short1","hairColor":"#2a1a0e","eyes":"eye11","nose":"nose13","mouth":"straight","skinColor":"#f2d6cb"}',
   'skautoval pro mládežnickou akademii', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-11', 'Praha', NULL, NULL, 'skaut', 'David', 'Kříž', 'm', 44,
   4, 3, 3, 14, 12, 7, 6, 280, 1120,
   '{"head":"head8","hair":"shaggy1","hairColor":"#5b3a1a","eyes":"eye1","nose":"nose1","mouth":"mouth","skinColor":"#ddb7a0"}',
   'výborné kontakty na trenéry v celém kraji', '2027-12-31T23:59:59Z'),

  ('scout-seed-praha-12', 'Praha', NULL, NULL, 'skaut', 'Pavel', 'Šebek', 'm', 30,
   2, 3, 2, 10, 7, 6, 4, 185, 740,
   '{"head":"head9","hair":"short1","hairColor":"#6b4a2a","eyes":"eye3","nose":"nose2","mouth":"mouth2","skinColor":"#e8c4a0"}',
   'objede tři zápasy za sobotu', '2027-12-31T23:59:59Z'),

  -- Okres České Budějovice (4 volní skauti)
  ('scout-seed-cb-01', 'České Budějovice', NULL, NULL, 'skaut', 'Tomáš', 'Klíma', 'm', 35,
   3, 3, 3, 11, 9, 6, 5, 215, 860,
   '{"head":"head1","hair":"shaggy1","hairColor":"#3b2214","eyes":"eye1","nose":"nose1","mouth":"smile3","skinColor":"#f2d6cb"}',
   'má oko na talenty', '2027-12-31T23:59:59Z'),

  ('scout-seed-cb-02', 'České Budějovice', NULL, NULL, 'skaut', 'Miroslav', 'Bárta', 'm', 49,
   4, 3, 2, 12, 10, 6, 4, 230, 920,
   '{"head":"head3","hair":"short1","hairColor":"#8e8e8e","eyes":"eye3","nose":"nose2","mouth":"straight","skinColor":"#ddb7a0"}',
   'objede tři zápasy za sobotu', '2027-12-31T23:59:59Z'),

  ('scout-seed-cb-03', 'České Budějovice', NULL, NULL, 'skaut', 'Václav', 'Pech', 'm', 31,
   2, 2, 3, 9, 8, 7, 5, 185, 740,
   '{"head":"head6","hair":"shaggy1","hairColor":"#5b3a1a","eyes":"eye6","nose":"nose6","mouth":"mouth","skinColor":"#e8c4a0"}',
   'zapisuje si poznámky do sešitu', '2027-12-31T23:59:59Z'),

  ('scout-seed-cb-04', 'České Budějovice', NULL, NULL, 'skaut', 'Karel', 'Vondra', 'm', 42,
   3, 4, 3, 13, 10, 6, 5, 250, 1000,
   '{"head":"head8","hair":"short1","hairColor":"#b0b0b0","eyes":"eye9","nose":"nose9","mouth":"mouth2","skinColor":"#f2d6cb"}',
   'zná každého dorostence v jižních Čechách', '2027-12-31T23:59:59Z');
