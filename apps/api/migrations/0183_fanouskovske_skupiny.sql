-- 0183: Fanouškovské skupiny, jejich vůdci a výtržnosti na stadionu.
--
-- Skupina NENÍ náhrada `team_fanbase` (hardcore/regular/casual). Ta zůstává jediným
-- zdrojem pro návštěvnost (`expectedAttendance`) i domácí výhodu — skupina je pohled
-- na ni: drží `share` (podíl na své vrstvě) a `size` se z fanbáze přepočítává v denním
-- ticku. Součty tak vždy sedí a nic z ekonomiky se nemusí přepisovat.
--
-- Vůdce skupiny je člověk z DRUHÉ strany stolu než zaměstnanec `sef_fanklubu`.
-- Šéf fanklubu je klubový placený most k fanouškům; vůdce mluví za kotel proti vedení.
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0183_fanouskovske_skupiny.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou. CREATE TABLE ano.

CREATE TABLE IF NOT EXISTS fan_groups (
  id            TEXT PRIMARY KEY,           -- deterministicky: fg-<teamId>-<kind>
  team_id       TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK(kind IN ('kotel','stamgasti','rodiny','pametnici','parta_z_okoli')),
  name          TEXT NOT NULL,              -- vygenerovaný název ("Prales Boys", "Štamgasti od Kaštanu")

  -- share = podíl na SVÉ vrstvě fanbáze, size = přepočítané číslo (denní tick).
  -- size je odvozenina, ne pravda — pravdou zůstává team_fanbase.
  share         REAL NOT NULL DEFAULT 0.2,
  size          INTEGER NOT NULL DEFAULT 0,

  mood          INTEGER NOT NULL DEFAULT 55,  -- 0-100, nálada skupiny
  heat          INTEGER NOT NULL DEFAULT 0,   -- 0-100, naštvanost na vedení klubu

  -- Povahové osy 0–100 — vstupy vzorců, ne popisky.
  passion       INTEGER NOT NULL DEFAULT 50,  -- jak jim na klubu záleží
  aggression    INTEGER NOT NULL DEFAULT 50,  -- základ šance na výtržnost
  loyalty       INTEGER NOT NULL DEFAULT 50,  -- jak snadno odejdou
  spending      INTEGER NOT NULL DEFAULT 50,  -- kolik utratí za občerstvení
  noise         INTEGER NOT NULL DEFAULT 50,  -- příspěvek k domácí výhodě

  sector           TEXT NOT NULL DEFAULT 'hlavni' CHECK(sector IN ('kotel','hlavni','za_branou')),
  closed_until_gd  TEXT,                    -- uzavřený sektor do herního data (YYYY-MM-DD)
  ticket_discount  REAL NOT NULL DEFAULT 0, -- 0–0.5, sleva na vstupné pro sektor

  leader_id     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(team_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_fan_groups_team ON fan_groups(team_id);

-- Vůdce patří JEDNOMU klubu (na rozdíl od rozhodčího, který píská všem), takže vztah
-- k vedení je přímo sloupec `sentiment` — samostatná tabulka jako referee_team_relations
-- by tu byla vždy 1:1.
CREATE TABLE IF NOT EXISTS fan_leaders (
  id            TEXT PRIMARY KEY,           -- fl-<hash>-<idx>
  group_id      TEXT NOT NULL,
  team_id       TEXT NOT NULL,              -- denormalizace kvůli výpisu bez JOINu
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  nickname      TEXT,
  gender        TEXT NOT NULL DEFAULT 'm' CHECK(gender IN ('m','f')),
  age           INTEGER NOT NULL,
  occupation    TEXT NOT NULL,
  archetype     TEXT NOT NULL,              -- klíč do FAN_LEADER_ARCHETYPES (engine/fan-groups.ts)

  charisma      INTEGER NOT NULL DEFAULT 50,  -- jak moc táhne skupinu za sebou
  radikalnost   INTEGER NOT NULL DEFAULT 50,  -- posouvá závažnost výtržnosti nahoru
  vyjednavani   INTEGER NOT NULL DEFAULT 50,  -- jak dobře se s ním manažer domluví

  avatar        TEXT NOT NULL,              -- JSON facesjs faceConfig (kompat. s <FaceAvatar>)
  bio           TEXT NOT NULL DEFAULT '',
  hlaska        TEXT NOT NULL DEFAULT '',
  sentiment     INTEGER NOT NULL DEFAULT 0, -- -100..100 vůči vedení klubu
  duvod         TEXT,                       -- poslední moment, co sentimentem hnul
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_fan_leaders_group ON fan_leaders(group_id, status);
CREATE INDEX IF NOT EXISTS idx_fan_leaders_team ON fan_leaders(team_id, status);

-- Co se na tribuně stalo. reference_id drží idempotenci: pozápasový hook i ruční
-- dev trigger můžou proběhnout dvakrát a pokuta se nesmí strhnout podruhé.
CREATE TABLE IF NOT EXISTS fan_incidents (
  id                    TEXT PRIMARY KEY,
  reference_id          TEXT,
  match_id              TEXT,
  team_id               TEXT NOT NULL,      -- čí fanoušci to byli
  group_id              TEXT,
  kind                  TEXT NOT NULL,      -- klíč do FAN_INCIDENTS (engine/fan-groups.ts)
  severity              INTEGER NOT NULL DEFAULT 1 CHECK(severity BETWEEN 1 AND 3),
  minute                INTEGER,
  text                  TEXT NOT NULL,      -- česky, co se stalo
  fine                  INTEGER NOT NULL DEFAULT 0,
  sector_closed_matches INTEGER NOT NULL DEFAULT 0,
  fans_lost             INTEGER NOT NULL DEFAULT 0,
  morale_delta          INTEGER NOT NULL DEFAULT 0,
  game_date             TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_fan_incidents_team ON fan_incidents(team_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fan_incidents_match ON fan_incidents(match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_incidents_ref ON fan_incidents(reference_id) WHERE reference_id IS NOT NULL;

-- Historie manažerských akcí. Nese zároveň cooldown — čte se odsud, žádný další sloupec.
CREATE TABLE IF NOT EXISTS fan_group_actions (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  group_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  cost        INTEGER NOT NULL DEFAULT 0,
  game_date   TEXT NOT NULL,
  effect_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_fan_group_actions ON fan_group_actions(group_id, action, game_date);

-- JSON snapshot výtržností pro detail zápasu — přesně jako matches.referee_incidents.
ALTER TABLE matches ADD COLUMN fan_incidents TEXT;

-- Pořadatelská služba: 0=nikdo, 1=dva pořadatelé, 2=pořadatelská služba, 3=agentura.
ALTER TABLE stadiums ADD COLUMN security INTEGER NOT NULL DEFAULT 0;
