-- Equipment v2 — new categories
ALTER TABLE equipment ADD COLUMN goalkeeper_gear INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN water_bottles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN tactics_board INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN goalkeeper_gear_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN water_bottles_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN tactics_board_condition INTEGER NOT NULL DEFAULT 50;
