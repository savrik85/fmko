-- Stálé kádry klubů mimo hru (2026-10-18). Dřív skaut při každé návštěvě vylosoval nové
-- hráče, kteří existovali jen v jeho hlášení: dva týmy nikdy neviděly stejného hráče a
-- tentýž skaut viděl v Písku každý týden jiný kádr. Teď má klub obce na sezónu pevný kádr,
-- vznikne při první návštěvě kteréhokoli skauta a hráče dostane ten, kdo ho první podepíše.

-- Klub obce v sezóně: síla kádru (odvozená od ligy nejbližšího klubu ve hře, ne od kupce).
CREATE TABLE IF NOT EXISTS outside_clubs (
  village_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  club_mean REAL NOT NULL,
  anchor_league_id TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (village_id, season_number)
);

-- Hráči kádru. `id` se po podpisu stane `players.id`, takže stejného hráče nejde koupit dvakrát.
CREATE TABLE IF NOT EXISTS outside_players (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  position TEXT NOT NULL,
  age INTEGER NOT NULL,
  overall_rating INTEGER NOT NULL,
  -- Pořadí v kádru (1 = nejlepší): řídí cenu klubu.
  club_rank INTEGER NOT NULL,
  player_data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold')),
  -- Kdo ho koupil; NULL u prodeje jinému klubu mimo hru.
  sold_to_team_id TEXT,
  sold_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outside_players_slot ON outside_players(village_id, season_number, slot);

-- Hlášení na hráče stálého kádru. Víc týmů může mít hlášení na stejného hráče.
ALTER TABLE scout_reports ADD COLUMN outside_player_id TEXT;
CREATE INDEX IF NOT EXISTS idx_scout_reports_outside ON scout_reports(outside_player_id);
