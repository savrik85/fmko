-- Stadium entity — facilities, capacity, pitch condition, upgrades
CREATE TABLE IF NOT EXISTS stadiums (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL UNIQUE REFERENCES teams(id),
  capacity INTEGER NOT NULL DEFAULT 200,
  pitch_condition INTEGER NOT NULL DEFAULT 50,   -- 0-100 (0=bahno, 100=perfektní)
  pitch_type TEXT NOT NULL DEFAULT 'natural' CHECK(pitch_type IN ('natural','hybrid','artificial')),

  -- Facilities (level 0-3: 0=žádné, 1=základní, 2=dobré, 3=vynikající)
  changing_rooms INTEGER NOT NULL DEFAULT 1,
  showers INTEGER NOT NULL DEFAULT 1,
  refreshments INTEGER NOT NULL DEFAULT 0,        -- stánek s občerstvením
  lighting INTEGER NOT NULL DEFAULT 0,            -- osvětlení pro večerní zápasy
  stands INTEGER NOT NULL DEFAULT 0,              -- tribuny
  parking INTEGER NOT NULL DEFAULT 0,             -- parkoviště
  fence INTEGER NOT NULL DEFAULT 0,               -- oplocení hřiště

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_stadiums_team ON stadiums(team_id);
