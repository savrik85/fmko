-- Přístavby tribun: osm míst k zastavění (čtyři u tribun, čtyři rohy), v každém jedna přístavba
-- s úrovní 1–3. Druh se po postavení nemění, jen se vylepšuje.
CREATE TABLE IF NOT EXISTS stadium_extensions (
  team_id    TEXT NOT NULL,
  slot       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (team_id, slot)
);

-- Kapacita všech přístaveb dohromady. Přepočítává se při každé stavbě, ať ji mohou
-- čtecí místa (zápas, pohár, profil klubu) číst ze stejného řádku jako úrovně tribun.
ALTER TABLE stadiums ADD COLUMN stand_ext_capacity INTEGER NOT NULL DEFAULT 0;
