-- 0341: Útraty z kasy pokut. Kasa pokut se nepřevádí do rozpočtu klubu, platí se z ní jen
-- hospoda pro kabinu (fines/fund.ts). Každá útrata má řádek, ať ji trenér vidí na stránce Pokuty.
CREATE TABLE IF NOT EXISTS fine_fund_spends (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  amount_czk INTEGER NOT NULL,
  description TEXT NOT NULL,
  game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fine_fund_spends_team ON fine_fund_spends(team_id, game_date);
