-- Zavolat zpátky (F9, messaging/call-back.ts).
--
-- Kdo volal: u hráče jeho id, ať zpětný hovor ví, komu volá. Plní ho tikHovoru,
-- starší hovory ho nemají a hráč se k nim dohledá podle jména.
ALTER TABLE missed_calls ADD COLUMN player_id TEXT;

-- Zpětné hovory trenéra. Nejvýš jeden na klub a herní den a jeden na zmeškaný hovor.
-- Unikátní indexy jsou zároveň zámek: dvojklik ani souběžný požadavek nezavolá
-- (a nezaplatí) dvakrát. Když hovor nedopadne, řádek se smaže a kredit vrátí.
CREATE TABLE IF NOT EXISTS missed_call_callbacks (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL,
  call_id         TEXT NOT NULL,
  game_day        TEXT NOT NULL,
  caller          TEXT NOT NULL,
  -- voice | sms | thread, doplní se po doručení
  outcome         TEXT,
  conversation_id TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_missed_call_callbacks_day ON missed_call_callbacks(team_id, game_day);
CREATE UNIQUE INDEX IF NOT EXISTS idx_missed_call_callbacks_call ON missed_call_callbacks(call_id);
