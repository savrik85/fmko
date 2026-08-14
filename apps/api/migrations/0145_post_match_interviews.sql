-- 0145: Pozápasový rozhovor — rozšíření coach_interviews o druh, kontext zápasu,
-- strojově čitelnou analýzu odpovědí a zaúčtované dopady.
--
-- Rebuild tabulky (ne ALTER) ze dvou důvodů:
--   1) nový sloupec `kind` má CHECK a ALTER ADD COLUMN s CHECK je v D1 nespolehlivý
--   2) chceme UNIQUE(team_id, match_calendar_id, kind) místo dnešní idempotence
--      přes NOT EXISTS poddotaz, což je závod, ne záruka
-- Vzor rebuildu: 0047_lineups_drop_calendar_fk.sql, 0107_matchdays_gameclock.sql
--
-- CHECK na `status` se ZÁMĚRNĚ nemění. Stav „efekty zaúčtované" řeší časové razítko
-- `effects_applied_at`, ne nová hodnota enumu — ta by musela projít čtyřmi filtry
-- `status = 'pending'` a retry dotazem, a razítko je stejně lepší klíč idempotence.
--
-- Aplikovat MANUÁLNĚ:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0145_post_match_interviews.sql

PRAGMA foreign_keys=OFF;

-- Pojistka proti duplicitám před UNIQUE indexem — historicky mohl NOT EXISTS prohrát závod.
DELETE FROM coach_interviews
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM coach_interviews GROUP BY team_id, match_calendar_id
);

CREATE TABLE coach_interviews_new (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  manager_id TEXT NOT NULL,
  match_calendar_id TEXT NOT NULL,
  game_week INTEGER NOT NULL,

  -- Druh rozhovoru. Nahrazuje řetězcovou detekci `includes("-wrap")`.
  kind TEXT NOT NULL DEFAULT 'pre_match'
    CHECK(kind IN ('pre_match','post_match','season_wrap')),

  -- Konkrétní zápas (matches.id). Bez FK — pohárová varianta by narazila na cup_matches.
  match_id TEXT,
  -- Rozhodčí, kterého se rozhovor týká (referees.id). Bez FK kvůli pořadí migrací.
  referee_id TEXT,

  questions TEXT NOT NULL,           -- JSON string[]
  -- Klíče témat, index po indexu shodně s `questions`:
  -- [{"key":"vysledek"},{"key":"rozhodci"},{"key":"vyrok_soupere"}]
  topics TEXT,
  -- Snapshot faktů, ze kterých se otázky stavěly — slouží FE (sporná situace, citát
  -- soupeře) i generování článku, ať se zápas nedotazuje znovu.
  context TEXT,

  answers TEXT,                      -- JSON string[]
  -- Strojově čitelná klasifikace odpovědí:
  -- {"source":"gemini|lexicon|lexicon-override","rozhodci":{"postoj":"kritika","sila":2,"duvod":"..."},"tonKSoupsri":"provokace"}
  analysis TEXT,
  -- Co se reálně zaúčtovalo — pro UI i pro audit.
  effects TEXT,
  -- Klíč idempotence. Dokud je NULL, efekty ještě neproběhly.
  effects_applied_at TEXT,

  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','answered','declined','expired')),
  article_news_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Zpětná kompatibilita: sezónní rozhovory se poznají podle dnešní konvence
-- match_calendar_id = 'season-{n}-wrap', všechno ostatní je předzápasové.
INSERT INTO coach_interviews_new
  (id, league_id, team_id, manager_id, match_calendar_id, game_week, kind,
   match_id, referee_id, questions, topics, context, answers, analysis,
   effects, effects_applied_at, status, article_news_id, expires_at, created_at)
SELECT
  id, league_id, team_id, manager_id, match_calendar_id, game_week,
  CASE WHEN match_calendar_id LIKE 'season-%-wrap' THEN 'season_wrap' ELSE 'pre_match' END,
  NULL, NULL, questions, NULL, NULL, answers, NULL,
  NULL, NULL, status, article_news_id, expires_at, created_at
FROM coach_interviews;

DROP TABLE coach_interviews;
ALTER TABLE coach_interviews_new RENAME TO coach_interviews;

-- Idempotence na úrovni schématu: jeden rozhovor daného druhu na tým a zápas.
CREATE UNIQUE INDEX idx_ci_team_cal_kind ON coach_interviews(team_id, match_calendar_id, kind);
CREATE INDEX idx_ci_team_status ON coach_interviews(team_id, status);
CREATE INDEX idx_ci_match ON coach_interviews(match_id);
CREATE INDEX idx_ci_referee ON coach_interviews(referee_id);

PRAGMA foreign_keys=ON;
