-- Odhad talentu žáka: šum se nově losuje z (žák, klub, sezóna, úsudek trenéra), ne z pevného
-- čísla žáka. Sloupec drží, o kolik je chyba menší (den otevřených dveří: trenér ho viděl hrát).
ALTER TABLE youth_prospects ADD COLUMN estimate_precision REAL NOT NULL DEFAULT 1;
