-- 0254_tournament_venues_tabor.sql: Areál P-Mobile v Táboře — hlavní stadion pro zápas dne
-- a play-off, vedlejší hřiště pojmenovaná po táborských místech pro souběžné zápasy.
-- look: úrovně 0–3 jako sloupce stadiums (stands, roof, lighting, changing_rooms, showers,
-- refreshments, parking, fence, toilets, scoreboard_level), pitch_type, barvy areálu.
INSERT OR IGNORE INTO tournament_venues (id, city, name, capacity, is_main, sort, look) VALUES
  ('tabor-arena', 'Tábor', 'P-Mobile Aréna', 4000, 1, 1,
   '{"stands":3,"roof":3,"lighting":3,"changing_rooms":3,"showers":3,"refreshments":3,"parking":3,"fence":3,"toilets":3,"scoreboard_level":3,"pitch_type":"natural","primary":"#C8006A","secondary":"#FFFFFF"}'),
  ('tabor-jordan', 'Tábor', 'Hřiště U Jordánu', 1500, 0, 2,
   '{"stands":2,"roof":2,"lighting":2,"changing_rooms":2,"showers":2,"refreshments":2,"parking":2,"fence":2,"toilets":2,"scoreboard_level":2,"pitch_type":"natural","primary":"#1F5FA8","secondary":"#FFFFFF"}'),
  ('tabor-kotnov', 'Tábor', 'Hřiště Na Kotnově', 1200, 0, 3,
   '{"stands":2,"roof":1,"lighting":2,"changing_rooms":2,"showers":2,"refreshments":2,"parking":1,"fence":2,"toilets":2,"scoreboard_level":2,"pitch_type":"natural","primary":"#8A2B2B","secondary":"#F2E6C9"}'),
  ('tabor-klokoty', 'Tábor', 'Hřiště Pod Klokoty', 1000, 0, 4,
   '{"stands":2,"roof":1,"lighting":1,"changing_rooms":2,"showers":1,"refreshments":2,"parking":1,"fence":2,"toilets":1,"scoreboard_level":1,"pitch_type":"natural","primary":"#2D6B3A","secondary":"#FFFFFF"}'),
  ('tabor-luznice', 'Tábor', 'Hřiště U Lužnice', 900, 0, 5,
   '{"stands":1,"roof":1,"lighting":3,"changing_rooms":2,"showers":2,"refreshments":1,"parking":2,"fence":3,"toilets":2,"scoreboard_level":2,"pitch_type":"artificial","primary":"#2C7DA0","secondary":"#FFFFFF"}'),
  ('tabor-celkovice', 'Tábor', 'Hřiště Čelkovice', 700, 0, 6,
   '{"stands":1,"roof":0,"lighting":1,"changing_rooms":1,"showers":1,"refreshments":1,"parking":1,"fence":1,"toilets":1,"scoreboard_level":1,"pitch_type":"natural","primary":"#C97B1A","secondary":"#FFFFFF"}'),
  ('tabor-mesice', 'Tábor', 'Hřiště Měšice', 600, 0, 7,
   '{"stands":1,"roof":0,"lighting":1,"changing_rooms":1,"showers":1,"refreshments":1,"parking":1,"fence":1,"toilets":1,"scoreboard_level":1,"pitch_type":"natural","primary":"#4B3F72","secondary":"#FFFFFF"}'),
  ('tabor-holeckova', 'Tábor', 'Hřiště Na Holečkově', 500, 0, 8,
   '{"stands":1,"roof":0,"lighting":2,"changing_rooms":1,"showers":1,"refreshments":1,"parking":0,"fence":2,"toilets":1,"scoreboard_level":1,"pitch_type":"artificial","primary":"#3A7D44","secondary":"#FFFFFF"}'),
  ('tabor-sezimovo', 'Tábor', 'Hřiště Sezimovo Ústí', 450, 0, 9,
   '{"stands":1,"roof":0,"lighting":0,"changing_rooms":1,"showers":1,"refreshments":1,"parking":1,"fence":1,"toilets":1,"scoreboard_level":0,"pitch_type":"natural","primary":"#9E2A2B","secondary":"#FFFFFF"}'),
  ('tabor-horky', 'Tábor', 'Hřiště Horky', 300, 0, 10,
   '{"stands":0,"roof":0,"lighting":0,"changing_rooms":1,"showers":0,"refreshments":1,"parking":0,"fence":1,"toilets":1,"scoreboard_level":0,"pitch_type":"natural","primary":"#556B2F","secondary":"#FFFFFF"}');
