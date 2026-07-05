-- Avatar (obličej) do archivu odešlých hráčů — aby prodeje do CPU týmů (i jiné odchody)
-- měly v souhrnu přestupů a historii ksicht. Bez toho se avatar smaže spolu s hráčem.
ALTER TABLE departed_players ADD COLUMN avatar TEXT;
