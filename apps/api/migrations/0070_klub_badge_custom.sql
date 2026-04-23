-- Klub: krok 2c - plna customizace znaku klubu
-- Pridava vlastni barvy znaku (neopiraji od home dresu), vlastni iniciaaly
-- a symbol (emoji/glyph) ktery se zobrazi pod iniciaaly.

ALTER TABLE teams ADD COLUMN badge_primary_color TEXT;
ALTER TABLE teams ADD COLUMN badge_secondary_color TEXT;
ALTER TABLE teams ADD COLUMN badge_initials TEXT;
ALTER TABLE teams ADD COLUMN badge_symbol TEXT;
