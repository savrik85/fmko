-- Historie satisfaction delta po zápasech — pro graf vývoje a detail poslednich N zápasů
CREATE TABLE IF NOT EXISTS fans_match_history (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT,
  gamedate TEXT NOT NULL,
  satisfaction_before INTEGER NOT NULL,
  satisfaction_after INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reasons TEXT,                              -- JSON array stringů
  opponent_name TEXT,
  result TEXT,                               -- 'win' | 'draw' | 'loss'
  attendance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fans_history_team ON fans_match_history(team_id, created_at DESC);
