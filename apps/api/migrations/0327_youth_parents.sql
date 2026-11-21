-- 0327: Fotbaloví rodiče v U21 (F12). Rodič hráče z dorostu (U21) lidského klubu píše trenérovi
-- přes Telefon (participant_id yp-<id hráče>): když syn dvakrát po sobě nehrál, když se zranil
-- a po výhře. Táta podnikatel nabídne klubu příspěvek, když syn nastoupí od začátku (dohoda
-- v coach_commitments, kind = 'parent_deal'), máma po ignorování pohrozí přestupem do Vimperka
-- (důvod nespokojenosti 'parent'). Když trenér do lhůty neodpoví, rodič se urazí.
--
-- Rodiče vznikají líně v hodinovém běhu Telefonu (youth/parents-db.ts tickYouthParents),
-- u dvou až tří hráčů U21 v klubu. AI kluby rodiče nemají.
--
-- Aplikovat MANUÁLNĚ (NE wrangler d1 migrations apply):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0327_youth_parents.sql
-- Jen CREATE TABLE/INDEX IF NOT EXISTS, opakované spuštění je bezpečné.

CREATE TABLE IF NOT EXISTS youth_parents (
  id                    TEXT PRIMARY KEY,          -- yp-<player_id>
  player_id             TEXT NOT NULL UNIQUE,      -- syn v dorostu (U21)
  team_id               TEXT NOT NULL,             -- klub (áčko), jehož trenérovi rodič píše
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  avatar                TEXT,                      -- JSON facesjs
  archetype             TEXT NOT NULL CHECK(archetype IN ('ambitious_father','worried_mother','sponsor_dad','quiet')),
  mood                  TEXT NOT NULL DEFAULT 'calm' CHECK(mood IN ('calm','pleased','upset','offended')),
  -- Spouštěč čekající na odeslání: SMS odejde s prodlevou, v noci až ráno.
  pending_topic         TEXT CHECK(pending_topic IN ('benched','injury','win')),
  pending_key           TEXT,                      -- id zápasu nebo zranění
  pending_due_at        TEXT,
  -- Zpracované spouštěče (opakovaný běh nic nezdvojí).
  last_match_key        TEXT,
  last_injury_id        TEXT,
  last_sms_at           TEXT,
  sms_count             INTEGER NOT NULL DEFAULT 0,
  -- Lhůta na odpověď trenéra; po ní se rodič urazí.
  awaiting_reply_until  TEXT,
  last_coach_reply_at   TEXT,
  offended_at           TEXT,
  threat_at             TEXT,                      -- máma pohrozila Vimperkem
  -- Otevřená nabídka příspěvku od táty podnikatele (čeká na odpověď trenéra).
  deal_offer_amount     INTEGER,
  deal_offer_at         TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_youth_parents_team ON youth_parents(team_id);
CREATE INDEX IF NOT EXISTS idx_youth_parents_pending ON youth_parents(pending_due_at);
CREATE INDEX IF NOT EXISTS idx_youth_parents_awaiting ON youth_parents(awaiting_reply_until);
