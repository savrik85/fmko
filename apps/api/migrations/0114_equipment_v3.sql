-- Vybavení v3: 7 nových položek (dodávka, posilovna, zeď, gril, kotel, zimní výbava, kamera).
-- POZOR: na remote (test/prod) aplikovat ručně přes wrangler d1 execute --file (migrations apply padá).
ALTER TABLE equipment ADD COLUMN team_van INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN team_van_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN gym_corner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN gym_corner_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN training_wall INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN training_wall_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN club_grill INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN club_grill_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN fan_drums INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN fan_drums_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN winter_gear INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN winter_gear_condition INTEGER NOT NULL DEFAULT 50;
ALTER TABLE equipment ADD COLUMN video_setup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN video_setup_condition INTEGER NOT NULL DEFAULT 50;
