-- 0116_stadium_facilities.sql — 3 nové stavby zázemí: zastřešení tribun, sektor kotle, sociálky.
-- Aplikovat MANUÁLNĚ přes `wrangler d1 execute <db> --remote --file` (NE migrations apply).
-- POZOR: na prod aplikovat PŘED merge kódu (upgrade UPDATE bez catch na chybějící sloupec).
-- Pozn.: ALTER ... ADD COLUMN nelze IF NOT EXISTS — při re-runu "duplicate column" je OK.

ALTER TABLE stadiums ADD COLUMN roof INTEGER NOT NULL DEFAULT 0;          -- zastřešení tribun (0-3)
ALTER TABLE stadiums ADD COLUMN ultras_stand INTEGER NOT NULL DEFAULT 0;  -- sektor kotle (0-3)
ALTER TABLE stadiums ADD COLUMN toilets INTEGER NOT NULL DEFAULT 0;       -- sociálky (0-3)
