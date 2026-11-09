-- Ruční zavření okresu pro nové registrace (plná liga, kterou správce nechce dál plnit).
-- Stav 'closed' do CHECK u status přidat nejde bez přestavby tabulky, proto vlastní sloupec.
ALTER TABLE district_registrations ADD COLUMN registration_closed INTEGER NOT NULL DEFAULT 0;
