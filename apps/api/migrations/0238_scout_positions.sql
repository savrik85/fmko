-- Skaut může hledat víc postů najednou (přání uživatele 2026-10-04). Seznam postů jako JSON
-- pole, NULL = kdokoli. Starý sloupec `position` (jeden post) zůstává kvůli úkolům zadaným dřív.
ALTER TABLE scout_assignments ADD COLUMN positions TEXT;
