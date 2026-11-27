-- 0340: Sazebník pokut kabiny (docs/superpowers/specs/2026-11-27-fine-schedule-design.md).

-- Stav sazebníku týmu. Jeden řádek na tým, vzniká s prvním uloženým návrhem.
CREATE TABLE IF NOT EXISTS fine_schedules (
  team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  -- none = sazebník nemá (nebo ho zrušil), active = platí.
  status TEXT NOT NULL DEFAULT 'none',
  -- Jak platný sazebník vznikl: approved = schválil kapitán, imposed = vnucený bez souhlasu.
  origin TEXT,
  -- Návrh u kapitána: none | pending | approved | reservation | rejected.
  proposal_status TEXT NOT NULL DEFAULT 'none',
  proposal_captain_id TEXT,
  -- Výhrada kapitána: JSON { itemKey, conditionKey, wish } nebo null.
  proposal_note TEXT,
  proposed_at TEXT,
  decided_at TEXT,
  -- Od kterého herního dne platný sazebník platí (vždy až od dalšího týdne).
  effective_from TEXT,
  -- Odpor kabiny 0–3 (0 klid, 1 kapitán bručí, 2 ultimátum, 3 stávka proběhla).
  squad_stage INTEGER NOT NULL DEFAULT 0,
  squad_stage_at TEXT,
  -- Do kdy platí ultimátum (herní datum zápasu).
  ultimatum_match_id TEXT,
  -- Kabina si pamatuje vzpouru / diktát do tohoto herního data.
  resentment_until TEXT,
  -- Kolikrát se v sezóně sazebník zpřísnil nebo vnutil (zmatek).
  changes_season INTEGER NOT NULL DEFAULT 0,
  season_number INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Položky: active = platný sazebník, draft = rozpracovaný návrh pro kapitána.
CREATE TABLE IF NOT EXISTS fine_schedule_items (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  item_key TEXT NOT NULL,
  condition_key TEXT NOT NULL,
  value_kind TEXT NOT NULL,
  amount_czk INTEGER,
  repeat_mode TEXT NOT NULL DEFAULT 'flat',
  scope TEXT NOT NULL DEFAULT 'senior',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fine_schedule_items_team ON fine_schedule_items(team_id, version);

-- Zapsané pokuty. source_ref zaručí, že jeden prohřešek se zapíše jen jednou.
CREATE TABLE IF NOT EXISTS fines (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  item_key TEXT,
  condition_key TEXT,
  -- auto = zapsala hra, manual = tlačítko u ruční položky, sms = pokuta z SMS.
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  value_kind TEXT NOT NULL,
  amount_czk INTEGER,
  -- Kolik to hráče stojí v korunách (pro zátěž).
  czk_equivalent INTEGER NOT NULL DEFAULT 0,
  -- paid | refused (odmítl zaplatit, dluží) | forgiven.
  status TEXT NOT NULL,
  -- Co se doopravdy stalo („Zaspěl, prý měl budík na pět“).
  fact TEXT,
  in_schedule INTEGER NOT NULL DEFAULT 1,
  game_date TEXT NOT NULL,
  season_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  -- Hráč na pokutu odpověděl SMS (posílá hodinový běh telefonu, zápasový runner model nemá).
  reaction_sent_at TEXT,
  UNIQUE (team_id, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_fines_team_date ON fines(team_id, game_date);
CREATE INDEX IF NOT EXISTS idx_fines_player ON fines(player_id, game_date);
CREATE INDEX IF NOT EXISTS idx_fines_pending_reaction ON fines(reaction_sent_at) WHERE reaction_sent_at IS NULL;

ALTER TABLE teams ADD COLUMN fine_fund_balance INTEGER NOT NULL DEFAULT 0;
