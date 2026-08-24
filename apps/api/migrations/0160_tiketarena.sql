-- 0160: Tiketaréna — sdílení tiketů a komentáře pod nimi.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0160_tiketarena.sql

-- Kdy hráč tiket vyvěsil. NULL = nesdílený, vidí ho jen on (a komisař).
-- Sdílí se vědomě: u běžícího tiketu tím odkrývá, na co vsadil.
ALTER TABLE bet_tickets ADD COLUMN shared_at TEXT;

CREATE INDEX IF NOT EXISTS idx_bet_tickets_shared
  ON bet_tickets(league_id, shared_at);

-- Komentáře ve vláknu pod tiketem.
CREATE TABLE IF NOT EXISTS bet_comments (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES bet_tickets(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL,
  -- Jméno klubu i trenéra je SNAPSHOT z okamžiku napsání, stejně jako
  -- v kabinetu grémia: po přejmenování klubu má vlákno dál dávat smysl.
  team_name   TEXT NOT NULL,
  author_name TEXT,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_bet_comments_ticket ON bet_comments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bet_comments_team ON bet_comments(team_id);
