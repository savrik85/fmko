-- Rezerva patří tomu, kdo vede áčko
--
-- Při převzetí klubu se `user_id` měnilo jen u áčka, rezerva zůstala na
-- původním vlastníkovi. Dvě škody naráz:
--
--   1. Původní trenér nemohl založit nový klub. Kontrola „jeden uživatel =
--      jeden tým" našla jeho U21 a odmítla ho s tím, že už tým vede, i když
--      áčko dávno nemá. Přesně tohle potkalo vojtasperka@seznam.cz:
--      FK Madeta Lčovice převzal petrbica0@gmail.com, rezerva zůstala Vojtovi.
--   2. Nový majitel áčka naopak svoji rezervu neřídil, u čtyř klubů na
--      produkci na ní seděl `ai`.
--
-- Kód je opravený (převod jde s áčkem, kontrola duplicity U21 ignoruje),
-- tohle srovná, co už je rozjeté.

UPDATE teams
   SET user_id = (SELECT p.user_id FROM teams p WHERE p.id = teams.parent_team_id)
 WHERE COALESCE(team_type, 'senior') = 'u21'
   AND parent_team_id IS NOT NULL
   AND COALESCE(user_id, '') <> COALESCE((SELECT p.user_id FROM teams p WHERE p.id = teams.parent_team_id), '');
