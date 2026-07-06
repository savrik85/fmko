/**
 * Zaměstnanci (realizační tým) — API.
 * GET staff (sloty + efekty), GET market (volní v okrese), POST hire/fire/reassign/course.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireTeamOwnership } from "../auth/middleware";
import { recordTransaction, assertPurchaseAllowed } from "../season/finance-processor";
import { ROLE_DEFS, type StaffRole, type StaffAttributeKey } from "@okresni-masina/shared";
import { calculateStaffEffects } from "../staff/staff-effects";

export const staffRouter = new Hono<{ Bindings: Bindings }>();

// Mutace vyžadují vlastnictví týmu (GET jsou otevřené — middleware je propouští).
staffRouter.use("/teams/:teamId/staff", requireTeamOwnership);
staffRouter.use("/teams/:teamId/staff/*", requireTeamOwnership);

const ATTR_COLUMNS: StaffAttributeKey[] = [
  "coaching", "medicine", "maintenance", "judgement", "communication", "work_rate", "charm",
];

interface StaffRow {
  id: string;
  district: string;
  team_id: string | null;
  role: string | null;
  profession: string;
  first_name: string;
  last_name: string;
  gender: string;
  age: number;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  work_rate: number;
  charm: number;
  weekly_wage: number;
  signing_fee: number;
  avatar: string;
  description: string | null;
  course_attribute: string | null;
  course_points: number | null;
  course_weeks_remaining: number | null;
  hired_at: string | null;
  listed_until: string | null;
}

function mapStaff(row: StaffRow) {
  let avatar: Record<string, unknown> = {};
  try { avatar = JSON.parse(row.avatar); } catch (e) { logger.warn({ module: "staff" }, "parse avatar", e); }
  return {
    id: row.id,
    district: row.district,
    teamId: row.team_id,
    role: row.role,
    profession: row.profession,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    age: row.age,
    coaching: row.coaching,
    medicine: row.medicine,
    maintenance: row.maintenance,
    judgement: row.judgement,
    communication: row.communication,
    workRate: row.work_rate,
    charm: row.charm,
    weeklyWage: row.weekly_wage,
    signingFee: row.signing_fee,
    avatar,
    description: row.description,
    courseAttribute: row.course_attribute,
    coursePoints: row.course_points,
    courseWeeksRemaining: row.course_weeks_remaining,
    hiredAt: row.hired_at,
    listedUntil: row.listed_until,
  };
}

const STAFF_COLS =
  "id, district, team_id, role, profession, first_name, last_name, gender, age, coaching, medicine, maintenance, judgement, communication, work_rate, charm, weekly_wage, signing_fee, avatar, description, course_attribute, course_points, course_weeks_remaining, hired_at, listed_until";

/** Načte aktuální herní datum týmu (fallback = dnešní reálné datum). */
async function loadGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "load game_date", e); return null; });
  return row?.game_date ?? new Date().toISOString().slice(0, 10);
}

/** Cena/délka/body kurzu podle aktuální hodnoty atributu (dražší pro vyšší hodnoty). */
function computeCourse(current: number): { points: number; weeks: number; cost: number } | null {
  if (current >= 20) return null;
  const points = Math.min(3, 20 - current);
  const weeks = 3 + Math.floor(current / 7); // 3–5 týdnů
  const cost = Math.round((5 + current) * 1400); // ~9–34 k Kč
  return { points, weeks, cost };
}

/** GET /teams/:teamId/staff — najatí zaměstnanci + agregované efekty + nabídky kurzů. */
staffRouter.get("/teams/:teamId/staff", async (c) => {
  const teamId = c.req.param("teamId");
  const rows = await c.env.DB.prepare(`SELECT ${STAFF_COLS} FROM staff_members WHERE team_id = ? ORDER BY hired_at ASC`)
    .bind(teamId).all<StaffRow>()
    .catch((e) => { logger.warn({ module: "staff" }, "load hired staff", e); return { results: [] as StaffRow[] }; });

  const effects = calculateStaffEffects(rows.results);
  const staff = rows.results.map((row) => {
    const m = mapStaff(row);
    // Nabídky kurzů per atribut (pokud právě neběží jiný kurz)
    const courses = row.course_attribute
      ? null
      : ATTR_COLUMNS.map((attr) => {
          const quote = computeCourse((row as unknown as Record<string, number>)[attr]);
          return quote ? { attribute: attr, ...quote } : null;
        }).filter(Boolean);
    return { ...m, courses };
  });

  return c.json({ staff, effects });
});

/** GET /teams/:teamId/staff/market — volní kandidáti v okrese týmu. */
staffRouter.get("/teams/:teamId/staff/market", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "load team district", e); return null; });
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT ${STAFF_COLS} FROM staff_members WHERE district = ? AND team_id IS NULL ORDER BY weekly_wage DESC`
  ).bind(team.district).all<StaffRow>()
    .catch((e) => { logger.warn({ module: "staff" }, "load market", e); return { results: [] as StaffRow[] }; });

  return c.json({ market: rows.results.map(mapStaff) });
});

/** POST /teams/:teamId/staff/:staffId/hire { role } — najme kandidáta na roli (race-safe). */
staffRouter.post("/teams/:teamId/staff/:staffId/hire", async (c) => {
  const teamId = c.req.param("teamId");
  const staffId = c.req.param("staffId");
  const body = await c.req.json<{ role?: string }>().catch(() => ({} as { role?: string }));
  const role = body.role as StaffRole | undefined;

  if (!role || !(role in ROLE_DEFS)) return c.json({ error: "Neplatná role" }, 400);

  const team = await c.env.DB.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "hire load district", e); return null; });
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const cand = await c.env.DB.prepare(`SELECT ${STAFF_COLS} FROM staff_members WHERE id = ?`)
    .bind(staffId).first<StaffRow>()
    .catch((e) => { logger.warn({ module: "staff" }, "hire load candidate", e); return null; });
  if (!cand) return c.json({ error: "Kandidát nenalezen" }, 404);
  if (cand.team_id) return c.json({ error: "Tenhle člověk už někde dělá." }, 409);
  if (cand.district !== team.district) return c.json({ error: "Kandidát není z tvého okresu." }, 400);

  // Slot obsazený?
  const occupied = await c.env.DB.prepare("SELECT id FROM staff_members WHERE team_id = ? AND role = ?")
    .bind(teamId, role).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "hire check slot", e); return null; });
  if (occupied) return c.json({ error: `Slot „${ROLE_DEFS[role].label}" je už obsazený. Nejdřív propusť současného.` }, 409);

  // Rozpočet
  const allowed = await assertPurchaseAllowed(c.env.DB, teamId, cand.signing_fee);
  if (!allowed.ok) return c.json({ error: allowed.reason }, 400);

  const gameDate = await loadGameDate(c.env.DB, teamId);

  // Race-safe claim: jen pokud je pořád volný
  const claim = await c.env.DB.prepare(
    "UPDATE staff_members SET team_id = ?, role = ?, hired_at = ?, listed_until = NULL WHERE id = ? AND team_id IS NULL"
  ).bind(teamId, role, gameDate, staffId).run()
    .catch((e) => { logger.error({ module: "staff" }, "hire claim failed", e); return null; });
  if (!claim || (claim.meta?.changes ?? 0) === 0) {
    return c.json({ error: "Někdo tě předběhl — kandidáta už najal jiný tým." }, 409);
  }

  await recordTransaction(c.env.DB, teamId, "staff_signing", -cand.signing_fee,
    `Podpisné: ${cand.first_name} ${cand.last_name} (${ROLE_DEFS[role].label})`, gameDate, staffId);

  const hired = await c.env.DB.prepare(`SELECT ${STAFF_COLS} FROM staff_members WHERE id = ?`)
    .bind(staffId).first<StaffRow>();
  return c.json({ ok: true, staff: hired ? mapStaff(hired) : null });
});

/** POST /teams/:teamId/staff/:staffId/fire — propuštění (zdarma, zpět do poolu). */
staffRouter.post("/teams/:teamId/staff/:staffId/fire", async (c) => {
  const teamId = c.req.param("teamId");
  const staffId = c.req.param("staffId");

  const gameDate = await loadGameDate(c.env.DB, teamId);
  // Vrátit do poolu na ~2 týdny (listed_until), zrušit případný kurz
  const listedUntil = new Date(new Date(gameDate).getTime() + 14 * 24 * 3600 * 1000).toISOString();

  const res = await c.env.DB.prepare(
    "UPDATE staff_members SET team_id = NULL, role = NULL, hired_at = NULL, listed_until = ?, course_attribute = NULL, course_points = NULL, course_weeks_remaining = NULL WHERE id = ? AND team_id = ?"
  ).bind(listedUntil, staffId, teamId).run()
    .catch((e) => { logger.error({ module: "staff" }, "fire failed", e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) return c.json({ error: "Zaměstnanec nenalezen" }, 404);

  return c.json({ ok: true });
});

/** POST /teams/:teamId/staff/:staffId/reassign { role } — přesun na jiný volný slot. */
staffRouter.post("/teams/:teamId/staff/:staffId/reassign", async (c) => {
  const teamId = c.req.param("teamId");
  const staffId = c.req.param("staffId");
  const body = await c.req.json<{ role?: string }>().catch(() => ({} as { role?: string }));
  const role = body.role as StaffRole | undefined;
  if (!role || !(role in ROLE_DEFS)) return c.json({ error: "Neplatná role" }, 400);

  const cur = await c.env.DB.prepare("SELECT role FROM staff_members WHERE id = ? AND team_id = ?")
    .bind(staffId, teamId).first<{ role: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "reassign load", e); return null; });
  if (!cur) return c.json({ error: "Zaměstnanec nenalezen" }, 404);
  if (cur.role === role) return c.json({ ok: true }); // beze změny

  const occupied = await c.env.DB.prepare("SELECT id FROM staff_members WHERE team_id = ? AND role = ?")
    .bind(teamId, role).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "reassign check slot", e); return null; });
  if (occupied) return c.json({ error: `Slot „${ROLE_DEFS[role].label}" je obsazený.` }, 409);

  await c.env.DB.prepare("UPDATE staff_members SET role = ? WHERE id = ? AND team_id = ?")
    .bind(role, staffId, teamId).run()
    .catch((e) => { logger.error({ module: "staff" }, "reassign failed", e); throw e; });
  return c.json({ ok: true });
});

/** POST /teams/:teamId/staff/:staffId/course { attribute } — pošle zaměstnance na kurz. */
staffRouter.post("/teams/:teamId/staff/:staffId/course", async (c) => {
  const teamId = c.req.param("teamId");
  const staffId = c.req.param("staffId");
  const body = await c.req.json<{ attribute?: string }>().catch(() => ({} as { attribute?: string }));
  const attribute = body.attribute as StaffAttributeKey | undefined;
  if (!attribute || !ATTR_COLUMNS.includes(attribute)) return c.json({ error: "Neplatný atribut" }, 400);

  const row = await c.env.DB.prepare(`SELECT ${STAFF_COLS} FROM staff_members WHERE id = ? AND team_id = ?`)
    .bind(staffId, teamId).first<StaffRow>()
    .catch((e) => { logger.warn({ module: "staff" }, "course load staff", e); return null; });
  if (!row) return c.json({ error: "Zaměstnanec nenalezen" }, 404);
  if (row.course_attribute) return c.json({ error: "Zaměstnanec už je na kurzu." }, 409);

  const current = (row as unknown as Record<string, number>)[attribute];
  const quote = computeCourse(current);
  if (!quote) return c.json({ error: "Tenhle atribut je už na maximu (20)." }, 400);

  const allowed = await assertPurchaseAllowed(c.env.DB, teamId, quote.cost);
  if (!allowed.ok) return c.json({ error: allowed.reason }, 400);

  const gameDate = await loadGameDate(c.env.DB, teamId);

  await c.env.DB.prepare(
    "UPDATE staff_members SET course_attribute = ?, course_points = ?, course_weeks_remaining = ? WHERE id = ? AND team_id = ?"
  ).bind(attribute, quote.points, quote.weeks, staffId, teamId).run()
    .catch((e) => { logger.error({ module: "staff" }, "course start failed", e); throw e; });

  await recordTransaction(c.env.DB, teamId, "course_fee", -quote.cost,
    `Kurz (${attribute}) pro ${row.first_name} ${row.last_name}`, gameDate, staffId);

  return c.json({ ok: true, course: { attribute, ...quote } });
});
