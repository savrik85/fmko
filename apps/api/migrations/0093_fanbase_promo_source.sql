-- Source separation: rozlišit fanoušky z vlastní vesnice (home) vs. z propagace.
-- Bus konverze už je per-village v bus_satellite_fans (oddělené).
--
-- Po této migraci:
--   - team_fanbase.hardcore_count / regular_count / casual_count = JEN z vlastní vesnice
--   - team_fanbase.promo_casual_count = z propagačních článků
--   - bus_satellite_fans.casual_count (per village) = z autobusu
--
-- Aktuální backfill (× 0.005 / 0.020 / 0.030 z populace) zůstává smysluplný jako "home"
-- protože reprezentuje obyvatele vlastní vesnice.

ALTER TABLE team_fanbase ADD COLUMN promo_casual_count INTEGER NOT NULL DEFAULT 0;
