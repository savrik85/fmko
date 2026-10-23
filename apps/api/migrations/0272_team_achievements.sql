-- Kořaly (trofeje klubů). Tabulka na produkci i testu vznikla ručně a v repu migraci
-- neměla, takže na čerstvé databázi (lokální vývoj, testy) chyběla a trofeje se tiše
-- neudělovaly. Tvar je převzatý z produkce (sqlite_master 2026-10-23). Na produkci
-- a testu je migrace bez účinku, tabulka i index tam už jsou.
CREATE TABLE IF NOT EXISTS team_achievements (
  team_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  tier TEXT,
  meta TEXT,
  PRIMARY KEY (team_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_team_achievements_team ON team_achievements(team_id);
