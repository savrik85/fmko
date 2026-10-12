-- 0263_tournament_awards.sql: ceny Turnaje P-Mobile, vyhlášené po finále.
-- award: player (hráč turnaje), goalkeeper (gólman), young (mladý hráč do 21), veteran (osobnost 30+).
-- Jména drží snímek z vyhlášení, ať cena přežije odchod hráče z klubu.
CREATE TABLE IF NOT EXISTS tournament_awards (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  award TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_name TEXT NOT NULL,
  age INTEGER,
  apps INTEGER NOT NULL,
  goals INTEGER NOT NULL,
  assists INTEGER NOT NULL,
  avg_rating REAL NOT NULL,
  clean_sheets INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tournament_id, award)
);
