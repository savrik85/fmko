/**
 * Přepínač AI trenérů v CACHE_KV (klíč `ai_coach_mode`).
 *
 * - `on`: rozhoduje a provádí,
 * - `shadow`: rozhoduje a zapisuje do deníku, ale nic neprovede,
 * - `off`: rozhoduje jen náhradní pravidlo bez modelu.
 *
 * Hodnota je buď jeden řetězec pro všechny oblasti, nebo JSON `{ match, weekly, market }`.
 * Bez klíče platí `on`.
 */

import { logger } from "../lib/logger";

export const COACH_MODE_KEY = "ai_coach_mode";

export type CoachArea = "match" | "weekly" | "market";
export type CoachMode = "off" | "shadow" | "on";

const MODES: readonly CoachMode[] = ["off", "shadow", "on"];
const AREAS: readonly CoachArea[] = ["match", "weekly", "market"];

export type CoachModeSetting = CoachMode | Partial<Record<CoachArea, CoachMode>>;

function isMode(v: unknown): v is CoachMode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

export function resolveCoachMode(raw: string | null, area: CoachArea): CoachMode {
  if (!raw) return "on";
  if (isMode(raw)) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const v = (parsed as Record<string, unknown>)[area];
      if (isMode(v)) return v;
    }
  } catch (e) {
    logger.warn({ module: "ai-coach-mode" }, "neplatná hodnota přepínače AI trenérů", e);
  }
  return "on";
}

export async function readCoachMode(kv: KVNamespace | undefined, area: CoachArea): Promise<CoachMode> {
  if (!kv) return "on";
  const raw = await kv.get(COACH_MODE_KEY).catch((e) => {
    logger.warn({ module: "ai-coach-mode" }, "čtení přepínače AI trenérů", e);
    return null;
  });
  return resolveCoachMode(raw, area);
}

export async function readAllCoachModes(kv: KVNamespace | undefined): Promise<Record<CoachArea, CoachMode>> {
  const raw = kv
    ? await kv.get(COACH_MODE_KEY).catch((e) => {
      logger.warn({ module: "ai-coach-mode" }, "čtení přepínače AI trenérů", e);
      return null;
    })
    : null;
  return Object.fromEntries(AREAS.map((a) => [a, resolveCoachMode(raw, a)])) as Record<CoachArea, CoachMode>;
}

export function normalizeCoachModeSetting(value: unknown): CoachModeSetting | null {
  if (isMode(value)) return value;
  if (!value || typeof value !== "object") return null;
  const out: Partial<Record<CoachArea, CoachMode>> = {};
  for (const area of AREAS) {
    const v = (value as Record<string, unknown>)[area];
    if (v === undefined) continue;
    if (!isMode(v)) return null;
    out[area] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function writeCoachMode(kv: KVNamespace, value: CoachModeSetting): Promise<void> {
  await kv.put(COACH_MODE_KEY, typeof value === "string" ? value : JSON.stringify(value));
}
