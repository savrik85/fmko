-- 0160: Vstupní brána stadionu
-- Aplikovat MANUÁLNĚ přes `wrangler d1 execute <db> --remote --file` (NE migrations apply),
-- vždy před nasazením kódu. Při opakovaném spuštění znamená "duplicate column",
-- že už byla migrace aplikovaná.

-- 0=závora, 1=dřevěná pokladna, 2=zděná brána s turnikety, 3=monumentální portál
ALTER TABLE stadiums ADD COLUMN entrance_gate INTEGER NOT NULL DEFAULT 0;
