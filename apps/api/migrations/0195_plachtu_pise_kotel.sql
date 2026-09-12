-- Plachtu v kotli píše kotel, ne manažer
--
-- Migrace 0192 přidala přepínač `ultras_text_mode` s výchozí hodnotou
-- 'vlastni'. Tím pádem se u ŽÁDNÉHO klubu fanoušci k plachtě nikdy nedostali:
-- na testu bylo 14 stadionů ze 14 v režimu 'vlastni' a kotel si nenapsal ani
-- jednu. Celý ten mechanismus tak byl sloupec v databázi, který nikdy nic
-- neudělal.
--
-- Nikdo si režim 'vlastni' nevybral, jen ho zdědil jako výchozí. Proto se
-- překlápí všem. Kdo chce psát plachtu sám, přepne to jedním kliknutím a text
-- zůstává v `ultras_text`, takže se nic neztrácí.
--
-- SQLite neumí změnit DEFAULT sloupce bez přestavby tabulky, a přestavovat
-- `stadiums` kvůli jedné hodnotě se nevyplatí. Výchozí režim proto nastavuje
-- kód při zakládání stadionu a tahle migrace srovná, co už existuje.

UPDATE stadiums SET ultras_text_mode = 'fanousci' WHERE ultras_text_mode = 'vlastni';
