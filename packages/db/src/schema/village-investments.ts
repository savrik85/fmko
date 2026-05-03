import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { teams } from "./teams";

export const villageInvestments = sqliteTable("village_investments", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  type: text("type", {
    enum: ["stadium_upgrade", "pitch_renovation", "youth_facility", "bus_subsidy"],
  }).notNull(),
  targetFacility: text("target_facility"),
  offeredAmount: integer("offered_amount").notNull(),
  requiredContribution: integer("required_contribution").notNull(),
  favorThreshold: integer("favor_threshold").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status", {
    enum: ["offered", "accepted", "declined", "expired", "completed"],
  }).notNull().default("offered"),
  politicalCost: integer("political_cost").notNull().default(0),
  createdAt: text("created_at").notNull(),
  respondedAt: text("responded_at"),
});
