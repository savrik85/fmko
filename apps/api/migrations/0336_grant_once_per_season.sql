-- 0336: Pravidlo grémia „Žádost o dotaci jen jednou za sezónu“ (přání uživatele 2026-11-21).
-- Přepínač v sazebníku soutěže: 1 = klub smí v sezóně požádat o dotaci pro vlastní klub jen
-- jednou (stažená žádost se nepočítá). Výchozí 0, takže se nikomu nic nemění, dokud to grémium
-- neodhlasuje. Jen přidávací migrace; prod se zálohou předem.
ALTER TABLE competition_rules ADD COLUMN grant_once_per_season INTEGER NOT NULL DEFAULT 0;
