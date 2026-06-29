-- 0104_season_recap.sql — per-tým přehled konce sezóny (recap obrazovka po přihlášení)
-- Aplikovat manuálně přes `wrangler d1 execute`.

CREATE TABLE IF NOT EXISTS season_recap (
  team_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  data TEXT NOT NULL,                 -- JSON snapshot (umístění, odměna, odchody, ocenění, trofej, statistiky)
  seen INTEGER NOT NULL DEFAULT 0,    -- 0 = ještě nezobrazeno, 1 = manažer viděl
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, season_number)
);
