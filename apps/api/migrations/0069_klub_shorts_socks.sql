-- Klub: krok 2b - trenyrky + stulpny
-- Pridava barvy trenyrek (shorts) a stulpen (socks) pro home i away variantu.
-- Pole jsou nullable - fallback na primary/secondary color.

ALTER TABLE teams ADD COLUMN home_shorts_color TEXT;
ALTER TABLE teams ADD COLUMN home_socks_color TEXT;
ALTER TABLE teams ADD COLUMN away_shorts_color TEXT;
ALTER TABLE teams ADD COLUMN away_socks_color TEXT;
