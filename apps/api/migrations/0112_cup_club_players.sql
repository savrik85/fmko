-- Kádry velkoklubů pro plnohodnotný pohár (plné atributy, generováno lazy po chunkech).
-- Bez FK na teams (velkokluby nejsou reálné týmy) — match_player_stats FK nemá, takže OK.
CREATE TABLE IF NOT EXISTS cup_club_players (
  id TEXT PRIMARY KEY,
  cup_team_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT NOT NULL,
  overall_rating INTEGER NOT NULL,
  age INTEGER NOT NULL DEFAULT 26,
  skills TEXT NOT NULL DEFAULT '{}',
  physical TEXT NOT NULL DEFAULT '{}',
  personality TEXT NOT NULL DEFAULT '{}',
  condition INTEGER NOT NULL DEFAULT 100,
  morale INTEGER NOT NULL DEFAULT 60,
  avatar TEXT NOT NULL DEFAULT '{}',
  suspended_matches INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cup_club_players_team ON cup_club_players(cup_team_id);
