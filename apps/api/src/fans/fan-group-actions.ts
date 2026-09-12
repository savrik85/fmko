/**
 * Co manažer může s partou udělat — katalog akcí a jejich čistá matematika.
 *
 * Účinek se nepočítá náhodně: řídí ho ochota vůdce jednat a to, jak si s klubem
 * do teď stáli. Radikál se domluvit nedá skoro nikdy, předseda fanklubu skoro
 * vždycky — a to je celý smysl toho, že party mají svoje lidi.
 *
 * Bez DB, aby to šlo testovat.
 */

export type FanActionKey =
  | "schuzka" | "sleva" | "tifo" | "zakaz" | "odvolat_zakaz" | "presun";

export interface FanActionVariant {
  key: string;
  label: string;
  cost: number;
  /** Co to udělá. Bez toho je na tlačítku jen cena a hráč neví, co kupuje. */
  dopad?: string;
}

export interface FanActionDef {
  key: FanActionKey;
  label: string;
  popis: string;
  /** Cena bez variant; s variantami ji nese varianta. */
  cost: number;
  /** Kolik herních dní musí uplynout, než jde akce zopakovat. */
  cooldownDnu: number;
  variants?: readonly FanActionVariant[];
}

export const FAN_ACTIONS: Record<FanActionKey, FanActionDef> = {
  schuzka: {
    key: "schuzka",
    label: "Sejít se s vůdcem",
    popis: "Pozveš ho na pivo a vyslechneš si, co partu štve. Někdy to pomůže, u radikála to může být horší než mlčet.",
    cost: 600,
    cooldownDnu: 14,
  },
  sleva: {
    key: "sleva",
    label: "Levnější vstupné pro sektor",
    popis: "Ustoupíš na vstupném. Parta to ocení, pokladna míň.",
    cost: 0,
    cooldownDnu: 7,
    variants: [
      { key: "10", label: "Sleva 10 %", cost: 0 },
      { key: "25", label: "Sleva 25 %", cost: 0 },
      { key: "50", label: "Sleva 50 %", cost: 0 },
      { key: "0", label: "Zrušit slevu", cost: 0 },
    ],
  },
  tifo: {
    key: "tifo",
    label: "Přispět na choreo",
    popis: "Klub zaplatí látku a barvy. Kotel z toho žije celou sezónu, a taky se mu líp shání pyro.",
    cost: 0,
    cooldownDnu: 21,
    variants: [
      { key: "male", label: "Pár vlajek", cost: 2000 },
      { key: "stredni", label: "Plachta přes celý sektor", cost: 5000 },
      { key: "velke", label: "Choreo na celou tribunu", cost: 12000 },
    ],
  },
  zakaz: {
    key: "zakaz",
    label: "Zakázat vstup",
    popis: "Sektor zůstane zavřený. Klid bude, ale parta ti to nezapomene a na hřišti bude ticho.",
    cost: 0,
    cooldownDnu: 30,
    variants: [
      { key: "1", label: "Na jeden zápas", cost: 0 },
      { key: "2", label: "Na dva zápasy", cost: 0 },
      { key: "3", label: "Na tři zápasy", cost: 0 },
    ],
  },
  odvolat_zakaz: {
    key: "odvolat_zakaz",
    label: "Odpustit trest",
    popis: "Otevřeš sektor dřív, než trest doběhne.",
    cost: 0,
    cooldownDnu: 0,
  },
  presun: {
    key: "presun",
    label: "Přemístit sektor",
    popis: "Přestěhuješ partu jinam na stadion. S kotlem se stěhuje i atmosféra: "
      + "postavený sektor kotle dává domácí výhodu a morálku jen tehdy, když v něm kotel opravdu stojí.",
    cost: 3000,
    cooldownDnu: 30,
    // Čísla sedí na FAN_SKALY.SEKTOR_RIZIKO a SEKTOR_HLAS. Kdyby se tam
    // sazby změnily, musí se změnit i tady: hráč kupuje to, co je na tlačítku.
    variants: [
      { key: "kotel", label: "Kotel za brankou", cost: 3000, dopad: "Plná atmosféra z postaveného sektoru, plné riziko. Rvačka s hosty možná." },
      { key: "hlavni", label: "Hlavní tribuna", cost: 3000, dopad: "Rvačka vyloučená a o čtvrtinu míň malérů. Přijdeš ale o celou výhodu a morálku ze sektoru kotle." },
      { key: "za_branou", label: "Sektor za brankou", cost: 3000, dopad: "Hned vedle hostů: sebere jim morálku před výkopem. Za cenu o třetinu vyššího rizika a bez výhody ze sektoru kotle." },
    ],
  },
};

export const FAN_ACTION_KEYS = Object.keys(FAN_ACTIONS) as FanActionKey[];

/** Kolik akce stojí i s variantou. */
export function actionCost(key: FanActionKey, variant?: string | null): number {
  const def = FAN_ACTIONS[key];
  if (!def) return 0;
  if (!def.variants) return def.cost;
  return def.variants.find((v) => v.key === variant)?.cost ?? def.cost;
}

/** Rozdíl dvou herních dat ve dnech. Nečitelné datum bere jako „hodně dávno". */
export function dnuOd(drivejsi: string | null, ted: string): number {
  if (!drivejsi) return Number.MAX_SAFE_INTEGER;
  const a = Date.parse(drivejsi.length > 10 ? drivejsi : `${drivejsi}T00:00:00Z`);
  const b = Date.parse(ted.length > 10 ? ted : `${ted}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((b - a) / 86_400_000);
}

export interface Dopad {
  sentiment: number;
  mood: number;
  heat: number;
  /** Krátká věta, co se stalo — jde rovnou do UI. */
  text: string;
}

/**
 * Jak dopadne schůzka s vůdcem.
 *
 * `roll` je 0–1. Radikál (nízké `vyjednavani`) schůzku často odbyde a odejde
 * naštvanější, než přišel — proto se s ním musí jednat přes ústupky, ne přes
 * kancelář. To je jediná akce, která může skončit hůř, než začala.
 */
export function dopadSchuzky(opts: {
  vyjednavani: number;
  sentiment: number;
  managerReputation: number;
  roll: number;
}): Dopad {
  const ochota = Math.max(0, Math.min(100, opts.vyjednavani)) / 100;
  const respekt = Math.max(0, Math.min(100, opts.managerReputation)) / 100;
  const sanceNaUspech = 0.25 + ochota * 0.6 + respekt * 0.15;

  if (opts.roll > sanceNaUspech) {
    return {
      sentiment: -4,
      mood: -2,
      heat: 4,
      text: "Sešli jste se, ale nedomluvili. Odešel naštvanější, než přišel.",
    };
  }
  const zisk = Math.round(6 + ochota * 8 + respekt * 4);
  return {
    sentiment: zisk,
    mood: Math.round(zisk / 2),
    heat: -10,
    text: `Probrali jste, co partu štve. Odchází smířlivěji (+${zisk} vztah).`,
  };
}

/** Sleva na vstupné: čím větší ústupek, tím větší vděk. */
export function dopadSlevy(pct: number): Dopad {
  if (pct <= 0) {
    return { sentiment: -6, mood: -8, heat: 5, text: "Slevu jsi zrušil. Vzali to jako krok zpátky." };
  }
  const sentiment = pct >= 50 ? 15 : pct >= 25 ? 9 : 4;
  const mood = pct >= 50 ? 16 : pct >= 25 ? 10 : 5;
  return {
    sentiment,
    mood,
    heat: -Math.round(sentiment / 2),
    text: `Sektor má vstupné levnější o ${pct} %. Ocenili to.`,
  };
}

/**
 * Příspěvek na choreo. Účinek škáluje ochotou vůdce jednat — kdo s klubem
 * nemluví, ten peníze vezme a poděkuje míň.
 */
export function dopadTifa(velikost: string, vyjednavani: number): Dopad {
  const zaklad = velikost === "velke" ? 28 : velikost === "stredni" ? 18 : 10;
  const nasobic = 0.8 + (Math.max(0, Math.min(100, vyjednavani)) / 100) * 0.4;
  const sentiment = Math.round(zaklad * nasobic);
  return {
    sentiment,
    mood: Math.round(sentiment * 0.8),
    heat: -Math.round(sentiment / 3),
    text: `Klub zaplatil choreo. Na příštím domácím zápase to bude vidět (+${sentiment} vztah).`,
  };
}

/** Zákaz vstupu: čím delší, tím hlubší křivda. */
export function dopadZakazu(zapasu: number): Dopad {
  const n = Math.max(1, Math.min(3, zapasu));
  return {
    sentiment: -12 * n,
    mood: -15 * n,
    heat: 12 * n,
    text: `Sektor zůstane zavřený na ${n === 1 ? "jeden zápas" : n <= 4 ? `${n} zápasy` : `${n} zápasů`}. Berou to jako zradu.`,
  };
}

export function dopadOdvolaniZakazu(): Dopad {
  return { sentiment: 8, mood: 12, heat: -8, text: "Trest jsi odpustil. Vrátí se dřív a pamatují si to." };
}

/**
 * Přesun sektoru. Dál od hostů znamená klid, ale hlavní tribuna je pro kotel
 * urážka — tam se nedá skákat ani bubnovat.
 */
export function dopadPresunu(zeSektoru: string, doSektoru: string): Dopad {
  if (zeSektoru === doSektoru) {
    return { sentiment: 0, mood: 0, heat: 0, text: "Parta už tam stojí." };
  }
  if (doSektoru === "hlavni") {
    return { sentiment: -12, mood: -10, heat: 10, text: "Přesunul jsi je na hlavní tribunu. Mezi sedačkami se bubnovat nedá." };
  }
  if (doSektoru === "kotel") {
    return { sentiment: 6, mood: 8, heat: -4, text: "Dostali sektor za brankou. Konečně místo, kde je slyšet." };
  }
  return { sentiment: 0, mood: 2, heat: 0, text: "Parta se přestěhovala do jiného sektoru." };
}
