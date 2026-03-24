-- Team roles: captain, penalty taker, free kick taker
ALTER TABLE teams ADD COLUMN captain_id TEXT REFERENCES players(id);
ALTER TABLE teams ADD COLUMN penalty_taker_id TEXT REFERENCES players(id);
ALTER TABLE teams ADD COLUMN freekick_taker_id TEXT REFERENCES players(id);
