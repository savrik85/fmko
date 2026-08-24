import { logger } from "../lib/logger";
import type { Weather } from "../engine/types";
import {
  careEffectiveness, decidePitchCare, type PitchCareDecision, type PitchCareMode,
} from "./pitch-care";

/**
 * Opotřebení trávníku odehraným zápasem.
 *
 * Do 2026-08-24 hřiště chátralo POUZE časem (−1 bod/den v daily-ticku) a odehraný
 * zápas ho nestál vůbec nic — dvaadvacet lidí se po něm mohlo prohánět devadesát
 * minut bez následku. Údržba se pak neodvíjela od toho, kolik se hraje, ale jen
 * od toho, kolik dní uběhlo.
 *
 * Nese to domácí tým: hraje se na jeho hřišti.
 */

/** Kolik bodů sebere jeden zápas podle povrchu. Umělka se neopotřebovává. */
const WEAR_BY_SURFACE: Record<string, number> = {
  natural: 5,
  hybrid: 3,
  artificial: 0,
};

/**
 * Násobič podle počasí a to, čím se dá vykoupit.
 *
 * Trávník ničí obě krajnosti: v dešti a na sněhu se rozbahní, na výhni vyschne,
 * ztvrdne a drny se lámou. Každá strana má vlastní vybavení — vyhřívání drží
 * plochu rozmrzlou, zavlažování ji drží zelenou. Zataženo a vítr trávníku nad
 * rámec běžného zápasu neublíží, takže tam není co tlumit.
 */
type PitchCare = "heating" | "irrigation" | null;

const WEAR_BY_WEATHER: Record<Weather, { mult: number; care: PitchCare }> = {
  sunny:  { mult: 1.3, care: "irrigation" },
  cloudy: { mult: 1.0, care: null },
  wind:   { mult: 1.0, care: null },
  rain:   { mult: 1.4, care: "heating" },
  snow:   { mult: 1.7, care: "heating" },
};

/** Spodní mez kopíruje daily-tick, aby zápas nepropadl hlouběji než čas. */
const FLOOR_BY_SURFACE: Record<string, number> = {
  natural: 5,
  hybrid: 10,
  artificial: 0,
};

/** Účinnost péče o trávník (0–1 každá). Bez vybavení nula. */
export interface PitchCareMods {
  /** Vyhřívání — tlumí rozbahnění v dešti a na sněhu. */
  heatingMod?: number;
  /** Zavlažování — tlumí vysychání na výhni. */
  irrigationMod?: number;
}

/**
 * Kolik bodů zápas sebere — bez zápisu, ať to jde otestovat i spočítat dopředu.
 *
 * Péče tlumí VÝHRADNĚ navýšení z počasí. Běžné opotřebení dvaadvaceti páry
 * kopaček nezmizí ani nad topnými kabely, ani pod postřikovači.
 */
export function pitchWearForMatch(
  pitchType: string | null | undefined,
  weather: Weather | null | undefined,
  care: PitchCareMods = {},
): number {
  const base = WEAR_BY_SURFACE[pitchType ?? "natural"] ?? WEAR_BY_SURFACE.natural;
  if (base === 0) return 0;

  const entry = weather ? WEAR_BY_WEATHER[weather] : undefined;
  if (!entry) return base;

  const raw = entry.care === "heating" ? care.heatingMod
    : entry.care === "irrigation" ? care.irrigationMod
    : 0;
  const damped = Math.min(1, Math.max(0, raw ?? 0));

  return Math.round(base * (1 + (entry.mult - 1) * (1 - damped)));
}

/** Úrovně a účinnost zařízení péče o trávník. Bez vybavení nebo při chybě nuly. */
async function loadPitchEquipment(db: D1Database, teamId: string): Promise<
  PitchCareMods & { heatingLevel: number; irrigationLevel: number }
> {
  try {
    const row = await db.prepare("SELECT * FROM equipment WHERE team_id = ?")
      .bind(teamId).first<Record<string, unknown>>();
    if (!row) return { heatingLevel: 0, irrigationLevel: 0 };

    const levels: Record<string, number> = {};
    const conditions: Record<string, number> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "id" || k === "team_id") continue;
      if (k.endsWith("_condition")) conditions[k] = v as number;
      else if (typeof v === "number") levels[k] = v;
    }

    const { calculateEffects } = await import("../equipment/equipment-generator");
    const eff = calculateEffects(levels, conditions);
    return {
      heatingMod: eff.pitchHeatingMod,
      irrigationMod: eff.pitchIrrigationMod,
      heatingLevel: levels.pitch_heating ?? 0,
      irrigationLevel: levels.pitch_irrigation ?? 0,
    };
  } catch (e) {
    logger.warn({ module: "pitch-wear" }, "nacteni pece o travnik", e);
    return { heatingLevel: 0, irrigationLevel: 0 };
  }
}

/**
 * Zapíše opotřebení hřiště domácího týmu a vyúčtuje péči, která se před zápasem
 * zapnula. Chybu jen loguje — rozehraný zápas se kvůli trávníku rušit nebude.
 *
 * Vrací, co se zapnulo a co to stálo, aby to šlo ukázat v zápise ze zápasu.
 */
export async function applyPitchWear(
  db: D1Database,
  homeTeamId: string,
  weather: Weather | null | undefined,
  gameDate?: string,
): Promise<PitchCareDecision & { wear: number }> {
  const nic: PitchCareDecision & { wear: number } = { service: null, cost: 0, skipped: null, wear: 0 };
  try {
    const stadium = await db
      .prepare(`SELECT pitch_type, pitch_care_mode, pitch_care_ordered, pitch_snow_clearing_ordered
                  FROM stadiums WHERE team_id = ?`)
      .bind(homeTeamId)
      .first<{
        pitch_type: string | null;
        pitch_care_mode: string | null;
        pitch_care_ordered: number | null;
        pitch_snow_clearing_ordered: number | null;
      }>();
    if (!stadium) return nic;

    const equip = await loadPitchEquipment(db, homeTeamId);
    const budget = (await db.prepare("SELECT budget FROM teams WHERE id = ?")
      .bind(homeTeamId).first<{ budget: number }>()
      .catch((e) => { logger.warn({ module: "pitch-wear" }, "rozpocet pro peci o travnik", e); return null; }))?.budget ?? 0;

    const decision = decidePitchCare({
      weather,
      mode: (stadium.pitch_care_mode as PitchCareMode) ?? "auto",
      heatingLevel: equip.heatingLevel,
      irrigationLevel: equip.irrigationLevel,
      orderedThisMatch: (stadium.pitch_care_ordered ?? 0) > 0,
      snowClearingOrdered: (stadium.pitch_snow_clearing_ordered ?? 0) > 0,
      budget,
    });

    // Objednávky platí jen na tenhle zápas — spotřebují se bez ohledu na výsledek,
    // jinak by jedna zaplacená péče držela celou sezónu.
    if ((stadium.pitch_care_ordered ?? 0) > 0 || (stadium.pitch_snow_clearing_ordered ?? 0) > 0) {
      await db.prepare(
        "UPDATE stadiums SET pitch_care_ordered = 0, pitch_snow_clearing_ordered = 0 WHERE team_id = ?"
      ).bind(homeTeamId).run()
        .catch((e) => logger.warn({ module: "pitch-wear" }, "spotrebovani objednavky pece", e));
    }

    if (decision.cost > 0) {
      const { recordTransaction } = await import("../season/finance-processor");
      await recordTransaction(
        db, homeTeamId, "pitch_repair", -decision.cost,
        decision.service === "snow_clearing" ? "Úklid sněhu z hřiště"
          : decision.service === "heating" ? "Provoz vyhřívání trávníku"
          : "Provoz zavlažování hřiště",
        gameDate ?? new Date().toISOString(),
      ).catch((e) => logger.warn({ module: "pitch-wear" }, "uctovani pece o travnik", e));
    }

    const mods = careEffectiveness(decision, equip.heatingMod ?? 0, equip.irrigationMod ?? 0);
    const wear = pitchWearForMatch(stadium.pitch_type, weather, mods);
    if (wear <= 0) return { ...decision, wear: 0 };

    const floor = FLOOR_BY_SURFACE[stadium.pitch_type ?? "natural"] ?? 5;
    await db
      .prepare("UPDATE stadiums SET pitch_condition = MAX(?, pitch_condition - ?) WHERE team_id = ?")
      .bind(floor, wear, homeTeamId)
      .run();

    return { ...decision, wear };
  } catch (e) {
    logger.warn({ module: "pitch-wear" }, "zapis opotrebeni travniku", e);
    return nic;
  }
}
