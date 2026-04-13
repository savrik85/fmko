-- Push notification subscriptions (Web Push API)
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_sub_team ON push_subscriptions(team_id);

-- Per-team notification preferences (which types trigger push)
CREATE TABLE notification_preferences (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  match_reminder INTEGER NOT NULL DEFAULT 1,
  match_result INTEGER NOT NULL DEFAULT 1,
  transfer INTEGER NOT NULL DEFAULT 1,
  challenge INTEGER NOT NULL DEFAULT 1,
  event INTEGER NOT NULL DEFAULT 1,
  season INTEGER NOT NULL DEFAULT 1,
  system INTEGER NOT NULL DEFAULT 1
);
