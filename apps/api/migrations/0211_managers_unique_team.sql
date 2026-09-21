-- 0211: Každý klub má jednoho trenéra.
--
-- managers.team_id neměl unikátní index. Při převzetí AI klubu se smazali trenéři
-- nového id, ale AI trenér uložený pod id převzatého klubu (ukládá se, jakmile někdo
-- otevře jeho profil) zůstal a lidský trenér se k němu přistěhoval. Klub pak měl
-- dva trenéry: applyManagerAttrDelta četl jednoho a UPDATE psal do obou, přehled
-- vztahů ukazoval klub dvakrát, trénink a zápasový bonus četly náhodný řádek.
--
-- Aplikovat MANUÁLNĚ a AŽ PO nasazení opravy převzetí (routes/teams.ts maže AI
-- trenéra před přesunem lidského). Se starým kódem by převzetí narazilo na index.
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0211_managers_unique_team.sql
-- Idempotentní — smí se spustit znovu.

-- 1) AI trenér tam, kde už je lidský: pryč.
DELETE FROM managers
 WHERE user_id = 'ai'
   AND team_id IN (SELECT team_id FROM managers WHERE user_id != 'ai' AND team_id IS NOT NULL);

-- 2) Zbylé duplicity (dva AI nebo dva lidští): nechat poslední zapsaný řádek.
DELETE FROM managers
 WHERE team_id IS NOT NULL
   AND rowid NOT IN (SELECT MAX(rowid) FROM managers WHERE team_id IS NOT NULL GROUP BY team_id);

-- 3) Pojistka do budoucna.
CREATE UNIQUE INDEX IF NOT EXISTS idx_managers_team_unique ON managers(team_id) WHERE team_id IS NOT NULL;
