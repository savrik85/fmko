-- Prodávající smí u inzerátu (prodej i hostování) odkrýt potenciál hráče: kupující ho pak
-- vidí na trhu a v profilu hráče po dobu, kdy je inzerát aktivní.
ALTER TABLE transfer_listings ADD COLUMN reveal_potential INTEGER NOT NULL DEFAULT 0;
