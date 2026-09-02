-- Pohárové zápasy odehrané PŘED zavedením seen sloupců (migrace 0175) se musí tvářit
-- jako už zhlédnuté. Jinak by manažerům při prvním přihlášení naskočila fronta match-day
-- obrazovek pro kola stará i měsíc — upozornění na zápas, který dávno zná z výsledků.
-- Nezhlédnuté smí být jen to, co se odehraje od teď dál.
UPDATE cup_matches
   SET home_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
       away_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE status = 'simulated'
   AND (home_seen_at IS NULL OR away_seen_at IS NULL);
