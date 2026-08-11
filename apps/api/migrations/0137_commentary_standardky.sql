-- Komentáře ke standardkám: penalty, rohy a přímé kopy dostaly v enginu vlastní
-- události, tak ať k nim rozhlas má co říct. Univerzální řádky + prachatická
-- a pražská příchuť; tagy odpovídají `detail` z enginu.

INSERT INTO commentary_templates (event_type, template, tags, district) VALUES
  -- ── Penalty ──────────────────────────────────────────────────────────────
  ('penalty', 'PENALTA! Rozhodčí ukazuje na puntík a míč si bere {player}.', '["awarded"]', NULL),
  ('penalty', 'Pokutový kop pro {team}! Na značku si to staví {player}. {crowd_reaction}', '["awarded"]', NULL),
  ('penalty', 'Hrálo se to rukou? Rozhodčí nemá pochyb — penalta a {player} u míče.', '["awarded"]', NULL),
  ('penalty', 'Zbytečný faul ve vápně a je z toho penalta. Zodpovědnost bere {player}.', '["awarded"]', NULL),
  ('penalty', 'Puntík! {player} si rovná balon a na tribuně se přestalo dýchat.', '["awarded"]', NULL),
  ('penalty', 'PENALTA! {player} to má na kopačce a hospoda ztichla jak o Štědrém večeru.', '["awarded"]', 'Prachatice'),
  ('penalty', 'Pokutový kop! {player} si nese míč na puntík klidně jak řidič trolejbusu do zastávky.', '["awarded"]', 'Praha'),

  -- ── Rohy ─────────────────────────────────────────────────────────────────
  ('corner', 'Roh pro {team}. Centr rozehrává {player}.', '["taken"]', NULL),
  ('corner', 'Balon jde za koncovou — roh. K praporku si to štrádá {player}.', '["taken"]', NULL),
  ('corner', '{player} zvedá roh do vápna, kde se mele klubko těl.', '["taken"]', NULL),
  ('corner', 'Rohový kop. {player} centruje, obrana couvá k brance.', '["taken"]', NULL),
  ('corner', 'Další roh pro {team} — {player} si opět bere balon k praporku.', '["taken"]', NULL),
  ('corner', 'Roh! {player} centruje a ve vápně to voní bramborákem z pouťového stánku.', '["taken"]', 'Prachatice'),
  ('corner', 'Rohový kop, {player} nahazuje — a před brankou nacpáno jak metro v sedm ráno.', '["taken"]', 'Praha'),

  -- ── Přímé kopy ───────────────────────────────────────────────────────────
  ('freekick', 'Přímý kop v dobré pozici! Míč si staví {player}.', '["direct"]', NULL),
  ('freekick', 'Faul před vápnem a {player} si už rovná balon. Zeď se staví.', '["direct"]', NULL),
  ('freekick', 'Standardka jak dělaná na střelu — {player} měří vzdálenost ke zdi.', '["direct"]', NULL),
  ('freekick', '{player} u míče, rozhodčí odměřuje devět metrů. {crowd_reaction}', '["direct"]', NULL),
  ('freekick', 'Přímák z hranice vápna. {player} si odplivl a rozbíhá se.', '["direct"]', 'Prachatice'),
  ('freekick', 'Standardka z boku, do vápna centruje {player}.', '["cross"]', NULL),
  ('freekick', '{player} nahazuje volný kop do šestnáctky, kde už si to hlídají hlavičkáři.', '["cross"]', NULL),
  ('freekick', 'Volný kop ze strany — {player} hledá centrem někoho ve vápně.', '["cross"]', NULL),
  ('freekick', '{player} posílá standardku do vápna, kde se tlačí celá obrana i útok.', '["cross"]', NULL);
