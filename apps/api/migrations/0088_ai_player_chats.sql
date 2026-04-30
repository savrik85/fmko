-- AI player ↔ coach chats: random AI-generated threads from players to manager,
-- 2-3 message exchanges, outcome affects morale/condition/coach_relationship.

-- Vztah hráče k trenérovi (0-100, default 50)
ALTER TABLE players ADD COLUMN coach_relationship INTEGER NOT NULL DEFAULT 50;

-- Stav AI threadu na conversations
-- ai_thread_state JSON: {trigger, scenario_id, max_replies, current_replies,
--                        awaiting:'coach'|'player'|'done', initiated_at, player_id,
--                        resolution: {morale_delta, condition_delta, relationship_delta, summary, tone, offended?} | null}
ALTER TABLE conversations ADD COLUMN ai_thread_state TEXT;
ALTER TABLE conversations ADD COLUMN ai_thread_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN ai_thread_last_at TEXT;

-- Per-team throttle: kdy naposledy byl iniciován AI thread v tomto týmu (pro 7-denní cooldown)
ALTER TABLE teams ADD COLUMN last_ai_player_thread_at TEXT;

-- Částečný index pro rychlé hledání aktivních threadů (stale-check, throttle)
CREATE INDEX idx_conv_ai_active ON conversations(team_id, ai_thread_active);
