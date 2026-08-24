-- Zavlažování hřiště — protějšek vyhřívání na druhé straně počasí.
--
-- Trávník ničí obě krajnosti: v dešti a na sněhu se rozbahní, na výhni vyschne
-- a ztvrdne. Vyhřívání řeší první případ, zavlažování druhý (Lv3 v plné kondici
-- navýšení opotřebení ze slunečného počasí vynuluje).
--
-- Ceny 6k/22k/65k — levnější než vyhřívání (25k/80k/220k), je to jen rozvod vody
-- a postřikovače, ne topné kabely pod celým trávníkem.

ALTER TABLE equipment ADD COLUMN pitch_irrigation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN pitch_irrigation_condition INTEGER NOT NULL DEFAULT 50;
