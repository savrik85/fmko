-- Příjmení Hodonický a Klimek (přání uživatele 2026-10-04). Četnost = skutečný počet lidí
-- v okrese podle prijmeni.cz (po obcích s rozšířenou působností): Hodonický Prachatice 1
-- + Vimperk 4, Strakonice 7, Písek 3; Klimek Vimperk 3, České Budějovice 9, Český Krumlov 1.
INSERT OR IGNORE INTO district_surnames (district, surname, frequency) VALUES
('Prachatice', 'Hodonický', 5),
('Prachatice', 'Klimek', 3),
('Strakonice', 'Hodonický', 7),
('Písek', 'Hodonický', 3),
('České Budějovice', 'Klimek', 9),
('Český Krumlov', 'Klimek', 1);
