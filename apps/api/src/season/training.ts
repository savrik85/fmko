import type { Weather } from "../engine/types";
/**
 * FMK-12: Tréninkový systém — plánování, účast, efekt na atributy.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer } from "../generators/player";

/**
 * Hráč v tréninku: GeneratedPlayer + volitelné stropy atributů (maxPotential ze
 * sloupce skills_max) a skrytý talent. Bez stropů se atribut smí vyšplhat až na 100
 * (fallback pro staré/neúplné záznamy).
 */
export type TrainingPlayer = GeneratedPlayer & {
  skillCaps?: Record<string, number>;
  hiddenTalent?: number;
};

export type TrainingType = "conditioning" | "technique" | "tactics" | "match_practice";
export type TrainingApproach = "strict" | "balanced" | "relaxed";

const CELEB_TRAINING_EXCUSES = [
  "Dnes má rehabilitaci u svého fyzioterapeuta",
  "Běhá si sám v parku, má vlastní program",
  "Řekl že tohle cvičení je pod jeho úroveň",
  "Volal že je na golfu",
  "Prý má natáčení pro ČT Sport",
  "Zaspání — včerejší charitativní akce se protáhla",
  "Jel na soustředění veteránů",
  "Má trénink s osobním koučem",
  "Doktor mu doporučil odpočinek",
  "Řekl: já tohle nepotřebuju, já to umím",
  "Letěl na podpis dresu pro fanoušky",
  "Manažer ho odvolal na press konferenci",
  "Vystoupení v podcastu, nemohl zrušit",
  "Točí reklamu na pivo, nemůže přijít zpotit",
  "Sponzoring — focení pro novou kolekci",
  "Pozvali ho do StarDance, zkouší tango",
  "Jel autogramiádu do nákupního centra",
  "Diskuze v Show Jana Krause",
  "Otevírá hospodu kamarádovi v Brně",
  "Soustředění reprezentace veteránů na Maledivách",
];

/** Základní šance na zlepšení atributu za jeden odtrénovaný den (před modifikátory). */
export const BASE_IMPROVE_CHANCE = 0.20;

export type TrainingIntensity = "light" | "normal" | "hard";

/**
 * Intenzita jednoho tréninku. Tvrdý dá víc, ale sebere víc sil a hráči ho hůř snášejí;
 * lehký je regenerační — hodí se den před zápasem.
 * `load` je váha do celkové týdenní zátěže, ze které se počítá spokojenost hráčů.
 */
export const INTENSITY: Record<TrainingIntensity, { growth: number; drain: number; load: number; label: string }> = {
  light:  { growth: 0.6,  drain: 0.5, load: 0.6, label: "Lehký" },
  normal: { growth: 1.0,  drain: 1.0, load: 1.0, label: "Normální" },
  hard:   { growth: 1.45, drain: 1.6, load: 1.4, label: "Tvrdý" },
};

/**
 * České názvy typů tréninku pro cokoliv, co uvidí hráč (záznam o kondici, kalendář…).
 * Do textů nikdy nedávat holý klíč — v UI se pak objeví „Trénink: tactics".
 */
export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  conditioning: "Kondice",
  technique: "Technika",
  tactics: "Taktika",
  match_practice: "Zápasová praxe",
};

/** Bezpečný převod na český název — neznámý klíč vrátí sám sebe. */
export function trainingTypeLabel(type: string | null | undefined): string {
  if (!type) return "Trénink";
  return TRAINING_TYPE_LABELS[type as TrainingType] ?? type;
}

/** Věkový modifikátor růstu — mladí rostou rychle, veteráni skoro vůbec. */
export function ageGrowthMod(age: number): number {
  return age < 20 ? 1.3 : age < 25 ? 1.15 : age < 30 ? 1.0 : age < 34 ? 0.7 : age < 38 ? 0.4 : 0.15;
}

/** Klesající výnosy: každý bod nad 50 ubírá ze šance na další zlepšení. */
export function diminishingMod(currentValue: number): number {
  return currentValue >= 50 ? Math.max(0.15, 1.0 - (currentValue - 50) * 0.017) : 1.0;
}

/**
 * Ideální počet tréninkových dnů v týdnu pro daného hráče. Dříč chce dřít, pohodář ne;
 * veterán a vyčerpaný hráč potřebují ubrat, mladík naopak snese víc.
 * Sdílené se simulací, aby predikce na stránce ukazovala totéž, co se pak stane.
 */
export function idealTrainingLoad(player: { workRate: number; age: number; condition: number }): number {
  let ideal = 2 + (player.workRate / 100) * 2;
  if (player.age >= 33) ideal -= 0.5;
  if (player.age <= 21) ideal += 0.5;
  if (player.condition < 50) ideal -= 1;
  return ideal;
}

/** Jak hráč snáší zadanou zátěž: přetížený / nevytížený / spokojený. */
export function loadVerdict(player: { workRate: number; age: number; condition: number }, load: number):
  "pretizeny" | "nevytizeny" | "spokojeny" {
  const diff = load - idealTrainingLoad(player);
  if (diff >= 1.5) return "pretizeny";
  if (diff <= -1.5) return "nevytizeny";
  return Math.abs(diff) <= 0.75 ? "spokojeny" : "neutralni" as never;
}

export interface TrainingPlan {
  /**
   * Kolik tréninků týdně tým podle nastavení má. Slouží k ekonomice a zobrazení —
   * simulace ho NEPOUŽÍVÁ: jedno volání simulateTraining = jeden trénink (jeden den).
   * Dřív se jím násobil počet tréninků UVNITŘ jednoho dne, takže tým s "2x týdně"
   * a dvěma tréninkovými dny reálně odtrénoval 4x a rostl dvojnásobně rychle.
   */
  sessionsPerWeek: number;
  type: TrainingType;
  approach: TrainingApproach;
  /** Intenzita dnešního tréninku. Chybí-li, bere se normální. */
  intensity?: TrainingIntensity;
  /**
   * Týdenní zátěž pro spokojenost hráčů — součet vah intenzit všech tréninkových dnů.
   * Chybí-li, použije se sessionsPerWeek (každý den se počítá za jeden).
   */
  weeklyLoad?: number;
}

export interface TrainingAttendance {
  playerIndex: number;
  attended: boolean;
  reason?: string;
}

export interface TrainingResult {
  attendance: TrainingAttendance[];
  improvements: Array<{ playerIndex: number; attribute: string; change: number }>;
  teamChemistry: number; // Change to team chemistry
  /** Jak hráči reagovali na nastavení tréninku (zátěž, přístup). Volající je ukládá do morálky. */
  moraleChanges: Array<{ playerIndex: number; change: number; reason: string }>;
  description: string;
}

const ABSENCE_REASONS = [
  // Práce
  "Měl směnu v práci",
  "Šéf ho nepustil dřív, prý urgentní zakázka",
  "Byl na nočce, spal celý den",
  "Schůzka v práci se protáhla — nešla zrušit",
  "Vzal si přesčas, peníze nad fotbal",
  "Kolega se nedostavil, musí ho zaskočit",
  "Pohotovost v práci — nemůže odejít",
  "Služební cesta, vrátil se až večer",

  // Rodina
  "Nedostal se z domu — děti",
  "Hlídá ségřiny děti",
  "Slíbil ženě, že dneska zůstane doma",
  "Tchýně přijela na návštěvu, nemůže utéct",
  "Manželka má noční, sám s malýma",
  "Dcera má vystoupení ve školce",
  "Syn se mu pere ve škole, řeší to",
  "Pohřeb vzdáleného strejdy",
  "Tchán něco potřebuje opravit",
  "Žena mu řekla, že má volno on, ne ona",
  "Veze rodiče k doktorovi",
  "Stěhuje se, nemá čas",

  // Zdraví
  "Říkal, že ho bolí koleno",
  "Natáhl si sval v práci",
  "Prý má rýmu a nechce nakazit ostatní",
  "Bolí ho záda od soboty",
  "Bouchla mu hlava, vzal si paralen",
  "Schůzka u doktora, nemohl přeobjednat",
  "Po včerejším tréninku má zatuhlé lýtko",
  "Oteklý kotník, raději ho šetří",

  // Hospoda / parta
  "Páteční hospoda se protáhla",
  "Včera byla zabijačka, dneska se sotva hýbe",
  "Strejda měl narozeniny, dali si jen jedno…",
  "Oslava povýšení v práci, dohnalo ho to ráno",
  "Hodili kluci po práci pivo, jedno vedlo k druhým",
  "Včera viděl Slavii, neudržel emoce",

  // Vesnický humor
  "Grilování u sousedů",
  "Jede na rybářské závody",
  "Vyklízí stodolu, slíbil dědovi",
  "Sekal trávu, dotáhl to až do noci",
  "Kombajn na poli — celá rodina pomáhá",
  "Soused mu pomáhá s drůbeží, nemůže ho nechat",
  "Hasičský trénink — povinná účast",
  "Vyhrál v tombole prase, řeší co s ním",
  "Schůze družstva, starosta to nazval povinnou",
  "Pomáhá tátovi na zahradě s jablkama",

  // Logistika / drobnosti
  "Auto nejelo",
  "Opravuje si auto, nemá jak dojet",
  "Zaspěl, prý měl budík na pět",
  "Říkal, že zapomněl",
  "Říkal, že myslel že je zítra",
  "Říkal, že přišel pozdě a styděl se",
  "Říkal, že přijde, ale nepřišel. Nezdá telefon",
  "Montér mu přijde dělat kotel",
  "Doručuje mu Rohlík, čeká doma",
  "Vybitý telefon, nikoho nezavolal",
  "Oslavuje narozeniny — své, ne cizí",
  "Dovolená",
  "Tréninkové boty zapomněl v práci",
];

const COMMUTE_ABSENCE_REASONS = [
  "Nestihl to — daleko dojíždí",
  "Auto se porouchalo cestou",
  "Nechtělo se mu jet tak daleko v dešti",
  "Zmeškal autobus",
  "Říkal že cesta za to nestojí",
  "Silnice je zasněžená, nejede",
  "Tankoval a zjistil, že nemá peníze na benzín",
  "Spolujezdec zrušil, sám nechce jet",
  "Říkal, že v tom blátě tam jeho auto nedojede",
  "Potkalo ho stádo krav na silnici, prý čekal půl hodiny",
  "Nehoda na hlavní, stál hodinu v koloně",
  "Píchlá pneumatika, nemá rezervu",
  "Vlak měl výluku, NAD nedoběhl",
  "Bus měl zpoždění, otočil to domů",
  "Spolujízda zrušila, sám se mu nechtělo",
  "Auto v servisu, čeká na díly",
  "Sníh — silnice je neprojezdná",
  "Mlha — radši zůstal doma",
  "Cesta uzavřená kvůli stromu po větru",
  "Diesel mu zamrzl, neumí ho rozjet",
];

export const TRAINING_EFFECTS: Record<TrainingType, string[]> = {
  conditioning: ["stamina", "speed", "strength"],
  technique: ["technique", "shooting", "creativity", "setPieces"],
  tactics: ["passing", "defense", "vision"],
  match_practice: ["shooting", "heading", "goalkeeping"],
};

/**
 * Simulate training attendance for one session.
 * commuteKms: optional array of commute distances per player index.
 */
function simulateAttendance(
  rng: Rng,
  squad: GeneratedPlayer[],
  approach: TrainingApproach,
  commuteKms?: number[],
  attendanceBonus: number = 0,
  managerDiscipline: number = 40,
): TrainingAttendance[] {
  // Trenér, který drží kázeň, dostane na trénink víc lidí. Kolem hodnoty 40 je to
  // neutrální, nahoře i dole to hýbe docházkou nejvýš o deset procentních bodů.
  const managerAttendanceMod = Math.max(-0.1, Math.min(0.1, (managerDiscipline - 40) / 100 * 0.2));

  return squad.map((player, i) => {
    // Base attendance from discipline (+ bonus z vybavení, např. klubová dodávka)
    let attendProb = player.discipline / 100 * 0.6 + 0.3 + attendanceBonus + managerAttendanceMod;

    const km = commuteKms?.[i] ?? 0;

    // Celebrity override: very low training attendance
    const isCeleb = (player as any).isCelebrity;
    const celebType = (player as any).celebrityType as string | undefined;
    if (isCeleb) {
      attendProb = celebType === "glass_man" ? 0.40 : celebType === "fallen_star" ? 0.25 : 0.15;
    } else {
      // Approach modifiers (only for non-celebrities)
      if (approach === "strict") attendProb += 0.1;
      if (approach === "relaxed") attendProb -= 0.1;

      // Age: older players skip more
      if (player.age > 35) attendProb -= 0.1;

      // Alcohol: party animals skip more
      if (player.alcohol > 70) attendProb -= 0.1;

      // Morale: low morale = less motivated
      if (player.morale < 30) attendProb -= 0.15;

      // Transfer truc: hráč naštvaný z odmítnutého přestupu chodí míň
      if (((player as any).transferUnrest ?? 0) >= 40) attendProb -= 0.15;

      // Commute: farther players attend less
      if (km > 0) {
        attendProb -= Math.min(0.22, km * 0.008);
      }
    }

    attendProb = Math.max(0.05, Math.min(0.95, attendProb));

    if (rng.random() < attendProb) {
      return { playerIndex: i, attended: true };
    }

    // Celebrity-specific training excuses
    if (isCeleb) {
      return { playerIndex: i, attended: false, reason: rng.pick(CELEB_TRAINING_EXCUSES) };
    }
    const reason = km > 10 && rng.random() < 0.4
      ? rng.pick(COMMUTE_ABSENCE_REASONS)
      : rng.pick(ABSENCE_REASONS);

    return {
      playerIndex: i,
      attended: false,
      reason,
    };
  });
}

/**
 * Vliv počasí na chuť dojít na trénink.
 *
 * Počasí je ve hře vlastnost DNE (`season/season-weather.ts`), takže trénink
 * ve čtvrtek dostane počasí čtvrtka — stejné, jaké hráč vidí v předpovědi.
 * Zápas se odehraje skoro za každého počasí, ale na středeční trénink se
 * v plískanici nikomu nechce.
 *
 * Rozpětí je schválně malé: počasí má docházku barvit, ne řídit.
 */
export function trainingWeatherMod(weather: Weather | undefined): number {
  switch (weather) {
    case "sunny": return 0.06;
    case "cloudy": return 0;
    case "wind": return -0.04;
    case "rain": return -0.09;
    case "snow": return -0.14;
    default: return 0;
  }
}

/**
 * Odsimuluje JEDEN trénink (jeden tréninkový den). Kolikrát za týden se trénuje,
 * určují výhradně tréninkové dny — volající zavolá tuhle funkci jednou za každý z nich.
 */
export function simulateTraining(
  rng: Rng,
  squad: TrainingPlayer[],
  plan: TrainingPlan,
  commuteKms?: number[],
  equipmentMultiplier: number = 1.0,
  managerBonus: { coaching: number; discipline: number; youthDev: number } = { coaching: 40, discipline: 40, youthDev: 40 },
  equipExtras: { attendanceBonus?: number; youthTrainingMod?: number; gkTrainingMul?: number } = {},
  /** Počasí tréninkového dne z `resolveWeatherForDate`. */
  weather?: Weather,
): TrainingResult {
  const allAttendance: TrainingAttendance[] = [];
  const attendanceCounts = new Map<number, number>();

  // Jeden trénink = jedna docházka. Kdo přišel, dostane jeden pokus o zlepšení.
  const session = simulateAttendance(
    rng, squad, plan.approach, commuteKms,
    (equipExtras.attendanceBonus ?? 0) + trainingWeatherMod(weather),
    managerBonus.discipline,
  );
  for (const a of session) {
    if (a.attended) attendanceCounts.set(a.playerIndex, 1);
  }
  allAttendance.push(...session);

  // Calculate improvements
  const improvements: TrainingResult["improvements"] = [];
  const affectedAttrs = TRAINING_EFFECTS[plan.type];

  for (const [playerIndex, sessions] of attendanceCounts) {
    // Přišel na trénink → má nárok na pokus o zlepšení (dřív musel stihnout půlku z N sessions).
    if (sessions < 1) continue;

    const player = squad[playerIndex];

    const ageMod = ageGrowthMod(player.age);

    // Manager coaching bonus: 40=1.12x, 60=1.28x, 80=1.44x, 99=1.59x
    const coachMod = 0.8 + (managerBonus.coaching / 100) * 0.8;
    // Youth development bonus for players under 22
    const youthMod = player.age < 22
      ? (0.9 + (managerBonus.youthDev / 100) * 0.6) * (1 + (equipExtras.youthTrainingMod ?? 0))
      : 1.0;

    // Independent roll per session attended (base 10% per session)
    for (let s = 0; s < sessions; s++) {
      // GK filter: non-GK never gets goalkeeping, GK prefers goalkeeping in match_practice
      let attr = rng.pick(affectedAttrs);
      if (attr === "goalkeeping" && player.position !== "GK") {
        const filtered = affectedAttrs.filter((a) => a !== "goalkeeping");
        attr = rng.pick(filtered);
      } else if (player.position === "GK" && plan.type === "match_practice" && attr !== "goalkeeping") {
        if (rng.random() < 0.6) attr = "goalkeeping";
      }
      const current = player[attr as keyof GeneratedPlayer] as number;

      const diminishing = diminishingMod(current);

      // Trenér brankářů: extra multiplikátor jen pro brankáře
      const gkMul = player.position === "GK" ? (equipExtras.gkTrainingMul ?? 1) : 1;
      const intensityMod = INTENSITY[plan.intensity ?? "normal"].growth;
      // Skrytý talent zrychluje růst (0 → 1.0×, 65 → ~1.33×) — "odhalí se postupně tréninkem"
      const talentMod = 1 + Math.max(0, player.hiddenTalent ?? 0) / 200;
      const improveChance = BASE_IMPROVE_CHANCE * intensityMod * equipmentMultiplier * diminishing * ageMod * coachMod * youthMod * gkMul * talentMod;
      if (rng.random() < improveChance) {
        // Strop atributu = vygenerovaný potenciál (skills_max), ne paušálních 100.
        // Hráč, který je na svém stropu, se v daném atributu dál nezlepší.
        const cap = Math.min(100, player.skillCaps?.[attr] ?? 100);
        if (current < cap) {
          (player as unknown as Record<string, number>)[attr] = current + 1;
          improvements.push({ playerIndex, attribute: attr, change: 1 });
        }
      }
    }
  }

  // Veteran decay: 37+ lose physical attributes (was 34+)
  for (const [playerIndex] of attendanceCounts) {
    const player = squad[playerIndex];
    if (player.age >= 37) {
      const decayChance = (player.age - 36) * 0.01;
      for (const attr of ["speed", "stamina", "strength"]) {
        const val = player[attr as keyof GeneratedPlayer] as number;
        if (rng.random() < decayChance && val > 15) {
          (player as unknown as Record<string, number>)[attr] = val - 1;
          improvements.push({ playerIndex, attribute: attr, change: -1 });
        }
      }
    }
  }

  // Non-attendees may lose stamina (5% chance per training day)
  for (let i = 0; i < squad.length; i++) {
    const attended = attendanceCounts.get(i) ?? 0;
    if (attended === 0 && rng.random() < 0.05) {
      const player = squad[i];
      if (player.stamina > 5) {
        player.stamina -= 1;
        improvements.push({ playerIndex: i, attribute: "stamina", change: -1 });
      }
    }
  }

  // Team chemistry from tactics training
  let chemistryChange = 0;
  if (plan.type === "tactics" && squad.length > 0) {
    const attendRate = [...attendanceCounts.values()].filter((v) => v > 0).length / squad.length;
    chemistryChange = Math.round(attendRate * 3);
  }

  // ── Jak hráčům sedí nastavený trénink ────────────────────────────────────────
  // Zátěž = kolik dnů v týdnu se trénuje. Každý hráč má svoje ideální tempo podle
  // pracovitosti, věku a aktuální kondice — dříč se při jednom tréninku týdně nudí,
  // pohodář a unavený veterán naopak reptá, když se dře pětkrát.
  const moraleChanges: TrainingResult["moraleChanges"] = [];
  const bump = (playerIndex: number, change: number, reason: string) => {
    const player = squad[playerIndex];
    const before = player.morale;
    player.morale = Math.max(0, Math.min(100, before + change));
    if (player.morale !== before) moraleChanges.push({ playerIndex, change: player.morale - before, reason });
  };

  const load = Math.max(0.5, Math.min(7, plan.weeklyLoad ?? plan.sessionsPerWeek));
  for (let i = 0; i < squad.length; i++) {
    const player = squad[i];
    const diff = load - idealTrainingLoad(player);
    if (diff >= 1.5 && rng.random() < 0.25) {
      bump(i, -2, "Dřina navíc mu nesedí");
    } else if (diff <= -1.5 && rng.random() < 0.2) {
      bump(i, -1, "Chtěl by trénovat víc");
    } else if (Math.abs(diff) <= 0.75 && rng.random() < 0.15) {
      bump(i, 1, "Tempo tréninku mu vyhovuje");
    }
  }

  // Přístup trenéra — přísnost sedne disciplinovaným, pohoda zvedne náladu všem
  if (plan.approach === "strict") {
    for (let i = 0; i < squad.length; i++) {
      if (squad[i].discipline < 50 && rng.random() < 0.1) bump(i, -2, "Přísný dril ho otravuje");
    }
  }
  if (plan.approach === "relaxed") {
    for (let i = 0; i < squad.length; i++) {
      if (rng.random() < 0.05) bump(i, 1, "Pohodová atmosféra na tréninku");
    }
  }

  const attendedCount = [...attendanceCounts.values()].filter((v) => v > 0).length;
  const descriptions = [
    `Na trénink dorazilo ${attendedCount} z ${squad.length} hráčů.`,
    `Trénink ${plan.type === "conditioning" ? "kondice" : plan.type === "technique" ? "techniky" : plan.type === "tactics" ? "taktiky" : "zápasový"}: účast ${attendedCount}/${squad.length}.`,
  ];

  return {
    attendance: allAttendance,
    improvements,
    teamChemistry: chemistryChange,
    moraleChanges,
    description: rng.pick(descriptions),
  };
}
