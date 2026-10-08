-- Typ postavy hráče do physical.bodyType
-- (spec docs/superpowers/specs/2026-10-08-player-body-design.md).
-- Výška ani váha se nemění, kromě hráčů, kteří je nemají vůbec. Idempotentní:
-- každý krok sahá jen na chybějící hodnotu, druhé spuštění nic nezmění.
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0255_player_body_type.sql
-- Produkce: nejdřív záloha (wrangler d1 export), spouští uživatel přes `!`.

-- 1) Chybějící výška: podle postu ±8 cm (jako generator).
UPDATE players SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

-- 2) Chybějící váha: ideál (BMI 23,5) × 1,05 ± 3 kg.
UPDATE players SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

-- 3) Typ postavy z BMI.
UPDATE players SET physical = json_set(physical, '$.bodyType',
  CASE
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 20 THEN 'thin'
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 25 THEN
      CASE WHEN COALESCE(json_extract(skills, '$.speed'), 0)
              + COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) >= 70
           THEN 'athletic' ELSE 'normal' END
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 30 THEN 'stocky'
    ELSE 'obese'
  END)
WHERE json_extract(physical, '$.bodyType') IS NULL;

-- Totéž pro pohárové velkokluby.
UPDATE cup_club_players SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

UPDATE cup_club_players SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

UPDATE cup_club_players SET physical = json_set(physical, '$.bodyType',
  CASE
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 20 THEN 'thin'
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 25 THEN
      CASE WHEN COALESCE(json_extract(skills, '$.speed'), 0)
              + COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) >= 70
           THEN 'athletic' ELSE 'normal' END
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 30 THEN 'stocky'
    ELSE 'obese'
  END)
WHERE json_extract(physical, '$.bodyType') IS NULL;
