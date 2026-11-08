-- Socky mění vztahy trenérů (manager_relations): komentář nebo příspěvek, který míří
-- na jiný klub, vyhodnotí model (uznání, rýpnutí, urážka), lajk přidá kapku respektu.
-- Tabulka hlídá, aby se jeden text nezapočítal dvakrát, a denní strop na dvojici klubů.
CREATE TABLE IF NOT EXISTS social_relation_effects (
  id            TEXT PRIMARY KEY,
  -- Dvojice klubů seřazená jako v manager_relations (menší id první).
  team_a_id     TEXT NOT NULL,
  team_b_id     TEXT NOT NULL,
  actor_team_id TEXT NOT NULL,
  -- comment:<id> | post:<id> | like:<target_key>
  source_key    TEXT NOT NULL,
  -- praise | tease | insult | like
  kind          TEXT NOT NULL,
  respect       INTEGER NOT NULL,
  heat          INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_rel_once ON social_relation_effects(source_key, team_a_id, team_b_id);
CREATE INDEX IF NOT EXISTS idx_social_rel_pair_day ON social_relation_effects(team_a_id, team_b_id, created_at);
