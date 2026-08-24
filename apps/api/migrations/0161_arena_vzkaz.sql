-- 0161: Vzkaz autora k vyvěšenému tiketu.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0161_arena_vzkaz.sql
--
-- Sdílet holý tiket je málo — hráč k němu chce něco říct („jdu do toho naplno",
-- „tohle je jistota"). Vzkaz je nepovinný a při stažení z arény se maže s ním.
ALTER TABLE bet_tickets ADD COLUMN share_note TEXT;
