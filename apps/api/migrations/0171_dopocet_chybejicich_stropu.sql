-- Dopočet chybějících stropů (`skills_max`) u hráčů ze starších generací.
--
-- Naměřeno na produkci: 60 % hráčů A-týmů má `skills_max` prázdný (`{}`) nebo bez klíčových
-- atributů — vznikli dřív, než generátor začal potenciál ukládat kompletní. Bez opravy by
-- jim po nasazení rozvoje zůstaly hvězdy prázdné, sloupec potenciálu pomlčka a laťka klubu
-- by se počítala z nesmyslných čísel (u testovaného týmu vyšel „strop opor" 48, ačkoli
-- základní sestava má dnes 52).
--
-- Prostor růstu se odvíjí od VĚKU a TALENTU, aby dopočet odpovídal tomu, jak by hráč vyšel
-- z generátoru dnes:
--     16–20 let: +18 bodů základ     |  k tomu podle talentu až +17
--     21–25 let: +12                 |  (talent/100 × 17)
--     26–29 let: +8
--     30–33 let: +5
--     34+ let:   +3                  → veterán už nikam nedoroste
--
-- Strop nikdy neklesne pod současnou hodnotu, nepřeleze 100 a je to CELÉ číslo — hodnocení
-- se počítá v celých bodech a desetinné stropy se do UI propisovaly jako „81.35".
--
-- Bere jen řádky, kde `skills_max` nenese ŽÁDNOU použitelnou hodnotu. Starší tvar s holými
-- čísly (`{"speed": 70}`) sem nepatří: potenciál v něm uložený je skutečný a přepsat ho
-- vzorcem by znamenalo o něj přijít. Ten převádí migrace 0172.
UPDATE players
SET skills_max = (
  WITH prostor AS (
    SELECT (
      CASE
        WHEN age <= 20 THEN 18
        WHEN age <= 25 THEN 12
        WHEN age <= 29 THEN 8
        WHEN age <= 33 THEN 5
        ELSE 3
      END
      + (COALESCE(hidden_talent, 0) / 100.0) * 17
    ) AS bonus
  )
  SELECT json_object(
    'speed', json_object('current', COALESCE(json_extract(skills, '$.speed'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.speed'), 0) + (SELECT bonus FROM prostor)))),
    'technique', json_object('current', COALESCE(json_extract(skills, '$.technique'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.technique'), 0) + (SELECT bonus FROM prostor)))),
    'shooting', json_object('current', COALESCE(json_extract(skills, '$.shooting'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.shooting'), 0) + (SELECT bonus FROM prostor)))),
    'passing', json_object('current', COALESCE(json_extract(skills, '$.passing'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.passing'), 0) + (SELECT bonus FROM prostor)))),
    'heading', json_object('current', COALESCE(json_extract(skills, '$.heading'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.heading'), 0) + (SELECT bonus FROM prostor)))),
    'defense', json_object('current', COALESCE(json_extract(skills, '$.defense'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.defense'), 0) + (SELECT bonus FROM prostor)))),
    'goalkeeping', json_object('current', COALESCE(json_extract(skills, '$.goalkeeping'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.goalkeeping'), 0) + (SELECT bonus FROM prostor)))),
    'vision', json_object('current', COALESCE(json_extract(skills, '$.vision'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.vision'), 0) + (SELECT bonus FROM prostor)))),
    'creativity', json_object('current', COALESCE(json_extract(skills, '$.creativity'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.creativity'), 0) + (SELECT bonus FROM prostor)))),
    'setPieces', json_object('current', COALESCE(json_extract(skills, '$.setPieces'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(skills, '$.setPieces'), 0) + (SELECT bonus FROM prostor)))),
    'stamina', json_object('current', COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) + (SELECT bonus FROM prostor)))),
    'strength', json_object('current', COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0),
      'maxPotential', MIN(100, ROUND(COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0) + (SELECT bonus FROM prostor)))),
    'experience', json_object('current', COALESCE(json_extract(skills, '$.experience'), 0), 'maxPotential', 100)
  )
)
WHERE (status IS NULL OR status = 'active')
  AND json_extract(skills_max, '$.speed.maxPotential') IS NULL
  AND json_extract(skills_max, '$.goalkeeping.maxPotential') IS NULL
  AND json_extract(skills_max, '$.reflexes.maxPotential') IS NULL
  -- ani holá čísla, ta si nese svůj vlastní potenciál
  AND json_type(skills_max, '$.speed') IS NULL
  AND json_type(skills_max, '$.goalkeeping') IS NULL
  AND json_type(skills_max, '$.reflexes') IS NULL;
