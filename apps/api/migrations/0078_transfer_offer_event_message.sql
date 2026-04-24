-- Kratka zprava (volitelna) ke kazde udalosti vyjednavani
ALTER TABLE transfer_offer_events ADD COLUMN message TEXT;

-- Backfill: initial offer event dostane message z transfer_offers.message
UPDATE transfer_offer_events
SET message = (SELECT o.message FROM transfer_offers o WHERE o.id = transfer_offer_events.offer_id)
WHERE event_type = 'offer' AND message IS NULL;

-- Reject event dostane reject_message
UPDATE transfer_offer_events
SET message = (SELECT o.reject_message FROM transfer_offers o WHERE o.id = transfer_offer_events.offer_id)
WHERE event_type = 'reject' AND message IS NULL;
