-- Sponzorské nabídky soutěže.
--
-- Nabídky vznikají v zimní přestávce, přijmout jde nejvýš jednu a rozhoduje
-- o tom hlasování. Řádek zůstává i po vypršení, aby šlo dohledat, co soutěž
-- odmítla — a aby se táž nabídka nedala vygenerovat dvakrát.
CREATE TABLE IF NOT EXISTS competition_sponsor_offers (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  name              TEXT NOT NULL,
  amount            INTEGER NOT NULL DEFAULT 0,
  seasons           INTEGER NOT NULL DEFAULT 1,
  tier              TEXT NOT NULL DEFAULT 'mistni'
                      CHECK(tier IN ('mistni','okresni','regionalni')),
  conditions        TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','accepted','rejected','expired')),
  opened_game_date  TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(league_id, season_number, name)
);
CREATE INDEX IF NOT EXISTS idx_comp_sponsor_league
  ON competition_sponsor_offers(league_id, status);
