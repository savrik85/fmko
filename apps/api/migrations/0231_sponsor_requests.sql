-- Prosba o příspěvek u majitele firmy (sponsors/requests.ts): peníze na účel, kontrola po 30 dnech.
CREATE TABLE IF NOT EXISTS sponsor_requests (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('coach', 'transfer', 'equipment', 'stadium', 'youth')),
  asked INTEGER NOT NULL,
  granted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('refused', 'granted', 'kept', 'broken', 'lapsed')),
  refusal TEXT,
  note TEXT,
  request_day TEXT NOT NULL,
  check_day TEXT,
  season INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_requests_team_sponsor ON sponsor_requests(team_id, sponsor_id, request_day);
CREATE INDEX IF NOT EXISTS idx_sponsor_requests_due ON sponsor_requests(status, check_day);
