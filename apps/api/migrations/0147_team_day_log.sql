-- Nárok na zpracování herního dne pro tým.
--
-- Denní tick účtuje pondělní finance, náklad na trénink a kabinu KAŽDÉMU týmu a žádná
-- z těch operací nemá vlastní pojistku proti dvojímu zaúčtování. Dokud běžel celý tick
-- v jedné invokaci, stačil KV guard (`daily-tick:YYYY-MM-DD`). Jakmile se práce rozdělí
-- do fronty, která doručuje "aspoň jednou", musí mít pojistku každý tým zvlášť.
--
-- PRIMARY KEY (team_id, game_date) + INSERT OR IGNORE = atomický nárok. Druhé doručení
-- dostane changes = 0 a tým se přeskočí. Stejný princip jako lock kola v league-round.ts.
CREATE TABLE IF NOT EXISTS team_day_log (
  team_id TEXT NOT NULL,
  game_date TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (team_id, game_date)
);

CREATE INDEX IF NOT EXISTS idx_team_day_log_date ON team_day_log(game_date);
