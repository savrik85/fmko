-- Celorepublikový amatérský pohár (KO). Samostatná soutěž napříč ligami + generované velkokluby.

CREATE TABLE IF NOT EXISTS cup_competitions (
  id TEXT PRIMARY KEY,
  season_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- active | finished
  total_rounds INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 1,
  winner_team_id TEXT,                       -- cup_teams.id vítěze
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Účastníci poháru: buď reálný herní tým (team_id), nebo generovaný velkoklub (team_id IS NULL).
CREATE TABLE IF NOT EXISTS cup_teams (
  id TEXT PRIMARY KEY,
  cup_id TEXT NOT NULL,
  team_id TEXT,                              -- reálný tým ze hry; NULL = velkoklub
  name TEXT NOT NULL,
  strength INTEGER NOT NULL,                 -- síla pro simulaci (reál = průměr kádru, velkoklub = generováno)
  is_big_club INTEGER NOT NULL DEFAULT 0,
  primary_color TEXT,
  eliminated_round INTEGER                   -- v jakém kole vypadl (NULL = stále ve hře / vítěz)
);

CREATE TABLE IF NOT EXISTS cup_matches (
  id TEXT PRIMARY KEY,
  cup_id TEXT NOT NULL,
  round INTEGER NOT NULL,                     -- 1 = první kolo (nejvíc týmů)
  bracket_pos INTEGER NOT NULL,              -- pozice dvojice v daném kole (pro strom pavouka)
  home_cup_team_id TEXT,                     -- cup_teams.id (NULL dokud není znám postupující)
  away_cup_team_id TEXT,
  home_score INTEGER,
  away_score INTEGER,
  home_pens INTEGER,                         -- penalty (jen při remíze)
  away_pens INTEGER,
  winner_cup_team_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | simulated
  scheduled_at TEXT,
  upset INTEGER NOT NULL DEFAULT 0           -- 1 = překvapení (slabší vyřadil výrazně silnějšího)
);

CREATE INDEX IF NOT EXISTS idx_cup_matches_cup_round ON cup_matches (cup_id, round);
CREATE INDEX IF NOT EXISTS idx_cup_teams_cup ON cup_teams (cup_id);
