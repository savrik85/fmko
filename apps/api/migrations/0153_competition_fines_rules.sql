-- Konkrétní výše strojově udělovaných pokut a pravidla soutěže.
--
-- Násobič `fine_mult` zůstává ve schématu kvůli starým řádkům, ale přestává se
-- používat: o pokutě se hlasuje částkou, ne koeficientem. Výchozí hodnoty jsou
-- zvolené tak, aby se dnešní chování nezměnilo ani o korunu:
--   fine_referee_abuse 1200 → 600 + 300 × síla dá při síle 2 přesně 1200
--   fine_admin          900 → dosavadní rozsah 300–1500 je rate/3 až rate×5/3
--
-- Pravidla soutěže jsou vypnutá (0), dokud si je kluby neodhlasují — spuštění
-- tedy nikomu nic nestrhne.

ALTER TABLE competition_rules ADD COLUMN fine_referee_abuse INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE competition_rules ADD COLUMN fine_admin         INTEGER NOT NULL DEFAULT 900;
ALTER TABLE competition_rules ADD COLUMN fine_rule          INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE competition_rules ADD COLUMN min_pitch_condition INTEGER NOT NULL DEFAULT 0;
ALTER TABLE competition_rules ADD COLUMN squad_min          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE competition_rules ADD COLUMN squad_max          INTEGER NOT NULL DEFAULT 0;

-- Pokuty za porušení pravidla uděluje kontrola před zasedáním, ne hlasování.
-- Aby ji opakovaný běh téhož zasedání nepřipsal dvakrát, dostává stabilní klíč.
-- Částečný unikátní index — ruční pokuty klíč nemají a nesmí si překážet.
ALTER TABLE competition_sanctions ADD COLUMN reference_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_sanction_ref
  ON competition_sanctions(reference_id) WHERE reference_id IS NOT NULL;
