/**
 * Nábor zaměstnance: jedna služba pro manažera (POST /teams/:teamId/staff/:staffId/hire)
 * i AI trenéra. Licence trenéra, sloty, rozpočet a souběh (dva kluby jednoho kandidáta)
 * se kontrolují jen tady.
 */

import {
  ROLE_DEFS, licenceLabel, maxScoutsForLicence, staffRequiredLicence,
  type LicenceLevel, type StaffAttributeKey, type StaffRole,
} from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { assertPurchaseAllowed, recordTransaction } from "../season/finance-processor";
import type { ServiceError } from "./lineup";

const ATTR_COLUMNS: StaffAttributeKey[] = [
  "coaching", "medicine", "maintenance", "judgement", "communication", "work_rate", "charm",
];

export interface StaffCandidateRow {
  id: string;
  district: string;
  team_id: string | null;
  role: string | null;
  profession: string;
  first_name: string;
  last_name: string;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  work_rate: number;
  charm: number;
  weekly_wage: number;
  signing_fee: number;
}

/** Jakou licenci trenéra kandidát chce — podle své nejsilnější vlastnosti. */
export function requiredLicence(row: Pick<StaffCandidateRow, StaffAttributeKey>): LicenceLevel {
  return staffRequiredLicence(Math.max(...ATTR_COLUMNS.map((a) => (row as unknown as Record<string, number>)[a] ?? 0)));
}

/** Licence trenéra klubu (rezerva spadá pod trenéra áčka). Bez trenéra = bez licence. */
export async function loadCoachLicence(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT m.licence_level FROM teams t
       JOIN managers m ON m.team_id = COALESCE(t.parent_team_id, t.id)
      WHERE t.id = ?`,
  ).bind(teamId).first<{ licence_level: number | null }>()
    .catch((e) => { logger.warn({ module: "staff" }, "load coach licence", e); return null; });
  return row?.licence_level ?? 0;
}

/** Načte aktuální herní datum týmu (fallback = dnešní reálné datum). */
async function loadGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "load game_date", e); return null; });
  return row?.game_date ?? new Date().toISOString().slice(0, 10);
}

const CANDIDATE_COLS =
  "id, district, team_id, role, profession, first_name, last_name, coaching, medicine, maintenance, judgement, communication, work_rate, charm, weekly_wage, signing_fee";

/** Najme kandidáta z poolu okresu na roli (race-safe). */
export async function hireStaff(db: D1Database, teamId: string, staffId: string, roleRaw: string | undefined): Promise<{ ok: true } | ServiceError> {
  const role = roleRaw as StaffRole | undefined;
  if (!role || !(role in ROLE_DEFS)) return { ok: false, status: 400, error: "Neplatná role" };

  const team = await db.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "hire load district", e); return null; });
  if (!team) return { ok: false, status: 404, error: "Tým nenalezen" };

  const cand = await db.prepare(`SELECT ${CANDIDATE_COLS} FROM staff_members WHERE id = ?`)
    .bind(staffId).first<StaffCandidateRow>()
    .catch((e) => { logger.warn({ module: "staff" }, "hire load candidate", e); return null; });
  if (!cand) return { ok: false, status: 404, error: "Kandidát nenalezen" };
  if (cand.team_id) return { ok: false, status: 409, error: "Tenhle člověk už někde dělá." };
  if (cand.district !== team.district) return { ok: false, status: 400, error: "Kandidát není z tvého okresu." };

  // Špičkoví lidé nejdou pod trenéra bez papírů (licence trenéra, fáze 3).
  const needed = requiredLicence(cand);
  if (needed > 0 && (await loadCoachLicence(db, teamId)) < needed) {
    return {
      ok: false, status: 403,
      error: `${cand.first_name} ${cand.last_name} chce pracovat jen pod trenérem s licencí ${licenceLabel(needed)} nebo vyšší.`,
    };
  }

  // Slot obsazený?
  if (role === "skaut") {
    const coachLicence = await loadCoachLicence(db, teamId);
    const maxScouts = maxScoutsForLicence(coachLicence);
    const scoutCountRow = await db.prepare("SELECT COUNT(*) as count FROM staff_members WHERE team_id = ? AND role = 'skaut'")
      .bind(teamId).first<{ count: number }>()
      .catch((e) => { logger.warn({ module: "staff" }, "hire check scout slots", e); return null; });
    const count = scoutCountRow?.count ?? 0;
    if (count >= maxScouts) {
      return { ok: false, status: 409, error: `Máš už plný počet skautů (${maxScouts}). Pro dalšího potřebuješ vyšší trenérskou licenci.` };
    }
  } else {
    const occupied = await db.prepare("SELECT id FROM staff_members WHERE team_id = ? AND role = ?")
      .bind(teamId, role).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: "staff" }, "hire check slot", e); return null; });
    if (occupied) return { ok: false, status: 409, error: `Slot „${ROLE_DEFS[role].label}" je už obsazený. Nejdřív propusť současného.` };
  }

  // Rozpočet
  const allowed = await assertPurchaseAllowed(db, teamId, cand.signing_fee);
  if (!allowed.ok) return { ok: false, status: 400, error: allowed.reason };

  const gameDate = await loadGameDate(db, teamId);

  // Race-safe claim: jen pokud je pořád volný
  let claimError: unknown = null;
  const claim = await db.prepare(
    "UPDATE staff_members SET team_id = ?, role = ?, hired_at = ?, listed_until = NULL WHERE id = ? AND team_id IS NULL"
  ).bind(teamId, role, gameDate, staffId).run()
    .catch((e) => {
      claimError = e;
      logger.error({ module: "staff" }, "hire claim failed", e);
      return null;
    });
  if (claimError || !claim) {
    return { ok: false, status: 500, error: "Nábor se nezdařil kvůli systémové chybě. Zkus to prosím znovu." };
  }
  if ((claim.meta?.changes ?? 0) === 0) {
    return { ok: false, status: 409, error: "Někdo tě předběhl, kandidáta už najal jiný tým." };
  }

  await recordTransaction(db, teamId, "staff_signing", -cand.signing_fee,
    `Podpisné: ${cand.first_name} ${cand.last_name} (${ROLE_DEFS[role].label})`, gameDate, staffId);

  return { ok: true };
}

/** Volní kandidáti v okrese týmu (pool zaměstnanců). */
export async function listStaffMarket(db: D1Database, teamId: string): Promise<StaffCandidateRow[]> {
  const team = await db.prepare(
    "SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "staff" }, "load team district", e); return null; });
  if (!team) return [];
  const rows = await db.prepare(
    `SELECT ${CANDIDATE_COLS} FROM staff_members WHERE district = ? AND team_id IS NULL ORDER BY weekly_wage DESC`
  ).bind(team.district).all<StaffCandidateRow>()
    .catch((e) => { logger.warn({ module: "staff" }, "load market", e); return { results: [] as StaffCandidateRow[] }; });
  return rows.results;
}
