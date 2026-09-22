-- 0212: Proč se hráč na trenéra zlobí (nebo ho má rád).
--
-- players.coach_relationship bylo jediné číslo bez historie. Mění ho ~10 míst
-- (chaty, odmítnutý přestup, rozhovory, hospoda, incidenty, nenominace) a nikde
-- se nezapisovalo proč. Každá změna teď jde přes lib/coach-relation.ts a nechá tu řádek,
-- ze kterého profil trenéra (Kabina) i profil hráče ukážou důvod.
--
-- Aplikovat MANUÁLNĚ a PŘED nasazením kódu, který do tabulky zapisuje
-- (jinak spadne celý batch, ve kterém je zápis vztahu):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0212_coach_relation_log.sql
-- Idempotentní.

CREATE TABLE IF NOT EXISTS coach_relation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  old_value INTEGER NOT NULL,
  new_value INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  raw_delta INTEGER NOT NULL,
  -- sms_thread | sms_ignored | transfer_rejected | interview | pub | incident | left_out | arrival | admin
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_id TEXT,
  game_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_rel_log_ref ON coach_relation_log(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_rel_log_team ON coach_relation_log(team_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_coach_rel_log_player ON coach_relation_log(player_id, id DESC);
