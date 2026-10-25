/**
 * Tréninkový plán týmu: jedna služba pro manažera (POST /teams/:teamId/training)
 * i AI trenéra (týdenní správa).
 */

import { logger } from "../lib/logger";
import type { ServiceError } from "./lineup";

/** Povolené typy tréninku — drží sync s TrainingType v season/training.ts. */
export const VALID_TRAINING_TYPES: string[] = ["conditioning", "technique", "tactics", "match_practice"];
export const VALID_INTENSITIES: string[] = ["light", "normal", "hard"];

export interface TrainingPlanInput {
  type: string;
  approach: string;
  sessionsPerWeek: number;
  trainingDays?: number[] | null;
  /** Den (0–6) → typ, nebo { type, intensity }. */
  trainingPlan?: Record<string, unknown> | null;
}

export async function setTrainingPlan(db: D1Database, teamId: string, body: TrainingPlanInput): Promise<{ ok: true } | ServiceError> {
  // Neznámý typ nebo přístup by denní tick neodtrénoval (tým s „kondice“ netrénoval půl roku).
  const { isTrainingApproach, isTrainingType } = await import("../season/training");
  if (!isTrainingType(body.type) || !isTrainingApproach(body.approach)) {
    return { ok: false, status: 400, error: "Neplatný typ tréninku nebo přístup" };
  }

  // Validace trainingDays: pole 1-5, unikatni, max 5 polozek. null/undefined → default mapping podle sessionsPerWeek.
  let trainingDaysJson: string | null = null;
  if (Array.isArray(body.trainingDays)) {
    const validated = Array.from(new Set(body.trainingDays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6))).sort();
    if (validated.length > 0) {
      trainingDaysJson = JSON.stringify(validated);
    }
  }

  // Týdenní plán: den (1-5) → typ tréninku. Prázdný plán = null → platí jednotný type pro
  // dny z trainingDays (původní chování). Neznámý typ nebo den se zahodí.
  let trainingPlanJson: string | null = null;
  if (body.trainingPlan && typeof body.trainingPlan === "object" && !Array.isArray(body.trainingPlan)) {
    const plan: Record<number, { type: string; intensity: string }> = {};
    for (const [k, v] of Object.entries(body.trainingPlan)) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      // Přijímáme obojí: holý typ (starší klient) i {type, intensity}.
      const type = typeof v === "string" ? v : (v as { type?: string })?.type;
      const rawIntensity = typeof v === "string" ? "normal" : (v as { intensity?: string })?.intensity;
      if (typeof type !== "string" || !VALID_TRAINING_TYPES.includes(type)) continue;
      const intensity = VALID_INTENSITIES.includes(rawIntensity ?? "normal") ? (rawIntensity ?? "normal") : "normal";
      plan[day] = { type, intensity };
    }
    if (Object.keys(plan).length > 0) {
      trainingPlanJson = JSON.stringify(plan);
      // Dny plánu drží training_days v souladu — čte je řada dalších míst (náklady, U21, FE).
      trainingDaysJson = JSON.stringify(Object.keys(plan).map(Number).sort((a, b) => a - b));
    }
  }

  // Počet tréninků týdně = počet tréninkových dnů. Jedna pravda: dny určují, kolikrát se
  // trénuje, kolik to stojí i jak rychle hráči rostou. Dřív šlo nastavit "2x týdně" a k tomu
  // pět tréninkových dnů — tým pak platil za dva tréninky a odtrénoval deset.
  // Bez explicitních dnů zůstává původní cesta: počet z těla → dny z default mapy.
  const explicitDays = trainingDaysJson ? (JSON.parse(trainingDaysJson) as number[]).length : 0;
  const sessionsPerWeek = explicitDays > 0 ? explicitDays : body.sessionsPerWeek;

  await db.prepare(
    "UPDATE teams SET training_type = ?, training_approach = ?, training_sessions = ?, training_days = ?, training_plan = ? WHERE id = ?"
  ).bind(body.type, body.approach, sessionsPerWeek, trainingDaysJson, trainingPlanJson, teamId).run().catch((e) => logger.warn({ module: "game" }, "update training plan", e));

  return { ok: true };
}
