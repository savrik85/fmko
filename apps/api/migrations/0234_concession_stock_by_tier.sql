-- Sklad občerstvení zvlášť pro každou kvalitu (season/concession-stock.ts).
-- Dřív byl jeden společný stock_quantity a kvalita šla přepnout po nákupu: levné pivo
-- se nakoupilo za 14 Kč a prodávalo jako Plzeň. Teď se prodává jen sklad zvolené kvality.
-- Starý stock_quantity se při prvním načtení rozdělí podle nákupů a vynuluje.
ALTER TABLE concession_products ADD COLUMN stock_l1 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE concession_products ADD COLUMN stock_l2 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE concession_products ADD COLUMN stock_l3 INTEGER NOT NULL DEFAULT 0;
