-- Bydliště trenéra jako obec ze hry (2026-10-31). Dřív volný text, profil obce ho párovat
-- jen podle názvu. Starší trenéři bez id se dál párují podle názvu (`birthplace`),
-- nový výběr v profilu ukládá obojí: id obce i její název.
ALTER TABLE managers ADD COLUMN birthplace_village_id TEXT;
