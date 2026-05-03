-- Tier-based fanouškovská základna: hardcore/regular/casual + streaks pro promotion
-- a propagační konverzi. Backfill ze stávajících teams.

CREATE TABLE team_fanbase (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  hardcore_count INTEGER NOT NULL DEFAULT 0,
  regular_count INTEGER NOT NULL DEFAULT 0,
  casual_count INTEGER NOT NULL DEFAULT 0,
  -- streaks pro postup mezi tiery (počítají home zápasy v řadě)
  casual_to_regular_streak INTEGER NOT NULL DEFAULT 0,
  regular_to_hardcore_streak INTEGER NOT NULL DEFAULT 0,
  -- propagační kampaň (promotion) tracking
  promo_consecutive_matches INTEGER NOT NULL DEFAULT 0,
  promo_unpromoted_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Backfill: hardcore 0.5 %, regular 2 %, casual 3 % populace vesnice
-- Vesnice 200 obyv → 1 / 4 / 6 = 11 stálých
INSERT INTO team_fanbase (team_id, hardcore_count, regular_count, casual_count)
SELECT
  t.id,
  CAST(v.population * 0.005 AS INTEGER),
  CAST(v.population * 0.020 AS INTEGER),
  CAST(v.population * 0.030 AS INTEGER)
FROM teams t
JOIN villages v ON t.village_id = v.id;
