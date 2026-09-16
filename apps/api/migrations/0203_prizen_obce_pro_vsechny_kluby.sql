-- Globální řádek přízně obce (official_id IS NULL) vznikal líně, až při první
-- návštěvě stránky obce. Zápisy přízně jsou prosté UPDATE bez založení řádku,
-- takže u klubu bez řádku tiše nic nedělaly: výtržnosti fanoušků, reakce obce
-- na konci sezóny, proslov na párty ani runda v hospodě. Na testu 20 z 29
-- lidských klubů řádek nemělo a 4 ze 7 výtržností přízeň nesnížily.
--
-- Nové kluby řádek dostanou při registraci (routes/teams.ts). Tady se doplní
-- existujícím lidským áčkům. Unikátní index (team_id, COALESCE(official_id,'global'))
-- chrání proti duplicitě i při opakovaném spuštění.
INSERT OR IGNORE INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, updated_at)
SELECT lower(hex(randomblob(16))), t.village_id, t.id, NULL, 50, 50, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM teams t
WHERE t.user_id != 'ai'
  AND COALESCE(t.team_type, 'senior') != 'u21'
  AND t.village_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM village_team_favor f WHERE f.team_id = t.id AND f.official_id IS NULL
  );
