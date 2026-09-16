/**
 * Kdy a za jakých okolností hráč odepisuje.
 *
 * Dokud chat nevěděl, kolik je hodin, psal každý hráč ve dvě ráno stejně
 * ochotně jako v neděli odpoledne. Tenhle modul dodá to, co v reálné SMS
 * konverzaci pozná každý: že jsi někoho vytáhl ze šichty nebo z postele.
 *
 * Bez DB a bez modelu, aby se to dalo testovat. Čas si bere volající.
 */

import type { Smena } from "../generators/occupations";

/** Co hráč zrovna dělá, když mu přijde trenérova SMS. */
export type Situace = "spi" | "prace" | "po_praci" | "volno";

export interface CasovyKontext {
  /** Hodina 0-23 v Praze. */
  hodina: number;
  /** Den v týdnu česky, jak ho hráč sám pojmenuje. */
  den: string;
  jeVikend: boolean;
  castDne: string;
  situace: Situace;
  /** U směnného provozu: kterou směnu dnes drží. Jinak `null`. */
  smenaDnes: "ranní" | "odpolední" | "noční" | null;
}

const DNY = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];

/** Pražská hodina a den. Hráč i trenér žijí ve stejném čase, herní datum řeší kalendář. */
function prazskyCas(kdy: Date): { hodina: number; denIndex: number } {
  const f = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague", hour: "2-digit", weekday: "short", hour12: false,
  });
  const casti = f.formatToParts(kdy);
  const hodina = Number.parseInt(casti.find((c) => c.type === "hour")?.value ?? "12", 10);
  // `weekday` je lokalizovaný, na index se dostaneme spolehlivěji přes posun
  // pražského času proti UTC, ne přes parsování zkratky.
  const posun = new Date(kdy.toLocaleString("en-US", { timeZone: "Europe/Prague" }));
  return { hodina: Number.isFinite(hodina) ? hodina : 12, denIndex: posun.getDay() };
}

function castDne(hodina: number): string {
  if (hodina < 5) return "noc";
  if (hodina < 9) return "ráno";
  if (hodina < 12) return "dopoledne";
  if (hodina < 17) return "odpoledne";
  if (hodina < 22) return "večer";
  return "noc";
}

/** Je hodina uvnitř intervalu? Zvládá i interval přes půlnoc (22 až 6). */
function mezi(hodina: number, od: number, doo: number): boolean {
  return od <= doo ? hodina >= od && hodina < doo : hodina >= od || hodina < doo;
}

/**
 * Kterou směnu drží dnes. Deterministicky: hasič má tenhle týden noční
 * a musí ji mít i při druhém načtení konverzace.
 */
function smenaDne(seed: number, den: number): "ranní" | "odpolední" | "noční" {
  const sady = ["ranní", "odpolední", "noční"] as const;
  return sady[Math.abs(seed + den) % 3];
}

/**
 * Co hráč právě dělá.
 *
 * `seed` je jen pro směnný provoz (obvykle hash id hráče), u ostatních oborů
 * na něm nezáleží. O víkendu se do práce chodí jen ve směnách a v zemědělství,
 * kde kráva nerozlišuje sobotu.
 */
export function kontextCasu(kdy: Date, smena: Smena, seed = 0): CasovyKontext {
  const { hodina, denIndex } = prazskyCas(kdy);
  const jeVikend = denIndex === 0 || denIndex === 6;
  const zaklad = {
    hodina, den: DNY[denIndex] ?? "den", jeVikend, castDne: castDne(hodina),
    smenaDnes: null as CasovyKontext["smenaDnes"],
  };

  if (smena === "smenny") {
    const dnes = smenaDne(seed, denIndex);
    const okna = { ranní: [6, 14], odpolední: [14, 22], noční: [22, 6] } as const;
    const [od, doo] = okna[dnes];
    const vPraci = mezi(hodina, od, doo);
    // Kdo má noční, spí přes den. Proto se nedá jen říct „v noci se spí".
    const spi = !vPraci && (dnes === "noční" ? mezi(hodina, 7, 14) : mezi(hodina, 23, 6));
    return { ...zaklad, smenaDnes: dnes, situace: vPraci ? "prace" : spi ? "spi" : "po_praci" };
  }

  if (smena === "volny") {
    // Student ani důchodce nikam nespěchá, ale ve tři ráno spí taky.
    return { ...zaklad, situace: mezi(hodina, 1, 8) ? "spi" : "volno" };
  }

  if (smena === "vecerni") {
    if (mezi(hodina, 16, 24)) return { ...zaklad, situace: "prace" };
    if (mezi(hodina, 1, 9)) return { ...zaklad, situace: "spi" };
    return { ...zaklad, situace: mezi(hodina, 0, 1) ? "po_praci" : "volno" };
  }

  if (smena === "rano") {
    if (mezi(hodina, 21, 4)) return { ...zaklad, situace: "spi" };
    // Zemědělec chodí ke kravám i v neděli.
    if (mezi(hodina, 4, 12)) return { ...zaklad, situace: "prace" };
    return { ...zaklad, situace: "po_praci" };
  }

  // denni
  if (mezi(hodina, 22, 6)) return { ...zaklad, situace: "spi" };
  if (jeVikend) return { ...zaklad, situace: "volno" };
  if (mezi(hodina, 7, 16)) return { ...zaklad, situace: "prace" };
  return { ...zaklad, situace: "po_praci" };
}

/**
 * Kdo je s ním doma, když ho telefon v noci vzbudí.
 *
 * Rodinu hra v datech nevede, takže se drží v mezích věku. Model si smí
 * vybarvit, koho vzbudil, ale nesmí si vymýšlet jména ani děje.
 */
export function domacnost(vek: number): string {
  if (vek < 21) return "Bydlíš ještě u rodičů.";
  if (vek < 26) return "Bydlíš s přítelkyní nebo sám na privátu.";
  if (vek < 36) return "Doma máš ženu, u mladších z vás je malé dítě.";
  if (vek < 46) return "Doma žena a děti, do školy jim ráno nikdo nepomůže.";
  return "Děti už máš odrostlé, doma bývá klid.";
}

/**
 * Jak moc smí sypat smajlíky.
 *
 * Devatenáctiletý píše jinak než čtyřicátník z kotelny, a přesně na tom je
 * poznat, že za zprávou je člověk.
 */
export function pravidloEmoji(vek: number, temper: number): string {
  if (vek <= 24) return "- Emoji používej běžně, klidně dvě ve zprávě, jak píšou mladí. 😅 😂 🙈 💪 se hodí.";
  if (vek <= 34 || temper >= 65) return "- Emoji občas, jedno za zprávu, když sedí k náladě.";
  return "- Emoji skoro nepoužívej. Když ano, tak nanejvýš jeden a spíš smutný nebo naštvaný.";
}

/** Věta do promptu o tom, kdy a kde ho SMS zastihla. */
export function popisSituace(k: CasovyKontext, povolani: string | undefined, vyluky: string[]): string {
  const kdy = `Je ${k.den} ${k.hodina}:00, ${k.castDne}.`;
  const prace = povolani ? `Děláš jako ${povolani.toLowerCase()}.` : "";
  const smena = k.smenaDnes ? ` Dneska máš ${k.smenaDnes}.` : "";

  if (k.situace === "spi") {
    return [
      kdy,
      "SPAL JSI a trenérova SMS tě vzbudila. Dej to najevo: jsi rozespalý a naštvaný,",
      "že ti někdo píše v tuhle hodinu. Klidně se ohradíš, že jsi kvůli tomu vzbudil",
      "i ostatní doma (ženu, malého, psa nebo kočku). Jména si nevymýšlej.",
      "Odpověz krátce a jdi zpátky spát.",
    ].join(" ");
  }
  if (k.situace === "prace") {
    // Schválně „obnáší například", ne „zrovna děláš". Část výmluv v katalogu
    // mluví o dešti nebo mrazu, aniž by měly vazbu na počasí, a chat o počasí
    // nic neví. Jako tvrzení o téhle chvíli by z toho byl nesmysl.
    const vymluva = vyluky.length > 0
      ? `Tvoje práce obnáší například tohle: „${vyluky[0]}". O počasí nic netvrď, nevíš, jak je venku.`
      : "";
    return [
      kdy, prace + smena,
      "JSI PRÁVĚ V PRÁCI a psát si teď nemůžeš pořádně.",
      "Napiš to narychlo, ať je poznat, že nemáš čas, a klidně se ozvi, že se ozveš potom.",
      vymluva,
    ].filter(Boolean).join(" ");
  }
  if (k.situace === "po_praci") {
    return `${kdy} ${prace}${smena} Máš po šichtě, jsi doma a unavený, ale napsat můžeš.`.trim();
  }
  return `${kdy} ${prace} Máš volno${k.jeVikend ? ", je víkend" : ""}, takže čas na odpověď je.`;
}

/** Jak dlouho hráči trvá, než odpoví. */
export interface ZpozdeniVstup {
  /** Délka odpovědi ve znacích. Delší zpráva se déle píše. */
  znaku: number;
  situace: Situace;
  /** Povaha: disciplinovaný odepisuje dřív, vznětlivý vybuchne hned. */
  discipline: number;
  temper: number;
}

/**
 * Nejdelší pauza, kterou si smíme dovolit.
 *
 * Čekání běží po odeslání odpovědi klientovi, takže se musí vejít do limitu
 * běhu na pozadí i s generováním a vyhodnocením konverzace.
 */
export const MAX_ZPOZDENI_MS = 14_000;
const MIN_ZPOZDENI_MS = 2_500;

/**
 * Vrací milisekundy, o které se odpověď zdrží.
 *
 * Skládá se z toho, co dělá reálná pauza v chatu: než si zprávy všimne
 * a než ji napíše. Kdo spí nebo stojí v práci, hledá telefon déle.
 */
export function zpozdeniOdpovedi(v: ZpozdeniVstup): number {
  const psani = Math.min(9_000, v.znaku * 55);
  const vsimnutiSi = v.situace === "spi" ? 5_500 : v.situace === "prace" ? 3_500 : 1_500;
  const povaha = 1
    - (v.discipline >= 65 ? 0.15 : 0)
    - (v.temper >= 70 ? 0.2 : 0)
    + (v.discipline <= 35 ? 0.15 : 0);
  const celkem = (psani + vsimnutiSi) * Math.max(0.5, povaha);
  return Math.round(Math.min(MAX_ZPOZDENI_MS, Math.max(MIN_ZPOZDENI_MS, celkem)));
}
