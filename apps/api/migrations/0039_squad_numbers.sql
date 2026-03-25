-- Čísla hráčů na dresu
ALTER TABLE players ADD COLUMN squad_number INTEGER;

-- Přiřadit čísla existujícím hráčům (per tým, seřazené dle pozice)
-- GK: 1, DEF: 2-5, MID: 6-9, FWD: 10-11, zbytek 12+
