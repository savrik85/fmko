-- Žáci: nová mládežnická akademie (docs/youth-academy-redesign-2026-11-04.md).
-- Kluci 12–15 let, které klub vychovává; hráči se z nich stanou až přijetím do dorostu.
CREATE TABLE IF NOT EXISTS youth_prospects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  position TEXT NOT NULL,
  home_village_id TEXT,
  identity_seed INTEGER NOT NULL,
  hidden_talent INTEGER NOT NULL,
  gem_cap INTEGER NOT NULL DEFAULT 0,
  progress_current REAL NOT NULL DEFAULT 0,
  progress_cap REAL NOT NULL DEFAULT 0,
  estimate_offset REAL NOT NULL DEFAULT 0,
  traits TEXT NOT NULL DEFAULT '[]',
  commitment INTEGER NOT NULL DEFAULT 70,
  status TEXT NOT NULL DEFAULT 'active',
  next_offer_on TEXT,
  player_id TEXT,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_youth_prospects_team ON youth_prospects(team_id, status);
CREATE INDEX IF NOT EXISTS idx_youth_prospects_offer ON youth_prospects(status, next_offer_on);

-- Zázemí žáků (provoz, hala, autobus) a obce, kde klub v létě nabírá (kromě vlastní)
ALTER TABLE teams ADD COLUMN academy_upkeep INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN academy_hall INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN academy_bus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN academy_recruit_villages TEXT NOT NULL DEFAULT '[]';

-- Nabídka do dorostu od trenéra mládeže ukazuje na kluka u žáků
ALTER TABLE player_offers ADD COLUMN prospect_id TEXT;
CREATE INDEX IF NOT EXISTS idx_player_offers_prospect ON player_offers(prospect_id);

-- Klub, který hráče vychoval (výchovné, Odchovanci klubu)
ALTER TABLE players ADD COLUMN raised_by_team_id TEXT;
