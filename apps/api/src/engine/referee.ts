/**
 * Okresní rozhodčí — čisté funkce pro simulaci.
 *
 * Žádná DB, žádné vedlejší efekty. Vše, co simulace potřebuje vědět o tom, jak
 * konkrétní sudí ovlivní zápas, je tady jako funkce profilu.
 *
 * Kalibrace (ověřeno dosazením do reálných vzorců simulation.ts):
 * neutrální sudí (všechny osy 50) drží 9,4 faulu, 1,44 karty a 0,27 penalty na zápas —
 * penalty tedy sedí na dnešní naměřené 0,29 a `set-pieces.test.ts` musí projít beze změny.
 * Fauly stoupnou ze 7,2 na 9,4 (reálný fotbal má 20+, takže posun správným směrem).
 *
 * Klíčové rozhodnutí: fauly se dělí na OSTRÉ (rolují zónovou tabulku → penalta/přímák/centr)
 * a MALICHERNOSTI (jen odpískání + slabá karta, žádná zóna). Bez toho by přísný sudí
 * ztrojnásobil počet penalt a rozbil gólovost.
 */

import type { Rng } from "../generators/rng";

export interface RefereeProfile {
  /** referees.id, nebo null u neutrálního / nedelegovaného sudího. */
  id: string | null;
  name: string;
  archetype: string;
  /** Kolik toho odpíská — foul rate + šířka zóny penalty. */
  strictness: number;
  /** Jak rychle sáhne do kapsy — karty, přímá červená, protesty. */
  cardHappiness: number;
  /** INVERZNĚ řídí šanci na spornou situaci. */
  experience: number;
  /** 50 = neutrál, výš = nadržuje domácím. */
  homeBias: number;
  /** Jak často pustí výhodu místo odpískání. */
  advantage: number;
  /** Nízká = po 70. minutě víc karet a chyb. */
  fitness: number;
  /** Co si sudí pamatuje o domácím klubu, −100..100. Plní fáze pozápasových rozhovorů. */
  homeRespect?: number;
  /** Totéž o hostech. */
  awayRespect?: number;
}

export const NEUTRAL_REFEREE: RefereeProfile = {
  id: null,
  name: "Delegovaný rozhodčí",
  archetype: "neutral",
  strictness: 50,
  cardHappiness: 50,
  experience: 50,
  homeBias: 50,
  advantage: 50,
  fitness: 50,
  homeRespect: 0,
  awayRespect: 0,
};

// ── Archetypy ────────────────────────────────────────────────────────────────

export type AxisRange = readonly [number, number];

export interface RefereeArchetypeDef {
  label: string;
  /** 1–2 věty do profilu. */
  bio: string;
  /** Hláška na kartičku v přípravě zápasu. */
  hlaska: string;
  ageRange: AxisRange;
  strictness: AxisRange;
  cardHappiness: AxisRange;
  experience: AxisRange;
  homeBias: AxisRange;
  advantage: AxisRange;
  fitness: AxisRange;
  /** Civilní povolání — okresní sudí je amatér a tohle nese většinu humoru. */
  occupations: readonly string[];
  /** Ženské tvary — sudí je stejně často žena a mužský rod u ní vypadá jako chyba. */
  labelF: string;
  bioF: string;
  hlaskaF: string;
  occupationsF: readonly string[];
}

export const REFEREE_ARCHETYPES = {
  klidny_veteran: {
    label: "Klidný veterán",
    bio: "Dvacet sezón v okrese. Píská jen to podstatné a hráči ho poslouchají, protože ví, co dělá.",
    hlaska: "Hrajeme dál, pánové.",
    ageRange: [42, 60],
    strictness: [45, 58], cardHappiness: [30, 45], experience: [82, 95],
    homeBias: [45, 55], advantage: [55, 75], fitness: [40, 60],
    occupations: ["mistr odborného výcviku", "vedoucí skladu", "údržbář v cukrovaru", "hasič z povolání"],
    labelF: "Klidná veteránka",
    bioF: "Dvacet sezón v okrese. Píská jen to podstatné a hráči ji poslouchají, protože ví, co dělá.",
    hlaskaF: "Hrajeme dál, pánové.",
    occupationsF: ["mistrová odborného výcviku", "vedoucí skladu", "údržbářka v cukrovaru", "hasička z povolání"],
  },
  pohodar: {
    label: "Pohodář",
    bio: "Nechává hrát, dokud teče krev. Divákům se to líbí, obráncům ještě víc.",
    hlaska: "Výhoda, hrajte!",
    ageRange: [30, 52],
    strictness: [25, 40], cardHappiness: [20, 35], experience: [55, 75],
    homeBias: [45, 58], advantage: [78, 92], fitness: [45, 65],
    occupations: ["hospodský", "zahradník", "řidič autobusu", "instalatér", "prodavač v železářství"],
    labelF: "Pohodářka",
    bioF: "Nechává hrát, dokud teče krev. Divákům se to líbí, obráncům ještě víc.",
    hlaskaF: "Výhoda, hrajte!",
    occupationsF: ["hospodská", "zahradnice", "řidička autobusu", "instalatérka", "prodavačka v železářství"],
  },
  puntickar: {
    label: "Puntičkář",
    bio: "Metr má stejný pro obě strany a nehne s ním nikdo. Nesnáší ho oba tábory naráz.",
    hlaska: "Pravidlo dvanáct, odstavec dvě.",
    ageRange: [35, 55],
    strictness: [75, 88], cardHappiness: [50, 65], experience: [70, 88],
    homeBias: [45, 55], advantage: [15, 30], fitness: [55, 75],
    occupations: ["revizor MHD", "celník", "bankovní úředník", "kontrolor kvality", "geodet"],
    labelF: "Puntičkářka",
    bioF: "Metr má stejný pro obě strany a nehne s ním nikdo. Nesnáší ji oba tábory naráz.",
    hlaskaF: "Pravidlo dvanáct, odstavec dvě.",
    occupationsF: ["revizorka MHD", "celní úřednice", "bankovní úřednice", "kontrolorka kvality", "geodetka"],
  },
  bafunar: {
    label: "Bafuňář",
    bio: "Zná všechny funkcionáře v okrese jménem a rád se nechá pozvat na guláš.",
    hlaska: "Po zápase to probereme u piva.",
    ageRange: [40, 60],
    strictness: [35, 50], cardHappiness: [35, 50], experience: [55, 75],
    homeBias: [60, 75], advantage: [45, 65], fitness: [35, 55],
    occupations: ["obchodní zástupce", "pojišťovák", "realitní makléř", "vedoucí prodejny"],
    labelF: "Bafuňářka",
    bioF: "Zná všechny funkcionáře v okrese jménem a ráda se nechá pozvat na guláš.",
    hlaskaF: "Po zápase to probereme u piva.",
    occupationsF: ["obchodní zástupkyně", "pojišťovačka", "realitní makléřka", "vedoucí prodejny"],
  },
  ambiciozni: {
    label: "Ambiciózní",
    bio: "Chce výš než okres, a tak si na každý zápas hraje na krajského. Rozhoduje rychle a nahlas.",
    hlaska: "Tady se hraje podle mě.",
    ageRange: [26, 38],
    strictness: [60, 75], cardHappiness: [65, 80], experience: [55, 75],
    homeBias: [35, 48], advantage: [25, 45], fitness: [80, 95],
    occupations: ["učitel tělocviku", "fitness trenér", "IT konzultant", "manažer pobočky"],
    labelF: "Ambiciózní",
    bioF: "Chce výš než okres, a tak si na každý zápas hraje na krajskou. Rozhoduje rychle a nahlas.",
    hlaskaF: "Tady se hraje podle mě.",
    occupationsF: ["učitelka tělocviku", "fitness trenérka", "IT konzultantka", "manažerka pobočky"],
  },
  zelenac: {
    label: "Zelenáč",
    bio: "Kurz má čerstvě z jara. Píská podle příručky a nechá se vykřičet.",
    hlaska: "Já to mám v pravidlech, koukejte.",
    ageRange: [21, 28],
    strictness: [55, 75], cardHappiness: [60, 80], experience: [8, 25],
    homeBias: [55, 75], advantage: [20, 40], fitness: [75, 92],
    occupations: ["student vysoké školy", "brigádník v marketu", "učeň automechanik", "voják z povolání"],
    labelF: "Zelenáčka",
    bioF: "Kurz má čerstvě z jara. Píská podle příručky a nechá se vykřičet.",
    hlaskaF: "Já to mám v pravidlech, koukejte.",
    occupationsF: ["studentka vysoké školy", "brigádnice v marketu", "učednice v autoservisu", "vojákyně z povolání"],
  },
  domaci_kamarad: {
    label: "Domácí kamarád",
    bio: "Po zápase sedává v domácí klubovně. Náhoda to prý není.",
    hlaska: "Já to viděl jinak než vy, pane trenére.",
    ageRange: [34, 56],
    strictness: [40, 60], cardHappiness: [45, 60], experience: [40, 65],
    homeBias: [78, 92], advantage: [35, 55], fitness: [45, 65],
    occupations: ["řezník", "pekař", "traktorista", "topenář", "provozní jídelny"],
    labelF: "Domácí kamarádka",
    bioF: "Po zápase sedává v domácí klubovně. Náhoda to prý není.",
    hlaskaF: "Já to viděla jinak než vy, pane trenére.",
    occupationsF: ["řeznice", "pekařka", "traktoristka", "topenářka", "provozní jídelny"],
  },
  ustvany: {
    label: "Uštvaný",
    bio: "V první půli stíhá, ve druhé stojí na půlce a odhaduje. V devadesáté už chce jen domů.",
    hlaska: "Já to odtud viděl dobře.",
    ageRange: [48, 62],
    strictness: [45, 60], cardHappiness: [45, 60], experience: [40, 65],
    homeBias: [50, 65], advantage: [40, 60], fitness: [12, 30],
    occupations: ["skladník", "důchodce", "vrátný", "noční hlídač", "poštovní doručovatel"],
    labelF: "Uštvaná",
    bioF: "V první půli stíhá, ve druhé stojí na půlce a odhaduje. V devadesáté už chce jen domů.",
    hlaskaF: "Já to odtud viděla dobře.",
    occupationsF: ["skladnice", "důchodkyně", "vrátná", "noční hlídačka", "poštovní doručovatelka"],
  },
  piskavy_kohout: {
    label: "Pískavý kohout",
    bio: "Píská všechno, i to, co nikdo neviděl. Zápas s ním trvá o deset minut dýl.",
    hlaska: "Pane, ještě slovo a jdete se osprchovat.",
    ageRange: [30, 50],
    strictness: [82, 95], cardHappiness: [78, 92], experience: [30, 55],
    homeBias: [45, 60], advantage: [5, 20], fitness: [45, 65],
    occupations: ["strážník", "dispečer", "mistr na pile", "kontrolor jízdenek"],
    labelF: "Pískavá siréna",
    bioF: "Píská všechno, i to, co nikdo neviděl. Zápas s ní trvá o deset minut dýl.",
    hlaskaF: "Pane, ještě slovo a jdete se osprchovat.",
    occupationsF: ["strážnice", "dispečerka", "mistrová na pile", "kontrolorka jízdenek"],
  },
  kartovy_cvok: {
    label: "Kartový cvok",
    bio: "Do zápisu píše víc než do deníku. Rekord: devět žlutých v jednom poločase.",
    hlaska: "Číslo osm, pojďte sem.",
    ageRange: [32, 52],
    strictness: [65, 80], cardHappiness: [88, 97], experience: [45, 70],
    homeBias: [45, 58], advantage: [10, 25], fitness: [50, 70],
    occupations: ["policista", "vězeňská služba", "exekutorský koncipient", "šéf ostrahy"],
    labelF: "Kartová mašina",
    bioF: "Do zápisu píše víc než do deníku. Rekord: devět žlutých v jednom poločase.",
    hlaskaF: "Číslo osm, pojďte sem.",
    occupationsF: ["policistka", "dozorkyně ve věznici", "exekutorská koncipientka", "šéfka ostrahy"],
  },
} as const satisfies Record<string, RefereeArchetypeDef>;

export type RefereeArchetype = keyof typeof REFEREE_ARCHETYPES;

/**
 * Základní patnáctka okresu. Extrémy jsou vzácné — každý okres má právě
 * jednoho pískavého kohouta a jednoho kartového cvoka, zbytek je snesitelný.
 *
 * Tenhle seznam se NESMÍ měnit ani přeskládat. ID sudího se odvozuje z archetypu
 * a jeho pořadí, takže každý zásah sem přejmenuje lidi, kterým už běží odpískané
 * zápasy, známky a vztahy ke klubům. Doplňovat se smí výhradně do POOL_EXTRA.
 */
export const REFEREE_POOL_MIX: readonly RefereeArchetype[] = [
  "klidny_veteran", "klidny_veteran", "klidny_veteran",
  "pohodar", "pohodar",
  "puntickar", "puntickar",
  "bafunar", "bafunar",
  "ambiciozni",
  "zelenac", "zelenac",
  "domaci_kamarad", "piskavy_kohout", "kartovy_cvok",
];

/**
 * Devítka, o kterou se listina rozšířila, když komisař rozhodčích dostal
 * obsazovací listinu.
 *
 * Původních patnáct na okres bylo míň, než kolik se v okrese hraje zápasů —
 * senior i U21 mají po sedmi kolech ve stejný den, takže z patnácti sudích jich
 * čtrnáct pískalo povinně a vybírat nebylo z čeho.
 *
 * Extrémy se ZÁMĚRNĚ nepřidávají: kohout, cvok i domácí kamarád zůstávají po
 * jednom na okres. Tím, že je pool větší, jsou vzácnější — a komisařovo
 * rozhodnutí nasadit je (nebo je z kola vyškrtnout) o to větší.
 */
export const REFEREE_POOL_EXTRA: readonly RefereeArchetype[] = [
  "klidny_veteran", "klidny_veteran",
  "pohodar", "pohodar",
  "puntickar", "puntickar",
  "bafunar",
  "zelenac",
  "ambiciozni",
];

export function archetypeLabel(key: string, gender?: string | null): string {
  const def = (REFEREE_ARCHETYPES as Record<string, RefereeArchetypeDef>)[key];
  if (!def) return "Rozhodčí";
  return gender === "f" ? def.labelF : def.label;
}

// ── Vzorce ───────────────────────────────────────────────────────────────────

/**
 * Základní frekvence ostrého souboje na minutu. Bylo 0,08 natvrdo; zvednuto na 0,098,
 * aby po odečtení pouštěných výhod vyšel neutrální sudí zpátky na dnešní počet faulů.
 */
const DUEL_PROB = 0.098;

/** Malichernosti dostávají kartu výrazně vzácněji než ostré fauly. */
export const PETTY_CARD_MUL = 0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pravděpodobnost ostrého souboje za minutu. 0,086 (pohodář) – 0,114 (kohout). */
export function severeFoulProb(r: RefereeProfile): number {
  return DUEL_PROB * (0.88 + 0.28 * (r.strictness / 100));
}

/** Jak často pustí výhodu místo přerušení hry. 0,06 – 0,32. */
export function advantageProb(r: RefereeProfile): number {
  return 0.06 + 0.26 * (r.advantage / 100);
}

/**
 * Malichernost — faul, který by benevolentní sudí vůbec neodpískal.
 * Roste s druhou mocninou přísnosti, takže pohodář je fakticky nemá.
 */
export function pettyFoulProb(r: RefereeProfile): number {
  return 0.085 * Math.pow(r.strictness / 100, 1.5) * (1 - 0.45 * (r.advantage / 100));
}

/** Násobič pravděpodobnosti karty. 0,55 (pohodář) – 1,45 (kartový cvok). */
export function cardMultiplier(r: RefereeProfile): number {
  return 0.55 + 0.90 * (r.cardHappiness / 100);
}

/**
 * Práh zóny penalty (roll < práh → penalta).
 * `crowdFactor` 0,6–1,4 podle návštěvy — tlak kotle zesiluje náchylnost k domácímu prostředí.
 */
export function penaltyZone(r: RefereeProfile, isHomeAttacking: boolean, crowdFactor = 1): number {
  // Základ je nižší, než by odpovídalo dnešním 0,04 — část penalt nově přibývá ze
  // sporných situací (vymyšlená penalta), takže by se jinak celkový počet přestřelil.
  const base = 0.019 + 0.019 * (r.strictness / 100);
  const tilt = (isHomeAttacking ? 1 : -1) * 0.35 * ((r.homeBias - 50) / 50) * clamp(crowdFactor, 0.6, 1.4);
  // Komu sudí přeje, tomu spíš ukáže na puntík.
  const memory = refereeBias(respectFor(r, isHomeAttacking));
  return clamp(base * (1 + tilt) * (1 + memory), 0.012, 0.075);
}

/** Co si sudí pamatuje o daném týmu. */
export function respectFor(r: RefereeProfile, isHome: boolean): number {
  return (isHome ? r.homeRespect : r.awayRespect) ?? 0;
}

/**
 * Násobič karetní pravděpodobnosti podle paměti. Kdo si sudího znepřátelil,
 * dostane kartu o něco snáz — v mezích, které zápas nerozhodnou.
 */
export function cardMemoryMod(r: RefereeProfile, isHome: boolean): number {
  return 1 - refereeBias(respectFor(r, isHome)) * 5;
}

/** Práh zóny přímého kopu (roll < práh a zároveň >= penaltyZone). */
export function freekickZone(penZone: number): number {
  return penZone + 0.2225;
}

/** Práh zóny centru ze standardky. */
export function crossZone(fkZone: number): number {
  return fkZone + 0.32;
}

/**
 * Přímá červená za jeden faul. Škáluje karetní ruka sudího i povaha faulujícího.
 *
 * Základ je nízký schválně: většina vyloučení vzniká druhou žlutou a k tomu ještě
 * přibývají chybné červené ze sporných situací. Dohromady to musí zůstat kolem
 * jednoho vyloučení na deset zápasů, jinak by se rozjely stopky a kádry by se tenčily.
 */
export function directRedProb(r: RefereeProfile, aggression: number): number {
  return 0.004 * (0.4 + 0.6 * (r.cardHappiness / 100)) * (0.5 + aggression / 100);
}

/** Žlutá za protesty. Dřív fixních 0,30 bez ohledu na to, kdo píská. */
export function protestYellowProb(r: RefereeProfile): number {
  return 0.30 * (0.6 + 0.8 * (r.cardHappiness / 100));
}

/**
 * Únava rozhodčího. Do 70. minuty 1,0; pak u nezkondičněného sudího roste
 * až na ~1,35 — v závěru přituhuje, protože už jen odhaduje.
 */
export function refFatigue(r: RefereeProfile, minute: number): number {
  if (minute <= 70) return 1;
  return 1 + (1 - r.fitness / 100) * 0.35 * ((minute - 70) / 20);
}

// ── Sporné situace ───────────────────────────────────────────────────────────

export type RefereeIncidentKind =
  | "neuznany_gol"
  | "vymyslena_penalta"
  | "neodpiskana_penalta"
  | "chybna_cervena"
  | "prehlednuta_cervena"
  | "sporny_primak";

export type IncidentSeverity = "high" | "medium" | "low";

export interface PlannedRefereeError {
  minute: number;
  kind: RefereeIncidentKind;
  severity: IncidentSeverity;
  /** true = chyba padne ve prospěch domácích. */
  favourHome: boolean;
}

/** Sporná situace tak, jak ji uvidí hráč. `teamId` jsou engine ID (1 = domácí, 2 = hosté). */
export interface RefereeIncident {
  minute: number;
  kind: RefereeIncidentKind;
  severity: IncidentSeverity;
  /** Tým, kterému chyba uškodila. */
  againstTeamId: number;
  /** Tým, kterému chyba pomohla. */
  favourTeamId: number;
  playerName: string;
  text: string;
}

const INCIDENT_TABLE: ReadonlyArray<{ kind: RefereeIncidentKind; weight: number; severity: IncidentSeverity }> = [
  { kind: "neuznany_gol", weight: 0.25, severity: "high" },
  { kind: "vymyslena_penalta", weight: 0.25, severity: "high" },
  // Chybná červená je nejtvrdší zásah do zápasu (soupeř dohraje v deseti), proto je
  // vzácnější než ostatní typy — jinak by sama o sobě zdvojnásobila počet vyloučení.
  { kind: "neodpiskana_penalta", weight: 0.22, severity: "medium" },
  { kind: "chybna_cervena", weight: 0.08, severity: "high" },
  { kind: "prehlednuta_cervena", weight: 0.10, severity: "medium" },
  { kind: "sporny_primak", weight: 0.10, severity: "low" },
];

/** Šance, že sudí v zápase viditelně chybuje. Zelenáč 0,54 · neutrál 0,37 · veterán 0,13. */
export function matchErrorChance(r: RefereeProfile): number {
  return 0.06 + 0.55 * Math.pow(1 - r.experience / 100, 0.85);
}

/**
 * Naplánuje NEJVÝŠ JEDNU spornou situaci na zápas.
 *
 * Strop je strukturální, ne pravděpodobnostní — volá se jednou před minutovou smyčkou
 * a po použití se výsledek zahodí. Funkce spotřebuje VŽDY čtyři hodnoty RNG, ať k chybě
 * dojde nebo ne; podmíněné čerpání by rozhodilo stream a znemožnilo reprodukovatelnost.
 */
export function planRefereeError(rng: Rng, r: RefereeProfile): PlannedRefereeError | null {
  const roll = rng.random();
  const minuteRoll = rng.random();
  const typeRoll = rng.random();
  const sideRoll = rng.random();

  if (roll >= matchErrorChance(r)) return null;

  // Náchylnost k domácímu prostředí posouvá, komu chyba nahraje (bias 90 → ~70 % domácím).
  const favourHome = sideRoll < clamp(0.5 + (r.homeBias - 50) / 200, 0.15, 0.85);

  let acc = 0;
  let picked = INCIDENT_TABLE[INCIDENT_TABLE.length - 1];
  for (const row of INCIDENT_TABLE) {
    acc += row.weight;
    if (typeRoll <= acc) { picked = row; break; }
  }

  return {
    minute: 3 + Math.floor(minuteRoll * 85),
    kind: picked.kind,
    severity: picked.severity,
    favourHome,
  };
}

/**
 * Posun hraničních verdiktů podle toho, co si o klubu sudí pamatuje.
 *
 * Strop je ±3 % při plném respektu ±100. Jedna ostrá kritika v pozápasovém
 * rozhovoru dá −16, tedy −0,48 % — má se to cítit jako „sudí si to pamatuje",
 * ne jako trest. Nedotýká se gólů, střel ani kondice, jen verdiktů, a NEZVYŠUJE
 * strop jedné sporné situace na zápas — jen posouvá, komu padne.
 */
export function refereeBias(respect: number): number {
  return clamp(respect / 100, -1, 1) * 0.03;
}

/** Česká věta popisující spornou situaci. Nesmí projít šablonou komentáře. */
export function incidentText(kind: RefereeIncidentKind, playerName: string, againstTeamName: string): string {
  switch (kind) {
    case "neuznany_gol":
      return `Gól neplatí! Sudí odmávl ofsajd, který nikdo jiný na hřišti neviděl — ${againstTeamName} zuří.`;
    case "vymyslena_penalta":
      return `Sudí ukazuje na puntík! ${playerName} se míče ani nedotkl a nikdo nechápe proč.`;
    case "neodpiskana_penalta":
      return `Jasné podražení ve vápně, ale sudí mává, ať se hraje dál. ${againstTeamName} obklopil rozhodčího.`;
    case "chybna_cervena":
      return `Červená karta pro ${playerName}! Za souboj, který na kartu rozhodně nebyl.`;
    case "prehlednuta_cervena":
      return `Brutální zákrok na ${playerName} a sudí vytahuje jen žlutou. Lavička ${againstTeamName} vyskočila.`;
    case "sporny_primak":
      return `Přímý kop z hranice vápna, který podle všech kromě sudího nebyl faul.`;
  }
}

// ── Známka rozhodčího ────────────────────────────────────────────────────────

/** Fakta ze zápasu, ze kterých se počítá známka. */
export interface RefereeGradeFacts {
  /** Počet odpískaných faulů (ostré i malichernosti). */
  fouls: number;
  /** Žluté + červené karty dohromady. */
  cards: number;
  /** Závažnost sporné situace, nebo null když žádná nebyla. */
  incidentSeverity: IncidentSeverity | null;
  /** Podíl faulů a karet, které padly po 70. minutě (0–1). */
  lateEventShare: number;
}

/**
 * Známka za celý zápas na školní stupnici 1,0–5,0, jako by ji dal delegát okresní komise.
 *
 * Záměrně to NENÍ hlasování týmů — obě strany by známkovaly podle výsledku a průměr by
 * pak měřil štěstí, ne výkon. Deterministické, bez RNG.
 *
 * Očekávané sezónní průměry: veterán ≈ 1,7 · pohodář ≈ 2,1 · neutrál ≈ 2,3 ·
 * zelenáč ≈ 2,6 · pískavý kohout ≈ 2,7. Žebříček tedy odměňuje zkušenost a klid.
 */
export function gradeReferee(r: RefereeProfile, f: RefereeGradeFacts): number {
  let g = 2.0;

  if (f.incidentSeverity === "high") g += 1.5;
  else if (f.incidentSeverity === "medium") g += 1.2;
  else if (f.incidentSeverity === "low") g += 1.0;

  const cardsPerFoul = f.cards / Math.max(1, f.fouls);
  if (f.cards >= 3) g += 0.35;               // rozdával karty po kapsách
  else if (cardsPerFoul > 0.22) g += 0.25;   // kartoval i to, co nemusel

  if (f.fouls >= 12 && f.cards <= 1) g += 0.4; // nechal to rozjet

  if (r.fitness < 40 && f.lateEventShare > 0.35) g += 0.2; // v závěru se rozsypal

  if (r.experience >= 75) g -= 0.3;
  else if (r.experience >= 55) g -= 0.15;

  if (f.incidentSeverity === null && f.cards <= 2) g -= 0.2; // klidný zápas bez sporů

  return Math.round(clamp(g, 1.0, 5.0) * 10) / 10;
}
