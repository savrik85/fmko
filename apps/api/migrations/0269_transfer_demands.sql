-- Poptávky na přestupech (2026-10-19): manažer napíše, koho hledá, ostatní mu nabídnou hráče.
-- Poptávky dávají i kluby mimo hru; těm se hráč nabídne a klub sám rozhodne, jestli pošle nabídku.
CREATE TABLE IF NOT EXISTS transfer_demands (
  id TEXT PRIMARY KEY,
  -- Poptávající tým manažera. U klubu mimo hru NULL a klub je v club_data.
  team_id TEXT,
  -- JSON klubu mimo hru: name, city, district, rating, country.
  club_data TEXT,
  -- Okres, kde poptávku klubu mimo hru vidí (manažerské vidí všichni).
  district TEXT,
  league_id TEXT,
  position TEXT NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  -- starter = do základu, squad = do kádru, prospect = mladý talent.
  role TEXT NOT NULL CHECK (role IN ('starter', 'squad', 'prospect')),
  -- Strop ceny v Kč; NULL = cena dohodou.
  max_price INTEGER,
  -- Jen u klubu mimo hru: jak dobrého hráče potřebuje. Hráč ho nevidí.
  min_rating INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'filled')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfer_demands_status ON transfer_demands(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_transfer_demands_team ON transfer_demands(team_id, status);

-- Hráči nabídnutí k poptávce.
CREATE TABLE IF NOT EXISTS transfer_demand_pitches (
  id TEXT PRIMARY KEY,
  demand_id TEXT NOT NULL,
  -- Tým, který hráče nabídl.
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  -- pitched = čeká na poptávajícího manažera; accepted/declined = rozhodnutí klubu mimo hru.
  status TEXT NOT NULL DEFAULT 'pitched' CHECK (status IN ('pitched', 'accepted', 'declined')),
  -- Odpověď klubu mimo hru jednou větou.
  reply TEXT,
  -- Nabídka, kterou klub mimo hru na hráče poslal.
  offer_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (demand_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_transfer_demand_pitches_demand ON transfer_demand_pitches(demand_id);
CREATE INDEX IF NOT EXISTS idx_transfer_demand_pitches_team ON transfer_demand_pitches(team_id);
