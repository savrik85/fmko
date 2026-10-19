-- Sliby hráčům (2026-10-19): co trenér hráči slíbil, aby to bylo vidět a hráči se mohli ozvat.
-- Herní logika slibu dál běží v life_context.transferUnrest.pledge; tabulka je jeho viditelná
-- historie (běží / dodržel / porušil / vypršel) a drží, kdy už hráč připomínal.
CREATE TABLE IF NOT EXISTS player_promises (
  id TEXT PRIMARY KEY,
  -- Klub (áčko), který slib dal.
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('minutes', 'transfer', 'release')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'kept', 'broken', 'expired')),
  made_at TEXT NOT NULL,
  deadline TEXT,
  resolved_at TEXT,
  -- JSON: u „pustit ho“ offerId a klub, u prodeje klub.
  details TEXT,
  -- Poslední připomínka hráče (id zápasu, nabídky…), ať se neopakuje.
  last_reminder_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_player_promises_player ON player_promises(player_id, status);
CREATE INDEX IF NOT EXISTS idx_player_promises_team ON player_promises(team_id, status);

-- Sliby, které už běží (life_context.transferUnrest.pledge), do tabulky.
INSERT OR IGNORE INTO player_promises (id, team_id, player_id, type, status, made_at, deadline, details)
SELECT 'legacy-' || p.id, COALESCE(t.parent_team_id, t.id), p.id,
       json_extract(p.life_context, '$.transferUnrest.pledge.type'), 'active',
       json_extract(p.life_context, '$.transferUnrest.pledge.madeAt'),
       json_extract(p.life_context, '$.transferUnrest.pledge.deadline'),
       json_object('offerId', json_extract(p.life_context, '$.transferUnrest.pledge.offerId'),
                   'club', json_extract(p.life_context, '$.transferUnrest.teamName'))
FROM players p JOIN teams t ON t.id = p.team_id
WHERE json_extract(p.life_context, '$.transferUnrest.pledge.type') IN ('minutes', 'transfer', 'release');
