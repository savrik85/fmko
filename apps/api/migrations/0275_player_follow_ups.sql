-- Odložené zprávy od hráčů (messaging/follow-ups.ts): hráč z práce slíbil, že se ozve
-- později; model byl mimo provoz, když trenér psal; poděkování den po přijaté pozvánce;
-- ranní omluva po opilé hlasovce. Doručuje je hodinový běh Telefonu (cron 30 * * * *).
CREATE TABLE IF NOT EXISTS player_follow_ups (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL,
  player_id       TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('reply_later', 'retry_reply', 'after_invite', 'hangover')),
  due_at          TEXT NOT NULL,
  payload         TEXT NOT NULL DEFAULT '{}',
  attempts        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  done_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_player_follow_ups_due ON player_follow_ups (done_at, due_at);
-- Jedna čekající odložená zpráva daného druhu na konverzaci: druhý pokus o totéž se zahodí.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_follow_ups_open
  ON player_follow_ups (conversation_id, kind) WHERE done_at IS NULL;

-- Kdy tým naposledy dostal zprávu „jen tak" (messaging/casual-messages.ts), kvůli četnosti.
ALTER TABLE teams ADD COLUMN last_casual_message_at TEXT;
