-- 0214: Trenérská škola — kurzy vlastností, licenční kurzy a závěrečné testy.
--
-- Kurz stojí peníze a čas (trenér během něj chybí na tréninku). Po skončení
-- kurzu má trenér 7 herních dní na test; neúspěch = jeden opravný termín za 20 %
-- ceny, druhý neúspěch = kurz propadá i s penězi.
--
-- Odpočty jsou v dnech (days_remaining, exam_days_remaining), ne v datech:
-- rollover sezóny posouvá herní hodiny zpět a absolutní datum by se rozbilo.
--
-- Aplikovat MANUÁLNĚ a PŘED nasazením kódu fáze 4:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0214_coach_courses.sql
-- Idempotentní.

CREATE TABLE IF NOT EXISTS coach_courses (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  -- attr_basic | attr_advanced | licence
  kind TEXT NOT NULL,
  -- coaching | motivation | tactics | youth_development | discipline (jen kurzy vlastností)
  attr TEXT,
  -- 1–4 (jen licenční kurzy)
  target_licence INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL,
  retake_price INTEGER NOT NULL,
  -- in_progress | exam_ready | retake_available | passed | failed
  status TEXT NOT NULL,
  days_total INTEGER NOT NULL,
  days_remaining INTEGER NOT NULL,
  exam_days_remaining INTEGER,
  attempts_used INTEGER NOT NULL DEFAULT 0,
  retake_paid INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER,
  season_number INTEGER NOT NULL DEFAULT 0,
  started_game_date TEXT,
  finished_game_date TEXT,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nejvýš jeden běžící kurz na klub, i při dvojkliku.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_courses_active ON coach_courses(team_id)
  WHERE status IN ('in_progress', 'exam_ready', 'retake_available');
CREATE INDEX IF NOT EXISTS idx_coach_courses_team ON coach_courses(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_courses_status ON coach_courses(status);

CREATE TABLE IF NOT EXISTS coach_exam_attempts (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  -- JSON: id otázek v pořadí, jak je trenér vidí
  question_ids TEXT NOT NULL,
  -- JSON: pro každou otázku pořadí možností (indexy do původního pole options)
  option_orders TEXT NOT NULL,
  -- JSON: zvolená možnost v zobrazeném pořadí, -1 = nezodpovězeno
  answers TEXT NOT NULL,
  score INTEGER,
  total INTEGER NOT NULL,
  pass_score INTEGER NOT NULL,
  passed INTEGER,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  submitted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_exam_attempt_no ON coach_exam_attempts(course_id, attempt_no);
CREATE INDEX IF NOT EXISTS idx_coach_exam_team ON coach_exam_attempts(team_id);
