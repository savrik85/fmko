-- 0130: Mandáty zastupitelů v herním čase.
--
-- UI slibuje volby "každé 4 sezóny", ale mandát byl uložen jako reálné datum +4 ROKY
-- a porovnával se s reálným časem — hráč volby prakticky nikdy neviděl.
-- Nově: mandát = 448 HERNÍCH dní (4 sezóny × 16 týdnů) a porovnání běží v herním čase
-- (processElections). Tento skript zkrátí existující mandáty na 448 dní od jejich začátku;
-- prošlé mandáty vyvolají volby při nejbližším pondělním zpracování.
--
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0130_officials_term_game_time.sql
-- PROD: nejdřív záloha + výslovný souhlas.

UPDATE village_officials
SET term_end_at = strftime('%Y-%m-%dT%H:%M:%SZ', datetime(term_start_at, '+448 days'))
WHERE term_end_at > strftime('%Y-%m-%dT%H:%M:%SZ', datetime(term_start_at, '+448 days'));
