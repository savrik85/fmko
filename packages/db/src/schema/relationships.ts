import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { players } from "./players";

export const relationships = sqliteTable("relationships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerAId: integer("player_a_id")
    .notNull()
    .references(() => players.id),
  playerBId: integer("player_b_id")
    .notNull()
    .references(() => players.id),
  type: text("type", {
    enum: ["brothers", "father_son", "in_laws", "classmates", "coworkers", "neighbors", "drinking_buddies", "rivals", "mentor_pupil"],
  }).notNull(),
  strength: integer("strength").notNull().default(50), // 0–100
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});