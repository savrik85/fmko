-- Úkoly zaměstnanců (kromě skauta, ten má vlastní scout_assignments).
--
-- Zaměstnanec dřív dával jen trvalý bonus. Teď mu manažer může zadat konkrétní práci:
--  - kind = 'match':  příprava na jeden ligový zápas (target_match_id). Účinek se přičte
--                     v match-mods, uzavře ho staff tick po odehrání, pak běží cooldown.
--  - kind = 'weekly': delší práce na N dní (např. sezení s hráčem, individuální plán).
--                     Průběh i konec hlídá denní staff tick.
-- Cena se platí předem. Vrací se celá při zrušení před začátkem a při propuštění.
CREATE TABLE IF NOT EXISTS staff_tasks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  staff_id TEXT NOT NULL REFERENCES staff_members(id),
  task_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('match', 'weekly')),
  target_player_id TEXT,
  target_match_id TEXT,
  params TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled', 'failed')),
  starts_game_date TEXT NOT NULL,
  ends_game_date TEXT NOT NULL,
  cost_paid INTEGER NOT NULL DEFAULT 0,
  result_data TEXT,
  end_reason TEXT,
  last_work_game_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  closed_at TEXT
);

-- Jeden aktivní úkol na zaměstnance.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_tasks_staff_active ON staff_tasks(staff_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_staff_tasks_team ON staff_tasks(team_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_match ON staff_tasks(target_match_id) WHERE status = 'active';

-- Cooldown patří zaměstnanci, ne úkolu: po zápasové práci si chvíli oddechne.
ALTER TABLE staff_members ADD COLUMN task_cooldown_until TEXT;
