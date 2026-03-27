-- AI system user (required for FK on teams.user_id)
INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none');

-- Sloupce přidané během vývoje ale chybějící v migracích

-- Teams: game_date pro herní čas
ALTER TABLE teams ADD COLUMN game_date TEXT;

-- Matches: zápasový kontext
ALTER TABLE matches ADD COLUMN attendance INTEGER;
ALTER TABLE matches ADD COLUMN stadium_name TEXT;
ALTER TABLE matches ADD COLUMN pitch_condition INTEGER;
ALTER TABLE matches ADD COLUMN weather TEXT;
ALTER TABLE matches ADD COLUMN home_lineup_data TEXT;
ALTER TABLE matches ADD COLUMN away_lineup_data TEXT;
ALTER TABLE matches ADD COLUMN absences TEXT;

-- Admin role
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
