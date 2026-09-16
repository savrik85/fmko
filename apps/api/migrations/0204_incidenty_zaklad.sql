-- 0204: Incidenty v klubu, fáze 1 (docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3)
--
-- Aplikovat ručně:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0204_incidenty_zaklad.sql
-- ALTER TABLE ADD COLUMN nezná IF NOT EXISTS: při opakovaném běhu je „duplicate column" v pořádku.

CREATE TABLE IF NOT EXISTS club_incidents (
  id                TEXT PRIMARY KEY,        -- inc-{teamId}-{kind}-{YYYY-MM-DD}
  team_id           TEXT NOT NULL,
  league_id         TEXT,
  season_number     INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK(category IN ('kradez','poskozeni','zivotni','pozitivni')),
  status            TEXT NOT NULL CHECK(status IN ('hrozi','otevreny','policie','probiha','uzavreny')),
  severity          INTEGER NOT NULL DEFAULT 1 CHECK(severity BETWEEN 1 AND 3),
  game_date         TEXT NOT NULL,
  deadline          TEXT,
  ends_on           TEXT,
  culprit_type      TEXT CHECK(culprit_type IN ('hrac','cizi','zamestnanec','nikdo')),
  culprit_player_id TEXT,                    -- PRAVDA, API ji vrací jen při culprit_revealed = 1
  culprit_staff_id  TEXT,
  culprit_revealed  INTEGER NOT NULL DEFAULT 0,
  subject_player_id TEXT,
  loss              TEXT NOT NULL DEFAULT '[]', -- JSON pole ztrát (typ Ztrata v incidents/typy.ts)
  recovered         INTEGER NOT NULL DEFAULT 0,
  accusations       INTEGER NOT NULL DEFAULT 0,
  police_result_on  TEXT,
  police_success    INTEGER,
  bazar_on          TEXT,
  resolution        TEXT,
  resolution_data   TEXT,
  text              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_on       TEXT
);
CREATE INDEX IF NOT EXISTS idx_club_incidents_team ON club_incidents(team_id, status, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_club_incidents_player ON club_incidents(culprit_player_id);

ALTER TABLE equipment ADD COLUMN area_security INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN area_security_condition INTEGER NOT NULL DEFAULT 50;
