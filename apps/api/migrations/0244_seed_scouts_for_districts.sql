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

-- Oprava: avatary výše byly v plochém formátu (bez obličeje); správné facesjs konfigurace.
UPDATE staff_members SET avatar = '{"fatness":0.6799999999999999,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#f5d5c0","size":1.031},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.788},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.538},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.05},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye3","angle":-0.54},"eyebrow":{"id":"eyebrow14","angle":1.5600000000000005},"hair":{"id":"short-fade","color":"#5b3a1a","flip":false},"mouth":{"id":"mouth","flip":true},"nose":{"id":"nose9","flip":true,"size":0.948},"glasses":{"id":"glasses1"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-01';
UPDATE staff_members SET avatar = '{"fatness":0.54,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#ddb7a0","size":0.972},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.604},"head":{"id":"head1","shave":"rgba(0,0,0,0)","fatness":0.629},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.978},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye3","angle":0.6600000000000001},"eyebrow":{"id":"eyebrow7","angle":-1.74},"hair":{"id":"messy-short","color":"#2a1a0e","flip":false},"mouth":{"id":"mouth3","flip":false},"nose":{"id":"nose13","flip":false,"size":0.72},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-02';
UPDATE staff_members SET avatar = '{"fatness":0.596,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#f2d6cb","size":0.96},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.72},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.4085},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.188},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye9","angle":2.0999999999999996},"eyebrow":{"id":"eyebrow10","angle":-1.7999999999999998},"hair":{"id":"crop-fade2","color":"#6b4a2a","flip":true},"mouth":{"id":"straight","flip":false},"nose":{"id":"nose2","flip":false,"size":1.064},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-03';
UPDATE staff_members SET avatar = '{"fatness":0.6080000000000001,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#f5d5c0","size":0.962},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.86},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.46449999999999997},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.927},"miscLine":{"id":"none"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye9","angle":0},"eyebrow":{"id":"eyebrow3","angle":-2.46},"hair":{"id":"short-bald","color":"#b0b0b0","flip":false},"mouth":{"id":"mouth2","flip":false},"nose":{"id":"nose1","flip":false,"size":0.832},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-04';
UPDATE staff_members SET avatar = '{"fatness":0.356,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#e8c4a0","size":1.011},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.736},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.6045},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.074},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye11","angle":-1.2000000000000002},"eyebrow":{"id":"eyebrow2","angle":1.3200000000000003},"hair":{"id":"spike4","color":"#2a1a0e","flip":false},"mouth":{"id":"mouth3","flip":true},"nose":{"id":"nose13","flip":true,"size":0.748},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-05';
UPDATE staff_members SET avatar = '{"fatness":0.512,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#f5d5c0","size":0.964},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.7},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.615},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.062},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye9","angle":2.04},"eyebrow":{"id":"eyebrow3","angle":-0.54},"hair":{"id":"short-bald","color":"#c8c8c8","flip":false},"mouth":{"id":"mouth2","flip":false},"nose":{"id":"nose1","flip":true,"size":0.9359999999999999},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-06';
UPDATE staff_members SET avatar = '{"fatness":0.424,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#f2d6cb","size":0.956},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.8240000000000001},"head":{"id":"head13","shave":"rgba(0,0,0,0)","fatness":0.615},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.99},"miscLine":{"id":"none"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye9","angle":-1.5},"eyebrow":{"id":"eyebrow7","angle":0.96},"hair":{"id":"messy-short","color":"#6b4a2a","flip":false},"mouth":{"id":"smile3","flip":true},"nose":{"id":"nose13","flip":false,"size":0.824},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-07';
UPDATE staff_members SET avatar = '{"fatness":0.46399999999999997,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#ddb7a0","size":1.013},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.856},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.5834999999999999},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.9510000000000001},"miscLine":{"id":"none"},"facialHair":{"id":"goatee4"},"eye":{"id":"eye9","angle":-1.2000000000000002},"eyebrow":{"id":"eyebrow3","angle":-1.56},"hair":{"id":"crop-fade2","color":"#c8c8c8","flip":true},"mouth":{"id":"mouth3","flip":true},"nose":{"id":"nose2","flip":true,"size":0.944},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-08';
UPDATE staff_members SET avatar = '{"fatness":0.528,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#e8c4a0","size":1.044},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.712},"head":{"id":"head9","shave":"rgba(0,0,0,0)","fatness":0.5694999999999999},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":0.978},"miscLine":{"id":"none"},"facialHair":{"id":"mustache"},"eye":{"id":"eye9","angle":1.62},"eyebrow":{"id":"eyebrow2","angle":2.76},"hair":{"id":"crop-fade2","color":"#6b4a2a","flip":false},"mouth":{"id":"mouth3","flip":true},"nose":{"id":"nose1","flip":false,"size":0.84},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-09';
UPDATE staff_members SET avatar = '{"fatness":0.536,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#f5d5c0","size":1.043},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.836},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.6395},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.9510000000000001},"miscLine":{"id":"none"},"facialHair":{"id":"goatee4"},"eye":{"id":"eye11","angle":2.88},"eyebrow":{"id":"eyebrow3","angle":2.6999999999999993},"hair":{"id":"crop-fade2","color":"#6b4a2a","flip":true},"mouth":{"id":"mouth","flip":true},"nose":{"id":"nose13","flip":true,"size":0.9119999999999999},"glasses":{"id":"glasses1"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-10';
UPDATE staff_members SET avatar = '{"fatness":0.344,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#f2d6cb","size":0.982},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.788},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.594},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.906},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye1","angle":-1.92},"eyebrow":{"id":"eyebrow7","angle":0.8399999999999999},"hair":{"id":"short-bald","color":"#c8c8c8","flip":false},"mouth":{"id":"mouth2","flip":true},"nose":{"id":"nose13","flip":false,"size":1.004},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-11';
UPDATE staff_members SET avatar = '{"fatness":0.548,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#e8c4a0","size":0.963},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.868},"head":{"id":"head1","shave":"rgba(0,0,0,0)","fatness":0.3525},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.927},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye1","angle":1.8000000000000007},"eyebrow":{"id":"eyebrow10","angle":3},"hair":{"id":"messy-short","color":"#6b4a2a","flip":false},"mouth":{"id":"smile3","flip":false},"nose":{"id":"nose13","flip":true,"size":0.8119999999999999},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-12';
UPDATE staff_members SET avatar = '{"fatness":0.664,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#d4a882","size":0.953},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.804},"head":{"id":"head11","shave":"rgba(0,0,0,0)","fatness":0.608},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.077},"miscLine":{"id":"none"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye11","angle":-2.94},"eyebrow":{"id":"eyebrow3","angle":1.92},"hair":{"id":"crop-fade2","color":"#c8c8c8","flip":true},"mouth":{"id":"straight","flip":false},"nose":{"id":"nose6","flip":false,"size":0.96},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-13';
UPDATE staff_members SET avatar = '{"fatness":0.348,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#e8c4a0","size":0.994},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.6839999999999999},"head":{"id":"head11","shave":"rgba(0,0,0,0)","fatness":0.3},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.2},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye3","angle":-1.7999999999999998},"eyebrow":{"id":"eyebrow10","angle":-1.5},"hair":{"id":"short-fade","color":"#3b2214","flip":false},"mouth":{"id":"smile3","flip":true},"nose":{"id":"nose2","flip":true,"size":0.98},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-prachatice-14';
UPDATE staff_members SET avatar = '{"fatness":0.688,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#d4a882","size":0.998},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.952},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.496},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.062},"miscLine":{"id":"none"},"facialHair":{"id":"mustache"},"eye":{"id":"eye6","angle":1.1999999999999993},"eyebrow":{"id":"eyebrow7","angle":1.4399999999999995},"hair":{"id":"short-fade","color":"#6b4a2a","flip":false},"mouth":{"id":"mouth","flip":false},"nose":{"id":"nose13","flip":true,"size":0.7879999999999999},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-01';
UPDATE staff_members SET avatar = '{"fatness":0.488,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#ddb7a0","size":0.98},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.612},"head":{"id":"head3","shave":"rgba(0,0,0,0)","fatness":0.4225},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":0.903},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye3","angle":-2.46},"eyebrow":{"id":"eyebrow2","angle":-2.16},"hair":{"id":"short3","color":"#8b6e3e","flip":true},"mouth":{"id":"mouth","flip":false},"nose":{"id":"nose1","flip":true,"size":0.988},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-02';
UPDATE staff_members SET avatar = '{"fatness":0.576,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#f5d5c0","size":0.969},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.612},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.3735},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.17},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye9","angle":1.08},"eyebrow":{"id":"eyebrow7","angle":-0.1200000000000001},"hair":{"id":"crop-fade2","color":"#8b6e3e","flip":true},"mouth":{"id":"straight","flip":true},"nose":{"id":"nose6","flip":false,"size":0.7879999999999999},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-03';
UPDATE staff_members SET avatar = '{"fatness":0.6759999999999999,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#f5d5c0","size":1.032},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.976},"head":{"id":"head9","shave":"rgba(0,0,0,0)","fatness":0.6255},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.041},"miscLine":{"id":"none"},"facialHair":{"id":"goatee4"},"eye":{"id":"eye11","angle":1.5},"eyebrow":{"id":"eyebrow3","angle":1.1399999999999997},"hair":{"id":"crop-fade2","color":"#b0b0b0","flip":false},"mouth":{"id":"mouth2","flip":true},"nose":{"id":"nose1","flip":true,"size":0.8039999999999999},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-04';
UPDATE staff_members SET avatar = '{"fatness":0.648,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#d4a882","size":1.022},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.78},"head":{"id":"head11","shave":"rgba(0,0,0,0)","fatness":0.6395},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.1640000000000001},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye6","angle":1.8600000000000003},"eyebrow":{"id":"eyebrow2","angle":2.9399999999999995},"hair":{"id":"short3","color":"#5b3a1a","flip":false},"mouth":{"id":"smile3","flip":false},"nose":{"id":"nose1","flip":false,"size":0.756},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-05';
UPDATE staff_members SET avatar = '{"fatness":0.376,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#ddb7a0","size":0.997},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.652},"head":{"id":"head3","shave":"rgba(0,0,0,0)","fatness":0.489},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.029},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye3","angle":-0.7800000000000002},"eyebrow":{"id":"eyebrow3","angle":-1.3199999999999998},"hair":{"id":"short-bald","color":"#b0b0b0","flip":true},"mouth":{"id":"straight","flip":true},"nose":{"id":"nose1","flip":true,"size":0.872},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-06';
UPDATE staff_members SET avatar = '{"fatness":0.6759999999999999,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#e8c4a0","size":1.002},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.752},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.6185},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.975},"miscLine":{"id":"none"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye1","angle":-2.82},"eyebrow":{"id":"eyebrow3","angle":1.2599999999999998},"hair":{"id":"short-fade","color":"#5b3a1a","flip":false},"mouth":{"id":"mouth2","flip":true},"nose":{"id":"nose6","flip":true,"size":1.056},"glasses":{"id":"glasses1"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-07';
UPDATE staff_members SET avatar = '{"fatness":0.548,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#e8c4a0","size":1.046},"jersey":{"id":"jersey"},"ear":{"id":"ear2","size":0.768},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.39449999999999996},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.038},"miscLine":{"id":"none"},"facialHair":{"id":"fullgoatee2"},"eye":{"id":"eye11","angle":-1.6199999999999999},"eyebrow":{"id":"eyebrow2","angle":-1.6199999999999999},"hair":{"id":"short3","color":"#5b3a1a","flip":false},"mouth":{"id":"smile3","flip":false},"nose":{"id":"nose1","flip":true,"size":0.944},"glasses":{"id":"glasses1"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-08';
UPDATE staff_members SET avatar = '{"fatness":0.6839999999999999,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#ddb7a0","size":0.973},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.912},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.4925},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.056},"miscLine":{"id":"none"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye1","angle":-1.1400000000000001},"eyebrow":{"id":"eyebrow7","angle":-1.38},"hair":{"id":"messy-short","color":"#5b3a1a","flip":false},"mouth":{"id":"smile3","flip":false},"nose":{"id":"nose2","flip":true,"size":1.048},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-09';
UPDATE staff_members SET avatar = '{"fatness":0.416,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#d4a882","size":0.955},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.62},"head":{"id":"head13","shave":"rgba(0,0,0,0)","fatness":0.398},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":0.993},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye9","angle":1.7400000000000002},"eyebrow":{"id":"eyebrow7","angle":-2.2199999999999998},"hair":{"id":"short3","color":"#6b4a2a","flip":true},"mouth":{"id":"mouth2","flip":true},"nose":{"id":"nose13","flip":false,"size":1.072},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-10';
UPDATE staff_members SET avatar = '{"fatness":0.432,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#f2d6cb","size":0.973},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.644},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.5135},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.155},"miscLine":{"id":"none"},"facialHair":{"id":"mustache"},"eye":{"id":"eye6","angle":-2.7},"eyebrow":{"id":"eyebrow14","angle":-2.82},"hair":{"id":"short3","color":"#9c9c9c","flip":true},"mouth":{"id":"smile3","flip":false},"nose":{"id":"nose6","flip":true,"size":1.004},"glasses":{"id":"glasses1"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-11';
UPDATE staff_members SET avatar = '{"fatness":0.428,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#d4a882","size":0.976},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.804},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.46449999999999997},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.149},"miscLine":{"id":"none"},"facialHair":{"id":"mustache"},"eye":{"id":"eye9","angle":0.96},"eyebrow":{"id":"eyebrow14","angle":-1.3199999999999998},"hair":{"id":"messy-short","color":"#2a1a0e","flip":true},"mouth":{"id":"mouth2","flip":false},"nose":{"id":"nose2","flip":true,"size":0.7959999999999999},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-praha-12';
UPDATE staff_members SET avatar = '{"fatness":0.6799999999999999,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#d4a882","size":1.036},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.868},"head":{"id":"head13","shave":"rgba(0,0,0,0)","fatness":0.3245},"eyeLine":{"id":"none"},"smileLine":{"id":"line1","size":1.1280000000000001},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye6","angle":2.04},"eyebrow":{"id":"eyebrow14","angle":0.3600000000000003},"hair":{"id":"crop-fade2","color":"#8b6e3e","flip":false},"mouth":{"id":"mouth2","flip":true},"nose":{"id":"nose13","flip":false,"size":0.836},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-cb-01';
UPDATE staff_members SET avatar = '{"fatness":0.428,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#f5d5c0","size":1.031},"jersey":{"id":"jersey"},"ear":{"id":"ear3","size":0.952},"head":{"id":"head11","shave":"rgba(0,0,0,0)","fatness":0.6359999999999999},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":0.996},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye11","angle":2.34},"eyebrow":{"id":"eyebrow2","angle":0.7199999999999998},"hair":{"id":"crop-fade2","color":"#6b4a2a","flip":true},"mouth":{"id":"smile3","flip":false},"nose":{"id":"nose2","flip":false,"size":0.852},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-cb-02';
UPDATE staff_members SET avatar = '{"fatness":0.6040000000000001,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#d4a882","size":1.026},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.8959999999999999},"head":{"id":"head8","shave":"rgba(0,0,0,0)","fatness":0.5765},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":1.179},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye11","angle":-2.1},"eyebrow":{"id":"eyebrow7","angle":-0.6600000000000001},"hair":{"id":"spike4","color":"#5b3a1a","flip":true},"mouth":{"id":"straight","flip":true},"nose":{"id":"nose2","flip":true,"size":0.948},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-cb-03';
UPDATE staff_members SET avatar = '{"fatness":0.43999999999999995,"teamColors":["#555555","#FFFFFF","#333333"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#ddb7a0","size":1.029},"jersey":{"id":"jersey"},"ear":{"id":"ear1","size":0.9},"head":{"id":"head6","shave":"rgba(0,0,0,0)","fatness":0.3455},"eyeLine":{"id":"none"},"smileLine":{"id":"line2","size":0.93},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye3","angle":-0.3599999999999999},"eyebrow":{"id":"eyebrow2","angle":-0.5999999999999996},"hair":{"id":"short3","color":"#9c9c9c","flip":false},"mouth":{"id":"mouth2","flip":true},"nose":{"id":"nose6","flip":true,"size":1.092},"glasses":{"id":"none"},"accessories":{"id":"none"}}' WHERE id = 'scout-seed-cb-04';
