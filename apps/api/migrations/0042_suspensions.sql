-- Stopky za karty: suspended_matches = kolik zápasů ještě musí vynechat
ALTER TABLE players ADD COLUMN suspended_matches INTEGER NOT NULL DEFAULT 0;
