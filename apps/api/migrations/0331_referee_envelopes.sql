-- 0331_referee_envelopes.sql: obálka pro sudího (2026-11-21).
--
-- Úplatnost sudího je vlastnost člověka, ne nový archetyp: pool rozhodčích (REFEREE_POOL_MIX)
-- se nesmí měnit, jinak by se sudí přejmenovali. NULL = výchozí hodnota odvozená v kódu
-- z archetypu a id (referees/envelope.ts `defaultCorruptibility`), bafuňář a ambiciózní výš.
-- Sloupec se plní, jen když se úplatnost změní (třeba po nahlášení).
ALTER TABLE referees ADD COLUMN corruptibility INTEGER;

-- Úplatný sudí delegovaný na derby nabídne jednomu klubu „domluvu“. Řádek je zároveň zámek:
-- id i reference_id jsou odvozené ze zápasu, takže opakovaný běh denního ticku nezaloží
-- druhou obálku, hodinový Telefon nepošle druhou SMS a platba se nezaúčtuje dvakrát.
CREATE TABLE IF NOT EXISTS referee_envelopes (
  id             TEXT PRIMARY KEY,
  referee_id     TEXT NOT NULL,
  team_id        TEXT NOT NULL,
  match_id       TEXT NOT NULL,
  league_id      TEXT NOT NULL,
  season_number  INTEGER NOT NULL,
  game_week      INTEGER NOT NULL,
  amount         INTEGER NOT NULL,
  -- planned (čeká na SMS nebo na rozhodnutí AI klubu) | pending (SMS odešla, čeká na trenéra)
  -- | paid | ignored | reported | expired (bez odpovědi do výkopu)
  status         TEXT NOT NULL DEFAULT 'planned',
  -- Klíč platby v transactions (recordTransaction) a stopa pro revizi účetnictví.
  reference_id   TEXT NOT NULL,
  conv_id        TEXT,
  -- Text SMS od sudího: důkaz pro komisaře, když ho trenér nahlásí.
  message        TEXT,
  -- coach | ai | ai_fallback | ai_shadow
  decided_by     TEXT,
  sent_at        TEXT,
  answered_at    TEXT,
  -- Pokuta za úplatek po revizi účetnictví (competition_sanctions.id).
  sanction_id    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referee_envelopes_match ON referee_envelopes (match_id);
CREATE INDEX IF NOT EXISTS idx_referee_envelopes_status ON referee_envelopes (status);
CREATE INDEX IF NOT EXISTS idx_referee_envelopes_team ON referee_envelopes (team_id, status);
CREATE INDEX IF NOT EXISTS idx_referee_envelopes_conv ON referee_envelopes (conv_id);
CREATE INDEX IF NOT EXISTS idx_referee_envelopes_ref ON referee_envelopes (reference_id);
