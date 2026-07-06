-- 0117_ultras_text.sql — vlastní nápis (chorál/slogan) na plachtě v sektoru kotle.
-- Aplikovat MANUÁLNĚ přes `wrangler d1 execute <db> --remote --file` (NE migrations apply).
ALTER TABLE stadiums ADD COLUMN ultras_text TEXT;
