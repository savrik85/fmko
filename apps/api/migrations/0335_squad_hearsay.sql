-- 0335: Kabina má uši (docs/superpowers/specs/2026-11-21-squad-ripple-conversations-design.md)
--
-- `squad_hearsay` = jedna věc, která se o hráči může roznést (co o něm trenér napsal jinému
-- hráči nebo do kabiny, změna kapitána, přestup kamaráda). `squad_hearsay_knowledge` = kdo ji
-- ví, od koho a jak (vzor club_incident_knowledge). Druhy bez CHECK: další fáze je rozšíří.
--
-- Jen přidávací migrace. Prod: záloha předem, pak
--   npx wrangler d1 execute prales-db-prod --remote --file apps/api/migrations/0335_squad_hearsay.sql

CREATE TABLE IF NOT EXISTS squad_hearsay (
  id                  TEXT PRIMARY KEY,
  club_team_id        TEXT NOT NULL,
  subject_player_id   TEXT NOT NULL,
  kind                TEXT NOT NULL,
  origin              TEXT NOT NULL,
  recipient_player_id TEXT,
  conversation_id     TEXT,
  quote               TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  expires_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_squad_hearsay_club ON squad_hearsay(club_team_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_squad_hearsay_subject ON squad_hearsay(subject_player_id, created_at);

CREATE TABLE IF NOT EXISTS squad_hearsay_knowledge (
  hearsay_id     TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  via            TEXT NOT NULL,
  from_player_id TEXT,
  learned_at     TEXT NOT NULL,
  message_state  TEXT NOT NULL DEFAULT 'none',
  messaged_at    TEXT,
  PRIMARY KEY (hearsay_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_hearsay_knowledge_player ON squad_hearsay_knowledge(player_id, learned_at);
CREATE INDEX IF NOT EXISTS idx_hearsay_knowledge_pending ON squad_hearsay_knowledge(message_state) WHERE message_state = 'pending';
