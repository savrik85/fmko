-- Hostování přes trh (2026-11-01).
--
-- Klub vystaví hráče na hostování: délka, poplatek a podmínka hraní. Kdo o hráče stojí,
-- požádá, z žádosti vznikne běžná nabídka hostování a půjčující ji musí potvrdit.
-- Každé přijaté hostování dostane záznam v `loan_agreements`: od kdy hráč hostuje,
-- jaký byl na začátku (hodnocení, dovednosti, docházka) a jak se plní podmínka hraní.
-- Jen přidávací změny: ADD COLUMN a CREATE TABLE/INDEX.

-- 'transfer' | 'loan'
ALTER TABLE transfer_listings ADD COLUMN deal_type TEXT NOT NULL DEFAULT 'transfer';
ALTER TABLE transfer_listings ADD COLUMN loan_days INTEGER;
-- 'starter' | 'regular' | 'none'
ALTER TABLE transfer_listings ADD COLUMN loan_playing_time TEXT;

ALTER TABLE transfer_offers ADD COLUMN loan_playing_time TEXT;
ALTER TABLE transfer_offers ADD COLUMN listing_id TEXT;

CREATE TABLE IF NOT EXISTS loan_agreements (
  id TEXT PRIMARY KEY,
  offer_id TEXT,
  player_id TEXT NOT NULL,
  lender_team_id TEXT NOT NULL,
  borrower_team_id TEXT NOT NULL,
  playing_time TEXT NOT NULL DEFAULT 'none'
    CHECK(playing_time IN ('starter', 'regular', 'none')),
  fee INTEGER NOT NULL DEFAULT 0,
  -- Herní čas začátku a konce hostování (stejný základ jako players.loan_until).
  started_at TEXT NOT NULL,
  until TEXT NOT NULL,
  -- Stav hráče na začátku hostování, od kterého se počítá vývoj.
  start_rating INTEGER,
  start_skills TEXT,
  start_training_attended INTEGER NOT NULL DEFAULT 0,
  start_training_total INTEGER NOT NULL DEFAULT 0,
  -- Hostování, které vzniklo dřív než tahle tabulka: vývoj se počítá až od založení záznamu.
  baseline_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'ended', 'recalled', 'bought')),
  -- Kdy dostal půjčující klub zprávu o porušení podmínky (jednou na porušení).
  breach_notified_at TEXT,
  -- Zápas, před kterým šlo hostujícímu klubu varování (aby nešlo dvakrát).
  warned_for_match_id TEXT,
  -- Reálný čas jako matches.simulated_at: počítají se zápasy odehrané po vzniku hostování.
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_loan_agreements_player ON loan_agreements(player_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_agreements_lender ON loan_agreements(lender_team_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_agreements_borrower ON loan_agreements(borrower_team_id, status);
