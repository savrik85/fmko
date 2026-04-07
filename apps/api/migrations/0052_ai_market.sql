ALTER TABLE transfer_listings ADD COLUMN is_ai_listing INTEGER DEFAULT 0;
ALTER TABLE transfer_listings ADD COLUMN ai_player_data TEXT;
