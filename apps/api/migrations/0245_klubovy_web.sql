-- 0245_klubovy_web.sql — Nastavení, šablony a doplňky klubového webu

CREATE TABLE IF NOT EXISTS team_websites (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  template TEXT NOT NULL DEFAULT 'retro_2004',
  unlocked_templates TEXT NOT NULL DEFAULT '["retro_2004"]',
  unlocked_addons TEXT NOT NULL DEFAULT '[]',
  custom_slug TEXT UNIQUE,
  announcement TEXT,
  sponsor_banner_enabled INTEGER NOT NULL DEFAULT 0,
  visitor_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_websites_slug ON team_websites(custom_slug);
