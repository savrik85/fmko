-- 0185: Sběrnice událostí klubu, na kterou reagují fanoušci.
--
-- Projekt žádný centrální log dění nemá — efekty se hákují do každého call site
-- zvlášť. Pro fanoušky by to znamenalo dvacet nezávislých zásahů do přestupů,
-- sponzorů, poháru a rozhovorů. Místo toho jedna tabulka: kdo něco udělá, zapíše
-- sem řádek, a denní tick ho jednou promítne do nálady part.
--
-- Vzor je `reputation_log` (0126) — tatáž idempotence přes `reference_id`.
-- `processed_at` drží, co už fanoušci strávili; zpracovává se v `syncFanGroups`.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0185_udalosti_klubu.sql

CREATE TABLE IF NOT EXISTS club_events (
  id            TEXT PRIMARY KEY,
  reference_id  TEXT,                -- stabilní klíč, aby se událost nezapsala dvakrát
  team_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,       -- klíč do CLUB_EVENTS (engine/fan-reactions.ts)
  -- JSON s detaily do textu zprávy: jméno hráče, částka, procento, soupeř.
  payload       TEXT,
  -- 0–1, jak velká ta věc je. Prodej náhradníka a prodej kapitána není totéž.
  severity      REAL NOT NULL DEFAULT 0.5,
  game_date     TEXT NOT NULL,
  processed_at  TEXT,                -- NULL = fanoušci to ještě nevstřebali
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_club_events_team ON club_events(team_id, processed_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_events_ref ON club_events(reference_id) WHERE reference_id IS NOT NULL;

-- Pohárové zápasy mají výtržnosti stejně jako ligové; sloupec 0183 dostaly jen `matches`.
ALTER TABLE cup_matches ADD COLUMN fan_incidents TEXT;
