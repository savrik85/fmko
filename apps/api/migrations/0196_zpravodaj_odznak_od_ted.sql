-- Odznak Zpravodaje počítal celou historii ligy
--
-- Migrace 0187 přidala `teams.news_seen_at`, ale nikomu ho nevyplnila.
-- Dotaz na odznak porovnává `n.created_at > COALESCE(t.news_seen_at, '')`
-- a prázdný řetězec je menší než každé datum, takže se jako nepřečtené
-- počítaly VŠECHNY články, co kdy v lize vyšly. Na produkci to u jednoho
-- klubu dělalo 582, u ligy jako celku přes dva tisíce.
--
-- Značka se nastaví na teď: odznak spadne na nulu a počítá se od téhle
-- chvíle, což je přesně to, co ten odznak měl dělat od začátku.

UPDATE teams SET news_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
 WHERE news_seen_at IS NULL;
