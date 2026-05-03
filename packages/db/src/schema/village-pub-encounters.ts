import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";
import { teams } from "./teams";
import { villageOfficials } from "./village-officials";

export const villagePubEncounters = sqliteTable("village_pub_encounters", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  officialId: text("official_id").notNull().references(() => villageOfficials.id),
  status: text("status", {
    enum: ["active", "accepted", "ignored", "expired"],
  }).notNull().default("active"),
  expiresAt: text("expires_at").notNull(),
  respondedAt: text("responded_at"),
  outcome: text("outcome"),
  createdAt: text("created_at").notNull(),
});
