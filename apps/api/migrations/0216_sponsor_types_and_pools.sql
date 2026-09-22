-- Obory sponzorů jako anglické klíče (české popisky jsou na webu), doplnění sponzorů pro Prahu
-- a České Budějovice, úklid smluv smazaných týmů. Aplikovat ručně PO 0215.

-- 1) Obory: 38 ručně psaných hodnot -> pevné klíče.
UPDATE district_sponsors SET type = CASE type
  WHEN 'hospoda' THEN 'pub'
  WHEN 'restaurace' THEN 'restaurant'
  WHEN 'fast_food' THEN 'fast_food'
  WHEN 'občerstvení' THEN 'fast_food'
  WHEN 'kavárna' THEN 'cafe'
  WHEN 'cukrárna' THEN 'cafe'
  WHEN 'pekárna' THEN 'bakery'
  WHEN 'řeznictví' THEN 'butcher'
  WHEN 'potraviny' THEN 'grocery'
  WHEN 'obchod' THEN 'shop'
  WHEN 'pivovar' THEN 'brewery'
  WHEN 'farma' THEN 'farm'
  WHEN 'zahradnictví' THEN 'gardening'
  WHEN 'zahrada' THEN 'gardening'
  WHEN 'stavby' THEN 'construction'
  WHEN 'střechy' THEN 'construction'
  WHEN 'podlahy' THEN 'construction'
  WHEN 'instalace' THEN 'construction'
  WHEN 'hydraulika' THEN 'construction'
  WHEN 'malíř' THEN 'construction'
  WHEN 'truhlářství' THEN 'woodwork'
  WHEN 'dřevo' THEN 'woodwork'
  WHEN 'pila' THEN 'woodwork'
  WHEN 'autoservis' THEN 'car_service'
  WHEN 'pneuservis' THEN 'car_service'
  WHEN 'autoprodej' THEN 'car_dealer'
  WHEN 'elektro' THEN 'electro'
  WHEN 'elektronika' THEN 'electro'
  WHEN 'IT' THEN 'it'
  WHEN 'ecommerce' THEN 'ecommerce'
  WHEN 'firma' THEN 'company'
  WHEN 'strojírenství' THEN 'industry'
  WHEN 'chemička' THEN 'industry'
  WHEN 'sluzby' THEN 'services'
  WHEN 'hotel' THEN 'hospitality'
  WHEN 'lázně' THEN 'hospitality'
  WHEN 'obec' THEN 'municipality'
  WHEN 'klub' THEN 'club'
  ELSE type END;

UPDATE sponsor_contracts SET sponsor_type = CASE sponsor_type
  WHEN 'hospoda' THEN 'pub'
  WHEN 'restaurace' THEN 'restaurant'
  WHEN 'fast_food' THEN 'fast_food'
  WHEN 'občerstvení' THEN 'fast_food'
  WHEN 'kavárna' THEN 'cafe'
  WHEN 'cukrárna' THEN 'cafe'
  WHEN 'pekárna' THEN 'bakery'
  WHEN 'řeznictví' THEN 'butcher'
  WHEN 'potraviny' THEN 'grocery'
  WHEN 'obchod' THEN 'shop'
  WHEN 'pivovar' THEN 'brewery'
  WHEN 'farma' THEN 'farm'
  WHEN 'zahradnictví' THEN 'gardening'
  WHEN 'zahrada' THEN 'gardening'
  WHEN 'stavby' THEN 'construction'
  WHEN 'střechy' THEN 'construction'
  WHEN 'podlahy' THEN 'construction'
  WHEN 'instalace' THEN 'construction'
  WHEN 'hydraulika' THEN 'construction'
  WHEN 'malíř' THEN 'construction'
  WHEN 'truhlářství' THEN 'woodwork'
  WHEN 'dřevo' THEN 'woodwork'
  WHEN 'pila' THEN 'woodwork'
  WHEN 'autoservis' THEN 'car_service'
  WHEN 'pneuservis' THEN 'car_service'
  WHEN 'autoprodej' THEN 'car_dealer'
  WHEN 'elektro' THEN 'electro'
  WHEN 'elektronika' THEN 'electro'
  WHEN 'IT' THEN 'it'
  WHEN 'ecommerce' THEN 'ecommerce'
  WHEN 'firma' THEN 'company'
  WHEN 'strojírenství' THEN 'industry'
  WHEN 'chemička' THEN 'industry'
  WHEN 'sluzby' THEN 'services'
  WHEN 'hotel' THEN 'hospitality'
  WHEN 'lázně' THEN 'hospitality'
  WHEN 'obec' THEN 'municipality'
  WHEN 'klub' THEN 'club'
  ELSE sponsor_type END;

-- Smlouvy napojené na sponzora převezmou jeho obor (jediný zdroj pravdy).
UPDATE sponsor_contracts SET sponsor_type = (SELECT ds.type FROM district_sponsors ds WHERE ds.id = sponsor_contracts.sponsor_id)
WHERE sponsor_id IS NOT NULL;

-- 2) Praha: na 17 klubů byli jen 2 silní sponzoři. Deset do středního a silného pásma.
INSERT OR IGNORE INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES
  ('Praha', 'Alza', 'ecommerce', 4500, 9500, 400, 900),
  ('Praha', 'Staropramen', 'brewery', 4000, 9000, 400, 900),
  ('Praha', 'Avast', 'it', 3500, 8500, 300, 700),
  ('Praha', 'Vltava Development', 'company', 3500, 8000, 300, 700),
  ('Praha', 'Dataservis Karlín', 'it', 3000, 7000, 250, 600),
  ('Praha', 'Stavby Holešovice', 'construction', 3000, 7000, 250, 600),
  ('Praha', 'Autosalon Libeň', 'car_dealer', 2500, 6500, 200, 550),
  ('Praha', 'Hotel U Karlova mostu', 'hospitality', 2500, 6000, 200, 500),
  ('Praha', 'Letenský pivovar', 'brewery', 2500, 6000, 200, 500),
  ('Praha', 'Uzenářství Nusle', 'butcher', 2500, 5500, 200, 450);

-- 3) České Budějovice: okres neměl ani jednoho sponzora. Rozvrstvení podle Prachatic.
INSERT OR IGNORE INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES
  ('České Budějovice', 'E.ON', 'company', 5000, 9000, 800, 1500),
  ('České Budějovice', 'Samson', 'brewery', 4500, 8500, 700, 1400),
  ('České Budějovice', 'Motor Jikov', 'industry', 4500, 8000, 650, 1300),
  ('České Budějovice', 'Koh-i-noor', 'industry', 4000, 7500, 600, 1200),
  ('České Budějovice', 'Jihočeská stavební', 'construction', 4000, 7500, 600, 1200),
  ('České Budějovice', 'Hotel Malše', 'hospitality', 3500, 6500, 500, 1000),
  ('České Budějovice', 'Lannovka Software', 'it', 1500, 4000, 250, 600),
  ('České Budějovice', 'Autosalon Rudolfov', 'car_dealer', 1500, 4500, 250, 650),
  ('České Budějovice', 'Pekárna Suché Vrbné', 'bakery', 1200, 3500, 200, 500),
  ('České Budějovice', 'Stavebniny Hlubocká', 'construction', 1200, 3500, 200, 500),
  ('České Budějovice', 'Řeznictví Černý', 'butcher', 1000, 3000, 150, 450),
  ('České Budějovice', 'Řeznictví U Černé věže', 'butcher', 1000, 3000, 150, 450),
  ('České Budějovice', 'Autoservis Litvínovice', 'car_service', 1000, 3000, 150, 450),
  ('České Budějovice', 'Farma Dubné', 'farm', 1000, 3000, 150, 450),
  ('České Budějovice', 'Elektro Mladé', 'electro', 1000, 2800, 150, 400),
  ('České Budějovice', 'Zahradnictví Hluboká', 'gardening', 900, 2500, 100, 350),
  ('České Budějovice', 'Truhlářství Srubec', 'woodwork', 900, 2500, 100, 350),
  ('České Budějovice', 'Hospoda Na Sadech', 'pub', 500, 1500, 100, 300),
  ('České Budějovice', 'Restaurace Solnice', 'restaurant', 500, 1500, 100, 300),
  ('České Budějovice', 'Pneuservis Čtyři Dvory', 'car_service', 500, 1500, 100, 300),
  ('České Budějovice', 'Potraviny Suché Vrbné', 'grocery', 500, 1400, 80, 250),
  ('České Budějovice', 'Bistro Lannova', 'fast_food', 400, 1200, 50, 200),
  ('České Budějovice', 'Obchod U Radnice', 'shop', 400, 1200, 50, 200),
  ('České Budějovice', 'Hostinec Rožnov', 'pub', 300, 900, 50, 150),
  ('České Budějovice', 'Kavárna Na Náměstí', 'cafe', 300, 900, 50, 150),
  ('České Budějovice', 'Cukrárna Pod Věží', 'cafe', 300, 800, 50, 150);

-- Smlouva Řeznictví Černý vznikla mimo okresní seznam — teď má sponzora, napoj ji.
UPDATE sponsor_contracts SET sponsor_id = (
  SELECT ds.id FROM district_sponsors ds WHERE ds.district = 'České Budějovice' AND ds.name = 'Řeznictví Černý'
), sponsor_type = 'butcher'
WHERE sponsor_id IS NULL AND sponsor_name = 'Řeznictví Černý';

-- 4) Smazané týmy nesmí blokovat sponzory (exkluzivita hlavního sponzora).
UPDATE sponsor_contracts SET status = 'terminated'
WHERE status = 'active' AND team_id IN (SELECT id FROM teams WHERE name LIKE 'DELETED-%');
