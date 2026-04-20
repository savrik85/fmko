-- Cash loans — hotovostní půjčky s úrokem splácené per zápasový den
-- Pravidla: 3 000 – 40 000 Kč jednou za sezónu, 15% úrok, rovnoměrné splátky
-- přes všechny zbývající zápasové dny v sezóně, při záporném rozpočtu zákaz nákupů.

CREATE TABLE IF NOT EXISTS cash_loans (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  principal INTEGER NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0.15,
  total_to_repay INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  total_installments INTEGER NOT NULL,
  installments_paid INTEGER NOT NULL DEFAULT 0,
  per_match_installment INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paid','defaulted')),
  taken_game_date TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  paid_off_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_loans_team ON cash_loans(team_id);
CREATE INDEX IF NOT EXISTS idx_cash_loans_season ON cash_loans(team_id, season_id);
CREATE INDEX IF NOT EXISTS idx_cash_loans_status ON cash_loans(team_id, status);
