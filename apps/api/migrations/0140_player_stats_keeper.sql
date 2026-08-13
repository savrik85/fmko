-- Brankářské statistiky: zákroky, chycené penalty, obdržené góly.
-- Zákroky i chycené penalty jsou v matches.events (special/save, special/penalty_save),
-- obdržené góly se odvozují ze skóre soupeře v zápasech, které gólman odchytal.
ALTER TABLE player_stats ADD COLUMN saves INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN penalty_saves INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN goals_conceded INTEGER NOT NULL DEFAULT 0;
