-- Vlhkost trávníku — paměť půdy mezi zápasy.
--
-- Vyschlý trávník i kaluže se dosud odvozovaly z AKTUÁLNÍHO počasí, takže týden
-- veder skončil v momentě, kdy se zatáhlo, a hřiště bylo hned zase zelené.
--
-- 0 = vyprahlý na kost, 50 = normál, 100 = rozmáčený. V dešti stoupá, v suchu
-- klesá, mezi zápasy se pomalu (2 body/den) vrací k normálu.
--
-- Není to totéž co pitch_condition: kondice je kvalita trávníku a spraví ji
-- údržba, vlhkost je stav půdy a spraví ji déšť nebo zálivka.

ALTER TABLE stadiums ADD COLUMN pitch_moisture INTEGER NOT NULL DEFAULT 50;
