-- Add category to sponsor contracts: 'main' (hlavní sponzor) or 'stadium' (sponzor stadionu)
ALTER TABLE sponsor_contracts ADD COLUMN category TEXT NOT NULL DEFAULT 'main' CHECK(category IN ('main','stadium'));
