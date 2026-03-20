import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const villages = sqliteTable("villages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  district: text("district").notNull(),
  region: text("region").notNull(),
  population: integer("population").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  category: text("category", {
    enum: ["vesnice", "obec", "mestys", "mesto"],
  }).notNull(),
  // Herní parametry odvozené z velikosti
  baseBudget: integer("base_budget").notNull(),
  playerPoolSize: integer("player_pool_size").notNull(),
  pitchType: text("pitch_type", {
    enum: ["hlinak", "trava", "umelka"],
  }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});