-- Okresní akce (2026-10-31): pouť, bál, dožínky… Spouští je ručně admin, když něco
-- vymyslíme. Lidským trenérům okresu přijde pozvánka, odpoví „přijdu s hráči / sám /
-- nepřijdu" a v den akce model z lidí, kteří tam opravdu jsou, vymyslí, co se stalo.
-- Kód jen hlídá meze následků. AI kluby se akcí neúčastní.
CREATE TABLE IF NOT EXISTS district_events (
  id            TEXT PRIMARY KEY,
  district      TEXT NOT NULL,
  title         TEXT NOT NULL,
  place         TEXT NOT NULL,
  description   TEXT NOT NULL,
  invitation    TEXT NOT NULL,
  event_date    TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'announced',
  attempts      INTEGER NOT NULL DEFAULT 0,
  report        TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_district_events_status ON district_events (status, event_date);

-- Pozvaný klub a jeho odpověď (alone | with_players | skip; NULL = neodpověděl).
CREATE TABLE IF NOT EXISTS district_event_teams (
  event_id   TEXT NOT NULL,
  team_id    TEXT NOT NULL,
  choice     TEXT,
  conv_id    TEXT,
  chosen_at  TEXT,
  PRIMARY KEY (event_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_district_event_teams_team ON district_event_teams (team_id);
