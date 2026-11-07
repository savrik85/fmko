-- Úroveň akademie: kolik týdenních uzávěrek sezóny byla která úroveň ({"modest":n,...}).
-- Roční účinky (odchody, žáci z okolí, lákání) se počítají podle nich, ne podle stavu v den léta.
ALTER TABLE teams ADD COLUMN academy_level_weeks TEXT;
-- Syn trenéra patří trenérovi (manažerovi), ne klubu: po změně majitele nebo novém založení
-- akademie se pozná, jestli tenhle trenér syna už měl.
ALTER TABLE youth_prospects ADD COLUMN coach_son_of TEXT;
