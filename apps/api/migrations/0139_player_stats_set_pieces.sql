-- Sezónní statistiky standardek: exekutoři penalt + góly ze standardek.
-- Data v matches.events (goal.source, chance.detail) existovala, jen se nikam neagregovala.
-- Pokusy o penaltu = penalty_goals + penalty_misses (zahozené i chycené brankářem).
ALTER TABLE player_stats ADD COLUMN penalty_goals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN penalty_misses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN setpiece_goals INTEGER NOT NULL DEFAULT 0;
