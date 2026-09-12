-- Kampaně fanoušků: „X ven!"
--
-- Nálada party dosud uměla jen klesat a projevit se v návštěvnosti. Když jsou
-- lidi opravdu naštvaní, chtějí konkrétní hlavu — hráče, který je neuspokojuje,
-- nebo rovnou trenéra.
--
-- Kampaň není okamžik, je to proces: začne, sbírá podpisy, dokud důvod trvá,
-- a když důvod pomine, vyšumí. Proto vlastní tabulka a ne příznak na partě.

CREATE TABLE IF NOT EXISTS fan_campaigns (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL,
  -- hrac_ven | trener_ven
  kind          TEXT NOT NULL,
  -- U kampaně proti hráči jeho id, u trenéra NULL.
  target_player_id TEXT,
  -- Jméno se ukládá zvlášť: hráč může odejít a kampaň má zůstat čitelná.
  target_name   TEXT NOT NULL,
  duvod         TEXT NOT NULL DEFAULT '',
  -- Kolik podpisů má a kolik jich potřebuje. Práh se počítá z velikosti
  -- fanouškovské základny, aby v Kunraticích neznamenal totéž co v Praze.
  podpisy       INTEGER NOT NULL DEFAULT 0,
  prah          INTEGER NOT NULL DEFAULT 100,
  -- sbira | splnena | vyzumela | vyresena
  status        TEXT NOT NULL DEFAULT 'sbira',
  -- Herní datum, kdy kampaň naposledy přibrala podpisy — podle toho vyšumí.
  last_game_date TEXT,
  started_game_date TEXT,
  ended_game_date   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Jedna živá kampaň na jeden cíl. Druhá by jen dělila podpisy.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_campaigns_zivy
  ON fan_campaigns(team_id, kind, COALESCE(target_player_id, ''))
  WHERE status = 'sbira';
CREATE INDEX IF NOT EXISTS idx_fan_campaigns_team ON fan_campaigns(team_id, status);
