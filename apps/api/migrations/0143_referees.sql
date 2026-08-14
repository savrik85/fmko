-- 0143: Okresní rozhodčí — 15 na okres, delegace 2 herní dny předem.
--
-- Povaha a zkušenost jdou přímo do vzorců enginu (fauly, karty, penalty, sporné situace),
-- nejsou to jen štítky do UI. Pool je klíčovaný OKRESEM, ne ligou: liga se sice napříč
-- sezónami recykluje, ale U21 liga má district = "Prachatice U21" (obchází UNIQUE constraint
-- v 0009, viz league/u21-generator.ts) a district_surnames zná jen základní okresy.
-- Delegace proto okres normalizuje a senior i dorost sdílí jednu okresní komisi rozhodčích.
--
-- Aplikovat MANUÁLNĚ (NE `wrangler d1 migrations apply`):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0143_referees.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní — spouštět jen jednou. CREATE TABLE ano.
--
-- Odehrané zápasy zůstávají bez rozhodčího (referee_id NULL) ZÁMĚRNĚ — dogenerovat sudího
-- zpětně by zfalšovalo statistiky zápasů, které vznikly bez něj. Žádný backfill.

CREATE TABLE IF NOT EXISTS referees (
  id             TEXT PRIMARY KEY,
  district       TEXT NOT NULL,            -- normalizovaný okres (bez sufixu " U21")
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  nickname       TEXT,                     -- přezdívka z kabin ("Píšťala") — flavour
  gender         TEXT NOT NULL DEFAULT 'm' CHECK(gender IN ('m','f')),
  age            INTEGER NOT NULL,
  occupation     TEXT NOT NULL,            -- civilní povolání; okresní sudí je amatér
  archetype      TEXT NOT NULL,            -- klíč do REFEREE_ARCHETYPES (engine/referee.ts)

  -- Povahové osy 0–100 — vstupy vzorců, ne popisky.
  strictness     INTEGER NOT NULL DEFAULT 50,  -- kolik odpíská (foul rate + šířka zóny penalty)
  card_happiness INTEGER NOT NULL DEFAULT 50,  -- jak rychle sáhne do kapsy
  experience     INTEGER NOT NULL DEFAULT 50,  -- INVERZNĚ řídí šanci na spornou situaci
  home_bias      INTEGER NOT NULL DEFAULT 50,  -- 50 = neutrál, výš = nadržuje domácím
  advantage      INTEGER NOT NULL DEFAULT 50,  -- jak často pustí výhodu místo odpískání
  fitness        INTEGER NOT NULL DEFAULT 50,  -- nízká = po 70' víc karet a chyb

  avatar         TEXT NOT NULL,            -- JSON facesjs faceConfig (kompat. s <FaceAvatar>)
  bio            TEXT NOT NULL DEFAULT '', -- 1–2 věty do profilu
  hlaska         TEXT NOT NULL DEFAULT '', -- hláška na kartičku v přípravě zápasu
  status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_referees_district ON referees(district, status);

-- Sezónní bilance. Drží se inkrementálně, aby profil rozhodčího nemusel při každém otevření
-- agregovat všechny odehrané zápasy okresu (14 týmů × 26 kol = 182 zápasů za sezónu).
-- grade_sum = součet známek; průměr = grade_sum / matches.
CREATE TABLE IF NOT EXISTS referee_stats (
  id             TEXT PRIMARY KEY,
  referee_id     TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  league_id      TEXT,                     -- NULL = pohár (sudí píská napříč soutěžemi)
  matches        INTEGER NOT NULL DEFAULT 0,
  fouls          INTEGER NOT NULL DEFAULT 0,
  yellow_cards   INTEGER NOT NULL DEFAULT 0,
  red_cards      INTEGER NOT NULL DEFAULT 0,
  penalties      INTEGER NOT NULL DEFAULT 0,
  incidents      INTEGER NOT NULL DEFAULT 0,  -- kolikrát viditelně chyboval
  grade_sum      REAL NOT NULL DEFAULT 0,     -- součet známek 1,0–5,0
  home_wins      INTEGER NOT NULL DEFAULT 0,  -- podklad pro "nadržuje domácím?" v profilu
  away_wins      INTEGER NOT NULL DEFAULT 0,
  draws          INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(referee_id, season_number, league_id)
);
CREATE INDEX IF NOT EXISTS idx_ref_stats_ref ON referee_stats(referee_id, season_number);

-- Paměť rozhodčího vůči klubu. ZAKLÁDÁ SE UŽ TEĎ, ČTE SE AŽ VE FÁZI 3 (pozápasové rozhovory:
-- trenér mu vynadá → sentiment dolů → hraniční verdikty se posunou). Ve fázi 1 se plní jen
-- bilance, aby profil uměl "vůči mému týmu" a fáze 3 nepotřebovala další migraci.
CREATE TABLE IF NOT EXISTS referee_team_relations (
  id                TEXT PRIMARY KEY,
  referee_id        TEXT NOT NULL,
  team_id           TEXT NOT NULL,
  sentiment         INTEGER NOT NULL DEFAULT 0,  -- -100 (jde po nich) … 0 … +100 (drží palce)
  duvod             TEXT NOT NULL DEFAULT '',    -- poslední důvod změny, do UI
  matches           INTEGER NOT NULL DEFAULT 0,
  wins              INTEGER NOT NULL DEFAULT 0,
  draws             INTEGER NOT NULL DEFAULT 0,
  losses            INTEGER NOT NULL DEFAULT 0,
  yellow_cards      INTEGER NOT NULL DEFAULT 0,
  red_cards         INTEGER NOT NULL DEFAULT 0,
  penalties_for     INTEGER NOT NULL DEFAULT 0,
  penalties_against INTEGER NOT NULL DEFAULT 0,
  incidents_for     INTEGER NOT NULL DEFAULT 0,  -- chyby v jeho prospěch
  incidents_against INTEGER NOT NULL DEFAULT 0,  -- chyby proti němu — tohle si trenér pamatuje
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(referee_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_ref_rel_team ON referee_team_relations(team_id);

-- Delegace + snapshot na zápase.
-- referee_snapshot: JSON profilu k okamžiku výkopu. Atributy se budou v čase měnit a sudí
-- může odejít — bez snapshotu by historický detail zápasu lhal a pohárové zápasy velkoklubů
-- (bez řádku v referees) by neměly co zobrazit.
-- referee_incidents: JSON pole sporných situací (0 nebo 1 prvek). Události nesou engine teamId
-- (1/2), tohle nese DB UUID, aby FE i pozápasový rozhovor nemusely parsovat 200 událostí.
-- referee_grade: známka 1,0–5,0 za celý zápas, počítaná automaticky (engine/referee.ts).
ALTER TABLE matches ADD COLUMN referee_id TEXT;
ALTER TABLE matches ADD COLUMN referee_snapshot TEXT;
ALTER TABLE matches ADD COLUMN referee_incidents TEXT;
ALTER TABLE matches ADD COLUMN referee_grade REAL;

ALTER TABLE cup_matches ADD COLUMN referee_id TEXT;
ALTER TABLE cup_matches ADD COLUMN referee_snapshot TEXT;
ALTER TABLE cup_matches ADD COLUMN referee_incidents TEXT;
ALTER TABLE cup_matches ADD COLUMN referee_grade REAL;

CREATE INDEX IF NOT EXISTS idx_matches_referee ON matches(referee_id);
