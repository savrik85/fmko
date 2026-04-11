-- Coach interviews: žádosti o rozhovor kola
-- Před každým zápasem dostane jeden lidský trenér (round-robin) žádost o rozhovor.
-- AI vygeneruje otázky, trenér napíše odpovědi, AI sestaví novinový článek.

CREATE TABLE IF NOT EXISTS coach_interviews (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  match_calendar_id TEXT NOT NULL,   -- season_calendar.id (konkrétní zápas)
  game_week INTEGER NOT NULL,
  questions TEXT NOT NULL,           -- JSON string[] (3–4 otázky)
  answers TEXT,                      -- JSON string[] (null dokud trenér nevyplní)
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','answered','declined','expired')),
  article_news_id TEXT,              -- news.id po publikaci článku
  expires_at TEXT NOT NULL,          -- = scheduled_at zápasu (vyprší při výkopu)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
