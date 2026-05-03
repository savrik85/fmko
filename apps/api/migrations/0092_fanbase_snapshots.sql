-- Denní snapshot fanbase tieru + reputation/satisfaction pro graf vývoje.

CREATE TABLE fanbase_snapshots (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  gamedate TEXT NOT NULL,
  hardcore_total INTEGER NOT NULL,
  regular_total INTEGER NOT NULL,
  casual_total INTEGER NOT NULL,
  total_loyal INTEGER NOT NULL,
  reputation_at_time INTEGER NOT NULL,
  satisfaction_at_time INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, gamedate)
);

CREATE INDEX idx_fanbase_snapshots_team ON fanbase_snapshots(team_id, gamedate);
