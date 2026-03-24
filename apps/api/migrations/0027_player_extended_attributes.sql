-- Backfill new player attributes into JSON columns for existing players
-- physical: add preferredFoot, preferredSide
-- personality: add leadership, workRate, aggression, consistency, clutch
-- skills: add creativity, setPieces

-- Physical: add preferredFoot (70% right, 20% left, 10% both) and preferredSide (center default)
UPDATE players SET physical = json_set(
  physical,
  '$.preferredFoot', CASE
    WHEN (ABS(RANDOM()) % 100) < 70 THEN 'right'
    WHEN (ABS(RANDOM()) % 100) < 90 THEN 'left'
    ELSE 'both'
  END,
  '$.preferredSide', CASE position
    WHEN 'GK' THEN 'center'
    ELSE CASE
      WHEN (ABS(RANDOM()) % 100) < 30 THEN 'left'
      WHEN (ABS(RANDOM()) % 100) < 65 THEN 'center'
      WHEN (ABS(RANDOM()) % 100) < 90 THEN 'right'
      ELSE 'any'
    END
  END
) WHERE physical IS NOT NULL AND json_extract(physical, '$.preferredFoot') IS NULL;

-- Personality: add new traits with reasonable random defaults
UPDATE players SET personality = json_set(
  personality,
  '$.leadership', 10 + (ABS(RANDOM()) % 50) + CASE WHEN age > 25 THEN MIN(30, (age - 25) * 2) ELSE 0 END,
  '$.workRate', 20 + (ABS(RANDOM()) % 50) + CASE position WHEN 'DEF' THEN 10 WHEN 'MID' THEN 5 WHEN 'FWD' THEN -5 ELSE 0 END,
  '$.aggression', 15 + (ABS(RANDOM()) % 50) + CASE position WHEN 'DEF' THEN 10 WHEN 'GK' THEN -10 ELSE 0 END,
  '$.consistency', 20 + (ABS(RANDOM()) % 60),
  '$.clutch', 10 + (ABS(RANDOM()) % 80)
) WHERE personality IS NOT NULL AND json_extract(personality, '$.leadership') IS NULL;

-- Skills: add creativity and setPieces
UPDATE players SET skills = json_set(
  skills,
  '$.creativity', CASE position
    WHEN 'MID' THEN 10 + (ABS(RANDOM()) % 40)
    WHEN 'FWD' THEN 5 + (ABS(RANDOM()) % 35)
    WHEN 'DEF' THEN (ABS(RANDOM()) % 25)
    ELSE 0
  END,
  '$.setPieces', CASE position
    WHEN 'MID' THEN 5 + (ABS(RANDOM()) % 40)
    WHEN 'FWD' THEN (ABS(RANDOM()) % 30)
    WHEN 'DEF' THEN (ABS(RANDOM()) % 20)
    ELSE 0
  END
) WHERE skills IS NOT NULL AND json_extract(skills, '$.creativity') IS NULL;
