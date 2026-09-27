-- Nové okresy otevírá správce až po přípravě místních dat.
CREATE TABLE district_registrations (
  district TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','ready')),
  founder_request_id TEXT,
  ready_at TEXT
);
CREATE TABLE league_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  district TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invited','activated')),
  activation_hash TEXT UNIQUE,
  activation_expires_at TEXT,
  user_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  activated_at TEXT
);
CREATE INDEX idx_league_requests_queue ON league_requests(status, created_at);
ALTER TABLE users ADD COLUMN registration_district TEXT;
-- Již rozehrané okresy zůstávají přístupné, předsedy jim neměníme.
INSERT INTO district_registrations (district, status, ready_at)
SELECT DISTINCT v.district, 'ready', strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM villages v JOIN teams t ON t.village_id = v.id WHERE t.user_id <> 'ai';
INSERT OR IGNORE INTO district_registrations (district, status, ready_at)
VALUES ('Prachatice', 'ready', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
       ('Praha', 'ready', strftime('%Y-%m-%dT%H:%M:%SZ','now'));
ALTER TABLE district_registrations ADD COLUMN founder_team_id TEXT;
