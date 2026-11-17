-- Hlášení chyb ze hry (menu u kroužku nápovědy → Nahlásit chybu).
-- Screen leží v R2 (SEED_DATA, předpona bug-reports/), tady jen klíč.
CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- Klub, ze kterého hráč hlásil (může mezitím převzít AI trenér).
  team_id TEXT,
  page_url TEXT NOT NULL,
  comment TEXT,
  image_key TEXT,
  -- JSON: zařízení, okno, chyby z konzole, poslední stránky, odkaz na nahrávku.
  context TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created ON bug_reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_created ON bug_reports(user_id, created_at);

-- Odpovědi autora hry; hráči odcházejí jako SMS do Telefonu.
CREATE TABLE IF NOT EXISTS bug_report_replies (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Klub, kam SMS odešla.
  team_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_bug_report_replies_report ON bug_report_replies(report_id);
