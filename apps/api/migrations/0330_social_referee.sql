-- 0330_social_referee.sql: kritika rozhodčího na Sockách a distanc na lavičce (2026-11-21).
--
-- Příspěvek nebo komentář o sudím má stejné dopady jako pozápasový rozhovor. Řádek je zámek
-- (jeden příspěvek = jedny dopady) a pamatuje si kritiku kvůli opakování. Opakovaná ostrá
-- kritika dá trenérovi distanc na lavičce na příští kolo (sankce s bench_ban_until_gw).
CREATE TABLE IF NOT EXISTS social_referee_effects (
  post_key    TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  referee_id  TEXT,
  postoj      TEXT NOT NULL,
  sila        INTEGER NOT NULL,
  fine        INTEGER NOT NULL DEFAULT 0,
  bench_ban   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_social_referee_effects_team ON social_referee_effects (team_id, created_at);

ALTER TABLE competition_sanctions ADD COLUMN bench_ban_until_gw INTEGER;
