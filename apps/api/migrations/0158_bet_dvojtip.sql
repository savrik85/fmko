-- 0158: Dvojtip (neprohra) jako nový trh sázkové kanceláře.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0158_bet_dvojtip.sql
--
-- bet_odds má tvrdý CHECK(market IN ('1x2','totals','scorer')), který SQLite
-- neumí uvolnit ALTERem. Tabulka se proto staví znovu.
--
-- Data se ZÁMĚRNĚ nepřenášejí: kurzový lístek se generuje každý herní den
-- a chybějící sadu si první pohled na lístek dopočítá sám. Podané tikety to
-- neohrozí — ty si kurz nesou ve vlastní kopii v bet_selections, která na
-- bet_odds nijak neodkazuje.

DROP TABLE IF EXISTS bet_odds;

CREATE TABLE bet_odds (
  id             TEXT PRIMARY KEY,
  league_id      TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  calendar_id    TEXT NOT NULL,
  match_id       TEXT NOT NULL,
  market         TEXT NOT NULL CHECK(market IN ('1x2','dchance','totals','scorer')),
  -- 1x2:     '1' | 'X' | '2'
  -- dchance: '1X' (domácí neprohrají) | 'X2' (hosté neprohrají) | '12' (padne vítěz)
  -- totals:  'over25' | 'under25' | 'over35' | 'under35' | 'over65'
  -- scorer:  <UUID hráče>
  selection      TEXT NOT NULL,
  odds_x100      INTEGER NOT NULL CHECK(odds_x100 >= 105),
  probability    REAL NOT NULL,
  label          TEXT NOT NULL,
  game_date      TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(match_id, market, selection)
);
CREATE INDEX IF NOT EXISTS idx_bet_odds_cal    ON bet_odds(calendar_id);
CREATE INDEX IF NOT EXISTS idx_bet_odds_league ON bet_odds(league_id, season_number);
