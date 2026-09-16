-- Osobní volno schválené trenérem v chatu se zapisuje do `injuries` jako typ 'obecne'.
-- Stejný typ ale mají i skutečná zranění (modřina, naraženina, rvačka v hospodě),
-- takže se volno od zranění nedalo odlišit. Lékař pak „léčil" i dovolenou na porod
-- a hlásil „zranění zaléčeno". Příznak to rozliší; falešná zranění mají vlastní is_fake.
ALTER TABLE injuries ADD COLUMN osobni_volno INTEGER NOT NULL DEFAULT 0;
