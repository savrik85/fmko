-- 0182: Komisař rozhodčích mění hotovou delegaci.
--
-- Aplikovat MANUÁLNĚ, PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0182_komisar_meni_delegaci.sql
--
-- Obrat proti 0181: obsazovací listina (komisař vybíral, KDO smí v kole pískat,
-- párování losovala delegace) se ruší. Delegace běží automaticky jako dřív
-- a komisař do hotového obsazení zasahuje výměnou konkrétního sudího.
--
-- `competition_referee_nominations` se ZÁMĚRNĚ nemaže. Na produkci v ní můžou
-- ležet nominace na rozehraná kola a DROP by je vzal i s historií; kód s tabulkou
-- přestává pracovat a uklidí se, až bude jasné, že se k listině nevracíme.

-- Výměny sudích v delegaci — kdo, koho za koho a proč.
--
-- Bez záznamu by výměna byla neviditelná: v `matches` zůstane jen výsledné
-- referee_id a nikdo by nepoznal, že los určil někoho jiného. Právě tohle je
-- u pravomoci se zjevným střetem zájmů to, co ji drží na uzdě — klub vidí,
-- že mu komisař sudího vyměnil, i koho odvolal.
CREATE TABLE IF NOT EXISTS competition_referee_swaps (
  id                TEXT PRIMARY KEY,
  league_id         TEXT NOT NULL,
  season_number     INTEGER NOT NULL,
  calendar_id       TEXT NOT NULL,
  match_id          TEXT NOT NULL,
  from_referee_id   TEXT,
  to_referee_id     TEXT NOT NULL,
  reason            TEXT NOT NULL DEFAULT '',
  swapped_by_team   TEXT NOT NULL,
  /* Zápas vlastního klubu komisaře. Ukládá se, aby to šlo v zápisu odlišit
     bez dohledávání soupisek zpětně. */
  own_match         INTEGER NOT NULL DEFAULT 0,
  game_date         TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_refswap_cal
  ON competition_referee_swaps(calendar_id);
CREATE INDEX IF NOT EXISTS idx_comp_refswap_league
  ON competition_referee_swaps(league_id, season_number);
CREATE INDEX IF NOT EXISTS idx_comp_refswap_match
  ON competition_referee_swaps(match_id);
