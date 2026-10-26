-- Odmítnutí bez lhůty na další nabídku (offer-cooldown.ts): 1 = kupec smí na hráče nabídnout hned.
-- Pro odmítnutí po opravě dat hráčů, kdy kupec nic neudělal špatně.
ALTER TABLE transfer_offers ADD COLUMN cooldown_waived INTEGER NOT NULL DEFAULT 0;
