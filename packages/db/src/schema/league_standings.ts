import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { leagues } from "./leagues";
import { teams } from "./teams";

export const leagueStandings = sqliteTable("league_standings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  played: integer("played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  goalsFor: integer("goals_for").notNull().default(0),
  goalsAgainst: integer("goals_against").notNull().default(0),
  points: integer("points").notNull().default(0),
});