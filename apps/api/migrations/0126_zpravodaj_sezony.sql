-- 0126: Zpravodaj — idempotence generátorů musí rozlišovat sezóny.
--
-- Generátory článků se ptaly "existuje už článek pro tuhle ligu a tohle kolo?"
-- bez ohledu na sezónu. Jakmile druhá sezóna došla ke kolu, které už bylo
-- odehrané v té první, každý další pokus skončil jako "už vygenerováno".
-- Hráč a trenér kola tak zmlkli po 7. kole, předzápasové preview po 8.
-- Ohlédnutí za sezónou by se nevygenerovalo už nikdy.

CREATE TABLE IF NOT EXISTS round_awards (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  game_week INTEGER NOT NULL,
  player_of_round_id TEXT,
  manager_of_round_team_id TEXT,
  player_reason TEXT,
  manager_reason TEXT,
  news_id TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE news ADD COLUMN season_number INTEGER;
ALTER TABLE round_awards ADD COLUMN season_number INTEGER;

-- Ocenění kola znají svůj kalendář přímo.
UPDATE round_awards
SET season_number = (
  SELECT sc.season_number FROM season_calendar sc WHERE sc.id = round_awards.calendar_id
)
WHERE season_number IS NULL;

-- Kotel má sloupec už z dřívějška, ale zůstal nevyplněný (default 0).
UPDATE ultras_reports
SET season_number = (
  SELECT sc.season_number FROM season_calendar sc WHERE sc.id = ultras_reports.calendar_id
)
WHERE calendar_id IS NOT NULL AND (season_number IS NULL OR season_number = 0);

-- Články kalendář neznají, dohledáme ho přes ligu a kolo. Doplňujeme jen typy,
-- které se na idempotenci spoléhají; u ostatních by sezóna byla mrtvý sloupec.
-- Ohlasy na zápas vznikly až po výkopu, bereme tedy poslední kolo před datem vydání.
UPDATE news
SET season_number = (
  SELECT sc.season_number FROM season_calendar sc
  WHERE sc.league_id = news.league_id AND sc.game_week = news.game_week
    AND sc.scheduled_at <= news.created_at
  ORDER BY sc.scheduled_at DESC
  LIMIT 1
)
WHERE game_week IS NOT NULL
  AND season_number IS NULL
  AND type IN ('season_opener', 'player_interview', 'round_summary', 'ultras_report');

-- Pozvánka na zápas naopak vychází před výkopem, tam platí nejbližší kolo dopředu.
UPDATE news
SET season_number = (
  SELECT sc.season_number FROM season_calendar sc
  WHERE sc.league_id = news.league_id AND sc.game_week = news.game_week
    AND sc.scheduled_at >= news.created_at
  ORDER BY sc.scheduled_at ASC
  LIMIT 1
)
WHERE game_week IS NOT NULL
  AND season_number IS NULL
  AND type = 'matchday_preview';

-- Zbytek spadá do první sezóny (starší data, kde kalendář dohledat nejde).
UPDATE round_awards SET season_number = 1 WHERE season_number IS NULL;
UPDATE ultras_reports SET season_number = 1 WHERE season_number IS NULL OR season_number = 0;

-- UNIQUE(league_id, game_week) vzniklo uvnitř CREATE TABLE, takže je to
-- auto-index, který nejde zahodit — obě tabulky se musí přestavět.
CREATE TABLE round_awards_new (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  game_week INTEGER NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  player_of_round_id TEXT,
  manager_of_round_team_id TEXT,
  player_reason TEXT,
  manager_reason TEXT,
  news_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(league_id, season_number, game_week)
);
INSERT INTO round_awards_new (id, league_id, calendar_id, game_week, season_number,
  player_of_round_id, manager_of_round_team_id, player_reason, manager_reason, news_id, created_at)
SELECT id, league_id, calendar_id, game_week, season_number,
  player_of_round_id, manager_of_round_team_id, player_reason, manager_reason, news_id, created_at
FROM round_awards;
DROP TABLE round_awards;
ALTER TABLE round_awards_new RENAME TO round_awards;

CREATE TABLE ultras_reports_new (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  calendar_id   TEXT,
  game_week     INTEGER NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  news_id       TEXT,
  photos_json   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, season_number, game_week)
);
INSERT INTO ultras_reports_new (id, league_id, calendar_id, game_week, season_number, news_id, photos_json, created_at)
SELECT id, league_id, calendar_id, game_week, season_number, news_id, photos_json, created_at
FROM ultras_reports;
DROP TABLE ultras_reports;
ALTER TABLE ultras_reports_new RENAME TO ultras_reports;

-- Zpravodaj tahá články po typech, ne jen podle data — index na to sedne.
CREATE INDEX IF NOT EXISTS idx_news_league_type_created ON news(league_id, type, created_at DESC);
