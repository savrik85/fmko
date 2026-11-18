-- Dohody z rozhovorů (2026-11-18): co trenér hráči napsal vlastními slovy a hra to bere vážně.
-- „Zítra jsi v základu“, „zkusím tě na křídle“, „tady máš prémii“, „pustím tě při další nabídce“.
-- Sliby z tlačítek dohody dál žijí v player_promises (tam typy hlídá CHECK a změna by
-- znamenala přestavbu tabulky). Druh tady kontroluje kód, viz messaging/coach-commitments.ts.
CREATE TABLE IF NOT EXISTS coach_commitments (
  id TEXT PRIMARY KEY,
  -- Klub (áčko), jehož trenér slib dal.
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  conversation_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  made_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  resolved_at TEXT,
  -- Trenérova slova, jak je napsal (zkrácená).
  quote TEXT,
  -- JSON: pozice, částka, procento, podmínka sázky…
  details TEXT,
  last_reminder_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_coach_commitments_active ON coach_commitments(status, due_at);
CREATE INDEX IF NOT EXISTS idx_coach_commitments_player ON coach_commitments(player_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_commitments_team ON coach_commitments(team_id, status);
