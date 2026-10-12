-- 0262_tournament_arena_top.sql: P-Mobile Aréna jako špičkový stadion — všechny tribuny na 3,
-- přístavby jako plně vybudovaný klub (dvojité tribuny po stranách, točené za brankami, oblouky
-- v rozích), VIP lóže, brána, pořadatelé. Kapacita podle pravidla klubů:
-- 150 + tribuny 500 + přístavby 1 180 - VIP lóže 100 = 1 730. Na produ ručně 2026-10-13.
UPDATE tournament_venues
   SET look = json_set(look,
         '$.stand_main', 3, '$.stand_opposite', 3, '$.stand_goal_west', 3, '$.stand_goal_east', 3,
         '$.entrance_gate', 3, '$.security', 3, '$.vip_box', 3,
         '$.extensions', json_array(
           json_object('slot', 'ext_main', 'kind', 'double_stand', 'level', 3),
           json_object('slot', 'ext_opposite', 'kind', 'double_stand', 'level', 3),
           json_object('slot', 'ext_goal_west', 'kind', 'round_stand', 'level', 3),
           json_object('slot', 'ext_goal_east', 'kind', 'round_stand', 'level', 3),
           json_object('slot', 'corner_main_goal_east', 'kind', 'curved_corner', 'level', 3),
           json_object('slot', 'corner_main_goal_west', 'kind', 'curved_corner', 'level', 3),
           json_object('slot', 'corner_opposite_goal_east', 'kind', 'curved_corner', 'level', 3),
           json_object('slot', 'corner_opposite_goal_west', 'kind', 'curved_corner', 'level', 3))),
       capacity = 1730
 WHERE id = 'tabor-arena';
