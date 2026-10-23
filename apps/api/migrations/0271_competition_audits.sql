-- Revize účetnictví klubů. Smí ji provést komisař pro integritu soutěže, nebo prezident
-- soutěže, když funkce není obsazená. Jeden řádek na klub a sezónu: první nahlédnutí
-- pošle revidovanému klubu SMS, další nahlédnutí v téže sezóně už ne.
CREATE TABLE IF NOT EXISTS competition_audits (
  league_id       TEXT NOT NULL,
  season_number   INTEGER NOT NULL,
  target_team_id  TEXT NOT NULL,
  auditor_team_id TEXT NOT NULL,
  game_date       TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (league_id, season_number, target_team_id)
);
