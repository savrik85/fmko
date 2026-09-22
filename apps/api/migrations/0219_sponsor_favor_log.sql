-- 0219: Deník změn náklonnosti majitelů firem ke klubům (záložka Oblíbenost na /sponzori).
-- 0218 je rezervovaná pro VIP lóže.
-- Aplikovat ručně PŘED nasazením kódu (zápis do deníku je ve stejném batchi jako změna náklonnosti):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0219_sponsor_favor_log.sql

CREATE TABLE IF NOT EXISTS sponsor_favor_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  -- Skutečná změna po ořezu 0–100, ne požadovaná.
  delta INTEGER NOT NULL,
  -- Český důvod pro zobrazení hráči.
  reason TEXT NOT NULL,
  -- Herní datum klubu (teams.game_date), jinak čas zápisu v ISO.
  game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_favor_log_team ON sponsor_favor_log(team_id, id);
