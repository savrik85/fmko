-- 0127: Redakce okresního zpravodaje.
--
-- Články dosud psal nikdo — pod každým stálo jen „Redakce". Teď má každý okres
-- vlastní partu redaktorů s povahou, která se propíše do tónu článků i do toho,
-- jak se ptají v rozhovorech. Vztah redaktora ke klubu se v čase mění podle
-- toho, jak s ním trenér jedná, a promítá se zpátky do hry.

CREATE TABLE IF NOT EXISTS journalists (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  nickname      TEXT,
  gender        TEXT NOT NULL DEFAULT 'm' CHECK(gender IN ('m','f')),
  age           INTEGER NOT NULL DEFAULT 40,
  avatar        TEXT NOT NULL,
  -- Povahové osy 0–100. Nejde o štítky, ale o hodnoty, které jdou do promptu.
  style         TEXT NOT NULL CHECK(style IN ('bulvar','seriozni','vycurany','patriot')),
  bulvarnost    INTEGER NOT NULL DEFAULT 50,
  zlomyslnost   INTEGER NOT NULL DEFAULT 50,
  odbornost     INTEGER NOT NULL DEFAULT 50,
  bio           TEXT NOT NULL DEFAULT '',
  hlaska        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_journalists_league ON journalists(league_id);

-- Vztah redaktor–klub: -100 (jde po nich) … 0 (neutrál) … +100 (drží palce)
CREATE TABLE IF NOT EXISTS journalist_relations (
  id            TEXT PRIMARY KEY,
  journalist_id TEXT NOT NULL,
  team_id       TEXT NOT NULL,
  sentiment     INTEGER NOT NULL DEFAULT 0,
  duvod         TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(journalist_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_jrel_team ON journalist_relations(team_id);

-- Podpis pod článkem
ALTER TABLE news ADD COLUMN journalist_id TEXT;
