-- 0157: Sázková kancelář.
--
-- Aplikovat MANUÁLNĚ, a to PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0157_sazkova_kancelar.sql
--
-- POŘADÍ JE ZÁVAZNÉ. Sloupce competition_rules se v kódu skládají
-- z Object.keys(DEFAULT_RULES) na třech místech (competition/rollover.ts:buildRules,
-- routes/competition.ts admin enable, competition/rules.ts RULE_FIELDS). Kdyby šel
-- kód první, INSERT by mířil na neexistující sloupec a rollover by celé soutěži
-- nezaložil sazebník.
--
-- PROTISTRANA JE MIMO HRU. Kancelář nemá konto: vklad z klubové kasy zmizí,
-- výhra vznikne. Jediné brzdy jsou marže v kurzu, strop výhry na tiket a strop
-- počtu tiketů na kolo.

-- ── Kurzový lístek ──────────────────────────────────────────────────────────
-- Jeden řádek = jedna nabízená možnost. Přepisuje se jednou za herní den, dokud
-- je kolo 'scheduled'. Tiket si kurz nese ve vlastní kopii, takže přepis lístku
-- už podanou sázku nikdy nezmění.
CREATE TABLE IF NOT EXISTS bet_odds (
  id             TEXT PRIMARY KEY,
  league_id      TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  calendar_id    TEXT NOT NULL,
  match_id       TEXT NOT NULL,
  market         TEXT NOT NULL CHECK(market IN ('1x2','totals','scorer')),
  -- '1' | 'X' | '2' | 'over25' | 'under25' | 'over35' | 'under35'
  -- | 'over65' | 'under65' | <UUID hráče>
  selection      TEXT NOT NULL,
  -- Kurz v SETINÁCH: 135 = 1,35. Celé číslo záměrně — s floaty by se součin
  -- akumulátoru rozešel mezi tím, co hráč viděl, a tím, co se vyplatí.
  odds_x100      INTEGER NOT NULL CHECK(odds_x100 >= 105),
  -- Férová pravděpodobnost PŘED marží. Jen pro audit a testy („sedí overround?").
  probability    REAL NOT NULL,
  -- Popisek uložený v okamžiku vzniku, aby tiket dával smysl i po přejmenování
  -- klubu nebo po přestupu hráče jinam.
  label          TEXT NOT NULL,
  game_date      TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(match_id, market, selection)
);
CREATE INDEX IF NOT EXISTS idx_bet_odds_cal    ON bet_odds(calendar_id);
CREATE INDEX IF NOT EXISTS idx_bet_odds_league ON bet_odds(league_id, season_number);

-- ── Tiket ───────────────────────────────────────────────────────────────────
-- VŠECHNY výběry tiketu jsou z JEDNOHO kola (calendar_id NOT NULL). Bez toho by
-- tiket čekal na doběhnutí několika kol, uzávěrka by musela být per výběr
-- a druhá půlka tiketu by se dala sázet už se znalostí výsledků první půlky.
CREATE TABLE IF NOT EXISTS bet_tickets (
  id                TEXT PRIMARY KEY,
  team_id           TEXT NOT NULL,
  league_id         TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  calendar_id       TEXT NOT NULL,
  stake             INTEGER NOT NULL CHECK(stake > 0),
  -- Odvod soutěži, placený NAVÍC k vkladu. 0 = soutěž daň nezavedla.
  levy              INTEGER NOT NULL DEFAULT 0,
  total_odds_x100   INTEGER NOT NULL,
  potential_payout  INTEGER NOT NULL,   -- už po uplatnění stropu
  capped            INTEGER NOT NULL DEFAULT 0,
  payout            INTEGER NOT NULL DEFAULT 0,
  -- 'pending' = řádek vznikl, ale peníze ještě neodešly. Nikdy se nevyhodnocuje.
  -- Bez tohohle mezistavu by pád workeru mezi INSERTem a stržením vkladu nechal
  -- platný tiket, za který klub nezaplatil ani korunu.
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','open','won','lost','void','confiscated')),
  placed_game_date  TEXT NOT NULL,
  settled_game_date TEXT,
  -- Kdy si hráč přečetl výsledek. NULL u vyhodnoceného tiketu = odznak v menu.
  seen_at           TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  settled_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_team   ON bet_tickets(team_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_cal    ON bet_tickets(calendar_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_league ON bet_tickets(league_id, season_number);

-- ── Výběry na tiketu ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bet_selections (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES bet_tickets(id) ON DELETE CASCADE,
  match_id   TEXT NOT NULL,
  market     TEXT NOT NULL,
  selection  TEXT NOT NULL,
  -- ZMRAZENÝ kurz. Přepis bet_odds se sem nikdy nepromítne.
  odds_x100  INTEGER NOT NULL,
  label      TEXT NOT NULL,
  result     TEXT NOT NULL DEFAULT 'pending'
               CHECK(result IN ('pending','won','lost','void')),
  -- NEJVÝŠ JEDEN VÝBĚR NA ZÁPAS. Tohle není úklid, je to protiexploitové
  -- opatření: „padne víc než 2,5 gólu" a „Novák dá gól" v témže zápase jsou
  -- silně kladně korelované, takže prostý součin kurzů podhodnocuje skutečnou
  -- pravděpodobnost a tiket by měl kladnou očekávanou hodnotu pro sázejícího.
  -- Sázkovky tomu říkají „related contingencies" a zakazují to úplně stejně.
  UNIQUE(ticket_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_bet_sel_ticket ON bet_selections(ticket_id);
CREATE INDEX IF NOT EXISTS idx_bet_sel_match  ON bet_selections(match_id, result);

-- ── Sazebník soutěže ────────────────────────────────────────────────────────
-- 0 = neutrální, tedy dnešní stav: zapnutí samosprávy nikomu sázení nezakáže
-- ani nezdaní. U stropů neutrální hodnota neexistuje, jsou to výchozí sazby.
-- CHECK se u ALTER ADD COLUMN nepíše (stejně jako v 0153) — rozsahy hlídá
-- validateProposal na serveru.
ALTER TABLE competition_rules ADD COLUMN ban_betting    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE competition_rules ADD COLUMN levy_bet_pct   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE competition_rules ADD COLUMN bet_max_stake  INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE competition_rules ADD COLUMN bet_max_payout INTEGER NOT NULL DEFAULT 100000;

-- Zákaz sázení uložený disciplinárně. NULL = klub sázet smí. Číslo = kolo,
-- do kterého včetně má stopku; ukládá se absolutně, aby zákaz přežil posun
-- herního času při rolloveru. Úspěšné odvolání překlopí sankci na 'overturned'
-- a zákaz tím padá sám, bez další tabulky a bez úklidu.
ALTER TABLE competition_sanctions ADD COLUMN bet_ban_until_gw INTEGER;
