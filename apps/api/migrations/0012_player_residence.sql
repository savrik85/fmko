-- Player residence — where players live, affects training/match attendance
ALTER TABLE players ADD COLUMN residence TEXT;       -- village/town name where player lives
ALTER TABLE players ADD COLUMN commute_km INTEGER DEFAULT 0;  -- distance to team's ground in km

-- Extend relationship types with new social bonds
-- (SQLite CHECK constraint on relationships.type can't be altered, so we just use the new values)
-- New types: 'neighbors', 'drinking_buddies', 'rivals', 'mentor_pupil'
