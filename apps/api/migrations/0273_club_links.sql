-- Propojené kluby: víc účtů téhož člověka. Kód to z user_id nepozná, každý účet má
-- vlastní, proto propojení zapisuje admin ručně. Kluby se stejným group_id patří
-- jednomu člověku a mezi sebou nesmí přestupovat, hostovat, podepsat propuštěného
-- hráče ani sázet na zápasy toho druhého. Řádek je jen pro A-tým, U21 se dovodí.
CREATE TABLE IF NOT EXISTS club_links (
  team_id    TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_club_links_group ON club_links(group_id);
