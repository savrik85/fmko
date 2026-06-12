-- Vztahy mezi manažery — respekt/heat na dvojici týmů + log interakcí
CREATE TABLE IF NOT EXISTS manager_relations (
  team_a_id TEXT NOT NULL REFERENCES teams(id),
  team_b_id TEXT NOT NULL REFERENCES teams(id),
  respect INTEGER NOT NULL DEFAULT 0,
  heat INTEGER NOT NULL DEFAULT 0,
  history TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (team_a_id, team_b_id)
);

CREATE TABLE IF NOT EXISTS manager_interactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor_team_id TEXT NOT NULL REFERENCES teams(id),
  target_team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'resolved',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_mi_actor ON manager_interactions(actor_team_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_mi_pair ON manager_interactions(actor_team_id, target_team_id, type);
CREATE INDEX IF NOT EXISTS idx_mi_match ON manager_interactions(match_id);
