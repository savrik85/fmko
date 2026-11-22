-- 0337: Hláška „Rozhodčí utíká k autu“ na konci zápasu jen po slabém výkonu rozhodčího.
-- Dřív se losovala u každého konce zápasu (tag full_time), i po výborném výkonu. Engine teď po známce
-- horší než 3 posílá detail „full_time:poor_referee“ a šablona je vyhrazená tagu poor_referee.
-- Jen úprava jednoho řádku číselníku; dokud migrace neproběhne, losuje se hláška postaru.
UPDATE commentary_templates
   SET tags = '["poor_referee","funny"]'
 WHERE template = 'Píská se konec! Rozhodčí utíká k autu — pro jistotu.';
