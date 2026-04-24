-- Transfer negotiation: timeline vsech akci (offer/counter/accept/reject/withdraw/expire)
-- + volitelny player swap v initial offer (offered_player_id)

CREATE TABLE IF NOT EXISTS transfer_offer_events (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES transfer_offers(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('offer','counter','accept','reject','withdraw','expire')),
  amount INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_offer_events_offer ON transfer_offer_events(offer_id, created_at);

-- Player swap (volitelny hrac na vymenu v initial offer)
ALTER TABLE transfer_offers ADD COLUMN offered_player_id TEXT REFERENCES players(id);

-- Backfill initial offer eventu — jen pro offery s existujicim from_team_id
-- (v test DB jsou orphan offery kde by FK kontrola selhala)
INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at)
SELECT lower(hex(randomblob(16))), o.id, o.from_team_id, 'offer', o.offer_amount, o.created_at
FROM transfer_offers o
WHERE EXISTS (SELECT 1 FROM teams t WHERE t.id = o.from_team_id)
  AND NOT EXISTS (SELECT 1 FROM transfer_offer_events e WHERE e.offer_id = o.id);

-- Backfill counter eventu — pouze existujici teamy a countered status
INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at)
SELECT lower(hex(randomblob(16))), o.id, o.last_action_by, 'counter', o.counter_amount,
       COALESCE(o.resolved_at, strftime('%Y-%m-%dT%H:%M:%SZ', o.created_at, '+1 hour'))
FROM transfer_offers o
WHERE o.counter_amount IS NOT NULL
  AND o.status = 'countered'
  AND o.last_action_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM teams t WHERE t.id = o.last_action_by);
