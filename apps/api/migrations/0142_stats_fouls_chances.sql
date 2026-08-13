-- Další sezónní statistiky z událostí zápasu: fauly, zahozené šance, zranění.
-- Šance + góly dávají úspěšnost zakončení, zranění vlastní žebříček.
ALTER TABLE player_stats ADD COLUMN fouls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN chances INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN injuries INTEGER NOT NULL DEFAULT 0;

-- Minuta prvního gólu zápasu — pro žebříček nejrychlejšího gólu sezóny.
-- Bez ní by se musely při každém načtení statistik parsovat události všech zápasů ligy.
ALTER TABLE matches ADD COLUMN fastest_goal_minute INTEGER;

-- Karty v zápase — pro žebříček nejdivočejšího zápasu bez agregace přes match_player_stats.
ALTER TABLE matches ADD COLUMN total_cards INTEGER;
