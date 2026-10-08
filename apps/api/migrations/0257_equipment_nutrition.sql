-- Vybavení „Váha a jídelníček“ (postava, část 3; spec docs/superpowers/specs/2026-10-08-player-body-levers-design.md).
-- Úroveň a stav jako u ostatních kategorií. MUSÍ běžet PŘED nasazením kódu: equipment-service
-- zakládá řádek vybavení se všemi kategoriemi z CATEGORIES, bez sloupců by nový klub vybavení nedostal.
ALTER TABLE equipment ADD COLUMN nutrition INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN nutrition_condition INTEGER NOT NULL DEFAULT 50;
