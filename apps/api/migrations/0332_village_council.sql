-- 0332: Zasedání zastupitelstva (F18). Jednou za herní měsíc obec rozdělí bank mezi spolky:
-- hasiče, myslivce a fotbal (každý klub obce zvlášť). Starosta pozve trenéra SMS přes Telefon
-- (participant_id vo-<village_officials.id>), trenér odpoví proslovem, model ho posoudí.
--
-- Zasedání zakládá pondělní větev denního ticku, pozvánky, odpovědi a rozdělení dělá hodinový
-- běh Telefonu (villages/council-db.ts). Dotace jde přes recordTransaction typ village_grant
-- s reference_id = village_grants.id.
--
-- Aplikovat MANUÁLNĚ (NE wrangler d1 migrations apply):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0332_village_council.sql
-- Jen CREATE TABLE/INDEX IF NOT EXISTS, opakované spuštění je bezpečné.

CREATE TABLE IF NOT EXISTS village_council_sessions (
  id             TEXT PRIMARY KEY,           -- vcs-<village_id>-<YYYY-MM>
  village_id     TEXT NOT NULL,
  month          TEXT NOT NULL,              -- herní měsíc YYYY-MM, jedno zasedání za měsíc
  session_date   TEXT NOT NULL,              -- herní den zasedání YYYY-MM-DD
  pot            INTEGER NOT NULL,           -- bank obce pro spolky v Kč
  status         TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','deciding','closed')),
  mayor_id       TEXT,                       -- village_officials.id starosty, který zve
  mayor_name     TEXT,
  invite_due_at  TEXT NOT NULL,              -- kdy starosta pošle pozvánky (reálný čas, přes den)
  deadline_at    TEXT NOT NULL,              -- začátek zasedání = lhůta na proslov
  claimed_at     TEXT,                       -- zámek rozdělení (převezme se po čtvrthodině)
  result         TEXT,                       -- JSON: rozdělení, článek, id článků podle soutěží
  news_id        TEXT,
  closed_at      TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(village_id, month)
);
CREATE INDEX IF NOT EXISTS idx_council_sessions_status ON village_council_sessions(status, deadline_at);

CREATE TABLE IF NOT EXISTS village_grants (
  id             TEXT PRIMARY KEY,           -- vg-<session_id>-firefighters | hunters | <team_id>
  session_id     TEXT NOT NULL,
  village_id     TEXT NOT NULL,
  applicant      TEXT NOT NULL CHECK(applicant IN ('firefighters','hunters','club')),
  team_id        TEXT,                       -- jen fotbal
  amount         INTEGER NOT NULL DEFAULT 0,
  conv_id        TEXT,                       -- vlákno se starostou
  invited_at     TEXT,
  reminded_at    TEXT,
  speech         TEXT,                       -- proslov (SMS trenéra do začátku zasedání)
  speech_at      TEXT,
  speech_by      TEXT,                       -- coach | model | rule (AI klub)
  verdict        TEXT,                       -- JSON {score, reaction, by}
  pending_reply  TEXT,                       -- odpověď starosty čekající na prodlevu
  reply_due_at   TEXT,
  acked_at       TEXT,
  decided_at     TEXT,
  favor_applied  INTEGER NOT NULL DEFAULT 0,
  notified_at    TEXT,                       -- SMS od Redakce Zpravodaje
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_village_grants_session ON village_grants(session_id);
CREATE INDEX IF NOT EXISTS idx_village_grants_team ON village_grants(team_id, created_at);
CREATE INDEX IF NOT EXISTS idx_village_grants_reply ON village_grants(reply_due_at) WHERE pending_reply IS NOT NULL;
