-- Indexy pro nejdražší dotazy z D1 Insights (2026-11-09).
-- Pojistky proti dvojí výplatě hledají transakci podle reference_id: bez indexu četly celou tabulku.
CREATE INDEX IF NOT EXISTS idx_txn_reference ON transactions(reference_id);
-- „Aktuální sezóna ligy" (MAX(season_number) WHERE league_id = ?) a kola ligy v sezóně podle termínu.
CREATE INDEX IF NOT EXISTS idx_calendar_league_season ON season_calendar(league_id, season_number, scheduled_at);
-- Sestava klubu na konkrétní kolo: rozpis i pás zápasů u Sestavy ji hledají pro každý řádek.
CREATE INDEX IF NOT EXISTS idx_lineups_team_calendar ON lineups(team_id, calendar_id);
