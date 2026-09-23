-- 0221: Jednání se sponzory (etapa 2) a sliby klubu (etapa 3).
-- Schéma je sdílené s plánem etapy 3, neměnit bez něj.
-- Aplikovat ručně PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0221_sponsor_negotiations.sql

CREATE TABLE IF NOT EXISTS sponsor_negotiations (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  category TEXT NOT NULL CHECK(category IN ('main','stadium')),
  wishes TEXT NOT NULL,          -- JSON array of promise kinds the owner wants
  budget_b INTEGER NOT NULL, patience INTEGER NOT NULL,
  rounds TEXT NOT NULL DEFAULT '[]',   -- JSON array of {proposal, response}
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','walked_away','expired','signed')),
  expires_game_date TEXT NOT NULL, cooldown_until TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_sponsor_negotiations_team ON sponsor_negotiations(team_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsor_negotiations_sponsor ON sponsor_negotiations(sponsor_id, team_id);
CREATE TABLE IF NOT EXISTS sponsor_promises (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), team_id TEXT NOT NULL REFERENCES teams(id),
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  kind TEXT NOT NULL,            -- league_position|promotion|no_relegation|cup_round|coach_licence|stadium_upgrade|jersey_logo|sector_exclusivity|attendance|youth|reputation|no_riots
  params TEXT NOT NULL,          -- JSON, e.g. {"position":3} / {"facility":"vip_box","level":2} / {"level":2}
  season INTEGER, deadline_game_date TEXT,
  value_share REAL NOT NULL, reward INTEGER NOT NULL DEFAULT 0, penalty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','partial','broken')),
  resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_sponsor_promises_contract ON sponsor_promises(contract_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_promises_open ON sponsor_promises(status, season);
ALTER TABLE sponsor_contracts ADD COLUMN signing_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsor_contracts ADD COLUMN paid_construction TEXT;
ALTER TABLE sponsor_contracts ADD COLUMN breaches_season INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsor_contracts ADD COLUMN negotiation_id TEXT;
