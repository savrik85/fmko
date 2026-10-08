-- Typ postavy hráče do physical.bodyType
-- (spec docs/superpowers/specs/2026-10-08-player-body-design.md).
-- Výška ani váha se nemění, kromě hráčů, kteří je nemají vůbec. Idempotentní:
-- každý krok sahá jen na chybějící hodnotu, druhé spuštění nic nezmění.
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0255_player_body_type.sql
-- Produkce: nejdřív záloha (wrangler d1 export), spouští uživatel přes `!`.

-- Pořadí v každé tabulce: chybějící výška (podle postu ±8 cm), chybějící váha (ideál × 1,05 ± 3 kg),
-- typ postavy z BMI, přirozená váha. Hráči, volní hráči, nabídky i pohároví velkokluby.

-- ── players ──
UPDATE players SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

UPDATE players SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

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

-- Přirozená váha = dnešní váha přepočtená na věk do 28 let. Tah k přirozené váze
-- (season/body-drift.ts) tak stávající hráče nikam nežene, hýbe s nimi jen to, co dělají.
UPDATE players SET physical = json_set(physical, '$.naturalBase',
  round(json_extract(physical, '$.weight') / (1 + max(0, age - 28) * 0.005), 2))
WHERE json_extract(physical, '$.naturalBase') IS NULL AND json_extract(physical, '$.weight') > 0;

-- ── cup_club_players ──
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

-- Přirozená váha = dnešní váha přepočtená na věk do 28 let. Tah k přirozené váze
-- (season/body-drift.ts) tak stávající hráče nikam nežene, hýbe s nimi jen to, co dělají.
UPDATE cup_club_players SET physical = json_set(physical, '$.naturalBase',
  round(json_extract(physical, '$.weight') / (1 + max(0, age - 28) * 0.005), 2))
WHERE json_extract(physical, '$.naturalBase') IS NULL AND json_extract(physical, '$.weight') > 0;

-- ── free_agents ──
UPDATE free_agents SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

UPDATE free_agents SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

UPDATE free_agents SET physical = json_set(physical, '$.bodyType',
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

-- Přirozená váha = dnešní váha přepočtená na věk do 28 let. Tah k přirozené váze
-- (season/body-drift.ts) tak stávající hráče nikam nežene, hýbe s nimi jen to, co dělají.
UPDATE free_agents SET physical = json_set(physical, '$.naturalBase',
  round(json_extract(physical, '$.weight') / (1 + max(0, age - 28) * 0.005), 2))
WHERE json_extract(physical, '$.naturalBase') IS NULL AND json_extract(physical, '$.weight') > 0;

-- ── player_offers ──
UPDATE player_offers SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

UPDATE player_offers SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

UPDATE player_offers SET physical = json_set(physical, '$.bodyType',
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

-- Přirozená váha = dnešní váha přepočtená na věk do 28 let. Tah k přirozené váze
-- (season/body-drift.ts) tak stávající hráče nikam nežene, hýbe s nimi jen to, co dělají.
UPDATE player_offers SET physical = json_set(physical, '$.naturalBase',
  round(json_extract(physical, '$.weight') / (1 + max(0, age - 28) * 0.005), 2))
WHERE json_extract(physical, '$.naturalBase') IS NULL AND json_extract(physical, '$.weight') > 0;
