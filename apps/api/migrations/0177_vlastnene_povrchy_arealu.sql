-- Povrch areálu se platil znovu při každém návratu k němu.
--
-- `stadiums.surround_surface` drží JEDINOU hodnotu — co je právě položené. Nikde se
-- nedrželo, co klub už zaplatil, a `game.ts` účtoval při každé změně na jinou hodnotu.
-- Kdo si koupil koberec za 50 000 a přepnul na trávu (ta je zdarma), o koberec přišel
-- a návrat k němu byl nový nákup za plnou cenu. Naměřeno na produkci: FK Geomapping
-- Čkyně zaplatil 30. 8. padesát tisíc a skončil s položenou trávou.
--
-- Nový sloupec drží JSON seznam pořízených povrchů. Tráva je zdarma, takže se nedrží.

ALTER TABLE stadiums ADD COLUMN surround_owned TEXT;

-- Backfill 1: co má klub právě položené, to má zaplacené.
UPDATE stadiums
   SET surround_owned = json_array(surround_surface)
 WHERE surround_surface IS NOT NULL AND surround_surface <> 'grass';

-- Backfill 2: co klub kdykoli zaplatil, to mu zůstává — i když to zrovna položené nemá.
-- Zdrojem je účetnictví, protože jiný záznam o nákupu neexistuje. Popis transakce
-- zakládá `game.ts` ve tvaru „Povrch areálu: <název>", takže se páruje přes něj.
UPDATE stadiums
   SET surround_owned = (
     SELECT json_group_array(povrch) FROM (
       SELECT DISTINCT povrch FROM (
         SELECT CASE
                  WHEN tr.description LIKE '%Antukový pás%'        THEN 'cinders'
                  WHEN tr.description LIKE '%Zámková dlažba%'      THEN 'paving'
                  WHEN tr.description LIKE '%Umělý trávník%'       THEN 'astro'
                  WHEN tr.description LIKE '%Klubový VIP koberec%' THEN 'tartan'
                END AS povrch
           FROM transactions tr
          WHERE tr.team_id = stadiums.team_id
            AND tr.description LIKE 'Povrch areálu:%'
         UNION
         SELECT s2.surround_surface
           FROM stadiums s2
          WHERE s2.team_id = stadiums.team_id
            AND s2.surround_surface IS NOT NULL
            AND s2.surround_surface <> 'grass'
       )
       WHERE povrch IS NOT NULL
     )
   )
 WHERE EXISTS (
   SELECT 1 FROM transactions tr
    WHERE tr.team_id = stadiums.team_id AND tr.description LIKE 'Povrch areálu:%'
 );
