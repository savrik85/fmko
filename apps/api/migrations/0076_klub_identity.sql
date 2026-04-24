-- Klub: krok 4 - identita (přezdívka, motto, rok založení, founding story, význam barev)
ALTER TABLE teams ADD COLUMN team_nickname TEXT;
ALTER TABLE teams ADD COLUMN club_motto TEXT;
ALTER TABLE teams ADD COLUMN founding_year INTEGER;
ALTER TABLE teams ADD COLUMN founding_story TEXT;
ALTER TABLE teams ADD COLUMN colors_meaning TEXT;
