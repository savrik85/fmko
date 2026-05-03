-- NPC v hospodě — random encounter, hráč může pozvat na pivo (cost + trust)
-- nebo ignorovat (-1 favor po expiraci).

CREATE TABLE village_pub_encounters (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  official_id TEXT NOT NULL REFERENCES village_officials(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','accepted','ignored','expired')),
  expires_at TEXT NOT NULL,
  responded_at TEXT,
  outcome TEXT,                  -- 'beer' | 'scandal' | 'ignored'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pub_encounters_team ON village_pub_encounters(team_id, status);
CREATE INDEX idx_pub_encounters_status ON village_pub_encounters(status, expires_at);
