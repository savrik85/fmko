import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { villages } from "./villages";

export const villageOfficials = sqliteTable("village_officials", {
  id: text("id").primaryKey(),
  villageId: text("village_id").notNull().references(() => villages.id),
  role: text("role", {
    enum: ["starosta", "mistostarosta", "zastupitel_1", "zastupitel_2"],
  }).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  age: integer("age").notNull(),
  occupation: text("occupation").notNull(),
  faceConfig: text("face_config").notNull(),
  personality: text("personality", {
    enum: ["podnikatel", "aktivista", "sportovec", "tradicionalista", "populista"],
  }).notNull(),
  portfolio: text("portfolio").notNull().default("[]"),
  preferences: text("preferences").notNull().default("{}"),
  termStartAt: text("term_start_at").notNull(),
  termEndAt: text("term_end_at").notNull(),
  createdAt: text("created_at").notNull(),
});
