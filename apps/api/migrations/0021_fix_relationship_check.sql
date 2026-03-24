-- Fix relationship type CHECK constraint — add new types
-- SQLite can't ALTER CHECK, so we recreate the table

CREATE TABLE relationships_new (
  id TEXT PRIMARY KEY,
  player_a_id TEXT NOT NULL REFERENCES players(id),
  player_b_id TEXT NOT NULL REFERENCES players(id),
  type TEXT NOT NULL CHECK(type IN ('brothers','father_son','in_laws','classmates','coworkers','neighbors','drinking_buddies','rivals','mentor_pupil')),
  strength INTEGER NOT NULL DEFAULT 50
);

INSERT INTO relationships_new (id, player_a_id, player_b_id, type)
  SELECT id, player_a_id, player_b_id, type
  FROM relationships;

DROP TABLE relationships;
ALTER TABLE relationships_new RENAME TO relationships;

CREATE INDEX idx_relationships_a ON relationships(player_a_id);
CREATE INDEX idx_relationships_b ON relationships(player_b_id);
