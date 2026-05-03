import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { teams } from "./teams";
import { villageOfficials } from "./village-officials";

export const villageBrigades = sqliteTable("village_brigades", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  offeredAt: text("offered_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status", {
    enum: ["open", "taken", "expired", "completed"],
  }).notNull().default("open"),
  requiredPlayerCount: integer("required_player_count").notNull(),
  durationHours: integer("duration_hours").notNull(),
  offeredByOfficialId: text("offered_by_official_id").references(() => villageOfficials.id),
  rewardMoney: integer("reward_money").notNull(),
  rewardFavor: integer("reward_favor").notNull(),
  conditionDrain: integer("condition_drain").notNull(),
  moraleChange: integer("morale_change").notNull().default(0),
  takenByTeamId: text("taken_by_team_id").references(() => teams.id),
  takenPlayerIds: text("taken_player_ids"),
  takenAt: text("taken_at"),
  completedAt: text("completed_at"),
});
