-- Systém hostování (loan) — hráč dočasně hraje za jiný tým

-- Hráč na hostování: loan_from_team_id = původní tým, loan_until = herní datum konce
ALTER TABLE players ADD COLUMN loan_from_team_id TEXT;
ALTER TABLE players ADD COLUMN loan_until TEXT;

-- Typ nabídky: transfer (trvalý přestup) nebo loan (hostování)
ALTER TABLE transfer_offers ADD COLUMN offer_type TEXT NOT NULL DEFAULT 'transfer'
  CHECK(offer_type IN ('transfer', 'loan'));

-- Délka hostování v herních dnech (jen pro loan)
ALTER TABLE transfer_offers ADD COLUMN loan_duration INTEGER;
