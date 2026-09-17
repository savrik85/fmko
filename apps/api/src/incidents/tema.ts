/**
 * Pozná, že se trenér hráče ptá na incident (spec 7a). Čisté funkce.
 *
 * Obecná slova (krádež, zloděj, kamera…) se hledají kdekoli v textu, protože se skloňují
 * i předponami („ukradl", „vykradli"). Slova konkrétního incidentu (místo, co zmizelo nebo
 * se rozbilo) jen jako začátek slova, aby „dres" nechytil kdejaké slovo s tou slabikou.
 */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import type { Ztrata } from "./typy";
import type { TemaKonverzace } from "./znalosti";

export function normalizuj(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Bez diakritiky, malými písmeny. */
const OBECNA_SLOVA = ["krad", "zlodej", "zmizel", "vloup", "kdo to byl", "kdo to udelal", "kamer", "polici"] as const;

/** Začátky slov podle druhu incidentu: kde se to stalo a co se tam dělo. */
const SLOVA_DRUHU: Record<string, readonly string[]> = {
  vloupani_sklad: ["sklad"],
  vitrina: ["vitrin", "pohar"],
  dodavka_pujcena: ["dodavk"],
  dodavka_ukradena: ["dodavk"],
  kradez_kamery: ["zabezpec"],
  oslava_v_kabine: ["oslav", "kabin"],
  kopnute_dvere: ["dver", "kabin"],
  koleje_trakturek: ["trakt", "kolej"],
  pozar_grilu: ["gril", "pozar", "ohen", "ohne", "stanek", "stank"],
  svetlice: ["svetlic", "pyro"],
  vandal: ["vandal"],
};

/** Slova z názvů vybavení a zařízení, která by chytala běžnou řeč. */
const NEROZLISUJICI = new Set([
  "klubova", "klubovy", "klubove", "treninkove", "treninkova", "vybaveni", "vybava", "zimni", "lavicky",
  "sektor", "kotel", "kotle", "sluzba",
]);

/** Kmeny slov z názvu toho, co incident poškodil: bez poslední hlásky, aby „dresy" poznalo i „dresů". */
function kmenyZtraty(z: Ztrata): string[] {
  const nazev = z.typ === "vybaveni" || z.typ === "vybaveni_stav" ? CATEGORY_LABELS[z.kategorie]
    : z.typ === "stadion" ? FACILITY_LABELS[z.zarizeni]
    : "trávník";
  return normalizuj(nazev ?? "")
    .split(/[^a-z]+/)
    .filter((slovo) => slovo.length >= 5 && !NEROZLISUJICI.has(slovo))
    .map((slovo) => slovo.slice(0, -1));
}

export function jeOtazkaNaIncident(textZpravy: string, incident: { kind: string; ztraty: readonly Ztrata[] }): boolean {
  const t = normalizuj(textZpravy);
  if (OBECNA_SLOVA.some((s) => t.includes(s))) return true;
  const slova = t.split(/[^a-z]+/).filter(Boolean);
  const kmeny = [...(SLOVA_DRUHU[incident.kind] ?? []), ...incident.ztraty.flatMap(kmenyZtraty)];
  return kmeny.some((k) => slova.some((s) => s.startsWith(k)));
}

/** Nejnovější incident, na který se zpráva ptá. `incidenty` seřazené od nejnovějšího (spec 7a). */
export function najdiIncidentVTextu(
  textZpravy: string, incidenty: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>,
): string | null {
  return incidenty.find((i) => jeOtazkaNaIncident(textZpravy, i))?.id ?? null;
}

/** Téma z `conversations.ai_thread_state`. S `den` platí jen v herní den, kdy se nastavilo. */
export function temaZeStavu(raw: unknown, den?: string): TemaKonverzace | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const v = JSON.parse(raw) as { incidentId?: unknown; incidentDen?: unknown };
    if (typeof v.incidentId !== "string" || typeof v.incidentDen !== "string") return null;
    if (den !== undefined && v.incidentDen !== den) return null;
    return { incidentId: v.incidentId, den: v.incidentDen };
  } catch (e) {
    logger.warn({ module: "incidents-tema" }, "nečitelný stav vlákna", e);
    return null;
  }
}
