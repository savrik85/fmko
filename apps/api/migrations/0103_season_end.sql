-- 0103_season_end.sql — Zakončení sezony (Season End + Rollover)
-- Aplikovat manuálně přes `wrangler d1 execute` (NE migrations apply).
-- Pozn.: ALTER ... ADD COLUMN nelze IF NOT EXISTS — při re-runu wrangler zahlásí "duplicate column", to je OK.

-- league_history: per-sezónní archiv (league_id se reusuje napříč sezónami → potřebujeme season_number)
ALTER TABLE league_history ADD COLUMN season_number INTEGER;
ALTER TABLE league_history ADD COLUMN awards TEXT;            -- JSON snapshot ocenění
ALTER TABLE league_history ADD COLUMN season_stats TEXT;     -- JSON "Sezona v číslech"

-- Trofeje u týmu (JSON pole: [{ seasonNumber, leagueName, place, title }])
ALTER TABLE teams ADD COLUMN trophies TEXT NOT NULL DEFAULT '[]';

-- Ocenění sezony (vzor: round_awards). Jeden řádek na ligu+sezónu.
CREATE TABLE IF NOT EXISTS season_awards (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  champion_team_id TEXT,
  runner_up_team_id TEXT,
  third_team_id TEXT,
  player_of_season_id TEXT,
  top_scorer_id TEXT,
  top_scorer_goals INTEGER,
  manager_of_season_team_id TEXT,
  discovery_of_season_id TEXT,
  best_eleven TEXT,            -- JSON: [{ playerId, name, position, teamName }]
  reasons TEXT,               -- JSON: { playerOfSeason, managerOfSeason, discovery }
  news_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(league_id, season_number)
);

-- Stavová tabulka chunkovaného idempotentního orchestrátoru konce sezony
CREATE TABLE IF NOT EXISTS season_end_progress (
  league_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done
  cursor TEXT,                             -- JSON (processedTeamIds[] pro chunkované fáze)
  data TEXT,                               -- JSON (snapshot standings/awards)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (league_id, season_number, phase)
);
