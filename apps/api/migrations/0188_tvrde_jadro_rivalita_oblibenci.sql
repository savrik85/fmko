-- Tvrdé jádro, rivalita mezi tábory a oblíbenci/otloukánci
--
-- Tři věci, které partám chyběly, aby to nebyla jen čísla:
--
-- 1. JÁDRO. Parta o třiceti lidech není třicet stejných lidí. Bordel dělá a ven
--    jezdí pár desítek nejtvrdších — a jen ti se serou s hostujícím kotlem.
--    `core` je jejich počet; roste, když se partě vychází vstříc, a klesá po
--    represích (zavřený sektor, zákazy, nejvyšší ochranka).
--
-- 2. RIVALITA. Dosud se „derby" poznalo jen podle heatu mezi MANAŽERY. Fanoušci
--    si ale pamatují své vlastní křivdy: kdo s kým se pral, komu zapálili sektor.
--    `fan_rivalries` drží dvojici klubů (vždy lexikograficky seřazenou, takže
--    každá dvojice existuje jednou) a její teplotu.
--
-- 3. OBLÍBENCI. Každá parta má svého miláčka a svého otloukánka. Kotel miluje
--    dříče, co nechává na hřišti kůži; pamětníci toho, kdo je v klubu nejdéle;
--    rodiny slušňáka. Prodat jim miláčka bolí, nasazovat otloukánka štve.

ALTER TABLE fan_groups ADD COLUMN core INTEGER NOT NULL DEFAULT 0;

-- Proti komu ta výtržnost byla — u rvačky je to druhý klub, jinak NULL.
ALTER TABLE fan_incidents ADD COLUMN opponent_team_id TEXT;

CREATE TABLE IF NOT EXISTS fan_rivalries (
  id          TEXT PRIMARY KEY,          -- riv-<team_a>-<team_b>
  -- Pořadí je dané lexikograficky, ne kdo byl doma. Jinak by vznikly dva řádky
  -- pro jednu rivalitu a každý by si pamatoval jinou polovinu historie.
  team_a      TEXT NOT NULL,
  team_b      TEXT NOT NULL,
  heat        INTEGER NOT NULL DEFAULT 0,   -- 0–100, jak je to mezi tábory horké
  fights      INTEGER NOT NULL DEFAULT 0,   -- kolik rvaček už spolu měli
  incidents   INTEGER NOT NULL DEFAULT 0,   -- kolik jiných průšvihů u jejich zápasů
  last_game_date TEXT,                      -- herní datum posledního přiložení
  history     TEXT NOT NULL DEFAULT '[]',   -- JSON: posledních pár momentů, co to rozpálily
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(team_a, team_b)
);

CREATE INDEX IF NOT EXISTS idx_fan_rivalries_a ON fan_rivalries(team_a);
CREATE INDEX IF NOT EXISTS idx_fan_rivalries_b ON fan_rivalries(team_b);

CREATE TABLE IF NOT EXISTS fan_group_players (
  id         TEXT PRIMARY KEY,           -- fgp-<group_id>-<stance>
  group_id   TEXT NOT NULL,
  team_id    TEXT NOT NULL,              -- denormalizace kvůli výpisu bez JOINu
  player_id  TEXT NOT NULL,
  stance     TEXT NOT NULL CHECK(stance IN ('oblibenec','otloukanek')),
  -- Skóre, kterým hráč vyhrál. Drží se, aby výměna potřebovala zřetelný náskok
  -- a miláček se neměnil každý den podle šumu.
  score      REAL NOT NULL DEFAULT 0,
  duvod      TEXT NOT NULL DEFAULT '',
  since      TEXT,                       -- herní datum, odkdy to platí
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(group_id, stance)
);

CREATE INDEX IF NOT EXISTS idx_fan_group_players_team ON fan_group_players(team_id);
CREATE INDEX IF NOT EXISTS idx_fan_group_players_player ON fan_group_players(player_id);
