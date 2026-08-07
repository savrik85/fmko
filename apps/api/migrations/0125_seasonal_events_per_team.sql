-- 0125: sezónní události a cooldown hospody per TÝM, ne per LIGU. Aplikovat RUČNĚ (test → prod).
--
-- Bug 1: seasonal_events měla jen league_id a GET filtroval `WHERE league_id = ?`.
--        Jedna událost tak připadala na všech 14 týmů v lize a spotřeboval ji první,
--        kdo klikl — atomický claim v /choose ostatním vrátil 400 "Already resolved".
--        Sezónní události jsou přitom největší deklarovaný zdroj klubové reputace.
--
-- Bug 2: ad-hoc události se GENERUJÍ per tým (index.ts, game.ts), ale ukládaly se
--        jen s league_id → v lize je viděl a mohl spotřebovat kdokoli.
--
-- Bug 3: 'hospoda_action' slouží jako cooldown marker a četl se taky přes league_id
--        → jeden tým v hospodě zablokoval celou ligu na dva herní dny.

ALTER TABLE seasonal_events ADD COLUMN team_id TEXT;

-- Historické řádky nelze přiřadit zpětně — kdo je vyřešil, se nikde neeviduje
-- a id jsou náhodná UUID, ne deterministická. Odstavíme je: konzument nově
-- filtruje na team_id = ?, takže '__legacy__' je pro hráče neviditelné.
-- Ztráta je nulová: šablony jsou generické a 13 ze 14 týmů je stejně nikdy nedostalo.
UPDATE seasonal_events SET team_id = '__legacy__' WHERE team_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_seasonal_events_team
  ON seasonal_events(team_id, season, game_week);

-- Pro cooldown hospody — hledá poslední 'hospoda_action' daného týmu.
CREATE INDEX IF NOT EXISTS idx_seasonal_events_team_type
  ON seasonal_events(team_id, type, created_at DESC);
