-- Měření běhů z fronty.
--
-- Bez tohohle není čím doložit hlavní tvrzení celé změny — že práce na jednu ligu
-- je konstantní bez ohledu na počet lig. `wrangler tail` invokace konzumera
-- nezachytává a `queues info` backlog neukazuje, takže se to musí ukládat samo.
--
-- lag_ms odděluje dvě různé věci, které se zvenku pletou dohromady:
--   čekání zprávy ve frontě  vs.  vlastní doba zpracování.
CREATE TABLE IF NOT EXISTS queue_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  league_id TEXT,
  status TEXT,
  matches INTEGER,
  queries INTEGER,
  duration_ms INTEGER,
  attempts INTEGER,
  lag_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_runs_created ON queue_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_runs_kind ON queue_runs(kind, created_at DESC);
