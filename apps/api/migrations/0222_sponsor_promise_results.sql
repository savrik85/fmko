-- 0222: Sliby sponzorům, etapa 3 (docs/superpowers/plans/2026-09-23-sponzori-etapa-3-sliby.md).
-- actual_value: naměřená hodnota při vyhodnocení (místo v tabulce, kolo poháru, návštěva,
--   průměr mladých v sestavě, reputace, počet výtržností, licence, úroveň zařízení, logo 0/1),
--   aby hráč viděl, o kolik to bylo „těsně vedle".
-- sleeve_sponsor_id: firma, jejíž logo nosí klub na rukávu dresu (slib jersey_logo).
-- Předpoklad: migrace 0221 (sponsor_promises, etapa 2) už je aplikovaná.
-- Aplikovat ručně PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0222_sponsor_promise_results.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní, spouštět jen jednou.

ALTER TABLE sponsor_promises ADD COLUMN actual_value REAL;
ALTER TABLE teams ADD COLUMN sleeve_sponsor_id INTEGER REFERENCES district_sponsors(id);
CREATE INDEX IF NOT EXISTS idx_sponsor_promises_pending ON sponsor_promises(status, kind);
