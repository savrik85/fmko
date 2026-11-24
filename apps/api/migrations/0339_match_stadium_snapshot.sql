-- Podoba domácího stadionu při zápase (JSON, stadium/match-snapshot.ts): tribuny a zařízení, přístavby, povrch,
-- barvy areálu a péče o trávník, která se na zápas zapnula (vyhřívání, úklid sněhu). Video ze zápasu podle ní
-- kreslí stadion tak, jak tehdy vypadal; klub mezitím staví a objednaný úklid sněhu se po zápase maže.
-- Starší zápasy ji nemají (NULL) a video u nich ukáže stadion, jak vypadá dnes.
ALTER TABLE matches ADD COLUMN stadium_snapshot TEXT;
ALTER TABLE cup_matches ADD COLUMN stadium_snapshot TEXT;
