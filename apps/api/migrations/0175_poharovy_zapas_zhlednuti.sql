-- Pohárový zápas si pamatuje, kdo si ho už přehrál.
-- Bez těchhle sloupců neměl unseen-match co číst a match-day obrazovka pohár míjela —
-- replay šel vyvolat jen ručně přes Pohár → Detail zápasu, na rozdíl od ligy.
-- Sloupce drží ISO čas zhlédnutí, NULL = ještě neviděl.
ALTER TABLE cup_matches ADD COLUMN home_seen_at TEXT;
ALTER TABLE cup_matches ADD COLUMN away_seen_at TEXT;
