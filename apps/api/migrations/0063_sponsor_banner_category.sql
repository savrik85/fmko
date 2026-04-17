-- Rozšíření category na 'banner' (reklamní bannery podél hřiště)
-- SQLite nedovoluje měnit CHECK constraint, takže recreate tabulky.

CREATE TABLE sponsor_contracts_new (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  sponsor_name TEXT NOT NULL,
  sponsor_type TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL,
  win_bonus INTEGER NOT NULL DEFAULT 0,
  seasons_total INTEGER NOT NULL DEFAULT 1,
  seasons_remaining INTEGER NOT NULL DEFAULT 1,
  early_termination_fee INTEGER NOT NULL DEFAULT 0,
  is_naming_rights INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','terminated')),
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  category TEXT NOT NULL DEFAULT 'main' CHECK(category IN ('main','stadium','banner'))
);

INSERT INTO sponsor_contracts_new SELECT * FROM sponsor_contracts;
DROP TABLE sponsor_contracts;
ALTER TABLE sponsor_contracts_new RENAME TO sponsor_contracts;

CREATE INDEX idx_sponsor_contracts_team ON sponsor_contracts(team_id);
CREATE INDEX idx_sponsor_contracts_active ON sponsor_contracts(team_id, status);
CREATE INDEX idx_sponsor_contracts_category ON sponsor_contracts(team_id, category, status);
