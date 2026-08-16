-- Dead-letter záznamy z Cloudflare Queues.
-- Zpráva, která selhala i po vyčerpání max_retries, spadne do DLQ a zapíše se sem,
-- aby liga nevypadla potichu (dnešní chování: uvízne v 'lineup_locked' a nikdo to nevidí).
CREATE TABLE IF NOT EXISTS queue_failures (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  message_kind TEXT NOT NULL,
  league_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_failures_created ON queue_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_failures_unresolved ON queue_failures(resolved, created_at DESC);
