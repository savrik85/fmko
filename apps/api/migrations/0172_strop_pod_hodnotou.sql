-- Srovnání hráčů, kteří mají dovednost NAD svým stropem.
--
-- Takový hráč se v té dovednosti nikdy nezlepší: trénink porovnává `current < cap` a rovnou
-- ho odmítne. Karta potenciálu mu přitom hlásí „na stropu" u něčeho, co nikdy netrénoval.
--
-- Původ je trojí:
--   1. Generátor dával specialistovi na standardky +30 na současnou hodnotu, ale jen +20
--      na strop (`skills/generator.ts`) — ten je opravený.
--   2. Zamrzlý `skills_max` u starších hráčů: trénink a zápasy posouvaly `skills` roky
--      nahoru, zatímco strop zůstal na hodnotě z okamžiku vzniku.
--   3. Snímek `current` uvnitř `skills_max` sám přerostl svůj strop. Čte ho profil hráče
--      jako záložní zdroj pro přehled a zkušenost, když v plochých `skills` chybí — a čísla
--      si pak protiřečila i mezi sebou.
--
-- Dřívější verze srovnávala JEN standardky s poznámkou, že jinde k tomu nedochází. Měření
-- to vyvrátilo: nad stropem je i výdrž, přehled, kreativita a další — u jedné databáze
-- 153 dovedností napříč deseti atributy. Proto se projíždějí všechny.
--
-- Strop se zvedne nad všechno, co o dovednosti víme (živá hodnota i snímek), a nikdy se
-- nesnižuje. Migrace je idempotentní: po prvním běhu už žádný řádek podmínce nevyhoví.
--
-- Musí běžet AŽ ZA 0170 a 0171, které srovnávají tvar. `json_set` totiž chybějící klíč
-- založí — na řádku bez dovednosti by vyrobil `{"maxPotential": 55}` bez `current`
-- a se stropem přilepeným na dnešní hodnotu, čili navěky bez prostoru růst. Pojistka
-- v podmínce proto pouští dovnitř jen řádky, které objektový tvar už mají.
UPDATE players
SET skills_max = json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    json_set(
    skills_max,
    '$.speed.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.speed.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.speed'), 0),
        COALESCE(json_extract(skills_max, '$.speed.current'), 0))
  ),
    '$.technique.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.technique.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.technique'), 0),
        COALESCE(json_extract(skills_max, '$.technique.current'), 0))
  ),
    '$.shooting.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.shooting.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.shooting'), 0),
        COALESCE(json_extract(skills_max, '$.shooting.current'), 0))
  ),
    '$.passing.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.passing.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.passing'), 0),
        COALESCE(json_extract(skills_max, '$.passing.current'), 0))
  ),
    '$.heading.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.heading.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.heading'), 0),
        COALESCE(json_extract(skills_max, '$.heading.current'), 0))
  ),
    '$.defense.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.defense.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.defense'), 0),
        COALESCE(json_extract(skills_max, '$.defense.current'), 0))
  ),
    '$.goalkeeping.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.goalkeeping.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.goalkeeping'), 0),
        COALESCE(json_extract(skills_max, '$.goalkeeping.current'), 0))
  ),
    '$.vision.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.vision.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.vision'), 0),
        COALESCE(json_extract(skills_max, '$.vision.current'), 0))
  ),
    '$.creativity.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.creativity.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.creativity'), 0),
        COALESCE(json_extract(skills_max, '$.creativity.current'), 0))
  ),
    '$.setPieces.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.setPieces.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.setPieces'), 0),
        COALESCE(json_extract(skills_max, '$.setPieces.current'), 0))
  ),
    '$.stamina.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.stamina.maxPotential'), 0),
        COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0),
        COALESCE(json_extract(skills_max, '$.stamina.current'), 0))
  ),
    '$.strength.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.strength.maxPotential'), 0),
        COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0),
        COALESCE(json_extract(skills_max, '$.strength.current'), 0))
  ),
    '$.experience.maxPotential',
    MAX(COALESCE(json_extract(skills_max, '$.experience.maxPotential'), 0),
        COALESCE(json_extract(skills, '$.experience'), 0),
        COALESCE(json_extract(skills_max, '$.experience.current'), 0))
  )
WHERE json_type(skills_max, '$.speed.maxPotential') IS NOT NULL
  AND (
     COALESCE(json_extract(skills, '$.speed'), 0) > json_extract(skills_max, '$.speed.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.speed.current'), 0) > json_extract(skills_max, '$.speed.maxPotential')
     OR COALESCE(json_extract(skills, '$.technique'), 0) > json_extract(skills_max, '$.technique.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.technique.current'), 0) > json_extract(skills_max, '$.technique.maxPotential')
     OR COALESCE(json_extract(skills, '$.shooting'), 0) > json_extract(skills_max, '$.shooting.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.shooting.current'), 0) > json_extract(skills_max, '$.shooting.maxPotential')
     OR COALESCE(json_extract(skills, '$.passing'), 0) > json_extract(skills_max, '$.passing.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.passing.current'), 0) > json_extract(skills_max, '$.passing.maxPotential')
     OR COALESCE(json_extract(skills, '$.heading'), 0) > json_extract(skills_max, '$.heading.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.heading.current'), 0) > json_extract(skills_max, '$.heading.maxPotential')
     OR COALESCE(json_extract(skills, '$.defense'), 0) > json_extract(skills_max, '$.defense.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.defense.current'), 0) > json_extract(skills_max, '$.defense.maxPotential')
     OR COALESCE(json_extract(skills, '$.goalkeeping'), 0) > json_extract(skills_max, '$.goalkeeping.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.goalkeeping.current'), 0) > json_extract(skills_max, '$.goalkeeping.maxPotential')
     OR COALESCE(json_extract(skills, '$.vision'), 0) > json_extract(skills_max, '$.vision.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.vision.current'), 0) > json_extract(skills_max, '$.vision.maxPotential')
     OR COALESCE(json_extract(skills, '$.creativity'), 0) > json_extract(skills_max, '$.creativity.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.creativity.current'), 0) > json_extract(skills_max, '$.creativity.maxPotential')
     OR COALESCE(json_extract(skills, '$.setPieces'), 0) > json_extract(skills_max, '$.setPieces.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.setPieces.current'), 0) > json_extract(skills_max, '$.setPieces.maxPotential')
     OR COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) > json_extract(skills_max, '$.stamina.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.stamina.current'), 0) > json_extract(skills_max, '$.stamina.maxPotential')
     OR COALESCE(json_extract(physical, '$.strength'), json_extract(skills, '$.strength'), 0) > json_extract(skills_max, '$.strength.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.strength.current'), 0) > json_extract(skills_max, '$.strength.maxPotential')
     OR COALESCE(json_extract(skills, '$.experience'), 0) > json_extract(skills_max, '$.experience.maxPotential')
     OR COALESCE(json_extract(skills_max, '$.experience.current'), 0) > json_extract(skills_max, '$.experience.maxPotential')
  );
