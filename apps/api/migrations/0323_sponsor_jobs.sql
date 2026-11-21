-- Sežeň mu práci (F8, sponsors/player-jobs-db.ts): trenér shání hráči místo u firmy, která klub
-- sponzoruje nebo mu fandí. Řádek = jedna žádost o práci pro jednoho hráče u jedné firmy za herní den.
-- Unikátní index je zámek: druhá žádost týž den (dvojklik, opakovaná fronta) nic nezapíše.
CREATE TABLE IF NOT EXISTS sponsor_jobs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  player_id TEXT NOT NULL,
  -- coach_sms = trenér napsal majiteli, player_tip = hráč se ptal sám, unrest_deal = dohoda s nespokojeným
  source TEXT NOT NULL CHECK (source IN ('coach_sms', 'player_tip', 'unrest_deal')),
  status TEXT NOT NULL CHECK (status IN ('hired', 'refused')),
  refusal TEXT,
  occupation TEXT,
  previous_occupation TEXT,
  request_day TEXT NOT NULL,
  season INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_jobs_day ON sponsor_jobs(team_id, sponsor_id, player_id, request_day);
CREATE INDEX IF NOT EXISTS idx_sponsor_jobs_sponsor ON sponsor_jobs(sponsor_id, status, season);
