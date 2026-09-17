-- Incidenty v klubu, fáze 5: kradené zboží jako soukromý inzerát v bazaru.
-- Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3 a 8.
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0207_incidenty_bazar.sql

ALTER TABLE equipment_listings ADD COLUMN incident_id TEXT;
CREATE INDEX IF NOT EXISTS idx_listings_incident ON equipment_listings(incident_id) WHERE incident_id IS NOT NULL;
