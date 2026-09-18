/**
 * Pozná, že se trenér hráče ptá na incident (spec 7a). Čisté funkce.
 *
 * Obecná slova (krádež, zloděj, kamera…) stačí sama a hledají se kdekoli v textu, protože se
 * skloňují i předponami („ukradl", „vykradli"). Kmeny konkrétního incidentu (místo, co zmizelo
 * nebo se rozbilo) se počítají jen spolu se signálem průšvihu v téže zprávě (zmizel, rozbi…,
 * nebo samostatné slovo „kdo") - jinak by chytaly běžnou řeč trenéra („sraz v kabině v pět",
 * „zítra brankářský trénink"). Kmen musí i tak sedět na začátek slova, aby „dres" nechytil
 * kdejaké slovo s tou slabikou.
 */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import type { Ztrata } from "./typy";
import type { TemaKonverzace } from "./znalosti";

export function normalizuj(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Bez diakritiky, malými písmeny. Tahle sama stačí, ostatní jen se signálem průšvihu. */
const OBECNA_SLOVA = ["krad", "zlodej", "vloup", "kdo to byl", "kdo to udelal", "kamer", "polici"] as const;

/** Podřetězce, které spolu s kmenem věci nebo místa znamenají průšvih, ne běžnou řeč. */
const SIGNAL_PRUSVIHU = ["zmizel", "rozbi", "rozmlat", "znic", "poskod", "prusvih", "vykop", "spal"] as const;

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

/** Peněžní ztráta (kasa, tombola, zpronevěra, útěk s penězi) nemá kategorii ani zařízení, kmeny jsou ruční. */
const KMENY_PENIZE = ["peniz", "hotovost", "kasa", "tombol", "pokladn"];

/** Kmeny slov z názvu toho, co incident poškodil: bez poslední hlásky, aby „dresy" poznalo i „dresů". */
function kmenyZtraty(z: Ztrata): string[] {
  // "dar" je taky jen peníze (spec 4d, opak "penize"), stejné kmeny stačí.
  if (z.typ === "penize" || z.typ === "dar") return KMENY_PENIZE;
  const nazev = z.typ === "vybaveni" || z.typ === "vybaveni_stav" || z.typ === "vybaveni_nahoru" ? CATEGORY_LABELS[z.kategorie]
    : z.typ === "stadion" || z.typ === "oprava" ? FACILITY_LABELS[z.zarizeni]
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
  const maSignalPrusvihu = SIGNAL_PRUSVIHU.some((s) => t.includes(s)) || slova.includes("kdo");
  if (!maSignalPrusvihu) return false;
  const kmeny = [...(SLOVA_DRUHU[incident.kind] ?? []), ...incident.ztraty.flatMap(kmenyZtraty)];
  return kmeny.some((k) => slova.some((s) => s.startsWith(k)));
}

/** Nejnovější incident, na který se zpráva ptá. `incidenty` seřazené od nejnovějšího (spec 7a). */
export function najdiIncidentVTextu(
  textZpravy: string, incidenty: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>,
): string | null {
  return incidenty.find((i) => jeOtazkaNaIncident(textZpravy, i))?.id ?? null;
}

/** Začátky slov, podle kterých trenér mluví o řečech z hospody (spec 9a). Bez diakritiky. */
const RECI_Z_HOSPODY_ZACATKY = ["hospod", "hospud", "kecal", "kecat", "kecas", "vykladal", "vykladas", "opil", "ozral", "blbost", "neblbn", "nedelej", "vyhroz"] as const;

/** Celá slova, podle kterých trenér mluví o řečech z hospody. Krátká na to, aby smělo jít jen o přesnou shodu. */
const RECI_Z_HOSPODY_SLOVA = new Set(["reci", "keci", "kecy"]);

/** Začátky slov varování/zákazu - spolu s místem činu znamenají narážku na hrozící čin. */
const VAROVANI_ZACATKY = ["nechod", "nesah", "neber", "nekrad", "nerozbij", "opovaz"] as const;

/**
 * Mluví zpráva o činu, který hráč ohlásil v hospodě? Kontroluje se po celých slovech, ne
 * podřetězcích (viz `jeOtazkaNaIncident`) - jinak by chytla i běžnou řeč, kde je hledaný kmen
 * jen náhodou uprostřed jiného slova („preciznější" obsahuje „reci", „utopil" obsahuje „opil").
 * Samotné místo činu (sklad, vitrína…) taky nestačí - z toho samého důvodu jako u
 * `jeOtazkaNaIncident`: chytalo by běžnou řeč o tom místě. Musí ho doprovázet varování/zákaz.
 */
export function jeRecOHrozicim(textZpravy: string, kind: string): boolean {
  const slova = normalizuj(textZpravy).split(/[^a-z]+/).filter(Boolean);
  if (slova.some((s) => RECI_Z_HOSPODY_SLOVA.has(s) || RECI_Z_HOSPODY_ZACATKY.some((z) => s.startsWith(z)))) return true;
  const maVarovani = slova.some((s) => VAROVANI_ZACATKY.some((z) => s.startsWith(z)));
  if (!maVarovani) return false;
  return (SLOVA_DRUHU[kind] ?? []).some((k) => slova.some((s) => s.startsWith(k)));
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
