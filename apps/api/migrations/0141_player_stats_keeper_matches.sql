-- Odchytané zápasy gólmana. Bez nich by se průměr počítal z appearances, které má i náhradník
-- na lavičce — pak vede tabulku ten, kdo nechytal (0 obdržených z 0 odchytaných zápasů).
ALTER TABLE player_stats ADD COLUMN keeper_matches INTEGER NOT NULL DEFAULT 0;
