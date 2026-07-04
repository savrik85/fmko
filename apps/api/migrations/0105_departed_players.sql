-- Archiv odešlých hráčů — drží identitu pro historické statistiky (neklikatelný záznam).
-- Hráč se z `players` smaže (zachováno chování), ale jeho jméno tu zůstane pro
-- match_player_stats výpisy (střelci, zápasové reporty, sezona v číslech).
CREATE TABLE IF NOT EXISTS departed_players (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT,
  position TEXT NOT NULL,
  age INTEGER,
  overall_rating INTEGER,
  team_id TEXT,
  team_name TEXT,
  league_id TEXT,
  leave_type TEXT,
  season_number INTEGER,
  left_at TEXT NOT NULL
);
