-- Sponzor jako entita: řádek district_sponsors je sponzor, smlouvy na něj odkazují přes sponsor_id.
-- Hlavní sponzor smí být jen u jednoho klubu. Aplikovat ručně (wrangler d1 execute --file).

-- 1) Praha má část sponzorů v seznamu dvakrát — ponech nejstarší řádek.
DELETE FROM district_sponsors
WHERE id NOT IN (SELECT MIN(id) FROM district_sponsors GROUP BY district, name);

CREATE UNIQUE INDEX IF NOT EXISTS ux_district_sponsors_district_name ON district_sponsors(district, name);

-- 2) Přednost po vypršení smlouvy (rollover): sponzor v sezóně priority_season jedná jen s priority_team_id.
ALTER TABLE district_sponsors ADD COLUMN priority_team_id TEXT;
ALTER TABLE district_sponsors ADD COLUMN priority_season INTEGER;

-- 3) Vazba smlouvy na sponzora. Smlouvy se sponzorem mimo okresní seznam zůstanou NULL.
ALTER TABLE sponsor_contracts ADD COLUMN sponsor_id INTEGER REFERENCES district_sponsors(id);

UPDATE sponsor_contracts SET sponsor_id = (
  SELECT MIN(ds.id) FROM district_sponsors ds
  JOIN teams t ON t.id = sponsor_contracts.team_id
  JOIN villages v ON v.id = t.village_id
  WHERE ds.district = v.district AND (
    ds.name = sponsor_contracts.sponsor_name
    OR (sponsor_contracts.category = 'stadium' AND TRIM(REPLACE(ds.name, ' s.r.o.', '')) || ' Arena' = sponsor_contracts.sponsor_name)
  )
);

CREATE INDEX IF NOT EXISTS idx_sponsor_contracts_sponsor ON sponsor_contracts(sponsor_id, status);

-- 4) Hlavní sponzor u více klubů: všem těmto smlouvám zbývá jen tahle sezóna.
--    Při rolloveru vyprší a přednost dostane klub s nejvyšší reputací.
UPDATE sponsor_contracts SET seasons_remaining = 1
WHERE status = 'active' AND category = 'main' AND sponsor_id IN (
  SELECT sponsor_id FROM sponsor_contracts
  WHERE status = 'active' AND category = 'main' AND sponsor_id IS NOT NULL
  GROUP BY sponsor_id HAVING COUNT(*) > 1
);
