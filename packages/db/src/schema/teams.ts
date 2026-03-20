import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { leagues } from "./leagues";

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  villageId: integer("village_id")
    .notNull()
    .references(() => villages.id),
  name: text("name").notNull(),
  primaryColor: text("primary_color").notNull(),
  secondaryColor: text("secondary_color").notNull(),
  budget: integer("budget").notNull(),
  reputation: integer("reputation").notNull().default(50),
  leagueId: integer("league_id").references(() => leagues.id),
  isAi: integer("is_ai", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});