-- Migrace existujicich pending/countered transfer_bids na transfer_offers
-- (po sjednoceni market bid -> transfer_offer flow)

INSERT INTO transfer_offers (
  id, player_id, from_team_id, to_team_id,
  offer_amount, counter_amount, expires_at,
  offer_type, last_action_by, status, created_at
)
SELECT
  lower(hex(randomblob(16))),
  tl.player_id,
  tb.team_id,
  tl.team_id,
  tb.amount,
  tb.counter_amount,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'),
  'transfer',
  COALESCE(tb.last_action_by, tb.team_id),
  CASE WHEN tb.counter_amount IS NOT NULL THEN 'countered' ELSE 'pending' END,
  COALESCE(tb.created_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
FROM transfer_bids tb
JOIN transfer_listings tl ON tb.listing_id = tl.id
WHERE tb.status IN ('pending', 'countered')
  AND tl.status = 'active'
  AND tl.player_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM teams t WHERE t.id = tb.team_id)
  AND EXISTS (SELECT 1 FROM teams t WHERE t.id = tl.team_id)
  AND NOT EXISTS (
    SELECT 1 FROM transfer_offers o
    WHERE o.player_id = tl.player_id
      AND o.from_team_id = tb.team_id
      AND o.status IN ('pending', 'countered')
  );

-- Po migraci oznacit legacy bidy jako withdrawn
UPDATE transfer_bids
SET status = 'withdrawn'
WHERE status IN ('pending', 'countered');
