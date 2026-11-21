-- Proslovy trenéra v kabině před zápasem a po něm (messaging/match-speech.ts).
-- Proslov před zápasem posune formu dne v tom zápase, proslov po zápase náladu kabiny,
-- vztah jmenovaných hráčů a menší posun formy dne v dalším zápase.
-- Jen CREATE TABLE/INDEX IF NOT EXISTS, opakované spuštění je bezpečné.
CREATE TABLE IF NOT EXISTS match_speeches (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pre', 'post')),
  -- O kterém zápase proslov je: season_calendar.id (liga) nebo matches.id (přátelák).
  match_key TEXT NOT NULL,
  -- coach = napsal trenér, ai = AI trenér přes model, rule = AI klub bez modelu.
  author TEXT NOT NULL CHECK (author IN ('coach', 'ai', 'rule')),
  score INTEGER NOT NULL,
  form_shift REAL NOT NULL DEFAULT 0,
  morale_delta INTEGER NOT NULL DEFAULT 0,
  mood TEXT,
  named TEXT,
  message_id TEXT,
  -- Zápas, ve kterém se posun formy uplatnil (u proslovu po zápase až ten další).
  applied_match_id TEXT,
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- Jeden proslov každého druhu na zápas a klub (zámek proti dvojímu započtení).
CREATE UNIQUE INDEX IF NOT EXISTS ux_match_speeches ON match_speeches(team_id, kind, match_key);
CREATE INDEX IF NOT EXISTS idx_match_speeches_pending ON match_speeches(team_id, applied_match_id);
CREATE INDEX IF NOT EXISTS idx_match_speeches_applied ON match_speeches(applied_match_id);
