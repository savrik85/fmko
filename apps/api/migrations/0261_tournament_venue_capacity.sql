-- 0261_tournament_venue_capacity.sql: kapacita hřišť areálu P-Mobile podle tribun, stejně jako u klubů
-- (základ 150 + tribuny: úroveň 1 = 240, 2 = 440, 3 = 650). Původní kapacity z 0254 byly od oka
-- a nesedělo to s 3D (Čelkovice s dvěma lavičkami „700 míst"). Na produ spuštěno ručně 2026-10-13.
UPDATE tournament_venues
   SET capacity = CASE CAST(json_extract(look, '$.stands') AS INTEGER) WHEN 3 THEN 650 WHEN 2 THEN 440 WHEN 1 THEN 240 ELSE 150 END
 WHERE city = 'Tábor';
