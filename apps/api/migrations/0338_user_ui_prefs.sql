-- 0338: Předvolby zobrazení účtu (JSON), zatím jen výchozí pohled záznamu zápasu: {"replayView":"2d"|"3d"}.
-- Platí pro účet, ne pro prohlížeč, ať se volba z Nastavení přenese i na mobil. NULL = výchozí (Plánek).
-- Jen přidaný sloupec. Dokud migrace neproběhne, /api/me/ui-prefs vrací 500 a záznam zápasu zůstane u Plánku.
ALTER TABLE users ADD COLUMN ui_prefs TEXT;
