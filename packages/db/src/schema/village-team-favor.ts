import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { teams } from "./teams";
import { villageOfficials } from "./village-officials";

export const villageTeamFavor = sqliteTable("village_team_favor", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  officialId: text("official_id").references(() => villageOfficials.id),
  favor: integer("favor").notNull().default(50),
  trust: integer("trust").notNull().default(50),
  lastInteractionAt: text("last_interaction_at"),
  updatedAt: text("updated_at").notNull(),
});
