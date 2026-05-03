-- Feature "Obec": sociálně-politický systém — starosta, zastupitelé, brigády,
-- pozvánky na zápas, investice obce, historie. Sprint A: foundation schema.

-- 1) Officials (starosta + 3 zastupitelé) — sdílení napříč týmy v obci.
CREATE TABLE village_officials (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  role TEXT NOT NULL CHECK(role IN ('starosta','mistostarosta','zastupitel_1','zastupitel_2')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  occupation TEXT NOT NULL,
  face_config TEXT NOT NULL,
  personality TEXT NOT NULL CHECK(personality IN ('podnikatel','aktivista','sportovec','tradicionalista','populista')),
  portfolio TEXT NOT NULL DEFAULT '[]',
  preferences TEXT NOT NULL DEFAULT '{}',
  term_start_at TEXT NOT NULL DEFAULT (datetime('now')),
  term_end_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(village_id, role)
);
CREATE INDEX idx_village_officials_village ON village_officials(village_id);

-- 2) Per-team favor — řádek pro každý (team, official) páru a jeden řádek
--    s official_id IS NULL = globální village favor (derivovaný cache).
CREATE TABLE village_team_favor (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  official_id TEXT REFERENCES village_officials(id),
  favor INTEGER NOT NULL DEFAULT 50,
  trust INTEGER NOT NULL DEFAULT 50,
  last_interaction_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- COALESCE-style unikátnost přes virtual column hack (NULL official → 'global')
CREATE UNIQUE INDEX idx_village_favor_unique
  ON village_team_favor(team_id, COALESCE(official_id, 'global'));
CREATE INDEX idx_village_favor_team ON village_team_favor(team_id);
CREATE INDEX idx_village_favor_village ON village_team_favor(village_id);

-- 3) Brigády — týdenní vyhlášky, zero-sum o slot mezi týmy v obci.
CREATE TABLE village_brigades (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  offered_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','taken','expired','completed')),
  required_player_count INTEGER NOT NULL,
  duration_hours INTEGER NOT NULL,
  offered_by_official_id TEXT REFERENCES village_officials(id),
  reward_money INTEGER NOT NULL,
  reward_favor INTEGER NOT NULL,
  condition_drain INTEGER NOT NULL,
  morale_change INTEGER NOT NULL DEFAULT 0,
  taken_by_team_id TEXT REFERENCES teams(id),
  taken_player_ids TEXT,
  taken_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_brigades_village ON village_brigades(village_id);
CREATE INDEX idx_brigades_status ON village_brigades(status, expires_at);
CREATE INDEX idx_brigades_team ON village_brigades(taken_by_team_id);

-- 4) Pozvánky představitelů na zápas — slot lock per (official, match_day).
CREATE TABLE village_invitations (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_day TEXT NOT NULL,
  official_id TEXT NOT NULL REFERENCES village_officials(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent','accepted','declined','attended')),
  gift_cost INTEGER NOT NULL,
  attendance_effects TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Slot lock: pouze 1 accepted/attended pozvánka per official na daný den.
CREATE UNIQUE INDEX idx_invitations_slot
  ON village_invitations(official_id, match_day)
  WHERE status IN ('accepted','attended');
CREATE INDEX idx_invitations_match ON village_invitations(match_id);
CREATE INDEX idx_invitations_team ON village_invitations(team_id);

-- 5) Investiční nabídky obce — favor-gated.
CREATE TABLE village_investments (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  type TEXT NOT NULL CHECK(type IN ('stadium_upgrade','pitch_renovation','youth_facility','bus_subsidy')),
  target_facility TEXT,
  offered_amount INTEGER NOT NULL,
  required_contribution INTEGER NOT NULL,
  favor_threshold INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offered' CHECK(status IN ('offered','accepted','declined','expired','completed')),
  political_cost INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX idx_investments_village ON village_investments(village_id);
CREATE INDEX idx_investments_team ON village_investments(team_id);
CREATE INDEX idx_investments_status ON village_investments(status, expires_at);

-- 6) Historie / feed — audit trail pro AI reportéra a transparency UI.
CREATE TABLE village_history (
  id TEXT PRIMARY KEY,
  village_id TEXT NOT NULL REFERENCES villages(id),
  team_id TEXT REFERENCES teams(id),
  official_id TEXT REFERENCES village_officials(id),
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  impact TEXT,
  game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_history_village ON village_history(village_id, created_at DESC);
CREATE INDEX idx_history_team ON village_history(team_id);
