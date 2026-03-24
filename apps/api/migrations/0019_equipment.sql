-- Team equipment — balls, jerseys, training gear, first aid etc.
CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL UNIQUE REFERENCES teams(id),
  balls INTEGER NOT NULL DEFAULT 0,
  jerseys INTEGER NOT NULL DEFAULT 0,
  training_cones INTEGER NOT NULL DEFAULT 0,
  first_aid INTEGER NOT NULL DEFAULT 0,
  boots_stock INTEGER NOT NULL DEFAULT 0,
  bibs INTEGER NOT NULL DEFAULT 0,
  balls_condition INTEGER NOT NULL DEFAULT 50,
  jerseys_condition INTEGER NOT NULL DEFAULT 50,
  training_cones_condition INTEGER NOT NULL DEFAULT 50,
  first_aid_condition INTEGER NOT NULL DEFAULT 50,
  boots_stock_condition INTEGER NOT NULL DEFAULT 50,
  bibs_condition INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_equipment_team ON equipment(team_id);
