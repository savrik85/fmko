-- 0248_cup_teams_team_index.sql: síň slávy na klubovém webu hledá pohárová tažení klubu
-- podle cup_teams.team_id; bez indexu prochází celou tabulku (roste o stovky řádků za sezónu).
CREATE INDEX IF NOT EXISTS idx_cup_teams_team ON cup_teams(team_id);
