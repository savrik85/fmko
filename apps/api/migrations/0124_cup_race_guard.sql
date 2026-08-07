-- Ochrana poháru proti souběžnému postupu kola.
--
-- Bug: dvě souběžné invokace simulateCupRound (cron / advance-day / admin endpoint)
-- načetly stejný chunk 'scheduled' zápasů, obě je odsimulovaly s různými výsledky
-- a obě pak vygenerovaly další kolo. Následek: duplicitní zápasy v dalším kole,
-- postup týmu, který podle finálního stavu prohrál, a neoprávněná prize money.

-- 1) Claim pro simulaci zápasu — zápas si smí vzít jen jedna invokace.
--    Stav 'scheduled' zůstává (FE i rozpisy filtrují na něj), claim je vedle.
--    Mrtvý claim (spadlá invokace) se po 15 minutách uvolní.
ALTER TABLE cup_matches ADD COLUMN claimed_at TEXT;

-- 2) Úklid už vzniklých duplicit — pro každou pozici v pavouku nechat poslední
--    vložený záznam (vznikl z nejaktuálnějších výsledků předchozího kola).
DELETE FROM cup_matches
WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM cup_matches GROUP BY cup_id, round, bracket_pos
);

-- 3) Tvrdá pojistka: jedna pozice v pavouku = jeden zápas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cup_matches_slot
  ON cup_matches (cup_id, round, bracket_pos);
