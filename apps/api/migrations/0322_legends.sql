-- 0322: Druhý život legend (F5). Hráč, který odešel ze souboje „kdo zůstane“ a byl v klubu
-- legendou (věk 30+ nebo aspoň dvě sezóny v klubu), se stane postavou v okrese (sudí, vůdce
-- kotle, hospodský, trenér žáků) a píše bývalému trenérovi přes Telefon (participant_id ex-<id>).
--
-- Háček v season/season-duels.ts jen zapíše kandidáta (status pending). Roli, článek
-- a SMS dělá hodinový běh Telefonu (season/legends-db.ts tickLegends).
--
-- Aplikovat MANUÁLNĚ (NE wrangler d1 migrations apply):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0322_legends.sql
-- Jen CREATE TABLE/INDEX IF NOT EXISTS, opakované spuštění je bezpečné.

CREATE TABLE IF NOT EXISTS legends (
  id                    TEXT PRIMARY KEY,          -- lg-<departed_player_id>
  departed_player_id    TEXT NOT NULL UNIQUE,      -- id hráče, archiv v departed_players
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  nickname              TEXT,
  avatar                TEXT,                      -- JSON facesjs z hráče
  age                   INTEGER NOT NULL,
  position              TEXT,
  overall_rating        INTEGER,
  personality           TEXT NOT NULL DEFAULT '{}', -- JSON povahy hráče (players.personality)
  occupation            TEXT,                      -- civilní povolání z life_context
  seasons_in_club       INTEGER NOT NULL DEFAULT 0,
  former_team_id        TEXT NOT NULL,
  coach_user_id         TEXT,                      -- trenér, který ho nechal odejít; jinému legenda nepíše
  district              TEXT NOT NULL,
  season_number         INTEGER NOT NULL,          -- sezóna, po které odešel
  status                TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','assigning','active','skipped')),
  role                  TEXT CHECK(role IN ('referee','fan_leader','pub_owner','youth_coach')),
  entity_id             TEXT,                      -- referees.id / fan_leaders.id / district_sponsors.id / staff_members.id
  decided_by            TEXT,                      -- model | rule
  role_reason           TEXT,
  news_id               TEXT,                      -- článek legend_farewell
  claimed_at            TEXT,
  first_sms_due_at      TEXT,
  first_sms_at          TEXT,
  last_sms_at           TEXT,
  sms_count             INTEGER NOT NULL DEFAULT 0,
  last_whistle_match_id TEXT,                      -- sudí-legenda ohlásil, že bývalému klubu píská
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_legends_status ON legends(status, created_at);
CREATE INDEX IF NOT EXISTS idx_legends_team ON legends(former_team_id, season_number);
CREATE INDEX IF NOT EXISTS idx_legends_district ON legends(district, season_number, role);
CREATE INDEX IF NOT EXISTS idx_legends_entity ON legends(role, entity_id);
