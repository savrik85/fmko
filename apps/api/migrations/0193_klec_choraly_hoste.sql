-- Klec nad kotlem, chorály a hostující kotel
--
-- 1. KLEC. Pořadatelská služba je lidi, oplocení je plot kolem hřiště. Klec
--    (plexi a mříž nad sektorem kotle) je třetí věc: skoro zabrání vniknutí na
--    plochu a házení předmětů, ale kotel ji nesnáší a ztlumí ho.
--
-- 2. CHORÁLY. Fanoušci si je vymýšlejí sami z toho, co se kolem klubu děje.
--    Drží se, protože chorál není jednorázová hláška: zpívá se, dokud platí
--    důvod, a pak se na něj zapomene.
--
-- 3. HOSTUJÍCÍ KOTEL. Dosud existoval jen jako číslo ve vzorci rizika. Teď se
--    zapisuje ke každému domácímu zápasu, aby bylo vidět, kolik jich přijelo
--    a jak se chovali.

ALTER TABLE stadiums ADD COLUMN cage INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS fan_chants (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  group_id    TEXT,
  -- Na co je: oblibenec | rival | trener_pro | trener_proti | vyhra | vzdor | vybaveni
  kind        TEXT NOT NULL,
  text        TEXT NOT NULL,
  -- Proč vznikl. Ukazuje se pod chorálem, ať je vidět, že to není náhoda.
  duvod       TEXT NOT NULL DEFAULT '',
  -- Jak často se zpívá 0-100. Roste opakováním, klesá, když důvod pomine.
  sila        INTEGER NOT NULL DEFAULT 40,
  since_game_date TEXT,
  last_game_date  TEXT,
  -- zpiva | zapomenut
  status      TEXT NOT NULL DEFAULT 'zpiva',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Jeden chorál na jeden důvod. Druhý by jen dělil pozornost.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_chants_druh
  ON fan_chants(team_id, kind) WHERE status = 'zpiva';
CREATE INDEX IF NOT EXISTS idx_fan_chants_team ON fan_chants(team_id, status);

-- Kolik hostů přijelo a co provedli. JSON, stejný vzor jako matches.fan_incidents.
ALTER TABLE matches ADD COLUMN away_fans TEXT;
ALTER TABLE cup_matches ADD COLUMN away_fans TEXT;
