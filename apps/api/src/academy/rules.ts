/**
 * Žáci: pravidla družstva mladších a starších žáků bez databáze.
 *
 * Podle skutečného okresního fotbalu (docs/youth-academy-redesign-2026-11-04.md): klub
 * buď družstvo žáků má, nebo nemá. Mít ho stojí hlavně trenéra a dost kluků z obce, málo
 * peněz. Kluci 11–14 let jsou v družstvu hned po založení, každé léto postoupí čtrnáctiletí
 * do dorostu (U21) a přijde nový ročník jedenáctiletých.
 *
 * Kategorie podle FAČR 2026/27: mladší žáci 11–12, starší žáci 13–14, mladší dorost 15–16.
 * Kdo hraje o kategorii výš, smí do dorostu od 13 let.
 */

import type { Rng } from "../generators/rng";

/** Nejmladší a nejstarší ročník žáků. */
export const YOUNGEST_AGE = 11;
export const OLDEST_AGE = 14;

/**
 * Kolik kluků jednoho ročníku dá obec: zhruba 1 % obyvatel v ročníku, polovina kluci,
 * třetina z nich hraje fotbal. Obec s 2 300 obyvateli (medián klubů na produ) má 3–4 kluky
 * na ročník, osada do 500 obyvatel kluka jednou za dva roky.
 */
export const KIDS_PER_RESIDENT = 0.0015;
/** Víc kluků na ročník družstvo nepobere (velké obce). */
export const MAX_KIDS_PER_YEAR = 4;
/** Pod tolik kluků družstvo nehraje okresní soutěž. */
export const MIN_SQUAD = 9;

/**
 * Týdenní provoz žáků: základ (míče, cesty na zápasy, rozhodčí) a za každého kluka (dresy,
 * startovné, pojištění). Na produ (2026-11-04) má střední klub pevné výdaje ~9 900 Kč týdně
 * a čistý výsledek jen ~+480 Kč, takže akademie stojí 8–15 % výdajů a chudší klub ji unese.
 */
export const UPKEEP_BASE = 300;
export const UPKEEP_PER_KID = 50;

/**
 * Kolik klub do akademie dává. Běžná je výchozí (300 + 50 Kč za kluka). Skromná šetří, ale
 * kluci rostou pomaleji a víc jich skončí. Ambiciózní platí letní soustředění, turnaje
 * a lepší dresy: rychlejší růst, méně odchodů, víc kluků z okolí a lákaní kluci mají větší zájem.
 * Simulace 6 sezón (2026-11-05): s růstem 0,85 / 1,2 dala skromná i ambiciózní skoro stejný
 * strop odchovanců (58 / 60), ambiciózní se za trojnásobnou cenu nevyplatila; proto 0,7 / 1,45.
 */
export const ACADEMY_LEVELS = {
  modest: { label: "Skromná", base: 200, perKid: 30, growth: 0.7, quit: 0.06, attract: 0.8, poachBonus: -5,
    text: "Jen startovné a cesty na zápasy. Žáci rostou pomaleji a víc jich skončí." },
  standard: { label: "Běžná", base: UPKEEP_BASE, perKid: UPKEEP_PER_KID, growth: 1, quit: 0, attract: 1, poachBonus: 0,
    text: "Startovné, cesty na zápasy a dresy pro žáky." },
  ambitious: { label: "Ambiciózní", base: 500, perKid: 90, growth: 1.45, quit: -0.05, attract: 1.3, poachBonus: 10,
    text: "Navíc letní soustředění a turnaje. Žáci rostou rychleji, méně jich skončí a láká to i žáky odjinud." },
} as const;
export type AcademyLevel = keyof typeof ACADEMY_LEVELS;

export function academyLevelOf(raw: string | null | undefined): AcademyLevel {
  return raw === "modest" || raw === "ambitious" ? raw : "standard";
}

export function upkeepWeekly(squadSize: number, level: AcademyLevel = "standard"): number {
  const l = ACADEMY_LEVELS[level];
  return l.base + l.perKid * Math.max(0, squadSize);
}

// ── Syn trenéra ───────────────────────────────────────────────────────────────

/** Jak často má trenér syna v klubu (pevně podle trenéra, ne náhodně při každém načtení). */
export const COACH_SON_CHANCE = 0.45;

/**
 * Věk trenérova syna, nebo null, když syna nemá. Rozhodne se pevně z id trenéra: jestli syna
 * má a v kolika letech se mu narodil (25–35). Syn roste s trenérem, takže se do akademie
 * dostane, až mu bude 11, a to jen jednou.
 */
export function coachSonAge(managerId: string, managerAge: number): number | null {
  let h = 2166136261;
  for (let i = 0; i < managerId.length; i++) h = Math.imul(h ^ managerId.charCodeAt(i), 16777619) >>> 0;
  if ((h % 1000) / 1000 >= COACH_SON_CHANCE) return null;
  const fatherAt = 25 + ((h >>> 10) % 11);
  const age = managerAge - fatherAt;
  return age >= 0 ? age : null;
}

export function expectedKidsPerYear(population: number): number {
  return Math.min(MAX_KIDS_PER_YEAR, Math.max(0, population) * KIDS_PER_RESIDENT);
}

/** Ze střední hodnoty skutečný počet kluků: celá část jistě, zbytek s pravděpodobností. */
export function rollKids(rng: Rng, expected: number): number {
  const whole = Math.floor(expected);
  return whole + (rng.random() < expected - whole ? 1 : 0);
}

export type CoachType = "volunteer" | "parent" | "staff";

/** Dobrovolník z áčka musí být starší hráč. */
export const VOLUNTEER_MIN_AGE = 28;

/**
 * Co který trenér žákům dá a co to stojí (aby volba byla volba, ne jen „vezmi nejlepšího“):
 * - trenér mládeže: nejlepší příprava a odhad talentu, ale nemá čas na obojí, bonus
 *   tréninku dorostu (U21) a mladých klesne na polovinu (`STAFF_SPLIT_U21_FACTOR`),
 * - hráč áčka: žáci k němu vzhlíží, méně jich skončí a víc dětí přijde z okolí i na nábor,
 *   ale on sám chodí méně na trénink áčka,
 * - táta: průměrný, bez vedlejších účinků, zná rodiče, takže nábor přivede žáka navíc.
 */
export const STAFF_SPLIT_U21_FACTOR = 0.5;
export const VOLUNTEER_QUIT_BONUS = -0.03;
export const VOLUNTEER_ATTRACT = 1.2;
export const PARENT_RECRUIT_EXTRA = 1;

export interface QualityInput {
  coach: CoachType | null;
  /** Vůdcovství dobrovolníka z áčka 0–100. */
  volunteerLeadership?: number;
  /** Efektivita placeného trenéra mládeže 0–20 (`rowEffectiveness`). */
  staffEffectiveness?: number;
  /** Trenérova (manažerova) dovednost „mládež“ 0–100. */
  managerYouth: number;
  squadSize: number;
  /** Úrovně klubového vybavení 0–3, které využívají i žáci (Vybavení). */
  equipment?: YouthEquipment;
}

/** Klubové vybavení, které pomáhá žákům: míče, tréninkové pomůcky, zimní výbava, dodávka. */
export interface YouthEquipment {
  balls: number;
  training_cones: number;
  winter_gear: number;
  team_van: number;
}

/** Co které vybavení žákům dá (do UI slovy, do výpočtu `equipmentQualityBonus`, `quitChance`). */
export const YOUTH_EQUIPMENT: { key: keyof YouthEquipment; label: string; effect: string }[] = [
  { key: "balls", label: "Míče", effect: "víc míčů na tréninku: žáci rostou rychleji" },
  { key: "training_cones", label: "Tréninkové pomůcky", effect: "kužely, branky, žebříky: lepší trénink" },
  { key: "winter_gear", label: "Zimní výbava lavičky", effect: "o něco lepší trénink" },
  { key: "team_van", label: "Klubová dodávka", effect: "odvoz na zápasy: méně žáků skončí" },
];

/** Bonus ke kvalitě přípravy z vybavení: míče a pomůcky po 0,03 za úroveň, zimní výbava 0,03. */
export function equipmentQualityBonus(e: YouthEquipment | undefined): number {
  if (!e) return 0;
  const lvl = (n: number) => Math.max(0, Math.min(3, n || 0));
  return 0.03 * (lvl(e.balls) + lvl(e.training_cones) + lvl(e.winter_gear));
}

/**
 * Kvalita přípravy `q`. Čtyři roky při q = 1 dají náskok +6 k dovednostem a +12 ke stropu.
 * Bez trenéra žáci netrénují (q = 0). Placený trenér je nejlepší (0,7–1,2), dobrovolník
 * podle vůdcovství (0,5–0,9), táta průměrný (0,6). Bez soutěže (pod 9 kluků) poloviční.
 */
export function programQuality(i: QualityInput): number {
  let base: number;
  if (i.coach === "staff") base = 0.7 + (Math.max(0, Math.min(20, i.staffEffectiveness ?? 10)) / 20) * 0.5;
  else if (i.coach === "volunteer") base = 0.5 + (Math.max(0, Math.min(100, i.volunteerLeadership ?? 40)) / 100) * 0.4;
  else if (i.coach === "parent") base = 0.6;
  else return 0;
  const manager = (Math.max(0, Math.min(100, i.managerYouth)) / 100) * 0.15;
  const q = base + manager + equipmentQualityBonus(i.equipment);
  return i.squadSize < MIN_SQUAD ? q * 0.5 : q;
}

/** Týdnů v sezóně, přes které se rozkládá roční růst (sezóna na produ ~15 týdnů). */
export const WEEKS_PER_SEASON = 15;
export const YEARLY_CURRENT = 1.5;
export const YEARLY_CAP = 3;

export function weeklyProgress(q: number): { current: number; cap: number } {
  return { current: (YEARLY_CURRENT * q) / WEEKS_PER_SEASON, cap: (YEARLY_CAP * q) / WEEKS_PER_SEASON };
}

export const LATE_BLOOM_CHANCE = 0.10;
export const BURNOUT_CHANCE = 0.10;

/** Změna talentu ve třinácti, kdy kluk začne dospívat: pozdní květ nebo vyhoření. */
export function talentShiftAt13(rng: Rng): number {
  const r = rng.random();
  if (r < LATE_BLOOM_CHANCE) return rng.int(20, 35);
  if (r < LATE_BLOOM_CHANCE + BURNOUT_CHANCE) return -20;
  return 0;
}

/**
 * Šum v trenérově odhadu talentu: v 11 letech ±25, ve 14 ±10. Placený trenér se plete
 * až o polovinu méně podle úsudku (`judgement` 0–20). `offset` je pevné číslo kluka −1..1,
 * aby odhad v UI neposkakoval.
 */
export function estimatedTalent(talent: number, age: number, offset: number, staffJudgement: number | null): number {
  const base = Math.max(0, 16 - age) * 5;
  const sharp = staffJudgement === null ? 1 : 1 - (Math.max(0, Math.min(20, staffJudgement)) / 20) * 0.5;
  return Math.max(0, Math.min(100, Math.round(talent + offset * base * sharp)));
}

/**
 * Slova trenéra podle odhadu talentu. Hranice sedí na rozložení talentu z generátoru:
 * běžný kluk z obce má kolem 20 (`generateHiddenTalent`), klenot 70–95.
 */
export function verdictText(estimate: number): string {
  if (estimate >= 70) return "Takovýho kluka tu dlouho nebylo. Z toho může být hvězda okresu.";
  if (estimate >= 45) return "Má na krajskej přebor, když vydrží.";
  if (estimate >= 25) return "Do áčka se dostane, na to vemte jed.";
  if (estimate >= 12) return "Na lavičku áčka, když bude makat.";
  return "Spíš pro radost, ale kluk dobrej.";
}

export function commitmentText(commitment: number): string {
  if (commitment >= 70) return "chodí rád";
  if (commitment >= 40) return "občas vynechá trénink";
  return "uvažuje, že skončí";
}

/**
 * Za muže smí hráč nastoupit až od 15 let (FAČR, výkladové stanovisko 2026/27: muži mohou
 * nasadit ročníky 2011 a starší). Hlídá to přesun z U21 do áčka (services/u21-moves.ts).
 */
export const SENIOR_MIN_AGE = 15;

/** Do dorostu o kategorii výš smí kluk od 13 let (starší žák v mladším dorostu). */
export const PLAY_UP_AGE = 13;
/** Od jakého odhadu trenér sám doporučí, aby kluk hrál o kategorii výš. */
export const PLAY_UP_ESTIMATE = 45;

export function canPlayUp(age: number): boolean {
  return age >= PLAY_UP_AGE;
}

export function recommendsPlayUp(age: number, estimate: number): boolean {
  return canPlayUp(age) && estimate >= PLAY_UP_ESTIMATE;
}

/** Za kolik dní po odmítnutém doporučení to trenér zkusí znovu. */
export const REOFFER_DAYS: [number, number] = [28, 35];

/** Den doporučení přes sezónu, ať nechodí všechna najednou. */
export function firstOfferDay(rng: Rng, seasonDays: number): number {
  return rng.int(7, Math.max(8, seasonDays - 7));
}

/** Roční šance, že kluk skončí (hokej, florbal, holky, škola). */
export const QUIT_BASE = 0.08;
export const QUIT_NO_COMPETITION = 0.15;
export const QUIT_NO_COACH = 0.10;

export function quitChance(commitment: number, playsCompetition: boolean, hasCoach: boolean, vanLevel = 0, levelQuit = 0): number {
  let chance = QUIT_BASE - 0.02 * Math.max(0, Math.min(3, vanLevel)) + levelQuit;
  if (!playsCompetition) chance += QUIT_NO_COMPETITION;
  if (!hasCoach) chance += QUIT_NO_COACH;
  if (commitment < 40) chance += 0.15;
  else if (commitment >= 70) chance -= 0.03;
  return Math.max(0, Math.min(0.9, chance));
}

/**
 * Tabulkové odstupné za kluka ve starších žácích (U14–U15) podle soutěže áčka klubu, kam
 * přechází (Přestupní řád FAČR od 1. 6. 2025, § 23). Platí se, když klub bez dorostu přijde
 * o čtrnáctileté do klubu s dorostem.
 */
export const YOUTH_TRANSFER_FEE: Record<string, number> = {
  krajsky_prebor: 15_000,
  i_a_trida: 12_500,
  i_b_trida: 10_000,
  okresni_prebor: 8_000,
  okresni_soutez: 6_500,
  iv_trida: 5_000,
};
export const DEFAULT_YOUTH_TRANSFER_FEE = 8_000;

export function youthTransferFee(leagueLevel: string | null | undefined): number {
  return (leagueLevel && YOUTH_TRANSFER_FEE[leagueLevel]) || DEFAULT_YOUTH_TRANSFER_FEE;
}

/** Plat odchovance v první smlouvě proti běžnému hráči stejného hodnocení. */
export const GRADUATE_WAGE_FACTOR = 0.7;

/**
 * Rysy kluka: povaha a rodina, NIKDY dovednosti. Dovednostní rysy („rychlej jak blesk“) si
 * odporovaly se silnými a slabými stránkami z generátoru (kluk „rychlej“ se slabinou „pomalý“).
 */
// Jen povaha a domov, žádná tvrzení o klubu: „brácha hraje za áčko“ nebo „děda je správce
// hřiště“ by byla nepravda (bratr v áčku ani správce ve hře nejsou)
export const TRAITS = [
  "doma ho ženou do hokeje", "učitelka si na něj stěžuje",
  "na trénink chodí první", "pořád se směje", "ve škole jednička z tělocviku", "neumí prohrávat",
  "mamka ho vozí na každý trénink", "s míčem chodí i do školy", "kamarádí se s celou partou", "fandí Slavii",
  "fandí Spartě", "stydí se, ale na hřišti ožije", "po zápase vždycky zůstane sbírat míče",
] as const;

/** Štítek ze staré sady, který už žák mít nemá (vymyšlené tvrzení o klubu). */
export function knownTrait(t: string): boolean {
  return (TRAITS as readonly string[]).includes(t);
}

export function pickTraits(rng: Rng): string[] {
  const first = rng.pick([...TRAITS]);
  if (rng.random() < 0.5) return [first];
  return [first, rng.pick(TRAITS.filter((t) => t !== first))];
}

/** Pozice se u mladších žáků ještě neví, ukazuje se od třinácti. */
export function positionVisible(age: number): boolean {
  return age >= 13;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.hypot((a.lng - b.lng) * 71.5, (a.lat - b.lat) * 111.2);
}

/** Jak trenér slovy hodnotí přípravu. */
export function qualityText(q: number, coach: CoachType | null): string {
  if (!coach) return "Žáci nemají trenéra, netrénují.";
  if (q >= 1.05) return "Příprava jako v krajském klubu.";
  if (q >= 0.8) return "Slušná příprava.";
  if (q >= 0.55) return "Příprava na koleně.";
  return "Žáci spíš jen kopou do míče.";
}

/** Kam to kluk dotáhne: stupnice potenciálu (odhad talentu 0–100) slovy. */
export const POTENTIAL_SCALE: { from: number; label: string }[] = [
  { from: 0, label: "pro radost" },
  { from: 12, label: "lavička áčka" },
  { from: 25, label: "áčko" },
  { from: 45, label: "krajský přebor" },
  { from: 70, label: "hvězda okresu" },
];

/** Rozpětí trenérova odhadu: čím mladší kluk a horší úsudek, tím širší. */
export function estimateRange(estimate: number, age: number, staffJudgement: number | null): { low: number; high: number } {
  const sharp = staffJudgement === null ? 1 : 1 - (Math.max(0, Math.min(20, staffJudgement)) / 20) * 0.5;
  const spread = Math.max(6, Math.max(0, 16 - age) * 5 * sharp);
  return { low: Math.max(0, Math.round(estimate - spread)), high: Math.min(100, Math.round(estimate + spread)) };
}

/** Silné a slabé stránky slovy podle dovedností, které ke kluku patří na jeho pozici. */
const SKILL_WORDS: Record<string, { strong: string; weak: string }> = {
  speed: { strong: "rychlý", weak: "pomalý" },
  shooting: { strong: "dobrý střelec", weak: "slabá střela" },
  heading: { strong: "hlavičkář", weak: "slabý v hlavičkách" },
  technique: { strong: "dobrá technika", weak: "slabá technika" },
  creativity: { strong: "nápaditý", weak: "málo nápaditý" },
  stamina: { strong: "vydrží celý zápas", weak: "rychle se unaví" },
  strength: { strong: "silný v soubojích", weak: "slabý v soubojích" },
  passing: { strong: "dobrá přihrávka", weak: "nepřesné přihrávky" },
  vision: { strong: "přehled ve hře", weak: "nemá přehled ve hře" },
  defense: { strong: "dobře brání", weak: "slabý v obraně" },
  goalkeeping: { strong: "skvělé reflexy", weak: "nejistý v bráně" },
};

const POSITION_SKILLS: Record<string, string[]> = {
  GK: ["goalkeeping", "strength", "passing", "vision"],
  DEF: ["defense", "heading", "strength", "speed", "passing", "stamina"],
  MID: ["passing", "vision", "technique", "creativity", "stamina", "speed", "shooting"],
  FWD: ["shooting", "speed", "heading", "technique", "creativity", "strength"],
};

/** Dvě nejlepší a jedna nejslabší dovednost kluka na jeho pozici, slovy. */
export function strengthsOf(position: string, skills: Record<string, number>): { strengths: string[]; weakness: string | null } {
  const keys = (POSITION_SKILLS[position] ?? POSITION_SKILLS.MID).filter((k) => typeof skills[k] === "number");
  if (keys.length < 3) return { strengths: [], weakness: null };
  const sorted = [...keys].sort((a, b) => skills[b] - skills[a]);
  return {
    strengths: sorted.slice(0, 2).map((k) => SKILL_WORDS[k]?.strong).filter((x): x is string => !!x),
    weakness: SKILL_WORDS[sorted[sorted.length - 1]]?.weak ?? null,
  };
}

/** Jak dobrý je trenér mládeže z trhu, slovy podle efektivity v roli (0–20). */
export function staffQualityText(effectiveness: number): string {
  if (effectiveness >= 15) return "výborný, žáky posune nejvíc";
  if (effectiveness >= 11) return "dobrý";
  if (effectiveness >= 7) return "průměrný";
  return "slabší";
}

// ── Kde vzít nové kluky ───────────────────────────────────────────────────────

/** Náborový den ve škole: jednou za sezónu, s trenérem žáků. */
export const RECRUIT_DAY_COST = 1500;
/** Dokud družstvo nemá MIN_SQUAD žáků na soutěž, jde nábor opakovat, nejdřív po tolika dnech. */
export const RECRUIT_REPEAT_DAYS = 7;

/** Den, kdy jde opakovaný nábor znovu (YYYY-MM-DD), nebo null, když už jde. */
export function nextRecruitDay(lastOn: string | null, today: string): string | null {
  if (!lastOn) return null;
  const next = new Date(`${lastOn.slice(0, 10)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + RECRUIT_REPEAT_DAYS);
  const nextDay = next.toISOString().slice(0, 10);
  return nextDay > today.slice(0, 10) ? nextDay : null;
}

/**
 * Kolik kluků (11–12 let) přivede náborový den: zhruba polovina ročníku obce navíc,
 * nejméně „možná jeden“, nejvýš 2. Dobrý trenér děti nadchne víc. Simulace 6 sezón
 * (2026-11-04): s vyšší dávkou poslal městys do U21 skoro 7 kluků ročně, U21 přetékala.
 */
/**
 * Den otevřených dveří na hřišti: dražší než nábor ve škole (občerstvení, míče a dresy na
 * vyzkoušení), přijde míň dětí, ale z okolních obcí a jen ty, které fotbal opravdu chtějí
 * (vyšší zápal). Trenér je vidí hrát, takže talent odhadne přesněji.
 */
export const OPEN_DAY_COST = 2500;
/** O kolik má žák z dne otevřených dveří vyšší zápal než běžný nováček. */
export const OPEN_DAY_COMMITMENT_BONUS = 15;
/** Jak se zmenší chyba odhadu talentu (trenér ho viděl hrát). */
export const OPEN_DAY_ESTIMATE_FACTOR = 0.5;

/**
 * Kolik dětí 11–14 let přijde: pětina ročníku obce a okolních obcí bez akademie, 0,4 až 1,2.
 * Vždycky míň než náborový den ve škole (ten až 2), výhoda je v zápalu, věku a odhadu.
 */
export const OPEN_DAY_MAX_KIDS = 1.2;
export function openDayExpected(ownPerYear: number, neighborsPerYear: number, quality: number): number {
  const base = Math.min(OPEN_DAY_MAX_KIDS, Math.max(0.4, (ownPerYear + neighborsPerYear) * 0.2));
  return Math.min(OPEN_DAY_MAX_KIDS, base * (0.7 + 0.3 * Math.min(1.3, Math.max(0, quality))));
}

export function recruitDayExpected(population: number, quality: number): number {
  const base = Math.min(2, Math.max(0.6, expectedKidsPerYear(population) * 0.5));
  return Math.min(2, base * (0.7 + 0.3 * Math.min(1.3, Math.max(0, quality))));
}

/** Kluci z obcí bez vlastní akademie chodí do akademie v okolí: do téhle vzdálenosti. */
export const NEIGHBOR_RADIUS_KM = 6;
/** Z okolních obcí přijde za léto nejvýš tolik kluků (velké obce by jinak zaplavily družstvo). */
export const NEIGHBOR_MAX_PER_YEAR = 2;
/** Víc kluků družstvo žáků neuživí: nábor ani okolní obce nikoho dalšího nepřivedou. */
export const MAX_SQUAD = 24;
/** Jaký díl ročníku obce bez akademie vůbec chce hrát fotbal jinde (dojíždění). */
export const NEIGHBOR_SHARE = 0.35;

/** Kolik jedenáctiletých z obce bez akademie přijde k jednomu klubu s akademií v okolí. */
export function neighborKidsExpected(population: number, academiesAround: number): number {
  return (expectedKidsPerYear(population) * NEIGHBOR_SHARE) / Math.max(1, academiesAround);
}

// ── Přetahování nadějných žáků ────────────────────────────────────────────────

/** O kolik klubů dál jde lákat (km mezi obcemi). */
export const POACH_RADIUS_KM = 15;
/** Kolik cizích kluků může klub za sezónu lákat. */
export const MAX_POACH_PER_SEASON = 2;
/** Od jakého zájmu kluk v létě přestoupí. */
export const POACH_THRESHOLD = 60;
/** Akce a co udělají se zájmem. Kopačky stojí peníze a můžou prasknout. */
export const POACH_ACTIONS = {
  invite: { interest: 15, cost: 0 },
  promise: { interest: 15, cost: 0 },
  boots: { interest: 25, cost: 2000, scandalChance: 0.3 },
  defend: { interest: -20, cost: 0 },
} as const;
export type PoachAction = keyof typeof POACH_ACTIONS;

/** Úrovně soutěží od nejvyšší, pro srovnání „kdo hraje výš“. */
const LEAGUE_RANK: Record<string, number> = {
  krajsky_prebor: 5, i_a_trida: 4, i_b_trida: 3, okresni_prebor: 2, okresni_soutez: 1, iv_trida: 0,
};

export interface PoachInput {
  /** Jeho klub nemá dorost: v patnácti stejně musí jinam. */
  fromHasU21: boolean;
  fromLeague: string | null;
  toLeague: string | null;
  /** Kvalita přípravy u jeho klubu a u lákajícího (programQuality). */
  fromQuality: number;
  toQuality: number;
  distanceKm: number;
  /** Chuť kluka (commitment) u vlastního klubu 0–100. */
  commitment: number;
}

/** Výchozí zájem kluka o lákající klub 0–100 (bez akcí). V UI jen slovy. */
export function poachBaseInterest(i: PoachInput): number {
  let v = 20;
  if (!i.fromHasU21) v += 25;
  const diff = (LEAGUE_RANK[i.toLeague ?? ""] ?? 1) - (LEAGUE_RANK[i.fromLeague ?? ""] ?? 1);
  v += Math.max(-10, Math.min(20, diff * 10));
  v += Math.round((i.toQuality - i.fromQuality) * 25);
  v -= Math.round(Math.max(0, i.distanceKm - 3) * 2);
  v -= Math.round((i.commitment - 50) * 0.4);
  return Math.max(0, Math.min(100, v));
}

/** Jednoho žáka smí najednou lákat nejvýš tolik klubů (víc rodičů nezvládne). */
export const MAX_POACH_CLUBS_PER_KID = 3;

/**
 * Zájem z pohledu lákajícího klubu. Přestoupit může jen jednou: kdo není první
 * (nejvyšší zájem), nedostane „v létě přestoupí“, i když je přes hranici.
 */
export function rivalInterestText(interest: number, leading: boolean): string {
  if (interest >= POACH_THRESHOLD && !leading) return "chce k vám, ale víc ho láká jiný klub";
  return interestText(interest);
}

/** Zájem vlastního žáka z pohledu klubu, odkud by odešel; `leader` je klub, který vede. */
export function leavingRivalText(interest: number, leading: boolean, leader: string | null): string {
  if (interest >= POACH_THRESHOLD && !leading) return `chce k nim, ale víc ho táhne ${leader ?? "jiný klub"}`;
  return leavingInterestText(interest);
}

/** Zájem vlastního žáka, kterého láká jiný klub (pohled klubu, odkud by odešel). */
export function leavingInterestText(interest: number): string {
  if (interest >= POACH_THRESHOLD) return "chce k nim, v létě přestoupí";
  if (interest >= 45) return "váhá, ještě trochu a odejde";
  if (interest >= 25) return "poslouchá je, ale drží se vás";
  return "nemá zájem odejít";
}

export function interestText(interest: number): string {
  if (interest >= POACH_THRESHOLD) return "chce k vám, v létě přestoupí";
  if (interest >= 45) return "váhá, ještě trochu a půjde";
  if (interest >= 25) return "poslouchá, ale drží se svého klubu";
  return "nemá zájem";
}

/**
 * Tabulkové odstupné za kluka podle věkové kategorie a soutěže klubu, kam jde
 * (Přestupní řád FAČR § 23): mladší žáci (do 12 let) mají nižší sazbu než starší.
 */
const YOUNGER_FEE: Record<string, number> = {
  krajsky_prebor: 12_500, i_a_trida: 10_000, i_b_trida: 8_000, okresni_prebor: 6_500, okresni_soutez: 5_000, iv_trida: 4_000,
};
export function youthFeeByAge(age: number, leagueLevel: string | null | undefined): number {
  if (age >= 13) return youthTransferFee(leagueLevel);
  return (leagueLevel && YOUNGER_FEE[leagueLevel]) || 6_500;
}
