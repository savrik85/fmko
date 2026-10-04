-- Tribuny po stranách. Každá ze čtyř stran má vlastní úroveň 0–3.
-- Sloupec `stands` zůstává jako odvozené maximum (čtou ho podmínky střechy,
-- lóže, sektorů a 3D scéna), proto ho drží trigger.
ALTER TABLE stadiums ADD COLUMN stand_main INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_opposite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_goal_west INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_goal_east INTEGER NOT NULL DEFAULT 0;

-- Převod zachová kapacitu i vzhled: dnešní L1 měla tribuny jen za brankami (90 míst), dlouhé strany
-- dostaly tribunu až od L2. L1 tedy dostanou jen obě tribuny za brankou, L2 a L3 všechny čtyři strany.
-- Převádí se podle SOUČASNÉHO `stands`, i když je klub sražený nezaplacenou škodou: kdo je teď na L1,
-- zůstane na L1 a oprava mu vrátí jednu stranu (kapacita se převodem nezvedne a nikdo nedostane míst zdarma).
UPDATE stadiums
SET stand_goal_west = MIN(3, COALESCE(stands, 0)),
    stand_goal_east = MIN(3, COALESCE(stands, 0)),
    stand_main = CASE WHEN COALESCE(stands, 0) >= 2 THEN MIN(3, stands) ELSE 0 END,
    stand_opposite = CASE WHEN COALESCE(stands, 0) >= 2 THEN MIN(3, stands) ELSE 0 END;

-- `stands` je maximum stran (trigger níž ho dál drží, tady ho srovnáme hned).
UPDATE stadiums SET stands = MAX(stand_main, stand_opposite, stand_goal_west, stand_goal_east);

-- Oprava jedné strany stojí zhruba třetinu opravy celých tribun (hlavní strana je ~35 % přírůstku
-- míst na každém stupni), zaokrouhleno na stovky.
UPDATE stadium_damage
SET repair_cost = MAX(500, CAST(ROUND(repair_cost * 0.35 / 100.0) AS INTEGER) * 100)
WHERE facility = 'stands' AND repaired_at IS NULL;

-- Nezaplacená oprava rozbité tribuny: `stands` už není zařízení, které jde opravit.
UPDATE stadium_damage
SET facility = CASE
  WHEN (SELECT s.stand_opposite FROM stadiums s WHERE s.team_id = stadium_damage.team_id) > 0 THEN 'stand_main'
  ELSE 'stand_goal_east'
END
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

-- Nový klub se zakládá s `stands` z generátoru (0, 1 nebo 2). Strany se naplní stejně jako při
-- převodu: L1 jen za brankami, L2 a výš na všech čtyřech stranách.
CREATE TRIGGER stadiums_stands_fill_sides
AFTER INSERT ON stadiums
WHEN NEW.stands > 0 AND NEW.stand_main = 0 AND NEW.stand_opposite = 0
  AND NEW.stand_goal_west = 0 AND NEW.stand_goal_east = 0
BEGIN
  UPDATE stadiums
  SET stand_goal_west = NEW.stands, stand_goal_east = NEW.stands,
      stand_main = CASE WHEN NEW.stands >= 2 THEN NEW.stands ELSE 0 END,
      stand_opposite = CASE WHEN NEW.stands >= 2 THEN NEW.stands ELSE 0 END
  WHERE id = NEW.id;
END;
