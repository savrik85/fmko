-- Klub: krok 2 - dres editor
-- Pridava away dres barvy + vzor + sponsor na dresu (fake nazev).
-- Pole jsou nullable - tymy bez nastaveni budou pouzivat home dres / zadny sponzor.

ALTER TABLE teams ADD COLUMN away_primary_color TEXT;
ALTER TABLE teams ADD COLUMN away_secondary_color TEXT;
ALTER TABLE teams ADD COLUMN away_jersey_pattern TEXT;
ALTER TABLE teams ADD COLUMN jersey_sponsor TEXT;
