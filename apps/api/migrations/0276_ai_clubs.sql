-- AI kluby jako normální kluby (2026-10-25), viz docs/superpowers/specs/2026-10-25-ai-clubs-design.md
-- Jen přidávací změny: nové sloupce a tabulky.

-- Postup a sestup mezi přeborem a III. třídou jde vypnout pro konkrétní ligu.
ALTER TABLE leagues ADD COLUMN promotion_enabled INTEGER NOT NULL DEFAULT 1;
-- Hrací dny ligy jako čísla getDay() oddělená čárkou (0 = neděle). NULL = pondělí a čtvrtek.
ALTER TABLE leagues ADD COLUMN match_weekdays TEXT;

-- Povaha AI trenéra (JSON), viz apps/api/src/ai-coach/profile.ts.
ALTER TABLE managers ADD COLUMN ai_profile TEXT;

-- Opuštěný lidský klub, který převzal AI trenér: kdy a komu patřil (návrat vlastníka).
ALTER TABLE teams ADD COLUMN ai_since TEXT;
ALTER TABLE teams ADD COLUMN ai_former_user_id TEXT;

-- Deník rozhodnutí AI trenérů.
CREATE TABLE IF NOT EXISTS ai_coach_decisions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  model TEXT,
  context_ref TEXT,
  input_summary TEXT,
  raw_output TEXT,
  actions TEXT,
  executed TEXT,
  used_fallback INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_coach_decisions_team ON ai_coach_decisions(team_id, created_at);

-- Pojistka proti dvojímu zpracování úlohy AI trenéra (fronty doručují aspoň jednou).
CREATE TABLE IF NOT EXISTS ai_coach_claims (
  team_id TEXT NOT NULL,
  task TEXT NOT NULL,
  day TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (team_id, task, day)
);
