-- 0217: Majitelé firem (sponzorů) a jejich náklonnost ke klubům. Etapa 1 vyjednávání.
-- Aplikovat ručně: npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0217_sponsor_owners.sql

CREATE TABLE IF NOT EXISTS sponsor_owners (
  sponsor_id INTEGER PRIMARY KEY REFERENCES district_sponsors(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  face_config TEXT NOT NULL,
  personality TEXT NOT NULL CHECK(personality IN ('patriot','businessman','fan','cautious')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chybějící řádek = výchozí náklonnost 40.
CREATE TABLE IF NOT EXISTS sponsor_team_favor (
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  favor INTEGER NOT NULL DEFAULT 40,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sponsor_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_team_favor_team ON sponsor_team_favor(team_id);

CREATE TABLE IF NOT EXISTS sponsor_invitations (
  id TEXT PRIMARY KEY,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT NOT NULL,
  match_day TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','declined','attended')),
  gift_cost INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Majitel přijme na jeden zápasový den jen jedno pozvání.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_invitations_slot
  ON sponsor_invitations(sponsor_id, match_day) WHERE status IN ('accepted','attended');
-- Jeden klub zve jednoho majitele na jeden zápas jen jednou.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_invitations_attempt
  ON sponsor_invitations(sponsor_id, team_id, match_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_invitations_match ON sponsor_invitations(match_id, team_id);

CREATE TABLE IF NOT EXISTS sponsor_pub_encounters (
  id TEXT PRIMARY KEY,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','beer','ignored','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sponsor_pub_team ON sponsor_pub_encounters(team_id, status);
