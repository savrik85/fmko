-- Counter offers + turn tracking pro market bidy (jako transfer_offers)
ALTER TABLE transfer_bids ADD COLUMN counter_amount INTEGER;
ALTER TABLE transfer_bids ADD COLUMN last_action_by TEXT;

-- Backfill: u pending bidu vychazi posledni akce od buyera
UPDATE transfer_bids SET last_action_by = team_id WHERE last_action_by IS NULL AND status = 'pending';
