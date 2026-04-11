-- Propagace zápasu: tým může zaplatit boost attendance před zápasem
ALTER TABLE matches ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN promotion_cost INTEGER;
ALTER TABLE matches ADD COLUMN promotion_boost REAL NOT NULL DEFAULT 1.0;
