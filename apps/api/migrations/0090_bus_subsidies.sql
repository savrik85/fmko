-- Záznam každé objednávky autobusu pro home zápas (jednorázový drop-in z okolní obce).

CREATE TABLE bus_subsidies (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT NOT NULL REFERENCES matches(id),
  source_village_id TEXT NOT NULL REFERENCES villages(id),
  bus_size TEXT NOT NULL CHECK(bus_size IN ('traktor','karosa','autokar')),
  cost INTEGER NOT NULL,
  attendees_brought INTEGER,  -- vyplní post-match logika
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bus_subsidies_team_match ON bus_subsidies(team_id, match_id);
CREATE INDEX idx_bus_subsidies_match ON bus_subsidies(match_id);
