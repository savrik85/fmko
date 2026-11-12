-- Historie staveb stadionu: co se postavilo, kdy a za kolik. Dřív se ukládala jen aktuální
-- úroveň a jedinou stopou byla platba ve financích (bez úrovně). Z historie se dá omylem
-- postavená tribuna do 48 hodin vrátit i s penězi (reverted_at).
CREATE TABLE IF NOT EXISTS stadium_builds (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  facility TEXT NOT NULL,
  label TEXT NOT NULL,
  from_level INTEGER,
  to_level INTEGER,
  cost INTEGER NOT NULL DEFAULT 0,
  built_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  reverted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stadium_builds_team ON stadium_builds(team_id, built_at);
