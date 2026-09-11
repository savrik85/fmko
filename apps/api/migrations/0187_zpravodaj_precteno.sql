-- 0187: Kdy klub naposled otevřel Zpravodaj.
--
-- Každý vydaný článek dosud rozeslal SMS všem lidským týmům v lize — pět
-- různých míst, přes sedmdesát zpráv na účet. „Vyšel článek" ale není nic,
-- s čím by trenér něco dělal; patří to na Zpravodaj, ne do telefonu.
-- Odznak v menu tu roli zastane bez jediné zprávy.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0187_zpravodaj_precteno.sql

ALTER TABLE teams ADD COLUMN news_seen_at TEXT;
