-- Organické nabídky hráčů (kamarád, dorůst, hospodský kontakt)
CREATE TABLE IF NOT EXISTS player_offers (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('youth', 'friend', 'pub', 'recommendation')),
  source_name TEXT NOT NULL,  -- "Hospodský Novák", "Trenér dorostu", etc.
  message TEXT NOT NULL,      -- "Znám jednoho kluka co hrával za Lhenice..."
  -- Generated player data (same as free_agents)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT,
  age INTEGER NOT NULL,
  position TEXT NOT NULL CHECK(position IN ('GK','DEF','MID','FWD')),
  overall_rating INTEGER NOT NULL,
  skills TEXT NOT NULL DEFAULT '{}',
  physical TEXT NOT NULL DEFAULT '{}',
  personality TEXT NOT NULL DEFAULT '{}',
  life_context TEXT NOT NULL DEFAULT '{}',
  avatar TEXT NOT NULL DEFAULT '{}',
  weekly_wage INTEGER NOT NULL DEFAULT 0,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_po_team ON player_offers(team_id, status);
