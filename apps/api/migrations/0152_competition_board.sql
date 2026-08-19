-- 0152: Kabinet — interní komunikace vedení soutěže.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0152_competition_board.sql
--
-- Vlastní tabulka místo group_chats: ta má scope omezený CHECKem na 'global'/'league'
-- a rozšíření by znamenalo přestavbu tabulky. Kabinet je navíc jiný druh vlákna —
-- čte a píše do něj JEN ten, kdo v soutěži právě zastává funkci, a to se v čase mění.

CREATE TABLE IF NOT EXISTS competition_board_messages (
  id            TEXT PRIMARY KEY,
  league_id     TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  team_id       TEXT NOT NULL,
  -- Jméno a role se ukládají jako SNAPSHOT: až pisatele odvolají nebo mu skončí
  -- mandát, musí u staré zprávy zůstat, kým byl, když ji psal.
  sender_name   TEXT NOT NULL,
  sender_role   TEXT NOT NULL,
  body          TEXT NOT NULL,
  sent_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_board ON competition_board_messages(league_id, sent_at DESC);

-- Kdo co přečetl — kvůli odznáčku nepřečtených.
CREATE TABLE IF NOT EXISTS competition_board_reads (
  league_id    TEXT NOT NULL,
  team_id      TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (league_id, team_id)
);
