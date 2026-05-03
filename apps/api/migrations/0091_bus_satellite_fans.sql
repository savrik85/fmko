-- Per-vesnice tier breakdown stálých fanoušků získaných díky autobusu.
-- Drop-in se po 3 zápasech v řadě konvertuje do casual_count, dál může
-- promotovat přes obecné tier streaky v team_fanbase.

CREATE TABLE bus_satellite_fans (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  village_id TEXT NOT NULL REFERENCES villages(id),
  casual_count INTEGER NOT NULL DEFAULT 0,
  regular_count INTEGER NOT NULL DEFAULT 0,
  hardcore_count INTEGER NOT NULL DEFAULT 0,
  consecutive_buses INTEGER NOT NULL DEFAULT 0,
  last_bus_match_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, village_id)
);

CREATE INDEX idx_bus_satellite_team ON bus_satellite_fans(team_id);
