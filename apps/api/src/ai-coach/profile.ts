/**
 * Povaha AI trenéra.
 *
 * Každý AI trenér dostane jednou vygenerovanou povahu, která řídí jeho rozhodnutí
 * (sestava, stavba stadionu, nákupy, ochota prodat). Hráčům se neukazuje, je vidět
 * jen na chování. Díky ní se AI kluby vyvíjejí různými směry.
 *
 * Generuje se deterministicky z id týmu, takže opakované založení dá stejného člověka.
 */

import { ensureAiManager } from "../coach/ai-manager";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";

export const TACTICS = ["offensive", "balanced", "defensive", "long_ball", "possession", "pressing"] as const;
export type Tactic = typeof TACTICS[number];

export const FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"] as const;
export type Formation = typeof FORMATIONS[number];

export interface AiCoachProfile {
  version: 1;
  /** Chuť vyhrávat hned (utrácí za hráče, riskuje rozpočet). */
  ambition: number;
  /** Šetrnost: jak velkou rezervu si drží. */
  thrift: number;
  /** Sázka na mládež: dává šanci mladým, trénuje techniku. */
  youthFocus: number;
  /** Ochota riskovat v zápase i v obchodech. */
  risk: number;
  /** Jak často obchoduje s hráči. */
  trading: number;
  /** Chuť stavět stadion a kupovat vybavení. */
  building: number;
  /** Trpělivost při vyjednávání. */
  patience: number;
  favouriteTactic: Tactic;
  favouriteFormations: Formation[];
}

interface ManagerTraits {
  tactics?: number | null;
  youth_development?: number | null;
  discipline?: number | null;
  motivation?: number | null;
}

const PROFILE_SEED_OFFSET = 7919;

function seedFromTeamId(teamId: string): number {
  let seed = 0;
  for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
  return Math.abs(seed);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Vlastnost trenéra 20–70 (AI) nebo 1–100 převede na 0–100 kolem stejného středu. */
function traitToScale(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return clamp(((v - 20) / 50) * 100);
}

export function generateAiProfile(teamId: string, manager: ManagerTraits | null): AiCoachProfile {
  const rng = createRng(seedFromTeamId(teamId) + PROFILE_SEED_OFFSET);
  const youthBase = traitToScale(manager?.youth_development);
  const disciplineBase = traitToScale(manager?.discipline);
  const motivationBase = traitToScale(manager?.motivation);
  const tacticsBase = traitToScale(manager?.tactics) ?? 50;

  const ambition = clamp(rng.int(20, 90) + ((motivationBase ?? 50) - 50) * 0.3);
  const thrift = clamp(rng.int(15, 90));
  const youthFocus = clamp(youthBase !== null ? youthBase * 0.7 + rng.int(0, 30) : rng.int(10, 90));
  const risk = clamp(rng.int(10, 90));
  const trading = clamp(rng.int(15, 85));
  // Šetrný trenér méně staví, ale ne úplně: i šetrný si opraví šatny.
  const building = clamp(rng.int(20, 95) - (thrift - 50) * 0.4);
  const patience = clamp(disciplineBase !== null ? disciplineBase * 0.6 + rng.int(10, 40) : rng.int(20, 80));

  // Taktik volí i moderní styly (držení, presink), ostatní spíš klasiku.
  const tacticWeights: Record<Tactic, number> = {
    offensive: 3,
    balanced: 4,
    defensive: 3,
    long_ball: 3,
    possession: 1 + tacticsBase / 25,
    pressing: 1 + tacticsBase / 25,
  };
  const favouriteTactic = rng.weighted(tacticWeights) as Tactic;

  // Okresní fotbal hraje hlavně 4-4-2, ostatní formace jsou vzácnější.
  const formationWeights: Record<Formation, number> = {
    "4-4-2": 6, "4-3-3": 3, "3-5-2": 2, "4-5-1": 2, "5-3-2": 2, "3-4-3": 1,
  };
  const first = rng.weighted(formationWeights) as Formation;
  const favouriteFormations: Formation[] = [first];
  if (rng.random() < 0.5) {
    const rest = { ...formationWeights };
    delete (rest as Partial<Record<Formation, number>>)[first];
    favouriteFormations.push(rng.weighted(rest) as Formation);
  }

  return {
    version: 1,
    ambition, thrift, youthFocus, risk, trading, building, patience,
    favouriteTactic, favouriteFormations,
  };
}

function isProfile(v: unknown): v is AiCoachProfile {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return p.version === 1
    && ["ambition", "thrift", "youthFocus", "risk", "trading", "building", "patience"].every((k) => typeof p[k] === "number")
    && (TACTICS as readonly string[]).includes(p.favouriteTactic as string)
    && Array.isArray(p.favouriteFormations)
    && (p.favouriteFormations as unknown[]).every((f) => (FORMATIONS as readonly string[]).includes(f as string));
}

export function parseAiProfile(raw: unknown): AiCoachProfile | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isProfile(parsed) ? parsed : null;
  } catch (e) {
    logger.warn({ module: "ai-coach-profile" }, "neplatný JSON povahy trenéra", e);
    return null;
  }
}

/**
 * Povaha trenéra AI klubu; když ještě není uložená, vygeneruje a uloží ji.
 * Lidskému klubu vrátí povahu jen spočítanou (neukládá se, lidský trenér rozhoduje sám).
 */
export async function ensureAiProfile(db: D1Database, teamId: string): Promise<AiCoachProfile> {
  const manager = await ensureAiManager(db, teamId);
  if (!manager || manager.user_id !== "ai") {
    return generateAiProfile(teamId, manager as ManagerTraits | null);
  }
  const stored = parseAiProfile(manager.ai_profile);
  if (stored) return stored;

  const profile = generateAiProfile(teamId, manager as ManagerTraits);
  await db.prepare("UPDATE managers SET ai_profile = ? WHERE id = ?")
    .bind(JSON.stringify(profile), manager.id).run()
    .catch((e) => logger.warn({ module: "ai-coach-profile" }, `uložení povahy trenéra ${teamId}`, e));
  return profile;
}
