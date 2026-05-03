import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { teams } from "./teams";
import { villageOfficials } from "./village-officials";

export const villageHistory = sqliteTable("village_history", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  teamId: text("team_id").references(() => teams.id),
  officialId: text("official_id").references(() => villageOfficials.id),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  impact: text("impact"),
  gameDate: text("game_date").notNull(),
  createdAt: text("created_at").notNull(),
});
