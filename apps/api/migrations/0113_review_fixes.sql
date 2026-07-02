-- 0113: opravy z code review. Aplikovat RUČNĚ na prod: wrangler d1 execute prales-db-prod --remote --file ...

-- #2: seasonal_events.type CHECK povoloval jen 6 hodnot → 'hospoda_action' (cooldown hospody) i adhoc typy
-- ('narozeniny','vylet_zapas','kontrola_svaz'…) tiše padaly na constraint (INSERT + .catch → 0 řádků).
-- Typy řídí výhradně kód (ne uživatelský vstup) → CHECK na type zrušen (status CHECK ponechán).
PRAGMA foreign_keys=OFF;
CREATE TABLE IF NOT EXISTS seasonal_events_new (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  effects TEXT NOT NULL,
  choices TEXT,
  season TEXT NOT NULL,
  game_week INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO seasonal_events_new (id, league_id, type, title, description, effects, choices, season, game_week, status, created_at)
  SELECT id, league_id, type, title, description, effects, choices, season, game_week, status, created_at FROM seasonal_events;
DROP TABLE seasonal_events;
ALTER TABLE seasonal_events_new RENAME TO seasonal_events;
PRAGMA foreign_keys=ON;

-- #16: idempotence vesnické reakce (favor se nesmí přičíst 2× při rerunu fáze / pádu před 'done').
ALTER TABLE village_team_favor ADD COLUMN last_reaction_season INTEGER;

-- #19: národnost i u nabídek hráčů (jinak přijatý cizinec z nabídky skončí jako CZ).
ALTER TABLE player_offers ADD COLUMN nationality TEXT NOT NULL DEFAULT 'CZ';
