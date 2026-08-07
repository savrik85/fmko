-- 0126: audit log klubové reputace (teams.reputation). Aplikovat RUČNĚ (test → prod).
--
-- Proč: reputaci dnes mění devět nezávislých míst, každé s vlastním clampem a bez
-- jakéhokoli záznamu. Hráč tak nemá jak zjistit, proč má 51 a co s tím — a stránka
-- "jak zvednout reputaci" nemá co ukázat.
--
-- Sloupec raw_delta drží, co si volající přál, delta co se opravdu připsalo po
-- krácení zisků. UI z toho umí říct "ze +5 se započítalo +4, protože jsi vysoko".

CREATE TABLE IF NOT EXISTS reputation_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       TEXT NOT NULL REFERENCES teams(id),
  old_value     INTEGER NOT NULL,
  new_value     INTEGER NOT NULL,
  delta         INTEGER NOT NULL,   -- skutečně aplikováno (po krácení a clampu)
  raw_delta     INTEGER NOT NULL,   -- co si volající přál
  source        TEXT NOT NULL,
  description   TEXT NOT NULL,      -- česky, jde přímo do UI
  reference_id  TEXT,               -- idempotence, vzor transactions.reference_id
  game_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unikátní index dělá idempotenci vynutitelnou na úrovni DB: zápis logu a změna
-- reputace jdou v jednom batchi, takže duplicitní reference_id shodí obojí.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_log_ref
  ON reputation_log(reference_id) WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reputation_log_team
  ON reputation_log(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reputation_log_team_src
  ON reputation_log(team_id, source, created_at DESC);
