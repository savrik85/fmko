-- Kdy doběhlo zpracování následků zápasu (statistiky, stopky, zranění, finance, kondice).
-- Zápas se stavem 'simulated' a prázdnou hodnotou zpracoval běh, který spadl uprostřed.
ALTER TABLE matches ADD COLUMN aftermath_done_at TEXT;
