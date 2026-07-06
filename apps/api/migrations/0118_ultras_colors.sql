-- 0118_ultras_colors.sql — volitelná barva plachty a nápisu v sektoru kotle.
-- Aplikovat MANUÁLNĚ přes `wrangler d1 execute <db> --remote --file` (NE migrations apply).
ALTER TABLE stadiums ADD COLUMN ultras_banner_color TEXT;  -- barva choreo plachty (NULL = týmová primární)
ALTER TABLE stadiums ADD COLUMN ultras_text_color TEXT;    -- barva nápisu (NULL = auto kontrast)
