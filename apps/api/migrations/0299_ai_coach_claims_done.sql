-- Nároky AI trenéra (ai_coach_claims): kdy byla úloha dokončená.
--
-- Nárok se bere před provedením a při chybě ho uvolní kód. Když worker skončí natvrdo
-- (limit času, restart), nárok zůstal navždy a nabídka nikdy nedostala odpověď. S `done_at`
-- jde poznat nedokončený nárok: starší než 30 minut smí převzít další běh (ai-coach/claims.ts).
-- Staré řádky mají NULL; přebírají se jen u úloh, které o to žádají (odpověď na nabídku,
-- hodinová práce), a jen když se o tentýž stav jednání žádá znovu.
ALTER TABLE ai_coach_claims ADD COLUMN done_at TEXT;
