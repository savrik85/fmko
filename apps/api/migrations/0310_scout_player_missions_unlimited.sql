-- Sledování konkrétního hráče už skauta neblokuje: klub smí sledovat libovolný počet hráčů
-- najednou, každého za jednorázové cestovné. Ostatní úkoly (oblast, liga, soupeř) zůstávají
-- po jednom na skauta, proto index hráčské úkoly vynechává.
DROP INDEX IF EXISTS idx_scout_assignments_staff_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_assignments_staff_active
  ON scout_assignments(staff_id) WHERE status = 'active' AND assignment_type != 'player';
-- Jeden klub nesleduje téhož hráče dvakrát současně.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_assignments_player_active
  ON scout_assignments(team_id, target_player_id) WHERE status = 'active' AND assignment_type = 'player';
