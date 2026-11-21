-- Brigáda a lopaty přes kabinu (F1, docs/superpowers/plans/2026-11-20-winter-features-roadmap.md).
-- Kolik lidí z kabiny přišlo s lopatou odklidit sníh před nejbližším domácím zápasem
-- (messaging/squad-brigade.ts). Od 6 lidí se sníh odklidí zdarma s účinností jako placená
-- parta, méně lidí jen zčásti. Spotřebuje se u zápasu spolu s ostatními objednávkami péče
-- (stadium/pitch-wear.ts). 0 = žádná brigáda.
ALTER TABLE stadiums ADD COLUMN pitch_snow_clearing_volunteer INTEGER NOT NULL DEFAULT 0;
