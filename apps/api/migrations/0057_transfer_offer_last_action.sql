-- Counter-offer fix: kdo byl poslední na tahu, aby druhá strana mohla odpovědět
ALTER TABLE transfer_offers ADD COLUMN last_action_by TEXT;

-- Backfill: pending = from_team_id (právě poslal), countered = to_team_id (právě counter)
UPDATE transfer_offers SET last_action_by = from_team_id
  WHERE last_action_by IS NULL AND status = 'pending';
UPDATE transfer_offers SET last_action_by = to_team_id
  WHERE last_action_by IS NULL AND status = 'countered';
