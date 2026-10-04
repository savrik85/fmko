-- Skauting mimo vlastní ligu a skutečné jednání s cizími kluby (spec 2026-10-04).
--
-- Jednání s AI klubem má vlastní tabulky, ne `transfer_offers`: tah počítače by do
-- `transfer_offer_events` nešel zapsat (cizí klíč na teams) a seznamy nabídek mezi lidmi
-- by se musely přepisovat. Tady se nic stávajícího nemění.

-- Úkol skauta: kam jezdí, koho hledá a jak dlouho. Jeden aktivní úkol na klub.
CREATE TABLE IF NOT EXISTS scout_assignments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  staff_id TEXT NOT NULL,
  position TEXT CHECK (position IS NULL OR position IN ('GK','DEF','MID','FWD')),
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  radius_km INTEGER NOT NULL,
  weekly_cost INTEGER NOT NULL,
  weeks_total INTEGER NOT NULL,
  weeks_worked INTEGER NOT NULL DEFAULT 0,
  -- Herní den poslední práce: dva běhy téhož pondělí nesmí strhnout cestovné dvakrát.
  last_work_game_date TEXT,
  reports_sent INTEGER NOT NULL DEFAULT 0,
  clubs_visited INTEGER NOT NULL DEFAULT 0,
  -- Hlášení, na které se má skaut příští týden podívat znovu (místo hledání nových).
  revisit_report_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','cancelled')),
  end_reason TEXT,
  started_game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  closed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_assignments_active ON scout_assignments(team_id) WHERE status = 'active';

-- Hlášení skauta. Hráč z klubu mimo hru v `players` ještě není (team_id je NOT NULL),
-- proto žije jako JSON jako hráči z inzerátů. `id` se po podpisu stane `players.id`.
CREATE TABLE IF NOT EXISTS scout_reports (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  assignment_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('village_club','free_agent')),
  village_id TEXT,
  club_name TEXT,
  club_city TEXT,
  district TEXT,
  distance_km INTEGER NOT NULL,
  free_agent_id TEXT,
  -- Skutečný hráč; klientovi se nikdy neposílá celý.
  player_data TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  position TEXT NOT NULL,
  rating_lo INTEGER NOT NULL,
  rating_hi INTEGER NOT NULL,
  potential_lo INTEGER,
  potential_hi INTEGER,
  visits INTEGER NOT NULL DEFAULT 1,
  -- Pořadí hráče v kádru jeho klubu (1 = nejlepší) a průměr kádru: řídí cenu a ochotu.
  club_rank INTEGER,
  club_mean INTEGER,
  -- Kolik si klub podle skauta řekne (zaokrouhleno na tisíce).
  ask_hint INTEGER,
  pros TEXT NOT NULL DEFAULT '[]',
  cons TEXT NOT NULL DEFAULT '[]',
  willingness INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','negotiating','signed','gone','expired','refused','closed','dismissed')),
  negotiation_id TEXT,
  expires_at TEXT NOT NULL,
  created_game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_scout_reports_team ON scout_reports(team_id, status);

-- Jednání s cizím klubem (inzerát na trhu nebo hráč z hlášení skauta).
CREATE TABLE IF NOT EXISTS ai_negotiations (
  id TEXT PRIMARY KEY,
  -- Kupující klub (áčko).
  team_id TEXT NOT NULL REFERENCES teams(id),
  target_squad TEXT NOT NULL DEFAULT 'senior' CHECK (target_squad IN ('senior','u21')),
  source TEXT NOT NULL CHECK (source IN ('listing','scout_report')),
  listing_id TEXT,
  scout_report_id TEXT,
  -- Budoucí `players.id` (id inzerátu nebo hlášení): víc jednání o tomtéž hráči se pozná podle něj.
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_position TEXT,
  player_age INTEGER,
  club_name TEXT NOT NULL,
  club_city TEXT,
  club_district TEXT,
  stance TEXT NOT NULL CHECK (stance IN ('listed','poached')),
  -- Tajný stav prodávajícího (rezervační cena, požadavek, trpělivost). Klientovi se neposílá.
  ai_state TEXT NOT NULL,
  -- Poslední návrh na stole (od kupujícího nebo od klubu).
  amount INTEGER NOT NULL,
  upfront_pct INTEGER NOT NULL DEFAULT 100,
  installments INTEGER NOT NULL DEFAULT 0,
  last_action_by TEXT NOT NULL CHECK (last_action_by IN ('buyer','club')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','agreed','signed','refused','broken_off','withdrawn','expired')),
  -- Odpověď klubu už je rozhodnutá, jen ještě „nedorazila" (realistická prodleva).
  pending_reply TEXT,
  reply_due_at TEXT,
  player_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_negotiations_team ON ai_negotiations(team_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_negotiations_player ON ai_negotiations(player_key, status);
CREATE INDEX IF NOT EXISTS idx_ai_negotiations_due ON ai_negotiations(reply_due_at) WHERE pending_reply IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_negotiations_open ON ai_negotiations(team_id, player_key) WHERE status IN ('open','agreed');

CREATE TABLE IF NOT EXISTS ai_negotiation_events (
  id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL REFERENCES ai_negotiations(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('buyer','club','player')),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('offer','counter','agree','break_off','withdraw','expire','sign','refuse')),
  amount INTEGER,
  upfront_pct INTEGER,
  installments INTEGER,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_negotiation_events ON ai_negotiation_events(negotiation_id, created_at);
