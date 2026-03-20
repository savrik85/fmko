import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  displayName: text("display_name").notNull(),
  teamId: integer("team_id").references(() => teams.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});