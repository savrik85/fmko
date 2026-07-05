-- Zájem hráče o přestup + metadata virtuálních klubů + trucovací zranění
-- player_interest: snapshot úrovně zájmu hráče při vzniku nabídky (0=nechce, 1=váhá, 2=chce, 3=velmi chce)
ALTER TABLE transfer_offers ADD COLUMN player_interest INTEGER;
-- virtual_team_data: {name, city, district, rating} pro nabídky od virtuálních klubů (from_team_id='virtual_ai')
ALTER TABLE transfer_offers ADD COLUMN virtual_team_data TEXT;
-- is_fake: 1 = hráč zranění simuluje (truc po odmítnuté nabídce), FE ho nerozlišuje
ALTER TABLE injuries ADD COLUMN is_fake INTEGER NOT NULL DEFAULT 0;
