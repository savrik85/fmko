-- Atomická počítadla pokusů (přihlášení, registrace). KV neumí přičíst atomicky,
-- souběžné pokusy se přepisovaly a limit šel obejít.
-- key = druh počítadla + otisk (SHA-256) e-mailu nebo adresy, nikdy čitelná hodnota.
-- window_start = unix čas v sekundách, kdy začalo běžící okno.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- Úklid prošlých oken při úspěšném přihlášení.
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_window ON rate_limit_counters (window_start);
