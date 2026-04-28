-- Hráč zápasu — uložení do match záznamu (jednou určen, pak konstantní)
ALTER TABLE matches ADD COLUMN mom_player_id TEXT;
