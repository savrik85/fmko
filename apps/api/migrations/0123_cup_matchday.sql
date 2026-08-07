-- Pohárový zápas jako plnohodnotný zápasový den: propagace + dovoz fanoušků.
-- Návštěva, vstupné a občerstvení už pohár měl (processMatchDayFinances), chyběla
-- propagace a autobusy z okolních obcí.

-- 1) Propagace pohárového zápasu — stejná trojice polí jako v matches.
ALTER TABLE cup_matches ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cup_matches ADD COLUMN promotion_cost INTEGER;
ALTER TABLE cup_matches ADD COLUMN promotion_boost REAL NOT NULL DEFAULT 1.0;

-- 2) bus_subsidies.match_id nově odkazuje na matches(id) NEBO cup_matches(id).
--    FK na matches by pohárovou objednávku odmítl → rebuild tabulky bez něj.
CREATE TABLE bus_subsidies_new (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT NOT NULL,          -- matches(id) nebo cup_matches(id) — bez FK, dvě zdrojové tabulky
  source_village_id TEXT NOT NULL REFERENCES villages(id),
  bus_size TEXT NOT NULL CHECK(bus_size IN ('traktor','karosa','autokar')),
  cost INTEGER NOT NULL,
  attendees_brought INTEGER,       -- vyplní post-match logika
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO bus_subsidies_new (id, team_id, match_id, source_village_id, bus_size, cost, attendees_brought, created_at)
  SELECT id, team_id, match_id, source_village_id, bus_size, cost, attendees_brought, created_at FROM bus_subsidies;

DROP TABLE bus_subsidies;
ALTER TABLE bus_subsidies_new RENAME TO bus_subsidies;

CREATE INDEX idx_bus_subsidies_team_match ON bus_subsidies(team_id, match_id);
CREATE INDEX idx_bus_subsidies_match ON bus_subsidies(match_id);
