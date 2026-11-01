-- „Čím se zápas lámal“ (2026-11-01): průměrné vlivy na šance obou týmů ze simulace
-- (forma, morálka, sehranost, chemie, hřiště a počasí, taktika, tvrdost soupeře, kondice),
-- JSON {home: {...}, away: {...}}, engine/match-factors.ts. Starší zápasy zůstanou NULL.
ALTER TABLE matches ADD COLUMN factors TEXT;
ALTER TABLE cup_matches ADD COLUMN factors TEXT;
