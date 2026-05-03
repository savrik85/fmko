import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";
import { villageOfficials } from "./village-officials";

export const villageInvitations = sqliteTable("village_invitations", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull(),
  matchDay: text("match_day").notNull(),
  officialId: text("official_id").notNull().references(() => villageOfficials.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  status: text("status", {
    enum: ["sent", "accepted", "declined", "attended"],
  }).notNull().default("sent"),
  giftCost: integer("gift_cost").notNull(),
  attendanceEffects: text("attendance_effects"),
  createdAt: text("created_at").notNull(),
});
