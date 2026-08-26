-- Nejstarší tvar `skills_max`: holá čísla místo objektů.
--
-- Kdysi se potenciál ukládal jako `{"speed": 70, "defense": 62}` — hodnota BYLA strop.
-- Dnešní tvar je `{"speed": {"current": 60, "maxPotential": 70}}`. Naměřeno na produkci:
-- 146 hráčů s plochými názvy a dalších pár desítek s brankářskými, tedy zhruba každý
-- desátý hráč ve hře.
--
-- Proč to nejde nechat být: `teoretickyStropHrace` čte `maxPotential`, na holém čísle
-- dostane `undefined` a hráči vyjde strop `null` — prázdné hvězdy, pomlčka ve sloupci
-- potenciálu a v laťkách klubu takový hráč vůbec nefiguruje.
--
-- Uložené číslo je skutečný potenciál a bere se, jak je. Trénink ale mezitím u některých
-- hráčů přerostl zamrzlý strop (naměřeno: 21 dovedností pod současnou hodnotou), proto
-- `MAX(uložený strop, dnešní hodnota)` — hráč nikdy nepřijde o to, co už umí.
--
-- Pořadí: až ZA 0169, které řeší brankářské názvy v objektovém tvaru a holých čísel se
-- po opravě nedotkne. Musí naopak běžet PŘED 0172 (srovnání stropů pod hodnotou), které
-- předpokládá, že každý řádek už objektový tvar má.
-- Idempotentní: bere jen řádky, kde je pod dovedností číslo.

-- ── 1. Ploché názvy (hráči v poli i brankáři po sjednocení) ──────────────────────────
UPDATE players
SET skills_max = json_object(
  'speed', json_object('current', COALESCE(json_extract(skills, '$.speed'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.speed'), 0), COALESCE(json_extract(skills, '$.speed'), 0)))),
  'technique', json_object('current', COALESCE(json_extract(skills, '$.technique'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.technique'), 0), COALESCE(json_extract(skills, '$.technique'), 0)))),
  'shooting', json_object('current', COALESCE(json_extract(skills, '$.shooting'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.shooting'), 0), COALESCE(json_extract(skills, '$.shooting'), 0)))),
  'passing', json_object('current', COALESCE(json_extract(skills, '$.passing'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.passing'), 0), COALESCE(json_extract(skills, '$.passing'), 0)))),
  'heading', json_object('current', COALESCE(json_extract(skills, '$.heading'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.heading'), 0), COALESCE(json_extract(skills, '$.heading'), 0)))),
  'defense', json_object('current', COALESCE(json_extract(skills, '$.defense'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.defense'), 0), COALESCE(json_extract(skills, '$.defense'), 0)))),
  'goalkeeping', json_object('current', COALESCE(json_extract(skills, '$.goalkeeping'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.goalkeeping'), 0), COALESCE(json_extract(skills, '$.goalkeeping'), 0)))),
  'vision', json_object('current', COALESCE(json_extract(skills, '$.vision'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.vision'), 0), COALESCE(json_extract(skills, '$.vision'), 0)))),
  'creativity', json_object('current', COALESCE(json_extract(skills, '$.creativity'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.creativity'), 0), COALESCE(json_extract(skills, '$.creativity'), 0)))),
  'setPieces', json_object('current', COALESCE(json_extract(skills, '$.setPieces'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.setPieces'), 0), COALESCE(json_extract(skills, '$.setPieces'), 0)))),
  'stamina', json_object('current', COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.stamina'), 0), COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0)))),
  'strength', json_object('current', COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.strength'), 0), COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0)))),
  'experience', json_object('current', COALESCE(json_extract(skills, '$.experience'), 0), 'maxPotential', 100)
)
WHERE skills_max IS NOT NULL
  AND json_type(skills_max, '$.speed') IN ('integer', 'real');

-- ── 2. Brankářské názvy s holými čísly ───────────────────────────────────────────────
-- Týž překlad jako v 0169 (reflexes+catching → goalkeeping, positioning → defense…),
-- jen se čte holé číslo místo `$.x.maxPotential`.
UPDATE players
SET skills_max = json_object(
  'goalkeeping', json_object('current', COALESCE(json_extract(skills, '$.goalkeeping'), 0),
    'maxPotential', MIN(100, MAX(
      COALESCE(json_extract(skills_max, '$.reflexes'), 0),
      COALESCE(json_extract(skills_max, '$.catching'), 0),
      COALESCE(json_extract(skills, '$.goalkeeping'), 0)))),
  'defense', json_object('current', COALESCE(json_extract(skills, '$.defense'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.positioning'), 0), COALESCE(json_extract(skills, '$.defense'), 0)))),
  'speed', json_object('current', COALESCE(json_extract(skills, '$.speed'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.rushing'), 0), COALESCE(json_extract(skills, '$.speed'), 0)))),
  'technique', json_object('current', COALESCE(json_extract(skills, '$.technique'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.kicking'), 0), COALESCE(json_extract(skills, '$.technique'), 0)))),
  'passing', json_object('current', COALESCE(json_extract(skills, '$.passing'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.distribution'), 0), COALESCE(json_extract(skills, '$.passing'), 0)))),
  'heading', json_object('current', COALESCE(json_extract(skills, '$.heading'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.reach'), 0), COALESCE(json_extract(skills, '$.heading'), 0)))),
  'creativity', json_object('current', COALESCE(json_extract(skills, '$.creativity'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.communication'), 0), COALESCE(json_extract(skills, '$.creativity'), 0)))),
  'strength', json_object('current', COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0),
    'maxPotential', MIN(100, MAX(COALESCE(json_extract(skills_max, '$.strength'), 0), COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0)))),
  -- Brankářská sada tyhle nikdy neměla; strop dostane rezervu, ať karta nehlásí „na stropu"
  -- u něčeho, co brankář netrénuje.
  'shooting', json_object('current', COALESCE(json_extract(skills, '$.shooting'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.shooting'), 0) + 15)),
  'vision', json_object('current', COALESCE(json_extract(skills, '$.vision'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.vision'), 0) + 15)),
  'setPieces', json_object('current', COALESCE(json_extract(skills, '$.setPieces'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(skills, '$.setPieces'), 0) + 15)),
  'stamina', json_object('current', COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0),
    'maxPotential', MIN(100, COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) + 15)),
  'experience', json_object('current', COALESCE(json_extract(skills, '$.experience'), 0), 'maxPotential', 100)
)
WHERE skills_max IS NOT NULL
  AND json_type(skills_max, '$.reflexes') IN ('integer', 'real');
