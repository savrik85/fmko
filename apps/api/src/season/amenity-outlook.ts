/**
 * Co vylepšení zázemí udělá se spokojeností fanoušků konkrétního klubu.
 *
 * Ozvučení, sociálky a pořadatelé slibují každé „+N spokojenost po zápase", ale zápas
 * jejich body sečte s obsluhou, kvalitním bufetem a trávníkem a usekne na
 * `AMENITY_BONUS_CAP`. Klub se sociálkami L2 je na stropu a další vylepšení mu nepřidá
 * nic. Nabídka v obchodě to musí říct dřív, než hráč zaplatí, a počítá to server ze
 * stejné funkce jako zápas (`amenityPoints` ve fans-processor.ts).
 */

import { logger } from "../lib/logger";
import { calculateStaffEffects, type StaffEffectRow } from "../staff/staff-effects";
import { calculateFacilityEffects } from "../stadium/stadium-generator";
import { calculateEffects } from "../equipment/equipment-generator";
import { stadiumFacilityLevels } from "./finance-processor";
import { CONCESSION_CATALOG, type ProductKey } from "./concession-catalog";
import { AMENITY_BONUS_CAP, amenityGain, amenityPoints, type AmenityInput } from "./fans-processor";

const M = "amenity-outlook";

export interface AmenityOutlook {
  /** Kolik bodů zázemí vylepšení samo přidá (to, co slibuje popisek). */
  raw: number;
  /** Kolik spokojenosti po domácím zápase z toho klub po stropu opravdu dostane. */
  gain: number;
  /** Kolik zázemí klubu dává teď, už po stropu. */
  current: number;
  cap: number;
  /** Věta do nabídky vylepšení. */
  note: string;
}

/**
 * Zázemí klubu tak, jak by ho započítal domácí zápas hraný dnes: stadion, ozvučení
 * v dnešním stavu, obsluha, nabídka bufetu a trávník. Null, když se data nepovedlo načíst.
 */
export async function loadAmenityInput(db: D1Database, teamId: string): Promise<AmenityInput | null> {
  try {
    const [stadiumRes, equipmentRes, staffRes, productsRes] = await db.batch([
      db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId),
      db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId),
      db.prepare(
        "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
      ).bind(teamId),
      db.prepare("SELECT product_key, quality_level, sell_price FROM concession_products WHERE team_id = ?").bind(teamId),
    ]);
    const stadium = (stadiumRes.results[0] as Record<string, unknown> | undefined) ?? null;
    const equipment = (equipmentRes.results[0] as Record<string, unknown> | undefined) ?? null;

    let paSystemBonus = 0;
    if (equipment) {
      const levels: Record<string, number> = {};
      const conditions: Record<string, number> = {};
      for (const [k, v] of Object.entries(equipment)) {
        if (typeof v !== "number") continue;
        if (k.endsWith("_condition")) conditions[k] = v;
        else levels[k] = v;
      }
      paSystemBonus = calculateEffects(levels, conditions).fanSatisfactionMod;
    }

    const products = (productsRes.results as Array<{ product_key: string; quality_level: number; sell_price: number }>)
      .filter((p) => p.product_key in CONCESSION_CATALOG)
      .map((p) => ({ key: p.product_key as ProductKey, qualityLevel: p.quality_level, sellPrice: p.sell_price }));

    return {
      paSystemBonus,
      facilityBonus: calculateFacilityEffects(stadiumFacilityLevels(stadium)).matchSatisfactionBonus,
      staffBonus: calculateStaffEffects(staffRes.results as unknown as StaffEffectRow[]).concessionSatBonus,
      concessionMode: stadium?.concession_mode === "self" ? "self" : "external",
      products,
      pitchCondition: typeof stadium?.pitch_condition === "number" ? stadium.pitch_condition : null,
    };
  } catch (e) {
    logger.warn({ module: M, teamId }, "načtení zázemí pro nabídku vylepšení", e);
    return null;
  }
}

function outlookNote(gain: number, raw: number, current: number, sources: string[]): string {
  const what = sources.length > 0 ? ` (${sources.join(", ")})` : "";
  if (gain <= 0) {
    return `Spokojenost fanoušků ti už nepřidá: zázemí stadionu dá po domácím zápase dohromady nejvýš +${AMENITY_BONUS_CAP} a to už máš${what}.`;
  }
  const now = current > 0 ? `teď máš +${current}${what}` : "zatím z něj nemáš nic";
  if (gain < raw) {
    return `Tobě přidá jen +${gain} spokojenost po domácím zápase: zázemí stadionu dá dohromady nejvýš +${AMENITY_BONUS_CAP}, ${now}.`;
  }
  return `Tobě přidá +${gain} spokojenost po domácím zápase. Zázemí stadionu dá dohromady nejvýš +${AMENITY_BONUS_CAP}, ${now}.`;
}

/**
 * Co změna ozvučení nebo sociálek a pořadatelů udělá se spokojeností po domácím zápase.
 * Null, když vylepšení body zázemí nepřidá (popisek pak spokojenost neslibuje).
 */
export function amenityOutlook(
  input: AmenityInput,
  change: Partial<Pick<AmenityInput, "paSystemBonus" | "facilityBonus">>,
): AmenityOutlook | null {
  const before = amenityPoints(input);
  const after = amenityPoints({ ...input, ...change });
  const raw = after.points - before.points;
  if (raw <= 0) return null;
  const gain = amenityGain(before.points, after.points);
  const current = Math.min(AMENITY_BONUS_CAP, before.points);
  return { raw, gain, current, cap: AMENITY_BONUS_CAP, note: outlookNote(gain, raw, current, before.sources) };
}

/** K nabídce vylepšení stadionu přidá, co by klubu udělala se spokojeností fanoušků. */
export function withFacilityAmenity<T extends { facility: string; nextLevel: number }>(
  options: T[],
  facilities: Record<string, number>,
  input: AmenityInput | null,
): Array<T & { amenity?: AmenityOutlook }> {
  if (!input) return options;
  const base = { ...input, facilityBonus: calculateFacilityEffects(facilities).matchSatisfactionBonus };
  return options.map((o) => {
    const next = calculateFacilityEffects({ ...facilities, [o.facility]: o.nextLevel }).matchSatisfactionBonus;
    const amenity = amenityOutlook(base, { facilityBonus: next });
    return amenity ? { ...o, amenity } : o;
  });
}

/**
 * Vybavení koupené na úrovni `level` ve stavu `condition` (bazar prodává ojeté).
 * Efekt ozvučení se násobí stavem stejně jako v zápase.
 */
export function equipmentPurchaseAmenity(
  category: string,
  level: number,
  condition: number,
  levels: Record<string, number>,
  conditions: Record<string, number>,
  input: AmenityInput | null,
): AmenityOutlook | null {
  if (!input) return null;
  const base = { ...input, paSystemBonus: calculateEffects(levels, conditions).fanSatisfactionMod };
  const next = calculateEffects(
    { ...levels, [category]: level },
    { ...conditions, [`${category}_condition`]: condition },
  ).fanSatisfactionMod;
  return amenityOutlook(base, { paSystemBonus: next });
}

/** Přidává tahle kategorie vybavení body zázemí? Bazar podle toho pozná, jestli zázemí načítat. */
export function equipmentRaisesAmenity(category: string): boolean {
  return calculateEffects({ [category]: 3 }, { [`${category}_condition`]: 100 }).fanSatisfactionMod > 0;
}

/** K nabídce vylepšení vybavení přidá, co by klubu udělala se spokojeností fanoušků. Koupené je nové. */
export function withEquipmentAmenity<T extends { category: string; nextLevel: number }>(
  options: T[],
  levels: Record<string, number>,
  conditions: Record<string, number>,
  input: AmenityInput | null,
): Array<T & { amenity?: AmenityOutlook }> {
  if (!input) return options;
  return options.map((o) => {
    // Upgrade v obchodě nastaví stav na 100 (POST /equipment/upgrade).
    const amenity = equipmentPurchaseAmenity(o.category, o.nextLevel, 100, levels, conditions, input);
    return amenity ? { ...o, amenity } : o;
  });
}
