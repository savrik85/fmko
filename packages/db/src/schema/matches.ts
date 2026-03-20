import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { leagues } from "./leagues";
import { teams } from "./teams";

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id),
  round: integer("round").notNull(),
  homeTeamId: integer("home_team_id")
    .notNull()
    .references(() => teams.id),
  awayTeamId: integer("away_team_id")
    .notNull()
    .references(() => teams.id),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  status: text("status", {
    enum: ["scheduled", "in_progress", "finished"],
  })
    .notNull()
    .default("scheduled"),
  // Události zápasu (JSON pole MatchEvent[])
  events: text("events"), // JSON string
  // Komentáře zápasu (JSON pole)
  commentary: text("commentary"), // JSON string
  playedAt: text("played_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});