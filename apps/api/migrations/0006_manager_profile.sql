-- Manager/coach profile
CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  team_id TEXT REFERENCES teams(id),
  name TEXT NOT NULL,
  backstory TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_managers_user ON managers(user_id);
CREATE INDEX idx_managers_team ON managers(team_id);

-- Persist display name from registration
ALTER TABLE users ADD COLUMN display_name TEXT;

-- System AI user for AI-controlled teams
INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none');
