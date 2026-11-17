-- Čekající liga (IV. třída do zásoby): zavřená, dokud do ní registrace nepošle prvního člověka.
-- AI trenér jejích klubů nic nedělá a trh, vyhledávání, nabídky ani přáteláky ji nevidí.
-- Viz apps/api/src/league/waiting-league.ts.
ALTER TABLE leagues ADD COLUMN waiting INTEGER NOT NULL DEFAULT 0;
