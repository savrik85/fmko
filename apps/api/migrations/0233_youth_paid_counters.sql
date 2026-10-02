-- Akademie: kolik klub za sezónu skutečně zaplatil (season/youth.ts paidYouthLevel).
-- youth_paid_base = součet základních týdenních cen zaplacené úrovně, youth_paid_weeks = počet
-- týdenních uzávěrek. Ročník odchovanců se řídí průměrem, ne nastavením v den konce sezóny.
-- Po vychování ročníku se obojí nuluje (end-season, fáze academy).
ALTER TABLE teams ADD COLUMN youth_paid_base INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN youth_paid_weeks INTEGER NOT NULL DEFAULT 0;
