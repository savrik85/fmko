import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nickname: text("nickname"),
  age: integer("age").notNull(),
  position: text("position", {
    enum: ["GK", "DEF", "MID", "FWD"],
  }).notNull(),

  // Fotbalové atributy (1–20)
  speed: integer("speed").notNull(),
  technique: integer("technique").notNull(),
  shooting: integer("shooting").notNull(),
  passing: integer("passing").notNull(),
  heading: integer("heading").notNull(),
  defense: integer("defense").notNull(),
  goalkeeping: integer("goalkeeping").notNull().default(1),

  // Fyzické
  stamina: integer("stamina").notNull(),
  strength: integer("strength").notNull(),
  injury_proneness: integer("injury_proneness").notNull(),

  // Osobnostní
  discipline: integer("discipline").notNull(),
  patriotism: integer("patriotism").notNull(),
  alcohol: integer("alcohol").notNull(),
  temper: integer("temper").notNull(),

  // Kontext
  occupation: text("occupation"),
  bodyType: text("body_type", {
    enum: ["thin", "athletic", "normal", "stocky", "obese"],
  }).notNull(),

  // Avatar config (JSON)
  avatarConfig: text("avatar_config").notNull(), // JSON string

  // Stav
  condition: integer("condition").notNull().default(100),
  morale: integer("morale").notNull().default(50),
  injuredUntil: text("injured_until"),

  // Vztah hráče k trenérovi (0-100), buduje se přes AI chaty + výsledky/minuty
  coachRelationship: integer("coach_relationship").notNull().default(50),

  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});