-- Petice občanů — měsíční random event, hráč může akceptovat (zaplatit cost,
-- získat favor) nebo ignorovat (-favor po expiraci).

CREATE TABLE village_petitions (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cost_money INTEGER NOT NULL DEFAULT 0,
  reward_favor INTEGER NOT NULL,
  ignore_penalty INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','accepted','ignored','expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX idx_petitions_team ON village_petitions(team_id, status);
CREATE INDEX idx_petitions_expires ON village_petitions(status, expires_at);
