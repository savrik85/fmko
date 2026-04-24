-- Klub: krok 3 - stadion metadata (beyond jen stadium_name)
-- Nickname ("Kotel", "Pekelne hriste"), rok vystavby, specialita
-- (co se u nas peče/pije), jmena tribun severni a jizni.

ALTER TABLE teams ADD COLUMN stadium_nickname TEXT;
ALTER TABLE teams ADD COLUMN stadium_built_year INTEGER;
ALTER TABLE teams ADD COLUMN stadium_specialita TEXT;
ALTER TABLE teams ADD COLUMN stadium_tribuna_north TEXT;
ALTER TABLE teams ADD COLUMN stadium_tribuna_south TEXT;
