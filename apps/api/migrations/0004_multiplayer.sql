-- FMK-18: Multiplayer — asynchronní PvP zápasy

-- PvP matches (liga i přátelské)
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  league_id TEXT,                     -- NULL pro přátelské
  calendar_id TEXT REFERENCES season_calendar(id),
  round INTEGER,
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  home_lineup_id TEXT REFERENCES lineups(id),
  away_lineup_id TEXT REFERENCES lineups(id),
  home_score INTEGER,
  away_score INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','lineups_open','simulated')),
  events TEXT,                        -- JSON: MatchEvent[]
  commentary TEXT,                    -- JSON: string[]
  player_ratings TEXT,                -- JSON: {playerId: number}
  simulated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_matches_home ON matches(home_team_id);
CREATE INDEX idx_matches_away ON matches(away_team_id);
CREATE INDEX idx_matches_calendar ON matches(calendar_id);
CREATE INDEX idx_matches_status ON matches(status);

-- Friendly match challenges
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenger_team_id TEXT NOT NULL REFERENCES teams(id),
  challenged_team_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired','played')),
  match_id TEXT REFERENCES matches(id),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_challenges_challenger ON challenges(challenger_team_id);
CREATE INDEX idx_challenges_challenged ON challenges(challenged_team_id);
CREATE INDEX idx_challenges_status ON challenges(status);
