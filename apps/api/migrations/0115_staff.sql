-- 0115_staff.sql — Zaměstnanci (realizační tým): 12 rolí, sdílený pool per okres, kurzy.
-- Aplikovat MANUÁLNĚ přes `wrangler d1 execute prales-db-test --remote --file` (NE migrations apply).
-- Pozn.: 0114 existuje 2× (equipment_v3 + transfer_interest), proto tato je 0115.
--        CREATE TABLE IF NOT EXISTS je idempotentní — re-run je bezpečný.

CREATE TABLE IF NOT EXISTS staff_members (
  id TEXT PRIMARY KEY,
  district TEXT NOT NULL,                -- sdílený pool per okres
  team_id TEXT REFERENCES teams(id),     -- NULL = volný kandidát
  role TEXT CHECK(role IN ('asistent','trener_mladeze','trener_brankaru','kondicni_trener','maser','lekar','psycholog','spravce_hriste','skaut','obsluha','sef_fanklubu','ekonom')), -- NULL dokud nenajat
  profession TEXT NOT NULL,              -- původní profese (stejné hodnoty jako role) — "co umí nejlíp"
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'm' CHECK(gender IN ('m','f')),
  age INTEGER NOT NULL,
  coaching INTEGER NOT NULL DEFAULT 5,       -- trénování
  medicine INTEGER NOT NULL DEFAULT 5,       -- zdravověda
  maintenance INTEGER NOT NULL DEFAULT 5,    -- údržba
  judgement INTEGER NOT NULL DEFAULT 5,      -- úsudek
  communication INTEGER NOT NULL DEFAULT 5,  -- komunikace
  work_rate INTEGER NOT NULL DEFAULT 5,      -- pracovitost
  charm INTEGER NOT NULL DEFAULT 5,          -- šarm (atraktivita)
  weekly_wage INTEGER NOT NULL,
  signing_fee INTEGER NOT NULL,
  avatar TEXT NOT NULL,                  -- JSON: facesjs faceConfig (kompat. s <FaceAvatar>)
  description TEXT,                      -- flavor jednou větou
  course_attribute TEXT,                 -- běžící kurz: který atribut (NULL = žádný)
  course_points INTEGER,                 -- kolik přidá po dokončení
  course_weeks_remaining INTEGER,        -- odpočet v pondělním ticku
  hired_at TEXT,                         -- herní datum náboru
  listed_until TEXT,                     -- expirace v poolu (jen volní kandidáti)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_staff_team ON staff_members(team_id);
CREATE INDEX IF NOT EXISTS idx_staff_pool ON staff_members(district, team_id);
-- Slot "max 1 na roli": partial unique index jen na najaté zaměstnance.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_slot ON staff_members(team_id, role) WHERE team_id IS NOT NULL;
