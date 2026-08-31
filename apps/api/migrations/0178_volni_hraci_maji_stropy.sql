-- Volný hráč se po podpisu narodil bez potenciálu.
--
-- `free_agents` neměla sloupec `skills_max` VŮBEC, takže podpis v `game.ts` dosazoval
-- za stropy ploché dovednosti:
--
--     const faSkillsMax = faLifeCtx.skillsMax ? … : fa.skills as string;
--
-- Výsledek byl {"speed": 51} místo {"speed": {"current": 51, "maxPotential": 68}} —
-- strop se rovnal dnešní hodnotě, takže hráč neměl kam růst. Naměřeno na produkci:
-- devět hráčů, mezi nimi osmnáctiletý se stropem na dnešní výkonnosti.
--
-- Generátor poolu k tomu nenastavoval ani talent: všech deset čekajících volných hráčů
-- mělo `hidden_talent` 0, protože sloupec má DEFAULT 0 a INSERT ho vynechával.

ALTER TABLE free_agents ADD COLUMN skills_max TEXT NOT NULL DEFAULT '{}';
