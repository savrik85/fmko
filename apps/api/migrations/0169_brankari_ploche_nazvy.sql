-- Brankáři: sjednocení názvů dovedností ve `skills_max` na ploché.
--
-- Brankář měl dvě sady názvů pro totéž. `skills_max` a váhy hodnocení jely pod
-- `reflexes`, `catching`, `positioning`…, zatímco trénink, zápasový engine i celé UI
-- pracovaly s plochými `goalkeeping`, `defense`, `speed`. Ty sady se opakovaně rozcházely:
--   * hodnocení brankáře se po tréninku vůbec nehýbalo (počítalo se ze zamrzlého skills_max)
--   * karta potenciálu ukazovala brankáři jediný řádek (Sílu — jediný atribut se stejným
--     jménem v obou sadách)
--   * profil a seznam si odporovaly o pár bodů, protože každý sčítal váhy jinak
--
-- Překlad: reflexes a catching splývají do `goalkeeping` (bere se vyšší z obou),
-- positioning → defense, rushing → speed, kicking → technique, distribution → passing,
-- reach → heading, communication → creativity. Strength a experience si jméno drží.
-- Dopočítávají se i atributy, které brankářská sada neměla (shooting, vision, setPieces,
-- stamina), aby karta potenciálu měla co ukazovat.
--
-- Migrace je idempotentní: bere jen řádky, které ještě mají starý tvar (`$.reflexes`)
-- ULOŽENÝ JAKO OBJEKT. Bez té podmínky sebrala i starší tvar, kde je pod `reflexes` holé
-- číslo — `$.reflexes.current` na čísle vrátí NULL, COALESCE z toho udělá nulu a brankář
-- přišel o osm z třinácti dovedností. Holá čísla řeší až migrace 0172.
UPDATE players
SET skills_max = json_object(
  'goalkeeping', json_object(
    'current', MAX(
      COALESCE(json_extract(skills_max, '$.reflexes.current'), 0),
      COALESCE(json_extract(skills_max, '$.catching.current'), 0)
    ),
    'maxPotential', MAX(
      COALESCE(json_extract(skills_max, '$.reflexes.maxPotential'), 0),
      COALESCE(json_extract(skills_max, '$.catching.maxPotential'), 0)
    )
  ),
  'defense', json_object(
    'current', COALESCE(json_extract(skills_max, '$.positioning.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.positioning.maxPotential'), 0)
  ),
  'speed', json_object(
    'current', COALESCE(json_extract(skills_max, '$.rushing.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.rushing.maxPotential'), 0)
  ),
  'technique', json_object(
    'current', COALESCE(json_extract(skills_max, '$.kicking.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.kicking.maxPotential'), 0)
  ),
  'passing', json_object(
    'current', COALESCE(json_extract(skills_max, '$.distribution.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.distribution.maxPotential'), 0)
  ),
  'heading', json_object(
    'current', COALESCE(json_extract(skills_max, '$.reach.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.reach.maxPotential'), 0)
  ),
  'creativity', json_object(
    'current', COALESCE(json_extract(skills_max, '$.communication.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.communication.maxPotential'), 0)
  ),
  'strength', json_object(
    'current', COALESCE(json_extract(skills_max, '$.strength.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.strength.maxPotential'), 0)
  ),
  'experience', json_object(
    'current', COALESCE(json_extract(skills_max, '$.experience.current'), 0),
    'maxPotential', COALESCE(json_extract(skills_max, '$.experience.maxPotential'), 100)
  ),
  -- Brankářská sada tyhle neměla; berou se ze současných plochých hodnot a strop
  -- dostane rozumnou rezervu, ať karta nehlásí „na stropu" u něčeho, co se nikdy netrénovalo.
  'shooting', json_object(
    'current', COALESCE(json_extract(skills, '$.shooting'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.shooting'), 0) + 15)
  ),
  'vision', json_object(
    'current', COALESCE(json_extract(skills, '$.vision'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.vision'), 0) + 15)
  ),
  'setPieces', json_object(
    'current', COALESCE(json_extract(skills, '$.setPieces'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.setPieces'), 0) + 15)
  ),
  'stamina', json_object(
    'current', COALESCE(json_extract(skills, '$.stamina'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.stamina'), 0) + 15)
  )
)
WHERE position = 'GK'
  AND skills_max IS NOT NULL
  AND json_type(skills_max, '$.reflexes') = 'object';
