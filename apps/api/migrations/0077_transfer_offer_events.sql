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

-- Backfill existujicich offeru: initial event z offer_amount + created_at + from_team_id
INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at)
SELECT lower(hex(randomblob(16))), id, from_team_id, 'offer', offer_amount, created_at
FROM transfer_offers
WHERE NOT EXISTS (SELECT 1 FROM transfer_offer_events e WHERE e.offer_id = transfer_offers.id);

-- Backfill counter events: pokud counter_amount + status='countered' + last_action_by
INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at)
SELECT lower(hex(randomblob(16))), id, last_action_by, 'counter', counter_amount,
       COALESCE(resolved_at, strftime('%Y-%m-%dT%H:%M:%SZ', created_at, '+1 hour'))
FROM transfer_offers
WHERE counter_amount IS NOT NULL
  AND status = 'countered'
  AND last_action_by IS NOT NULL;
