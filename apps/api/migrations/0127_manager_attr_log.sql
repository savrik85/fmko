-- 0127: audit log atributů a reputace TRENÉRA. Aplikovat RUČNĚ (test → prod).
--
-- Proč: reputaci a atributy trenéra mění pět nezávislých míst, každé vlastním
-- UPDATE bez jakéhokoli záznamu. Hráč vidí, že mu číslo kleslo, ale ne proč.
-- Sezónní recap navíc deltu reputace jen PŘEPOČÍTÁVAL z pořadí — když UPDATE
-- selhal nebo narazil na strop 75, ukázal změnu, která se nestala.
--
-- Stejný vzor jako reputation_log (0126) pro klubovou reputaci, jen s atributem
-- navíc, protože u trenéra se mění šest různých hodnot.

CREATE TABLE IF NOT EXISTS manager_attr_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       TEXT NOT NULL REFERENCES teams(id),
  attr          TEXT NOT NULL,      -- reputation | motivation | coaching | tactics | discipline | youth_development
  old_value     INTEGER NOT NULL,
  new_value     INTEGER NOT NULL,
  delta         INTEGER NOT NULL,   -- skutečně aplikováno (po clampu)
  raw_delta     INTEGER NOT NULL,   -- co si volající přál
  source        TEXT NOT NULL,      -- match_win | match_loss | season_position | cup | party | season_dev
  description   TEXT NOT NULL,      -- česky, jde přímo do UI
  reference_id  TEXT,               -- idempotence
  game_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Idempotence vynutitelná na úrovni DB: zápis logu a UPDATE jdou v jednom batchi,
-- takže duplicitní klíč shodí obojí. Řeší i to, že match-runner dnes používá
-- Math.random() bez reference — přesimulovaný zápas by jinak připsal reputaci znovu.
CREATE UNIQUE INDEX IF NOT EXISTS idx_manager_attr_log_ref
  ON manager_attr_log(reference_id) WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manager_attr_log_team
  ON manager_attr_log(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_manager_attr_log_team_attr
  ON manager_attr_log(team_id, attr, created_at DESC);
