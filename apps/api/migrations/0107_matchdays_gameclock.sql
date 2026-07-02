-- 0107: rozšíření CHECK match_day (po/čt liga, so pohár) + globální herní hodiny.
-- Aplikovat RUČNĚ: npx wrangler d1 execute <db> --remote --file migrations/0107_matchdays_gameclock.sql

-- 1) Přestavba season_calendar — CHECK match_day musí povolit VŠECHNY dny (jinak nový kalendář
--    s 'monday'/'thursday' porušuje starý CHECK a INSERT OR IGNORE ho tiše zahodí → liga bez zápasů).
PRAGMA foreign_keys=OFF;
CREATE TABLE IF NOT EXISTS season_calendar_new (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  game_week INTEGER NOT NULL,
  match_day TEXT NOT NULL CHECK(match_day IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','lineup_locked','simulated')),
  parent_calendar_id TEXT REFERENCES season_calendar(id)
);
INSERT INTO season_calendar_new (id, league_id, season_number, game_week, match_day, scheduled_at, status, parent_calendar_id)
  SELECT id, league_id, season_number, game_week, match_day, scheduled_at, status, parent_calendar_id FROM season_calendar;
DROP TABLE season_calendar;
ALTER TABLE season_calendar_new RENAME TO season_calendar;
PRAGMA foreign_keys=ON;

-- 2) Globální herní hodiny — jeden datum pro celou hru (herní den = reálný den + offset, násobek 7).
CREATE TABLE IF NOT EXISTS game_clock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  offset_days INTEGER NOT NULL
);
-- Seed offsetu SELF-COMPUTING z aktuálního herního data (funguje na testu i produ, není natvrdo 49):
-- offset = zaokrouhlený (herní game_date − teď) na násobek 7 → den v týdnu sedí s realitou.
-- OR IGNORE: na testu už řádek existuje, tam se nepřepíše.
INSERT OR IGNORE INTO game_clock (id, offset_days)
  SELECT 1, CAST(ROUND((julianday(MAX(game_date)) - julianday('now')) / 7.0) AS INTEGER) * 7
  FROM teams
  WHERE game_date IS NOT NULL
  HAVING MAX(game_date) IS NOT NULL;
