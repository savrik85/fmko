-- Mládežnická akademie: kolik klub sype do práce s mládeží.
--
-- Funkce tryGraduateYouth() existovala od začátku, ale nikdy se nevolala a neměla ani
-- kde vzít nastavení — akademie byla mrtvý kód. Tenhle sloupec ji zapíná: na konci sezóny
-- z ní podle investice vypadne odchovanec do U21.
--
-- 'none' | 'minimal' | 'medium' | 'high' — hodnoty odpovídají YouthInvestment
-- v apps/api/src/season/youth.ts.
ALTER TABLE teams ADD COLUMN youth_investment TEXT NOT NULL DEFAULT 'none';
