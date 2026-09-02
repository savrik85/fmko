-- Vývěska grémia: co už klub ze zasedání viděl.
--
-- Bez tohohle nešlo poznat, jestli hráč o rozhodnutí ví. Badge uměl počítat
-- jen návrhy, o kterých se teprve hlasuje — výsledek zasedání se nikde
-- nepřipomněl a rozhodnutí propadla bez povšimnutí.
--
-- Ukládá se herní datum posledního zasedání, které klub viděl, ne časové
-- razítko: rollover vrací herní hodiny o desítky dní zpět, takže absolutní
-- čas by po přechodu sezóny označil za nepřečtené i to, co klub dávno zná.

CREATE TABLE IF NOT EXISTS competition_meeting_reads (
  league_id     TEXT NOT NULL,
  team_id       TEXT NOT NULL,
  last_seen_gd  TEXT NOT NULL,
  PRIMARY KEY (league_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_reads_team
  ON competition_meeting_reads (team_id);
