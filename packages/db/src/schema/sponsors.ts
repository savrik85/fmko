import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";

/** Sponzor jako entita. Hlavním sponzorem smí být jen u jednoho klubu. */
export const sponsors = sqliteTable("district_sponsors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  district: text("district").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  monthlyMin: integer("monthly_min").notNull(),
  monthlyMax: integer("monthly_max").notNull(),
  winBonusMin: integer("win_bonus_min").notNull(),
  winBonusMax: integer("win_bonus_max").notNull(),
  /** Po vypršení hlavní smlouvy jedná sponzor v sezóně prioritySeason přednostně s tímto klubem. */
  priorityTeamId: text("priority_team_id"),
  prioritySeason: integer("priority_season"),
});

export const sponsorContracts = sqliteTable("sponsor_contracts", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id),
  /** NULL = sponzor mimo okresní seznam (např. starší smlouvy z onboardingu). */
  sponsorId: integer("sponsor_id").references(() => sponsors.id),
  sponsorName: text("sponsor_name").notNull(),
  sponsorType: text("sponsor_type").notNull(),
  monthlyAmount: integer("monthly_amount").notNull(),
  winBonus: integer("win_bonus").notNull().default(0),
  seasonsTotal: integer("seasons_total").notNull().default(1),
  seasonsRemaining: integer("seasons_remaining").notNull().default(1),
  earlyTerminationFee: integer("early_termination_fee").notNull().default(0),
  isNamingRights: integer("is_naming_rights").notNull().default(0),
  status: text("status", { enum: ["active", "expired", "terminated"] }).notNull().default("active"),
  signedAt: text("signed_at").notNull(),
  category: text("category", { enum: ["main", "stadium", "banner"] }).notNull().default("main"),
});
