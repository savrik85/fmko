-- Změna UNIQUE constraintu na (player_id, team_id, season_id)
-- Umožňuje hráči mít statistiky za každý tým zvlášť v rámci sezóny
-- (přestupy mid-season nebudou sbírat goly do staré ligy)

ALTER TABLE player_stats RENAME TO player_stats_old;

CREATE TABLE player_stats (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  appearances INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  man_of_match INTEGER NOT NULL DEFAULT 0,
  minutes_played INTEGER NOT NULL DEFAULT 0,
  avg_rating REAL NOT NULL DEFAULT 0,
  clean_sheets INTEGER NOT NULL DEFAULT 0,
  UNIQUE(player_id, team_id, season_id)
);

INSERT INTO player_stats SELECT * FROM player_stats_old;

DROP TABLE player_stats_old;

CREATE INDEX idx_player_stats_player ON player_stats(player_id);
CREATE INDEX idx_player_stats_team ON player_stats(team_id);
CREATE INDEX idx_player_stats_season ON player_stats(season_id);
CREATE INDEX idx_player_stats_goals ON player_stats(season_id, goals DESC);
