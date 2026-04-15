-- Hlasování Předsedy Pralesu (globální scope, pevné ANO/NE)
CREATE TABLE IF NOT EXISTS prales_votes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Jeden hlas per tým per hlasování
CREATE TABLE IF NOT EXISTS prales_vote_ballots (
  id TEXT PRIMARY KEY,
  vote_id TEXT NOT NULL REFERENCES prales_votes(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  answer TEXT NOT NULL CHECK(answer IN ('ano', 'ne')),
  voted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(vote_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_prales_votes_status ON prales_votes(status);
CREATE INDEX IF NOT EXISTS idx_prales_vote_ballots_vote ON prales_vote_ballots(vote_id);
