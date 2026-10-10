-- 0259: Doplňkové trhy sázkové kanceláře: handicap, přesný počet gólů v pásmu,
-- oba týmy dají gól, góly týmu, výsledek a počet gólů.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0259_bet_markets.sql
--
-- POŘADÍ JE ZÁVAZNÉ. Nový kód zapisuje kurzy nových trhů po dávkách společně
-- s 1/X/2. Se starým CHECKem by spadla celá dávka, a s ní i kurzy na výsledek.
-- Starému kódu nová tabulka nevadí, CHECK je jen širší.
--
-- bet_odds má tvrdý CHECK(market IN (...)), který SQLite neumí uvolnit ALTERem.
-- Tabulka se proto staví znovu. Na rozdíl od 0158 se data PŘENÁŠEJÍ: kurzy
-- odehraných zápasů čte hlídač kurzů (betting/calibration.ts) a lístek
-- otevřeného kola by se jinak musel přepočítat.
--
-- Jiná tabulka trh neomezuje: bet_selections.market CHECK nemá (ověřeno na kopii
-- produkce 2026-10-10), view ani trigger nad bet_odds neexistuje.
--
-- Po dokončení ZKONTROLOVAT, že počet řádků bet_odds je stejný jako před migrací:
--   SELECT COUNT(*) FROM bet_odds;

CREATE TABLE bet_odds_new (
  id             TEXT PRIMARY KEY,
  league_id      TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  calendar_id    TEXT NOT NULL,
  match_id       TEXT NOT NULL,
  market         TEXT NOT NULL CHECK(market IN (
                   '1x2','dchance','totals','scorer',
                   'handicap','goals_band','btts','team_totals','result_total')),
  -- 1x2:          '1' | 'X' | '2'
  -- dchance:      '1X' (domácí neprohrají) | 'X2' (hosté neprohrají) | '12' (padne vítěz)
  -- totals:       'over15' | 'under15' | … | 'over65' | 'under65' (linie 1,5 až 6,5)
  -- scorer:       <UUID hráče>
  -- handicap:     'home_m15' (domácí vyhrají o 2 a víc) | 'away_p15' (hosté neprohrají
  --               o víc než 1 gól) | 'away_m15' | 'home_p15' | totéž s 25
  -- goals_band:   'goals_0_1' | 'goals_2_3' | 'goals_4_5' | 'goals_6_plus'
  -- btts:         'btts_yes' | 'btts_no'
  -- team_totals:  'home_over15' | 'home_under15' | 'away_over25' | …
  -- result_total: '1_over35' | 'X_under35' | '2_over45' | … (linie je v kódu)
  selection      TEXT NOT NULL,
  odds_x100      INTEGER NOT NULL CHECK(odds_x100 >= 105),
  probability    REAL NOT NULL,
  label          TEXT NOT NULL,
  game_date      TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(match_id, market, selection)
);

INSERT INTO bet_odds_new
  (id, league_id, season_number, calendar_id, match_id, market, selection,
   odds_x100, probability, label, game_date, created_at)
SELECT id, league_id, season_number, calendar_id, match_id, market, selection,
       odds_x100, probability, label, game_date, created_at
  FROM bet_odds;

DROP TABLE bet_odds;
ALTER TABLE bet_odds_new RENAME TO bet_odds;

CREATE INDEX IF NOT EXISTS idx_bet_odds_cal    ON bet_odds(calendar_id);
CREATE INDEX IF NOT EXISTS idx_bet_odds_league ON bet_odds(league_id, season_number);
