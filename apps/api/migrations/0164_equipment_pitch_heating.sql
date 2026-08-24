-- Vyhřívání trávníku — nová položka vybavení.
--
-- Od 2026-08-24 opotřebovává trávník i odehraný zápas, ne jen plynoucí čas, a v dešti
-- a na sněhu se hřiště rozbahní podstatně víc. Vyhřívání drží trávník rozmrzlý, takže
-- tohle navýšení z nečasu tlumí (Lv3 v plné kondici ho vynuluje úplně). Běžné
-- opotřebení dvaadvaceti páry kopaček nezmizí ani nad topnými kabely.
--
-- Ceny 25k/80k/220k — je to infrastruktura pod zemí, dráž než sekačka (8k/30k/90k)
-- a řádově u přechodu na hybridní trávník (85k).

ALTER TABLE equipment ADD COLUMN pitch_heating INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN pitch_heating_condition INTEGER NOT NULL DEFAULT 50;
