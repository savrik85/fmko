-- Doplnění obcí aby každý okres měl dost vesnic pro ligu (14+ týmů)
-- Primárně okres Prachatice + další klíčové okresy

-- ═══ PRACHATICE (potřeba 20+, máme 2) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('p01', 'Prachatice', 'Prachatice', 'Jihočeský kraj', 11049, 'small_city', 49.0128, 14.0008),
('p02', 'Vimperk', 'Prachatice', 'Jihočeský kraj', 7670, 'town', 49.0585, 13.7844),
('p03', 'Volary', 'Prachatice', 'Jihočeský kraj', 3940, 'town', 48.9083, 13.8867),
('p04', 'Netolice', 'Prachatice', 'Jihočeský kraj', 2744, 'village', 49.0497, 14.1967),
('p05', 'Lhenice', 'Prachatice', 'Jihočeský kraj', 1700, 'village', 48.9883, 14.1533),
('p06', 'Vlachovo Březí', 'Prachatice', 'Jihočeský kraj', 1600, 'village', 49.0783, 13.9617),
('p07', 'Čkyně', 'Prachatice', 'Jihočeský kraj', 1550, 'village', 49.0717, 13.8350),
('p08', 'Stachy', 'Prachatice', 'Jihočeský kraj', 1100, 'village', 49.1000, 13.6833),
('p09', 'Zdíkov', 'Prachatice', 'Jihočeský kraj', 1050, 'village', 49.0750, 13.7167),
('p10', 'Bavorov', 'Prachatice', 'Jihočeský kraj', 1400, 'village', 49.1167, 14.0833),
('p11', 'Strunkovice nad Blanicí', 'Prachatice', 'Jihočeský kraj', 1200, 'village', 49.0617, 14.0583),
('p12', 'Ktiš', 'Prachatice', 'Jihočeský kraj', 520, 'hamlet', 48.9500, 14.0667),
('p13', 'Šumavské Hoštice', 'Prachatice', 'Jihočeský kraj', 480, 'hamlet', 49.0333, 13.8167),
('p14', 'Zbytiny', 'Prachatice', 'Jihočeský kraj', 350, 'hamlet', 48.9667, 13.8500),
('p15', 'Bohumilice', 'Prachatice', 'Jihočeský kraj', 580, 'hamlet', 49.0833, 13.8667),
('p16', 'Dub', 'Prachatice', 'Jihočeský kraj', 310, 'hamlet', 49.0167, 14.0167),
('p17', 'Kratušín', 'Prachatice', 'Jihočeský kraj', 180, 'hamlet', 49.0283, 13.9650),
('p18', 'Zálezly', 'Prachatice', 'Jihočeský kraj', 220, 'hamlet', 49.0050, 14.1200),
('p19', 'Těšovice', 'Prachatice', 'Jihočeský kraj', 280, 'hamlet', 49.0250, 14.0350),
('p20', 'Lipovice', 'Prachatice', 'Jihočeský kraj', 260, 'hamlet', 49.0417, 14.0083),
('p21', 'Spůle', 'Prachatice', 'Jihočeský kraj', 120, 'hamlet', 49.0200, 13.9500),
('p22', 'Hradčany', 'Prachatice', 'Jihočeský kraj', 95, 'hamlet', 49.0100, 13.9700),
('p23', 'Vyškovice', 'Prachatice', 'Jihočeský kraj', 85, 'hamlet', 49.0350, 13.9300),
('p24', 'Záblatí', 'Prachatice', 'Jihočeský kraj', 730, 'hamlet', 49.0567, 13.7167),
('p25', 'Lenora', 'Prachatice', 'Jihočeský kraj', 700, 'hamlet', 49.0517, 13.7900),
('p26', 'Kvilda', 'Prachatice', 'Jihočeský kraj', 160, 'hamlet', 49.0200, 13.5783),
('p27', 'Horní Vltavice', 'Prachatice', 'Jihočeský kraj', 420, 'hamlet', 48.9917, 13.7750),
('p28', 'Strážný', 'Prachatice', 'Jihočeský kraj', 450, 'hamlet', 48.9050, 13.7250),
('p29', 'Tvrzice', 'Prachatice', 'Jihočeský kraj', 110, 'hamlet', 49.0150, 14.0050),
('p30', 'Malovice', 'Prachatice', 'Jihočeský kraj', 680, 'hamlet', 49.0650, 14.1250),
('p31', 'Buk', 'Prachatice', 'Jihočeský kraj', 200, 'hamlet', 49.0383, 13.9100),
('p32', 'Žernovice', 'Prachatice', 'Jihočeský kraj', 230, 'hamlet', 49.0700, 13.9233),
('p33', 'Dvory', 'Prachatice', 'Jihočeský kraj', 150, 'hamlet', 49.0050, 13.9850),
('p34', 'Lažiště', 'Prachatice', 'Jihočeský kraj', 400, 'hamlet', 49.0267, 13.8617),
('p35', 'Litochovice', 'Prachatice', 'Jihočeský kraj', 180, 'hamlet', 49.0450, 14.0700);

-- ═══ ČESKÉ BUDĚJOVICE (máme 1) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('cb01', 'České Budějovice', 'České Budějovice', 'Jihočeský kraj', 94463, 'city', 48.9746, 14.4747),
('cb02', 'Trhové Sviny', 'České Budějovice', 'Jihočeský kraj', 4688, 'town', 48.8436, 14.6381),
('cb03', 'Týn nad Vltavou', 'České Budějovice', 'Jihočeský kraj', 8088, 'town', 49.2233, 14.4206),
('cb04', 'Hluboká nad Vltavou', 'České Budějovice', 'Jihočeský kraj', 5200, 'town', 49.0517, 14.4339),
('cb05', 'Rudolfov', 'České Budějovice', 'Jihočeský kraj', 3300, 'town', 48.9883, 14.5367),
('cb06', 'Borovany', 'České Budějovice', 'Jihočeský kraj', 4100, 'town', 48.8983, 14.6400),
('cb07', 'Ledenice', 'České Budějovice', 'Jihočeský kraj', 1900, 'village', 48.9267, 14.5950),
('cb08', 'Včelná', 'České Budějovice', 'Jihočeský kraj', 2000, 'village', 48.9417, 14.4583),
('cb09', 'Srubec', 'České Budějovice', 'Jihočeský kraj', 1400, 'village', 48.9467, 14.5233),
('cb10', 'Zliv', 'České Budějovice', 'Jihočeský kraj', 3500, 'town', 49.0650, 14.3700),
('cb11', 'Olešník', 'České Budějovice', 'Jihočeský kraj', 680, 'hamlet', 49.1267, 14.4750),
('cb12', 'Záboří', 'České Budějovice', 'Jihočeský kraj', 510, 'hamlet', 49.1700, 14.4167),
('cb13', 'Dříteň', 'České Budějovice', 'Jihočeský kraj', 1800, 'village', 49.1383, 14.3833),
('cb14', 'Litvínovice', 'České Budějovice', 'Jihočeský kraj', 1100, 'village', 48.9567, 14.4433),
('cb15', 'Adamov', 'České Budějovice', 'Jihočeský kraj', 320, 'hamlet', 48.8900, 14.5033);

-- ═══ ČESKÝ KRUMLOV (máme 1) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('ck01', 'Větřní', 'Český Krumlov', 'Jihočeský kraj', 3800, 'town', 48.7750, 14.2917),
('ck02', 'Kaplice', 'Český Krumlov', 'Jihočeský kraj', 7200, 'town', 48.7383, 14.4967),
('ck03', 'Vyšší Brod', 'Český Krumlov', 'Jihočeský kraj', 2700, 'village', 48.6217, 14.3133),
('ck04', 'Horní Planá', 'Český Krumlov', 'Jihočeský kraj', 2100, 'village', 48.7667, 14.0283),
('ck05', 'Rožmberk nad Vltavou', 'Český Krumlov', 'Jihočeský kraj', 580, 'hamlet', 48.6567, 14.3667),
('ck06', 'Frymburk', 'Český Krumlov', 'Jihočeský kraj', 1300, 'village', 48.6583, 14.1667),
('ck07', 'Loučovice', 'Český Krumlov', 'Jihočeský kraj', 1700, 'village', 48.6167, 14.2667),
('ck08', 'Dolní Dvořiště', 'Český Krumlov', 'Jihočeský kraj', 1300, 'village', 48.6567, 14.4583),
('ck09', 'Chvalšiny', 'Český Krumlov', 'Jihočeský kraj', 1050, 'village', 48.8317, 14.2083),
('ck10', 'Velešín', 'Český Krumlov', 'Jihočeský kraj', 3700, 'town', 48.8283, 14.4617),
('ck11', 'Přídolí', 'Český Krumlov', 'Jihočeský kraj', 850, 'hamlet', 48.8050, 14.3700),
('ck12', 'Brloh', 'Český Krumlov', 'Jihočeský kraj', 1500, 'village', 48.8467, 14.2083),
('ck13', 'Křemže', 'Český Krumlov', 'Jihočeský kraj', 2900, 'village', 48.9083, 14.3067),
('ck14', 'Benešov nad Černou', 'Český Krumlov', 'Jihočeský kraj', 1400, 'village', 48.7283, 14.6283);

-- ═══ BENEŠOV (máme 3) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('bn01', 'Vlašim', 'Benešov', 'Středočeský kraj', 11800, 'small_city', 49.7069, 15.0119),
('bn02', 'Votice', 'Benešov', 'Středočeský kraj', 4800, 'town', 49.6389, 14.6386),
('bn03', 'Sázava', 'Benešov', 'Středočeský kraj', 3700, 'town', 49.8711, 14.8969),
('bn04', 'Týnec nad Sázavou', 'Benešov', 'Středočeský kraj', 5600, 'town', 49.8333, 14.5917),
('bn05', 'Čerčany', 'Benešov', 'Středočeský kraj', 3100, 'town', 49.8517, 14.7050),
('bn06', 'Bystřice', 'Benešov', 'Středočeský kraj', 4300, 'town', 49.7333, 14.6667),
('bn07', 'Divišov', 'Benešov', 'Středočeský kraj', 1700, 'village', 49.7867, 14.8750),
('bn08', 'Neveklov', 'Benešov', 'Středočeský kraj', 2700, 'village', 49.7583, 14.5350),
('bn09', 'Postupice', 'Benešov', 'Středočeský kraj', 1100, 'village', 49.7500, 14.7600),
('bn10', 'Louňovice pod Blaníkem', 'Benešov', 'Středočeský kraj', 1300, 'village', 49.6333, 14.8833),
('bn11', 'Křečovice', 'Benešov', 'Středočeský kraj', 850, 'hamlet', 49.7667, 14.5000),
('bn12', 'Netvořice', 'Benešov', 'Středočeský kraj', 1400, 'village', 49.8333, 14.5167);

-- ═══ PELHŘIMOV (máme 3) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('pe01', 'Humpolec', 'Pelhřimov', 'Kraj Vysočina', 10700, 'small_city', 49.5417, 15.3583),
('pe02', 'Kamenice nad Lipou', 'Pelhřimov', 'Kraj Vysočina', 3700, 'town', 49.3033, 15.0750),
('pe03', 'Červená Řečice', 'Pelhřimov', 'Kraj Vysočina', 1100, 'village', 49.3617, 15.1633),
('pe04', 'Počátky', 'Pelhřimov', 'Kraj Vysočina', 2600, 'village', 49.2600, 15.2367),
('pe05', 'Žirovnice', 'Pelhřimov', 'Kraj Vysočina', 3000, 'village', 49.2533, 15.1833),
('pe06', 'Lukavec', 'Pelhřimov', 'Kraj Vysočina', 1400, 'village', 49.5767, 15.0467),
('pe07', 'Senožaty', 'Pelhřimov', 'Kraj Vysočina', 670, 'hamlet', 49.5400, 15.0617),
('pe08', 'Chýstovice', 'Pelhřimov', 'Kraj Vysočina', 380, 'hamlet', 49.4583, 15.0867),
('pe09', 'Vyskytná', 'Pelhřimov', 'Kraj Vysočina', 500, 'hamlet', 49.4133, 15.2533),
('pe10', 'Nová Cerekev', 'Pelhřimov', 'Kraj Vysočina', 1200, 'village', 49.3883, 15.1117),
('pe11', 'Černovice', 'Pelhřimov', 'Kraj Vysočina', 1800, 'village', 49.3717, 15.3383),
('pe12', 'Košetice', 'Pelhřimov', 'Kraj Vysočina', 700, 'hamlet', 49.5667, 15.1167);

-- ═══ ZLÍN (máme 3) ═══
INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES
('zl01', 'Otrokovice', 'Zlín', 'Zlínský kraj', 17900, 'small_city', 49.2100, 17.5317),
('zl02', 'Napajedla', 'Zlín', 'Zlínský kraj', 7300, 'town', 49.1717, 17.5117),
('zl03', 'Vizovice', 'Zlín', 'Zlínský kraj', 4700, 'town', 49.2217, 17.8517),
('zl04', 'Fryšták', 'Zlín', 'Zlínský kraj', 3600, 'town', 49.2817, 17.7917),
('zl05', 'Luhačovice', 'Zlín', 'Zlínský kraj', 5200, 'town', 49.1017, 17.7617),
('zl06', 'Slušovice', 'Zlín', 'Zlínský kraj', 3200, 'town', 49.2417, 17.8083),
('zl07', 'Tečovice', 'Zlín', 'Zlínský kraj', 1800, 'village', 49.2067, 17.5733),
('zl08', 'Malenovice', 'Zlín', 'Zlínský kraj', 1400, 'village', 49.2283, 17.6383),
('zl09', 'Želechovice nad Dřevnicí', 'Zlín', 'Zlínský kraj', 2200, 'village', 49.2117, 17.7383),
('zl10', 'Březnice', 'Zlín', 'Zlínský kraj', 850, 'hamlet', 49.1750, 17.6833),
('zl11', 'Bohuslavice u Zlína', 'Zlín', 'Zlínský kraj', 1100, 'village', 49.2583, 17.6050),
('zl12', 'Lípa', 'Zlín', 'Zlínský kraj', 620, 'hamlet', 49.2683, 17.8600);
