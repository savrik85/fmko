import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { teams } from "./teams";

export const villagePetitions = sqliteTable("village_petitions", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  costMoney: integer("cost_money").notNull().default(0),
  rewardFavor: integer("reward_favor").notNull(),
  ignorePenalty: integer("ignore_penalty").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status", {
    enum: ["active", "accepted", "ignored", "expired"],
  }).notNull().default("active"),
  createdAt: text("created_at").notNull(),
  respondedAt: text("responded_at"),
});
