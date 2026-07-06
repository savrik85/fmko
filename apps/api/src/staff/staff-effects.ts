/**
 * Staff effects engine — agreguje boosty od najatých zaměstnanců.
 * Vzor: `apps/api/src/equipment/equipment-generator.ts` (`calculateEffects`).
 *
 * Každá role → jeden efekt (sloty jsou unikátní, max 1 zaměstnanec na roli).
 * Efekt škáluje s efektivitou zaměstnance v roli (eff 1–20 = (2×primární + sekundární)/3).
 * Koeficienty jsou první nástřel laděný podle equipment efektů — jeden zaměstnanec ≈ jeden slušný kus vybavení.
 */

import { ROLE_DEFS, type StaffRole, type StaffAttributeKey } from "@okresni-masina/shared";

/** Minimální řádek zaměstnance z DB (snake_case sloupce). */
export interface StaffEffectRow {
  role: string | null;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  work_rate: number;
  charm: number;
}

export interface StaffEffects {
  // Trénink
  trainingMultiplier: number;      // ×improveChance (asistent). default 1
  trainingAttendanceBonus: number; // + k pravděpodobnosti docházky na trénink (asistent). default 0
  youthTrainingMod: number;        // ×(1 + mod) pro hráče <22 (trenér mládeže). default 0
  gkTrainingMul: number;           // ×improveChance pro GK (trenér brankářů). default 1
  // Kondice
  conditionDrainReduction: number; // drain ×(1 - mod) (kondiční trenér). default 0
  conditionRegenBonus: number;     // + body kondice/den (masér). default 0
  // Zranění
  injuryExtraHealChance: number;   // šance na -1 den navíc denně (lékař). default 0
  injurySeverityReduction: number; // nová zranění: dny ×(1 - mod) (lékař). default 0
  // Morálka
  moraleTargetBonus: number;       // + k cílové morálce/driftu (psycholog). default 0
  // Provoz / degradace
  pitchDegradationReduction: number; // degradace hřiště ×(1 - mod) (správce). default 0
  equipDegradationReduction: number; // degradace vybavení ×(1 - mod) (správce). default 0
  // Zápas
  gkBonus: number;                 // + k výkonu brankáře (trenér brankářů). default 0
  crowdAttendanceBonus: number;    // návštěvnost ×(1 + mod) doma (šéf fanklubu). default 0
  crowdMod: number;                // domácí kotel ×(1 + mod) (šéf fanklubu). default 0
  // Občerstvení
  concessionDemandMul: number;     // ×poptávka po občerstvení (obsluha). default 1
  concessionSatBonus: number;      // + spokojenost fanoušků (obsluha). default 0
  // Ekonomika
  opsCostMul: number;              // ×provozní náklady (ekonom, <1 = úspora). default 1
  sponsorBonusMul: number;         // ×sponzorské příjmy (ekonom, >1 = víc). default 1
}

export function emptyStaffEffects(): StaffEffects {
  return {
    trainingMultiplier: 1,
    trainingAttendanceBonus: 0,
    youthTrainingMod: 0,
    gkTrainingMul: 1,
    conditionDrainReduction: 0,
    conditionRegenBonus: 0,
    injuryExtraHealChance: 0,
    injurySeverityReduction: 0,
    moraleTargetBonus: 0,
    pitchDegradationReduction: 0,
    equipDegradationReduction: 0,
    gkBonus: 0,
    crowdAttendanceBonus: 0,
    crowdMod: 0,
    concessionDemandMul: 1,
    concessionSatBonus: 0,
    opsCostMul: 1,
    sponsorBonusMul: 1,
  };
}

/** Efektivita zaměstnance v roli z DB řádku (snake_case). Rozsah 0–20 (float pro jemnější škálování). */
export function rowEffectiveness(row: StaffEffectRow, role: StaffRole): number {
  const def = ROLE_DEFS[role];
  const val = (key: StaffAttributeKey): number => {
    // StaffAttributeKey hodnoty = přesně názvy DB sloupců (coaching, medicine, ..., work_rate, charm)
    const v = (row as unknown as Record<string, number>)[key];
    return typeof v === "number" ? v : 5;
  };
  const primary = val(def.primary);
  const secondary = val(def.secondary);
  const eff = (2 * primary + secondary) / 3;
  return Math.max(0, Math.min(20, eff));
}

/**
 * Spočítá agregované efekty ze seznamu najatých zaměstnanců.
 * Řádky bez role (volní kandidáti) se ignorují.
 */
export function calculateStaffEffects(rows: StaffEffectRow[]): StaffEffects {
  const fx = emptyStaffEffects();

  for (const row of rows) {
    if (!row.role || !(row.role in ROLE_DEFS)) continue;
    const role = row.role as StaffRole;
    const eff = rowEffectiveness(row, role);
    const f = eff / 20; // 0..1

    switch (role) {
      case "asistent":
        fx.trainingMultiplier = 1 + f * 0.25;
        fx.trainingAttendanceBonus = f * 0.1;
        break;
      case "trener_mladeze":
        fx.youthTrainingMod = f * 0.3;
        break;
      case "trener_brankaru":
        fx.gkTrainingMul = 1 + f * 0.3;
        fx.gkBonus = Math.round(f * 3);
        break;
      case "kondicni_trener":
        fx.conditionDrainReduction = f * 0.25;
        break;
      case "maser":
        fx.conditionRegenBonus = Math.round(f * 5);
        break;
      case "lekar":
        fx.injuryExtraHealChance = f * 0.5;
        fx.injurySeverityReduction = f * 0.25;
        break;
      case "psycholog":
        fx.moraleTargetBonus = Math.round(f * 5);
        break;
      case "spravce_hriste":
        fx.pitchDegradationReduction = f * 0.4;
        fx.equipDegradationReduction = f * 0.4;
        break;
      case "skaut":
        // scoutChanceMul se počítá zvlášť v scout call-site; zde nic aditivního.
        break;
      case "obsluha":
        fx.concessionDemandMul = 1 + f * 0.3;
        fx.concessionSatBonus = eff >= 12 ? 1 : 0;
        break;
      case "sef_fanklubu":
        fx.crowdAttendanceBonus = f * 0.15;
        fx.crowdMod = f * 0.12;
        break;
      case "ekonom":
        fx.opsCostMul = 1 - f * 0.15;
        fx.sponsorBonusMul = 1 + f * 0.1;
        break;
    }
  }

  return fx;
}

/** Scout: násobitel šance zahlédnout hráče soupeře. Vrací 1 pokud tým nemá skauta. */
export function scoutChanceMultiplier(rows: StaffEffectRow[]): number {
  const scout = rows.find((r) => r.role === "skaut");
  if (!scout) return 1;
  const eff = rowEffectiveness(scout, "skaut");
  return 1 + (eff / 20) * 1.0;
}
