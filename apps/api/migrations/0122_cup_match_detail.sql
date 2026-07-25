-- Pohárový zápas jako plnohodnotný ligový zápas: detail (průběh, sestavy, ratingy),
-- návštěva a počasí. Tržby (vstupné/občerstvení) se počítají přes processMatchDayFinances
-- pro domácí reálný tým, per-zápas data se ukládají sem (obdoba sloupců v matches).
ALTER TABLE cup_matches ADD COLUMN attendance INTEGER;
ALTER TABLE cup_matches ADD COLUMN events TEXT;
ALTER TABLE cup_matches ADD COLUMN commentary TEXT;
ALTER TABLE cup_matches ADD COLUMN player_ratings TEXT;
ALTER TABLE cup_matches ADD COLUMN home_lineup_data TEXT;
ALTER TABLE cup_matches ADD COLUMN away_lineup_data TEXT;
ALTER TABLE cup_matches ADD COLUMN absences TEXT;
ALTER TABLE cup_matches ADD COLUMN stadium_name TEXT;
ALTER TABLE cup_matches ADD COLUMN pitch_condition INTEGER;
ALTER TABLE cup_matches ADD COLUMN weather TEXT;
ALTER TABLE cup_matches ADD COLUMN simulated_at TEXT;
