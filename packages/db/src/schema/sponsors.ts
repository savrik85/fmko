import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";

export const sponsors = sqliteTable("sponsors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["hospoda", "obchod", "remeslo", "firma", "obec"],
  }).notNull(),
  monthlyAmount: integer("monthly_amount").notNull(),
  winBonus: integer("win_bonus").notNull().default(0),
  contractUntil: text("contract_until").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});