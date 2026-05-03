import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const teamFanbase = sqliteTable("team_fanbase", {
  teamId: text("team_id").primaryKey(),
  hardcoreCount: integer("hardcore_count").notNull().default(0),
  regularCount: integer("regular_count").notNull().default(0),
  casualCount: integer("casual_count").notNull().default(0),
  casualToRegularStreak: integer("casual_to_regular_streak").notNull().default(0),
  regularToHardcoreStreak: integer("regular_to_hardcore_streak").notNull().default(0),
  promoConsecutiveMatches: integer("promo_consecutive_matches").notNull().default(0),
  promoUnpromotedStreak: integer("promo_unpromoted_streak").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const busSubsidies = sqliteTable("bus_subsidies", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  matchId: text("match_id").notNull(),
  sourceVillageId: text("source_village_id").notNull(),
  busSize: text("bus_size", { enum: ["traktor", "karosa", "autokar"] }).notNull(),
  cost: integer("cost").notNull(),
  attendeesBrought: integer("attendees_brought"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const busSatelliteFans = sqliteTable("bus_satellite_fans", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  villageId: text("village_id").notNull(),
  casualCount: integer("casual_count").notNull().default(0),
  regularCount: integer("regular_count").notNull().default(0),
  hardcoreCount: integer("hardcore_count").notNull().default(0),
  consecutiveBuses: integer("consecutive_buses").notNull().default(0),
  lastBusMatchId: text("last_bus_match_id"),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const fanbaseSnapshots = sqliteTable("fanbase_snapshots", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  gamedate: text("gamedate").notNull(),
  hardcoreTotal: integer("hardcore_total").notNull(),
  regularTotal: integer("regular_total").notNull(),
  casualTotal: integer("casual_total").notNull(),
  totalLoyal: integer("total_loyal").notNull(),
  reputationAtTime: integer("reputation_at_time").notNull(),
  satisfactionAtTime: integer("satisfaction_at_time"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
