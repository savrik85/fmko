-- 0325: Drby o přestupech (F10). V hospodě vznikne drb ze signálů, které manažer jinak nevidí:
-- cizí skaut na jeho hráče (scout_assignments), zájem AI klubu (pondělní kurz a běh trhu v
-- ai_coach_decisions), AI klub chce hráče pustit, cizí hráč je nespokojený. Zhruba čtvrtina
-- drbů je nepravdivá: hospodský si spletl hráče nebo klub (is_true = 0).
--
-- Drb o vlastním hráči: hospodský pošle SMS s volbou (pustit do novin / uklidnit hráče),
-- odpověď do expires_on, jinak drb vyšumí. Drb o cizím hráči je jen tip na trh.
-- Kód: apps/api/src/pub/rumours.ts (pravidla a texty), rumours-db.ts (zápis, SMS, odpověď).
--
-- Aplikovat MANUÁLNĚ (NE wrangler d1 migrations apply):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0325_pub_rumours.sql
-- Jen CREATE TABLE/INDEX IF NOT EXISTS, opakované spuštění je bezpečné.

CREATE TABLE IF NOT EXISTS pub_rumours (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL,                 -- klub, kterému to hospodský řekl
  game_date     TEXT NOT NULL,                 -- herní den hospody (YYYY-MM-DD)
  season_number INTEGER,
  subject       TEXT NOT NULL CHECK (subject IN ('own', 'foreign')),
  signal        TEXT NOT NULL CHECK (signal IN ('scout', 'ai_interest', 'ai_sell', 'unhappy')),
  player_id     TEXT NOT NULL,                 -- o kom se mluví (vždy existující hráč)
  club_team_id  TEXT NOT NULL,                 -- zájemce (own) nebo hráčův klub (foreign)
  is_true       INTEGER NOT NULL,              -- 0 = hospodský si to spletl
  text          TEXT NOT NULL,                 -- co hospodský řekl (bez otázky na konci)
  -- pending = čeká na trenéra, published / calmed = rozhodnuto, expired = vyšumělo, tip = cizí hráč
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'calmed', 'expired', 'tip')),
  conv_id       TEXT,
  news_id       TEXT,
  expires_on    TEXT,
  decided_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- Jeden drb na klub a den: opakovaný běh hospody ani návštěva s trenérem druhý nepřidají.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_rumours_day ON pub_rumours (team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_pub_rumours_status ON pub_rumours (team_id, status);
