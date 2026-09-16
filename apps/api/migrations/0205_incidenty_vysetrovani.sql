-- Incidenty v klubu, fáze 2: vyšetřování.
-- Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3, 5b, 7.
-- CREATE jsou idempotentní, ALTER TABLE se spouští jen jednou.

CREATE TABLE IF NOT EXISTS club_incident_clues (
  id                  TEXT PRIMARY KEY,        -- {incidentId}-{zdroj}-{n}
  incident_id         TEXT NOT NULL,
  team_id             TEXT NOT NULL,
  source              TEXT NOT NULL CHECK(source IN
    ('kamera','spravce','soused','svedek','kamarad','rival','hospoda','bazar','policie','priznani')),
  points_to_player_id TEXT,                    -- vždy skutečný pachatel
  suspects            TEXT,                    -- JSON [playerId], vždy včetně pachatele
  holder_player_id    TEXT,                    -- od koho se stopa dá získat výslechem
  strength            INTEGER NOT NULL DEFAULT 1 CHECK(strength BETWEEN 1 AND 3),
  police_bonus        REAL NOT NULL DEFAULT 0, -- o kolik nalezená stopa zvedne šanci policie
  text                TEXT NOT NULL,
  found               INTEGER NOT NULL DEFAULT 0,
  found_on            TEXT
);
CREATE INDEX IF NOT EXISTS idx_clues_incident ON club_incident_clues(incident_id, found);

CREATE TABLE IF NOT EXISTS club_incident_knowledge (
  incident_id     TEXT NOT NULL,
  player_id       TEXT NOT NULL,
  team_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('kadr','svedek','kamarad','rival','pachatel','obvineny','drb')),
  fact            TEXT NOT NULL,
  willingness     INTEGER NOT NULL DEFAULT 50,
  interrogation   TEXT CHECK(interrogation IN ('prozradil','kryje','zapira','priznal')),
  interrogated_on TEXT,
  until           TEXT NOT NULL,
  season_number   INTEGER NOT NULL,
  -- Role v primárním klíči: fáze 4 přidá k stejnému hráči a incidentu řádky
  -- `svedek`/`kamarad`/`kadr`, o ty by (incident_id, player_id) přišel.
  PRIMARY KEY (incident_id, player_id, role)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_player ON club_incident_knowledge(player_id, until);

-- Koho manažer obvinil a jak to dopadlo: JSON [{playerId, jmeno, den, vysledek}].
ALTER TABLE club_incidents ADD COLUMN accused TEXT NOT NULL DEFAULT '[]';
