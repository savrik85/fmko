-- Národnost hráčů + volných hráčů (nízké % cizinců/menšin, viz data/nationalities.ts).
ALTER TABLE players ADD COLUMN nationality TEXT NOT NULL DEFAULT 'CZ';
ALTER TABLE free_agents ADD COLUMN nationality TEXT NOT NULL DEFAULT 'CZ';
