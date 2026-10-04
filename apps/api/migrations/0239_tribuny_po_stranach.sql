-- Tribuny po stranách. Každá ze čtyř stran má vlastní úroveň 0–3.
-- Sloupec `stands` zůstává jako odvozené maximum (čtou ho podmínky střechy,
-- lóže, sektorů a 3D scéna), proto ho drží trigger.
ALTER TABLE stadiums ADD COLUMN stand_main INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_opposite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_goal_west INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_goal_east INTEGER NOT NULL DEFAULT 0;

-- Převod: dnešní úroveň platí pro všechny čtyři strany (L2 = čtyři tribuny L2).
-- Kapacita se nemění, protože tabulka stran je sestavená na stejný součet.
UPDATE stadiums
SET stand_main = COALESCE(stands, 0),
    stand_opposite = COALESCE(stands, 0),
    stand_goal_west = COALESCE(stands, 0),
    stand_goal_east = COALESCE(stands, 0);

-- Nezaplacená oprava rozbité tribuny: `stands` už není zařízení, které jde opravit.
UPDATE stadium_damage SET facility = 'stand_main'
WHERE facility = 'stands' AND repaired_at IS NULL;

-- `stands` = nejvyšší ze čtyř stran. UPDATE OF na strany se `stands` netýká,
-- takže se trigger sám nespouští dokola.
CREATE TRIGGER stadiums_stands_derived
AFTER UPDATE OF stand_main, stand_opposite, stand_goal_west, stand_goal_east ON stadiums
BEGIN
  UPDATE stadiums
  SET stands = MAX(stand_main, stand_opposite, stand_goal_west, stand_goal_east)
  WHERE id = NEW.id;
END;

-- Nový klub se zakládá s `stands` z generátoru (0, 1 nebo 2). Strany se
-- naplní z něj, jinak by nový klub měl kapacitu bez tribun.
CREATE TRIGGER stadiums_stands_fill_sides
AFTER INSERT ON stadiums
WHEN NEW.stands > 0 AND NEW.stand_main = 0 AND NEW.stand_opposite = 0
  AND NEW.stand_goal_west = 0 AND NEW.stand_goal_east = 0
BEGIN
  UPDATE stadiums
  SET stand_main = NEW.stands, stand_opposite = NEW.stands,
      stand_goal_west = NEW.stands, stand_goal_east = NEW.stands
  WHERE id = NEW.id;
END;
