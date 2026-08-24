-- Provoz péče o trávník — režim a ruční objednávky.
--
-- Vybavení samo o sobě nic nedělá: topné kabely se musí zapnout a někdo za tu
-- elektřinu zaplatí. Bez tohohle by po jednorázovém nákupu vyhřívání bylo počasí
-- navždy vyřešené zadarmo a rozhodnutí „zaplatím, nebo to risknu" by nevzniklo.
--
-- pitch_care_mode:
--   auto   — co je potřeba, zapne se a klub to zaplatí (výchozí, nikoho nepřekvapí)
--   manual — nic se nezapne samo, objednává se na každý zápas zvlášť
--   off    — nezapíná se nic; ušetříš, ale hřiště si to vybere
--
-- Objednávky platí vždy jen na nejbližší domácí zápas a po něm se spotřebují.

ALTER TABLE stadiums ADD COLUMN pitch_care_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE stadiums ADD COLUMN pitch_care_ordered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN pitch_snow_clearing_ordered INTEGER NOT NULL DEFAULT 0;
