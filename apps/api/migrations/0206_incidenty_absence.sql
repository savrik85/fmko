-- Incidenty v klubu, fáze 3: incidentní absence (výslech, soud, vyřazení).
-- Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3 a 17a.
-- Sloupce od_dne/do_dne: DO je v SQLite klíčové slovo.

CREATE TABLE IF NOT EXISTS club_incident_absences (
  id            TEXT PRIMARY KEY,   -- {incidentId}-abs-{1 výslech | 2 soud | 3 vyřazení}
  incident_id   TEXT NOT NULL,
  team_id       TEXT NOT NULL,
  player_id     TEXT NOT NULL,
  kind          TEXT NOT NULL,      -- vyslech | soud | vyrazen (fáze 7: porod, nemocna_mama, stehovani)
  od_dne        TEXT,               -- YYYY-MM-DD herní den, u vyřazení NULL
  do_dne        TEXT,
  zapasu_zbyva  INTEGER,            -- jen vyřazení: kolik ligových kol ještě
  announced_on  TEXT NOT NULL,      -- YYYY-MM-DD; od_dne >= announced_on + 2
  duvod         TEXT NOT NULL,      -- krátký důvod do sestavy („Soudní jednání")
  sms           TEXT NOT NULL       -- věta hráče do omluvenky
);
CREATE INDEX IF NOT EXISTS idx_incident_abs_team ON club_incident_absences(team_id, od_dne, do_dne);
