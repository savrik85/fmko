/**
 * Texty rozboru kádru (záložka Rozbor v Kádru). Šablony bez skloňovadla, proto:
 *  - jméno hráče stojí vždy v 1. pádě jako podmět (nikdy za předložkou ani jako předmět),
 *  - vlastnosti mají připravené tvary (1., 6. a 7. pád) i s předložkou v/ve,
 *  - žádná dlouhá pomlčka.
 */

import type { Slot } from "../engine/roles";

/** Vlastnosti, o kterých asistent mluví: role z enginu, povaha a výška. */
export type AnalysisSkill =
  | "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping"
  | "stamina" | "strength" | "vision" | "creativity" | "setPieces" | "experience"
  | "workRate" | "aggression" | "height";

interface SkillForms {
  /** Název jako v profilu hráče (štítky v UI). */
  ui: string;
  /** 1. pád do věty. */
  nom: string;
  /** Předložka pro 6. pád (v / ve). */
  prep: "v" | "ve";
  /** 6. pád. */
  loc: string;
  /** Předložka pro 7. pád (s / se). */
  insPrep: "s" | "se";
  /** 7. pád („hledej záložníka s přehledem“). */
  ins: string;
}

export const SKILL_FORMS: Record<AnalysisSkill, SkillForms> = {
  speed: { ui: "Rychlost", nom: "rychlost", prep: "v", loc: "rychlosti", insPrep: "s", ins: "rychlostí" },
  technique: { ui: "Technika", nom: "technika", prep: "v", loc: "technice", insPrep: "s", ins: "technikou" },
  shooting: { ui: "Střelba", nom: "střelba", prep: "ve", loc: "střelbě", insPrep: "se", ins: "střelbou" },
  passing: { ui: "Přihrávky", nom: "přihrávky", prep: "v", loc: "přihrávkách", insPrep: "s", ins: "přihrávkami" },
  heading: { ui: "Hlavičky", nom: "hlavičky", prep: "v", loc: "hlavičkách", insPrep: "s", ins: "hlavičkami" },
  defense: { ui: "Obrana", nom: "obranná hra", prep: "v", loc: "obranné hře", insPrep: "s", ins: "obrannou hrou" },
  goalkeeping: { ui: "Chytání", nom: "chytání", prep: "v", loc: "chytání", insPrep: "s", ins: "chytáním" },
  stamina: { ui: "Výdrž", nom: "výdrž", prep: "ve", loc: "výdrži", insPrep: "s", ins: "výdrží" },
  strength: { ui: "Síla", nom: "síla", prep: "v", loc: "síle", insPrep: "se", ins: "silou" },
  vision: { ui: "Přehled", nom: "přehled", prep: "v", loc: "přehledu", insPrep: "s", ins: "přehledem" },
  creativity: { ui: "Kreativita", nom: "kreativita", prep: "v", loc: "kreativitě", insPrep: "s", ins: "kreativitou" },
  setPieces: { ui: "Standardky", nom: "standardky", prep: "ve", loc: "standardkách", insPrep: "se", ins: "standardkami" },
  experience: { ui: "Zkušenost", nom: "zkušenost", prep: "ve", loc: "zkušenostech", insPrep: "se", ins: "zkušenostmi" },
  workRate: { ui: "Nasazení", nom: "nasazení", prep: "v", loc: "nasazení", insPrep: "s", ins: "nasazením" },
  aggression: { ui: "Agresivita", nom: "agresivita", prep: "v", loc: "agresivitě", insPrep: "s", ins: "agresivitou" },
  height: { ui: "Výška", nom: "výška", prep: "ve", loc: "výšce", insPrep: "s", ins: "výškou" },
};

/**
 * U brankáře znamenají vlastnosti něco jiného (váhy hodnocení: obrana = postavení,
 * rychlost = vybíhání, kreativita = komunikace, hlavičky = dosah). Ve větách mluví
 * asistent fotbalově, štítky v UI zůstávají jako v profilu.
 */
const KEEPER_FORMS: Partial<Record<AnalysisSkill, Omit<SkillForms, "ui">>> = {
  defense: { nom: "postavení", prep: "v", loc: "postavení", insPrep: "s", ins: "postavením" },
  speed: { nom: "vybíhání", prep: "ve", loc: "vybíhání", insPrep: "s", ins: "vybíháním" },
  creativity: { nom: "komunikace s obranou", prep: "v", loc: "komunikaci s obranou", insPrep: "s", ins: "komunikací s obranou" },
  heading: { nom: "hra ve vzduchu", prep: "ve", loc: "hře ve vzduchu", insPrep: "s", ins: "hrou ve vzduchu" },
};

export function skillForms(skill: AnalysisSkill, keeper = false): SkillForms {
  const base = SKILL_FORMS[skill];
  const k = keeper ? KEEPER_FORMS[skill] : undefined;
  return k ? { ...base, ...k } : base;
}

/** „přehled a přihrávky“ */
export function skillsNom(skills: readonly AnalysisSkill[], keeper = false): string {
  return joinCs(skills.map((s) => skillForms(s, keeper).nom));
}

/** „v přehledu a přihrávkách“ — předložka podle prvního slova. */
export function skillsLoc(skills: readonly AnalysisSkill[], keeper = false): string {
  if (skills.length === 0) return "";
  return `${skillForms(skills[0], keeper).prep} ${joinCs(skills.map((s) => skillForms(s, keeper).loc))}`;
}

/** „se střelbou, technikou a rychlostí“ — předložka podle prvního slova. */
export function skillsIns(skills: readonly AnalysisSkill[], keeper = false): string {
  if (skills.length === 0) return "";
  return `${skillForms(skills[0], keeper).insPrep} ${joinCs(skills.map((s) => skillForms(s, keeper).ins))}`;
}

/** „a, b a c“ */
export function joinCs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;
}

export interface LineForms {
  /** Název řady v přehledu (Brankář, Obrana…). */
  label: string;
  /** Rod názvu řady kvůli přívlastkům. */
  feminine: boolean;
  /** Hráč řady v 1. pádě: brankář, obránce… */
  playerNom: string;
  /** Hráč řady ve 4. pádě: brankáře, obránce… */
  playerAcc: string;
  /** Kde hráč v sestavě stojí: v brance, v obraně… */
  where: string;
  /** „Nejsilnější obranu má…“ */
  bestAcc: string;
}

export const LINE_FORMS: Record<Slot, LineForms> = {
  GK: { label: "Brankář", feminine: false, playerNom: "brankář", playerAcc: "brankáře", where: "v brance", bestAcc: "Nejlepšího brankáře" },
  DEF: { label: "Obrana", feminine: true, playerNom: "obránce", playerAcc: "obránce", where: "v obraně", bestAcc: "Nejsilnější obranu" },
  MID: { label: "Záloha", feminine: true, playerNom: "záložník", playerAcc: "záložníka", where: "v záloze", bestAcc: "Nejsilnější zálohu" },
  FWD: { label: "Útok", feminine: false, playerNom: "útočník", playerAcc: "útočníka", where: "v útoku", bestAcc: "Nejsilnější útok" },
};

/** Skupina hráčů z požadavku taktiky ve 2. pádě: „rychlost útočníků“. */
export function groupGen(positions: readonly string[]): string {
  if (positions.length !== 1) return "hráčů v poli";
  switch (positions[0]) {
    case "GK": return "brankáře";
    case "DEF": return "obránců";
    case "MID": return "záložníků";
    default: return "útočníků";
  }
}

/** Verdikt řady proti lize. Sedmistupňová škála; slabší asistent mluví hrubší. */
export type LineVerdict = "best" | "top" | "aboveAverage" | "average" | "belowAverage" | "bottom" | "worst";

/** Přísudek k řadě, rod podle řady: „patří k nejlepším v lize“, „je nadprůměrná“. */
export function verdictPhrase(verdict: LineVerdict, feminine: boolean, vague: boolean): string {
  const a = feminine ? "á" : "ý";
  if (vague) {
    if (verdict === "average") return `je asi průměrn${a}`;
    return ["best", "top", "aboveAverage"].includes(verdict)
      ? `je podle mě spíš silnější než u soupeřů`
      : `je podle mě spíš slabší než u soupeřů`;
  }
  switch (verdict) {
    case "best": return "je nejlepší v lize";
    case "top": return "patří k nejlepším v lize";
    case "aboveAverage": return "je mírně nad průměrem ligy";
    case "average": return `je průměrn${a}`;
    case "belowAverage": return "je mírně pod průměrem ligy";
    case "bottom": return "patří k nejslabším v lize";
    case "worst": return "je nejslabší v lize";
  }
}

/** Co asistent o vlastnosti hry řekne: dva nadpisy pro sílu, dva pro slabinu. */
export interface AspectTexts { strong: readonly string[]; weak: readonly string[] }

export const ASPECT_TEXTS: Record<string, AspectTexts> = {
  gkSaves: {
    strong: ["Na brankáře je spoleh", "Brankář nás drží v zápasech"],
    weak: ["Brankář pouští laciné góly", "Brankář nás v zápasech nepodrží"],
  },
  gkAerial: {
    strong: ["Brankář vládne vápnu při centrech", "Centry do vápna brankář vychytá"],
    weak: ["Brankář nestíhá na centry", "Po centrech je ve vápně zmatek"],
  },
  gkCommand: {
    strong: ["Brankář řídí obranu", "Brankář má obranu pod kontrolou"],
    weak: ["Brankář obranu neřídí", "Vzadu chybí hlas brankáře"],
  },
  gkDistribution: {
    strong: ["Brankář rozehrává přesně", "Rozehrávka od brankáře sedí"],
    weak: ["Brankář rozehrávkou ztrácí míče", "Výkopy od brankáře končí u soupeře"],
  },
  defBuildUp: {
    strong: ["Rozehrávka zezadu má hlavu a patu", "Obránci se míče nebojí"],
    weak: ["Obránci míč jen odkopnou", "Rozehrávka zezadu vázne"],
  },
  defDuels: {
    strong: ["Obrana vyhrává souboje", "Přes naši obranu se těžko projde"],
    weak: ["Obrana prohrává souboje", "Přes obranu se soupeř dostane snadno"],
  },
  defSupport: {
    strong: ["Obránci podporují útok", "Dlouhé míče od obránců otevírají hru"],
    weak: ["Obránci do útoku nic nedají", "Od obránců nepřijde žádný míč do útoku"],
  },
  midControl: {
    strong: ["Záloha drží míč", "Střed hřiště je náš"],
    weak: ["Záloha ztrácí míč pod tlakem", "Ve středu hřiště nám soupeř bere míč"],
  },
  midCreation: {
    strong: ["Záloha vymýšlí šance", "Ze zálohy chodí nebezpečné přihrávky"],
    weak: ["Ze zálohy nepřijde poslední přihrávka", "Záloha nevytvoří šanci"],
  },
  midDefending: {
    strong: ["Záloha poctivě pomáhá dozadu", "Záložníci soupeře zastaví už ve středu"],
    weak: ["Záloha nepomáhá obraně", "Záložníci soupeře ve středu nezastaví"],
  },
  midShooting: {
    strong: ["Záložníci umí vystřelit", "Ze zálohy padají góly"],
    weak: ["Záložníci se střelou neprosadí", "Střely ze zálohy jdou mimo"],
  },
  fwdMovement: {
    strong: ["Útočníci dělají soupeři problémy náběhy", "Útočníci se umí uvolnit"],
    weak: ["Útočníci se neumí uvolnit", "Útok je čitelný, náběhy chybí"],
  },
  fwdFinishing: {
    strong: ["Útočníci proměňují šance", "Vepředu máme zabijáky"],
    weak: ["Útočníci zahazují šance", "Koncovka nám nejde"],
  },
  fwdHoldUp: {
    strong: ["Útočníci podrží míč", "Útočníci udrží míč zády k bráně"],
    weak: ["Útočníkům míč odskakuje", "Útočníci míč nepodrží"],
  },
  fwdPressing: {
    strong: ["Útok napadá už u soupeřova vápna", "Útočníci poctivě napadají"],
    weak: ["Útočníci nebrání", "Útočníci soupeře nenapadají"],
  },
  workRate: {
    strong: ["Mužstvo to uběhá", "Kluci makají celý zápas"],
    weak: ["Mužstvu dochází dech", "V poli se málo běhá"],
  },
  experience: {
    strong: ["Ostřílené mužstvo nezpanikaří", "Zkušenost rozhoduje těsné zápasy"],
    weak: ["Mužstvu chybí zkušenost", "Nezkušenost nás stojí body"],
  },
};

/** Slovesa do vět se jmény: jeden hráč / víc hráčů. */
export const WEAK_PLAYER_TEMPLATES: ReadonlyArray<{ one: string; many: string }> = [
  { one: "zaostává", many: "zaostávají" },
  { one: "je slabší", many: "jsou slabší" },
  { one: "má rezervy", many: "mají rezervy" },
];

export const STRONG_PLAYER_TEMPLATES: ReadonlyArray<{ one: string; many: string }> = [
  { one: "vyniká", many: "vynikají" },
  { one: "je nad průměrem ligy", many: "jsou nad průměrem ligy" },
];

export const TACTIC_LABELS: Record<string, string> = {
  offensive: "Útočná",
  balanced: "Vyrovnaná",
  defensive: "Defenzivní",
  long_ball: "Nakopávané",
  possession: "Držení míče",
  pressing: "Vysoký presink",
};
