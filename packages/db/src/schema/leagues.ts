import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const leagues = sqliteTable("leagues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  district: text("district").notNull(),
  level: integer("level").notNull().default(1), // 1 = nejnižší
  season: text("season").notNull(), // "2024/2025"
  currentRound: integer("current_round").notNull().default(0),
  totalRounds: integer("total_rounds").notNull(),
  status: text("status", {
    enum: ["preparation", "autumn", "winter_break", "spring", "finished"],
  })
    .notNull()
    .default("preparation"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});