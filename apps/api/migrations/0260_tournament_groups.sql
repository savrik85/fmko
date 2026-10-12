-- 0260_tournament_groups.sql: Turnaj P-Mobile ve skupinách.
-- group_code = písmeno skupiny (A–D), nastaví ho los. NULL = ročník hraje jednu tabulku.
-- Zápasy skupin zůstávají ve fázi 'league', skupinu zápasu určují oba týmy.
ALTER TABLE tournament_entries ADD COLUMN group_code TEXT;
