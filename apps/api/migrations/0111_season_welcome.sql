-- Uvítací obrazovka na začátku nové sezóny (novinky + co hráče čeká). Zrcadlo k season_recap.
CREATE TABLE IF NOT EXISTS season_welcome (
  team_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, season_number)
);
