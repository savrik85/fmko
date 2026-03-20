import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { players } from "./players";
import { teams } from "./teams";

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  playerId: integer("player_id").references(() => players.id),
  type: text("type", {
    enum: [
      "injury",
      "absence",
      "morale_change",
      "sponsor_offer",
      "player_arrival",
      "player_departure",
      "training",
      "special",
    ],
  }).notNull(),
  description: text("description").notNull(),
  impact: text("impact"), // JSON string popisující efekt
  season: text("season"),
  round: integer("round"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});