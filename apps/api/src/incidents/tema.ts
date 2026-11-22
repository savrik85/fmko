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
const OBECNA_SLOVA = ["krad", "krast", "zlodej", "vloup", "kdo to byl", "kdo to udelal", "kamer", "polici"] as const;

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
  stag_party: ["rozluc", "svobod", "kabin"],
  kopnute_dvere: ["dver", "kabin"],
  koleje_trakturek: ["trakt", "kolej"],
  pozar_grilu: ["gril", "pozar", "ohen", "ohne", "stanek", "stank"],
  svetlice: ["svetlic", "pyro"],
  vandal: ["vandal"],
  kasa_obcerstveni: ["obcerstv", "stank", "stanek"],
  tombola: ["tombol"],
  zpronevera_ekonoma: ["ekonom"],
};

/** Slova z názvů vybavení a zařízení, která by chytala běžnou řeč. */
const NEROZLISUJICI = new Set([
  "klubova", "klubovy", "klubove", "treninkove", "treninkova", "vybaveni", "vybava", "zimni", "lavicky",
  "sektor", "kotel", "kotle", "sluzba",
]);

/**
 * Peněžní ztráta (kasa, tombola, zpronevěra, útěk s penězi) nemá kategorii ani zařízení, kmeny jsou ruční.
 * Kasa po pádech („vykrást tu kasu“, Geomapping 11/2026), ne jen „kas“: to by chytlo i „kašle“.
 */
const KMENY_PENIZE = ["peniz", "hotovost", "prach", "trzb", "kasa", "kasu", "kase", "kasy", "kasou", "tombol", "pokladn"];

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

/** Jmenuje zpráva místo nebo věc právě tohohle incidentu (začátek slova)? Bez signálu průšvihu. */
function namesIncidentThing(slova: readonly string[], incident: { kind: string; ztraty: readonly Ztrata[] }): boolean {
  const kmeny = [...(SLOVA_DRUHU[incident.kind] ?? []), ...incident.ztraty.flatMap(kmenyZtraty)];
  return kmeny.some((k) => slova.some((s) => s.startsWith(k)));
}

/**
 * Incident, jehož druh, místo nebo věc zpráva jmenuje, bez signálu průšvihu: ten dodá sama
 * zpráva (žádost „vrať to“, „zaplať to“, restitution.ts). Druh a místo („u tomboly“, „ze
 * skladu“) váží víc než věc („ty peníze“), shoda = první v pořadí volajícího. Nic = null.
 */
export function incidentNamedInText(
  text: string, incidents: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>,
): string | null {
  const words = normalizuj(text).split(/[^a-z]+/).filter(Boolean);
  const named = (stems: readonly string[]) => stems.some((k) => words.some((w) => w.startsWith(k)));
  let best: { id: string; score: number } | null = null;
  for (const i of incidents) {
    const score = (named(SLOVA_DRUHU[i.kind] ?? []) ? 2 : 0) + (named(i.ztraty.flatMap(kmenyZtraty)) ? 1 : 0);
    if (score > (best?.score ?? 0)) best = { id: i.id, score };
  }
  return best?.id ?? null;
}

/** Zmiňuje zpráva místo nebo věc právě tohohle incidentu, se signálem průšvihu nebo obecným slovem? */
function mentionsIncidentStems(textZpravy: string, incident: { kind: string; ztraty: readonly Ztrata[] }): boolean {
  const t = normalizuj(textZpravy);
  const slova = t.split(/[^a-z]+/).filter(Boolean);
  const hasTroubleSignal = OBECNA_SLOVA.some((s) => t.includes(s))
    || SIGNAL_PRUSVIHU.some((s) => t.includes(s)) || slova.includes("kdo");
  if (!hasTroubleSignal) return false;
  return namesIncidentThing(slova, incident);
}

/** Trenér hráče z věci obviňuje přímo („vzal jsi“, „byl jsi to ty“, „přiznej se“). Bez diakritiky. */
const ACCUSATION_RE = /\b(byls to ty|tys to (byl|udelal|vzal|rozbil)|jsi (to )?(byl|vzal|ukradl|rozbil|udelal|sebral)|(byl|vzal|ukradl|rozbil|udelal|sebral) jsi|vzals|rozbils|prizn\w*|zapir\w*)\b/;

/**
 * Incident, na který se ptá zpráva hráči, který je do něj zapletený (pachatel, obviněný, svědek).
 * Kromě běžné otázky (`najdiIncidentVTextu`) stačí přímé obvinění s věcí nebo místem incidentu:
 * „Martine, ty míče ze skladu jsi vzal ty?“ slovo průšvihu nemá, a přesto se ptá na ten incident.
 */
export function involvedIncidentInText(
  textZpravy: string, incidenty: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>,
): string | null {
  const found = najdiIncidentVTextu(textZpravy, incidenty);
  if (found) return found;
  const t = normalizuj(textZpravy);
  if (!ACCUSATION_RE.test(t)) return null;
  const slova = t.split(/[^a-z]+/).filter(Boolean);
  return incidenty.find((i) => namesIncidentThing(slova, i))?.id ?? null;
}

export function jeOtazkaNaIncident(textZpravy: string, incident: { kind: string; ztraty: readonly Ztrata[] }): boolean {
  const t = normalizuj(textZpravy);
  if (OBECNA_SLOVA.some((s) => t.includes(s))) return true;
  return mentionsIncidentStems(textZpravy, incident);
}

/**
 * Incident, na který se zpráva ptá. `incidenty` seřazené od nejnovějšího (spec 7a). Přednost má
 * ten, jehož místo nebo věc zpráva jmenuje („vykrást tu kasu“ míří na kasu, i když je novější
 * oslava v kabině), obecná otázka („kdo to byl?“) míří na nejnovější.
 */
export function najdiIncidentVTextu(
  textZpravy: string, incidenty: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>,
): string | null {
  return incidenty.find((i) => mentionsIncidentStems(textZpravy, i))?.id
    ?? incidenty.find((i) => jeOtazkaNaIncident(textZpravy, i))?.id ?? null;
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
