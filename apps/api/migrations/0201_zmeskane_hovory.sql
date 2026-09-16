-- Zmeškané hovory na telefonu
--
-- Čistě pro atmosféru: v Čechách je hromada nepřijatých hovorů od jednoho
-- člověka univerzální znamení, že máš průšvih. Sponzor volal pětkrát a ty
-- nevíš proč, ale víš, že to nebude nic dobrého.
--
-- Hovor NEVZNIKÁ náhodně. Každý má důvod navázaný na stav klubu (naštvaný
-- kotel, série proher, pokuta za výtržnosti, podpisovka za tvoje odvolání),
-- stejně jako chorály a plachta. Jinak by to byl jen šum.
--
-- `pocet` drží počet zvonění od jednoho volajícího za ten den: pětkrát
-- volající sponzor je jiná zpráva než jeden zmeškaný hovor.

CREATE TABLE IF NOT EXISTS missed_calls (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  -- kotel | sponzor | starosta | komise | hrac | novinar
  volajici    TEXT NOT NULL,
  -- Jméno, které se ukáže v seznamu. U vůdce kotle jeho vlastní.
  jmeno       TEXT NOT NULL,
  -- Proč volal. Ukazuje se po rozkliknutí, v tom je ta sranda.
  duvod       TEXT NOT NULL,
  pocet       INTEGER NOT NULL DEFAULT 1,
  game_date   TEXT NOT NULL,
  seen        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Jeden volající jednou za herní den. Bez toho by tick při opakování
-- nasypal deset stejných hovorů.
CREATE UNIQUE INDEX IF NOT EXISTS idx_missed_calls_den
  ON missed_calls(team_id, volajici, game_date);
CREATE INDEX IF NOT EXISTS idx_missed_calls_tym ON missed_calls(team_id, created_at);
