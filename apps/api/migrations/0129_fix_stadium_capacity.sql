-- 0129: Kapacita stadionu — sloupec capacity = ZÁKLAD (bez tribun).
--
-- Dřívější přímý upgrade tribun přičítal do capacity kumulativně absolutní hodnoty
-- ([50,150,300] za každou dosaženou úroveň), zatímco zápasový engine bonus tribun
-- přičítá při čtení z úrovně stands — bonus se tak počítal dvakrát. Obecní
-- spolufinancovaný upgrade naopak capacity neměnil vůbec.
--
-- Tento skript srazí nafouknuté kapacity zpět na maximum základu při generování
-- (BASE_BY_SIZE + 40, viz stadium-generator.ts). Pozor: DB drží anglické size klíče
-- ('village', 'town'), pro které generátor padá na fallback obec (250) — CASE to zrcadlí.
--
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0129_fix_stadium_capacity.sql
-- PROD: nejdřív záloha (wrangler d1 export) + výslovný souhlas.

UPDATE stadiums SET capacity = MIN(capacity, (
  SELECT CASE v.size
    WHEN 'hamlet' THEN 80
    WHEN 'vesnice' THEN 150
    WHEN 'obec' THEN 250
    WHEN 'mestys' THEN 400
    WHEN 'mesto' THEN 600
    WHEN 'small_city' THEN 800
    WHEN 'city' THEN 1200
    ELSE 250 END + 40
  FROM teams t JOIN villages v ON t.village_id = v.id
  WHERE t.id = stadiums.team_id
))
WHERE EXISTS (
  SELECT 1 FROM teams t JOIN villages v ON t.village_id = v.id
  WHERE t.id = stadiums.team_id
);
