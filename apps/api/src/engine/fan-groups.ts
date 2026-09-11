/**
 * Fanouškovské skupiny, jejich vůdci a výtržnosti — katalog a čistá matematika.
 *
 * Vzor je `engine/referee.ts`: povahové osy jsou rozsahy `[min, max]`, ze kterých
 * generátor losuje, a všechna čísla mají JEDINÝ zdroj (`FAN_SKALY`), aby popisek
 * v UI nemohl slíbit něco jiného, než co spočítá engine.
 *
 * Tenhle soubor nesmí sáhnout na DB — všechno jsou čisté funkce, aby šly testovat
 * bez Workers runtime.
 *
 * Skupina NENÍ vlastní počet fanoušků. Je to pohled na `team_fanbase`
 * (hardcore/regular/casual): drží podíl na své vrstvě a velikost se dopočítává.
 * Jediným zdrojem návštěvnosti zůstává `season/fanbase-helpers.ts`.
 */

export type AxisRange = readonly [number, number];

// ── Skupiny ──────────────────────────────────────────────────────────────────

export type FanGroupKind = "kotel" | "stamgasti" | "rodiny" | "pametnici" | "parta_z_okoli";

/** Ze které vrstvy fanbáze skupina čerpá lidi. */
export type FanTier = "hardcore" | "regular" | "casual";

export type FanSector = "kotel" | "hlavni" | "za_branou";

export interface FanGroupDef {
  label: string;
  /** 1–2 věty do karty skupiny. */
  popis: string;
  tier: FanTier;
  /** Podíl na SVÉ vrstvě fanbáze. Součet podílů jedné vrstvy je záměrně < 1 —
   *  zbytek jsou lidi, co chodí sami za sebe a do žádné party nepatří. */
  shareRange: AxisRange;
  sector: FanSector;
  passion: AxisRange;
  aggression: AxisRange;
  loyalty: AxisRange;
  spending: AxisRange;
  noise: AxisRange;
  /** Archetypy, ze kterých se losuje vůdce téhle party. */
  leaders: readonly FanLeaderArchetype[];
  /** Šablony názvu; `{obec}` se nahradí jménem obce. */
  nameTemplates: readonly string[];
}

export const FAN_GROUPS: Record<FanGroupKind, FanGroupDef> = {
  kotel: {
    label: "Kotel",
    popis: "Mladí za brankou. Buben, vlajky a hlas, který slyší i sousední ves. Když se nudí, začnou vymýšlet.",
    tier: "hardcore",
    shareRange: [0.55, 0.7],
    sector: "kotel",
    passion: [80, 95], aggression: [55, 85], loyalty: [70, 90], spending: [25, 45], noise: [90, 100],
    leaders: ["stary_kapo", "mlady_radikal"],
    nameTemplates: ["{obec} Boys", "Kotel {obec}", "Ultras {obec}", "Sektor za brankou", "Divoká lavice"],
  },
  stamgasti: {
    label: "Štamgasti",
    popis: "Chlapi od výčepu. Přijdou hodinu před výkopem, odejdou hodinu po konci a mezitím prodiskutují sestavu.",
    tier: "regular",
    shareRange: [0.35, 0.5],
    sector: "hlavni",
    passion: [55, 75], aggression: [40, 70], loyalty: [75, 95], spending: [70, 95], noise: [50, 70],
    leaders: ["hospodsky_vudce", "predseda_fanklubu"],
    nameTemplates: ["Štamgasti od výčepu", "Parta od piva", "Křídlo u sudu", "Hospodská tribuna"],
  },
  rodiny: {
    label: "Rodiny s dětmi",
    popis: "Nedělní publikum s kočárky a limonádou. Utratí nejvíc na hlavu a zmizí první, když začne létat pyro.",
    tier: "casual",
    shareRange: [0.4, 0.55],
    sector: "hlavni",
    passion: [30, 50], aggression: [5, 15], loyalty: [40, 60], spending: [55, 80], noise: [25, 45],
    leaders: ["organizatorka", "predseda_fanklubu"],
    nameTemplates: ["Rodiče a děti", "Nedělní rodinka", "Kočárkov", "Tribuna s dětmi"],
  },
  pametnici: {
    label: "Pamětníci",
    popis: "Chodí sem od nepaměti a pamatují každou sezónu. Bordel v kotli berou jako osobní urážku.",
    tier: "regular",
    shareRange: [0.2, 0.3],
    sector: "hlavni",
    passion: [45, 65], aggression: [10, 25], loyalty: [85, 100], spending: [20, 35], noise: [20, 35],
    leaders: ["pametnik", "stary_kapo"],
    nameTemplates: ["Pamětníci {obec}", "Klub od roku 1974", "Lavička u plotu", "Staré gardy"],
  },
  parta_z_okoli: {
    label: "Parta z okolí",
    popis: "Přespolní, co jezdí autobusem. Doma nemají koho fandit, tak si vybrali vás — a berou to vážně.",
    tier: "hardcore",
    shareRange: [0.15, 0.25],
    sector: "za_branou",
    passion: [60, 80], aggression: [45, 75], loyalty: [50, 70], spending: [45, 65], noise: [60, 80],
    leaders: ["predseda_fanklubu", "mlady_radikal", "hospodsky_vudce"],
    nameTemplates: ["Parta z {obec}", "Autobusáci", "Přespolní", "Výjezd {obec}"],
  },
};

export const FAN_GROUP_KINDS = Object.keys(FAN_GROUPS) as FanGroupKind[];

export const SECTOR_LABELS: Record<FanSector, string> = {
  kotel: "Kotel za brankou",
  hlavni: "Hlavní tribuna",
  za_branou: "Sektor za brankou",
};

// ── Vůdci ────────────────────────────────────────────────────────────────────

export type FanLeaderArchetype =
  | "stary_kapo" | "mlady_radikal" | "predseda_fanklubu"
  | "hospodsky_vudce" | "organizatorka" | "pametnik";

export interface FanLeaderArchetypeDef {
  label: string;
  bio: string;
  /** Hláška na kartu vůdce. */
  hlaska: string;
  ageRange: AxisRange;
  /** Jak moc táhne skupinu za sebou — násobí dopad jeho nálady na náladu skupiny. */
  charisma: AxisRange;
  /** Posouvá závažnost výtržnosti nahoru. */
  radikalnost: AxisRange;
  /** Jak dobře se s ním manažer domluví. */
  vyjednavani: AxisRange;
  occupations: readonly string[];
  /** Ženské tvary — bez nich by z organizátorky byl „starý kápo, hospodský". */
  labelF: string;
  bioF: string;
  hlaskaF: string;
  occupationsF: readonly string[];
  /** Podíl žen u tohohle archetypu. Kotel v okrese vede chlap skoro vždycky. */
  femaleShare: number;
}

export const FAN_LEADER_ARCHETYPES: Record<FanLeaderArchetype, FanLeaderArchetypeDef> = {
  stary_kapo: {
    label: "Starý kápo",
    bio: "Vede kotel od devadesátek. Umí ho rozjet i utišit — a ví, kdy je co potřeba.",
    hlaska: "Klid, kluci. Dneska ne.",
    ageRange: [48, 62],
    charisma: [70, 90], radikalnost: [30, 50], vyjednavani: [55, 75],
    occupations: ["svářeč", "mistr v pile", "řidič náklaďáku", "zedník", "údržbář v mlékárně"],
    labelF: "Stará kápo",
    bioF: "Vede kotel od devadesátek. Umí ho rozjet i utišit — a ví, kdy je co potřeba.",
    hlaskaF: "Klid, kluci. Dneska ne.",
    occupationsF: ["svářečka", "mistrová v pile", "řidička náklaďáku", "zednice", "údržbářka v mlékárně"],
    femaleShare: 0.05,
  },
  mlady_radikal: {
    label: "Mladý radikál",
    bio: "Pyro nosí v batohu a v jednání vidí zradu. Domluvit se s ním jde jedině přes kotel, ne přes kancelář.",
    hlaska: "My si mluvit nenecháme zakázat.",
    ageRange: [19, 27],
    charisma: [55, 80], radikalnost: [75, 95], vyjednavani: [10, 30],
    occupations: ["učeň automechanik", "skladník", "brigádník na pile", "student průmyslovky", "montér"],
    labelF: "Mladá radikálka",
    bioF: "Pyro nosí v batohu a v jednání vidí zradu. Domluvit se s ní jde jedině přes kotel, ne přes kancelář.",
    hlaskaF: "My si mluvit nenecháme zakázat.",
    occupationsF: ["učednice v autoservisu", "skladnice", "brigádnice na pile", "studentka průmyslovky", "montérka"],
    femaleShare: 0.12,
  },
  predseda_fanklubu: {
    label: "Předseda fanklubu",
    bio: "Má stanovy, razítko a seznam členů. Přijde s tabulkou a odejde s příspěvkem na autobus.",
    hlaska: "Mám to sepsané, stačí podepsat.",
    ageRange: [35, 52],
    charisma: [50, 70], radikalnost: [15, 35], vyjednavani: [75, 95],
    occupations: ["účetní", "pojišťovák", "vedoucí pobočky", "obecní úředník", "obchodní zástupce"],
    labelF: "Předsedkyně fanklubu",
    bioF: "Má stanovy, razítko a seznam členů. Přijde s tabulkou a odejde s příspěvkem na autobus.",
    hlaskaF: "Mám to sepsané, stačí podepsat.",
    occupationsF: ["účetní", "pojišťovačka", "vedoucí pobočky", "obecní úřednice", "obchodní zástupkyně"],
    femaleShare: 0.3,
  },
  hospodsky_vudce: {
    label: "Hospodský vůdce",
    bio: "Vliv má přes pípu — co řekne u výčepu, to platí na tribuně. Po prohře je s ním potíž.",
    hlaska: "To si probereme po zápase. U mě.",
    ageRange: [40, 58],
    charisma: [65, 85], radikalnost: [45, 70], vyjednavani: [45, 70],
    occupations: ["hospodský", "řezník", "provozní pivovaru", "prodavač v železářství", "taxikář"],
    labelF: "Hospodská vůdkyně",
    bioF: "Vliv má přes pípu — co řekne u výčepu, to platí na tribuně. Po prohře je s ní potíž.",
    hlaskaF: "To si probereme po zápase. U mě.",
    occupationsF: ["hospodská", "řeznice", "provozní pivovaru", "prodavačka v železářství", "taxikářka"],
    femaleShare: 0.25,
  },
  organizatorka: {
    label: "Organizátorka",
    bio: "Dětský den, malování na obličej, buchty do bufetu. Pyrotechnika je pro ni konec debaty.",
    hlaska: "Tady chodí děti, prosím vás.",
    ageRange: [32, 48],
    charisma: [55, 75], radikalnost: [5, 20], vyjednavani: [70, 90],
    occupationsF: ["učitelka v mateřské škole", "zdravotní sestra", "vedoucí knihovny", "kadeřnice", "poštovní doručovatelka"],
    labelF: "Organizátorka",
    bioF: "Dětský den, malování na obličej, buchty do bufetu. Pyrotechnika je pro ni konec debaty.",
    hlaskaF: "Tady chodí děti, prosím vás.",
    occupations: ["učitel v mateřské škole", "zdravotník", "vedoucí knihovny", "holič", "poštovní doručovatel"],
    femaleShare: 0.85,
  },
  pametnik: {
    label: "Pamětník",
    bio: "Chodí sem od roku 1974 a pamatuje i to, co v kronice není. Morální autorita, kterou nikdo nechce naštvat.",
    hlaska: "Za nás se tohle nedělalo.",
    ageRange: [62, 78],
    charisma: [45, 70], radikalnost: [5, 15], vyjednavani: [60, 85],
    occupations: ["důchodce, bývalý strojvedoucí", "důchodce, bývalý kronikář", "důchodce, bývalý traktorista", "důchodce, bývalý učitel"],
    labelF: "Pamětnice",
    bioF: "Chodí sem od roku 1974 a pamatuje i to, co v kronice není. Morální autorita, kterou nikdo nechce naštvat.",
    hlaskaF: "Za nás se tohle nedělalo.",
    occupationsF: ["důchodkyně, bývalá výpravčí", "důchodkyně, bývalá kronikářka", "důchodkyně, bývalá švadlena", "důchodkyně, bývalá učitelka"],
    femaleShare: 0.4,
  },
};

/** Popisek archetypu v rodě podle pohlaví. */
export function fanLeaderArchetypeLabel(key: string, gender?: string): string {
  const def = FAN_LEADER_ARCHETYPES[key as FanLeaderArchetype];
  if (!def) return key;
  return gender === "f" ? def.labelF : def.label;
}

// ── Číselné škály — JEDINÝ ZDROJ ─────────────────────────────────────────────

/**
 * Čísla, ze kterých počítá engine i popisky v UI.
 *
 * Pole indexovaná úrovní vybavení jsou KUMULATIVNÍ (hodnota úrovně, ne přírůstek) —
 * stejná konvence jako `SKALY` ve `stadium/stadium-generator.ts`.
 */
export const FAN_SKALY = {
  /** Šance, že skupina s agresivitou 100 a nulovým heatem něco provede na domácím zápase. */
  BASE_RATE: 0.06,
  /** Nad tuhle šanci se jedna skupina za jeden zápas nedostane — jinak by derby
   *  s naštvaným kotlem znamenalo výtržnost pokaždé a hráč by ztratil pocit, že to ovlivní. */
  MAX_RATE: 0.45,
  /** Skupina menší než tolik lidí sama o sobě bordel neudělá. */
  MIN_SIZE: 12,

  /**
   * Šacování u vstupu a kamery nad kotlem partu štvou. Za každý domácí zápas
   * tolik heatu — proto nejvyšší ochranka není jen bezpečná volba.
   * Index = úroveň pořadatelské služby.
   */
  KOTEL_HEAT_ZA_OCHRANKU: [0, 0, 1, 2],

  /** Násobiče rizika. */
  MOD: {
    /** Naštvanost na vedení při heat = 100. */
    heat: 1.0,
    /** Derby (heat manažerů ≥ DERBY_HEAT_THRESHOLD). */
    derby: 0.6,
    /** Domácí prohrávají / prohráli. */
    losing: 0.35,
    /** Plná dávka piva na diváka. */
    beer: 0.4,
    /** Hostující kotel o velikosti 200 lidí. */
    awayUltrasPer200: 0.5,
    /** Tifo rozpálí kotel — příspěvek na choreo zvedne i riziko pyro. */
    tifo: 0.3,
    /** Nálada pod 30 přidá, nad 70 ubere. */
    moodSwing: 0.25,
  },

  /** Sektor uzavřený za trest — kolik z hlasu skupiny zbude. */
  CLOSED_SECTOR_NOISE: 0.15,

  /**
   * Kde parta stojí. U hostů je na dosah strkanice, na hlavní tribuně sedí mezi
   * rodinami a moc si nedovolí. Bez tohohle byl přesun sektoru za 3 000 Kč
   * tlačítko, které nedělalo nic.
   */
  SEKTOR_RIZIKO: { kotel: 1.0, hlavni: 0.75, za_branou: 1.3 } as Record<FanSector, number>,
  /** Hlas party podle sektoru — z hlavní tribuny se bubnovat nedá. */
  SEKTOR_HLAS: { kotel: 1.0, hlavni: 0.6, za_branou: 0.9 } as Record<FanSector, number>,

  /** Kolem téhle nálady a vášně se parta chová „normálně". */
  NEUTRAL: { mood: 50, passion: 55, spending: 55 },
} as const;

// ── Výtržnosti ───────────────────────────────────────────────────────────────

export type FanIncidentKind =
  | "pyro" | "hazeni" | "pokriky" | "bitka_kotle" | "vniknuti" | "skoda" | "vyhrozovani";

export interface FanIncidentDef {
  label: string;
  /** Jak vážný ten skutek vůbec může být. */
  severityRange: AxisRange;
  /** Pokuta podle závažnosti; index 0 se nepoužívá (závažnost je 1–3). */
  fine: readonly number[];
  /** Na kolik zápasů se zavře sektor. */
  closeSector: readonly number[];
  /** Jaký podíl skupiny odejde a přestane chodit. */
  fansLostShare: readonly number[];
  /** Dopad na morálku mužstva. Kotel umí tým i nakopnout, proto může být kladný. */
  morale: readonly number[];
  /** Které party tohle dělají a jak často. Chybí-li klíč, ta skupina to nedělá vůbec. */
  weightByGroup: Partial<Record<FanGroupKind, number>>;
  /** Skutek dává smysl jen když dorazil hostující kotel. */
  needsAwayUltras?: boolean;
  /**
   * Texty do hlášení. `{skupina}` a `{vudce}` se nahradí.
   *
   * Dvě pravidla, která hlídá test „texty výtržností jsou česky":
   *  • `{skupina}` je NESKLOŇOVATELNÉ vlastní jméno („Břevnov Boys"), takže smí
   *    stát jen po slově, které pád nese za něj — „parta", „party", „stojí".
   *    Jinak vznikne „Ze Břevnov Boys vběhl někdo na hřiště".
   *  • Po `{vudce}` jen PŘÍTOMNÝ čas. Vůdce může být žena a minulý čas by se
   *    v češtině musel shodovat v rodě („{vudce} nezastavil" u organizátorky).
   */
  texty: readonly string[];
}

export const FAN_INCIDENTS: Record<FanIncidentKind, FanIncidentDef> = {
  pyro: {
    label: "Pyrotechnika v sektoru",
    severityRange: [1, 2],
    fine: [0, 1500, 5000, 9000],
    closeSector: [0, 0, 0, 1],
    fansLostShare: [0, 0.01, 0.03, 0.05],
    morale: [0, 2, 1, -1],
    weightByGroup: { kotel: 5, parta_z_okoli: 2 },
    texty: [
      "V sektoru, kde stojí parta {skupina}, hořely světlice a hra se na chvíli zastavila kvůli kouři.",
      "Z kotle vyletěly dýmovnice — {vudce} tvrdí, že to bylo choreo, delegát to vidí jinak.",
      "Hned po gólu odpálili pyro. Krásné to bylo, levné ne.",
    ],
  },
  hazeni: {
    label: "Házení předmětů na hrací plochu",
    severityRange: [1, 3],
    fine: [0, 3000, 6000, 10000],
    closeSector: [0, 0, 1, 2],
    fansLostShare: [0, 0.02, 0.05, 0.09],
    morale: [0, -1, -3, -5],
    weightByGroup: { kotel: 3, stamgasti: 2, parta_z_okoli: 2 },
    texty: [
      "Ze sektoru, kde stojí parta {skupina}, přiletěl na hřiště kelímek.",
      "Po sporném verdiktu začalo z tribuny létat na plochu, co komu přišlo pod ruku.",
      "Na trávník dopadla plechovka od piva — {vudce} se za to omlouvá, delegát si to zapsal.",
    ],
  },
  pokriky: {
    label: "Urážlivé pokřiky",
    severityRange: [1, 2],
    fine: [0, 2000, 6000, 9000],
    closeSector: [0, 0, 0, 1],
    fansLostShare: [0, 0.01, 0.04, 0.07],
    morale: [0, 0, -2, -3],
    weightByGroup: { kotel: 4, stamgasti: 3, parta_z_okoli: 2 },
    texty: [
      "Z party {skupina} se nesly pokřiky, které delegát do zápisu opsat nechtěl.",
      "Z tribuny se ozývalo něco, co v okresním přeboru nemá co dělat. Za to se platí.",
      "{vudce} pokřiky neumlčí a delegát to má v zápise.",
    ],
  },
  bitka_kotle: {
    label: "Rvačka s hostujícím kotlem",
    severityRange: [2, 3],
    fine: [0, 6000, 9000, 13000],
    closeSector: [0, 1, 2, 3],
    fansLostShare: [0, 0.05, 0.09, 0.15],
    morale: [0, -3, -5, -8],
    weightByGroup: { kotel: 4, parta_z_okoli: 3 },
    needsAwayUltras: true,
    texty: [
      "U plotu se parta {skupina} srazila s hostujícím kotlem. Rozdělit je trvalo deset minut.",
      "Za brankou to vzplálo — {vudce} tvrdí, že začali oni.",
      "Strkanice s hosty přerostla v rvačku a zápas se musel na chvíli přerušit.",
    ],
  },
  vniknuti: {
    label: "Vniknutí na hrací plochu",
    severityRange: [2, 3],
    fine: [0, 4000, 8000, 12000],
    closeSector: [0, 0, 1, 2],
    fansLostShare: [0, 0.02, 0.05, 0.08],
    morale: [0, -2, -4, -6],
    weightByGroup: { kotel: 3, parta_z_okoli: 1 },
    texty: [
      "Někdo z party {skupina} vběhl na hřiště a rozhodčí přerušil hru.",
      "Na plochu se dostali dva lidé z kotle. Pořadatelé je vyváděli za pískotu tribuny.",
      "{vudce} to ještě zkouší uklidnit, ale na trávníku už stojí první z nich.",
    ],
  },
  skoda: {
    label: "Poškození zařízení stadionu",
    severityRange: [1, 3],
    fine: [0, 2000, 5000, 8000],
    closeSector: [0, 0, 0, 1],
    fansLostShare: [0, 0.01, 0.02, 0.04],
    morale: [0, 0, -1, -2],
    weightByGroup: { kotel: 3, stamgasti: 2, parta_z_okoli: 2 },
    texty: [
      "Z party {skupina} zbyl na tribuně vylomený kus zábradlí. Opravu zaplatí klub.",
      "Po zápase zbyly z laviček v sektoru třísky.",
      "Někdo od party {skupina} vykopl dveře na záchodcích. Klasika.",
    ],
  },
  vyhrozovani: {
    label: "Vyhrožování rozhodčímu",
    severityRange: [2, 3],
    fine: [0, 4000, 7000, 11000],
    closeSector: [0, 0, 1, 1],
    fansLostShare: [0, 0.01, 0.03, 0.05],
    morale: [0, -1, -2, -4],
    weightByGroup: { kotel: 3, stamgasti: 2, pametnici: 1 },
    texty: [
      "Na rozhodčího čekala u kabin parta {skupina}. Bitkou to neskončilo, ale klidné to nebylo.",
      "Na sudího se ze sektoru sneslo tolik výhrůžek, že si to napsal do zápisu.",
      "{vudce} křičí na rozhodčího věci, které delegát ocitoval doslova.",
    ],
  },
};

export const FAN_INCIDENT_KINDS = Object.keys(FAN_INCIDENTS) as FanIncidentKind[];

// ── Matematika rizika ────────────────────────────────────────────────────────

export interface IncidentGroupState {
  kind: FanGroupKind;
  aggression: number;
  heat: number;
  mood: number;
  size: number;
  /** Sektor je za trest zavřený — lidi se dovnitř nedostanou. */
  sectorClosed: boolean;
}

export interface IncidentContext {
  group: IncidentGroupState;
  /** Kde parta na stadionu stojí. */
  sector: FanSector;
  /** Radikálnost vůdce 0–100; bez vůdce se bere 50. */
  leaderRadikalnost: number | null;
  /** Vzájemný heat manažerů ≥ DERBY_HEAT_THRESHOLD. */
  derby: boolean;
  /** Domácí zápas nezvládli. */
  homeLosing: boolean;
  /** Kolik piva padlo na jednoho diváka, 0–1 (1 = každý měl aspoň jedno). */
  beerPerAttendee: number;
  /** Kolik hostujících ultras dorazilo. */
  awayUltrasSize: number;
  /**
   * Hotová čísla z `calculateFacilityEffects`, ne úrovně vybavení.
   *
   * Škály pořadatelské služby a oplocení vlastní `stadium/stadium-generator.ts`
   * (`SKALY`) — jediný zdroj čísel vybavení. Kdyby si je engine držel taky,
   * rozešly by se s tím, co slibuje nabídka upgradu.
   */
  securityRiskReduction: number;
  sectorSeparation: number;
  /** Klub zaplatil choreo na tenhle zápas. */
  tifo: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Šance, že tahle skupina na tomhle zápase něco provede. 0–`MAX_RATE`.
 *
 * Ochranka a oplocení jsou jediné dvě věci, které to srážejí strukturálně — všechno
 * ostatní je situace nebo důsledek toho, jak se manažer ke skupině chová. Bez toho
 * by výtržnost byla náhodná daň, a přesně to nechceme.
 */
export function incidentChance(ctx: IncidentContext): number {
  const g = ctx.group;
  if (g.size < FAN_SKALY.MIN_SIZE) return 0;
  if (g.sectorClosed) return 0;

  const M = FAN_SKALY.MOD;
  let p = FAN_SKALY.BASE_RATE * (g.aggression / 100);

  p *= 1 + (g.heat / 100) * M.heat;
  if (ctx.derby) p *= 1 + M.derby;
  if (ctx.homeLosing) p *= 1 + M.losing;
  p *= 1 + Math.max(0, Math.min(1, ctx.beerPerAttendee)) * M.beer;
  p *= 1 + (Math.max(0, ctx.awayUltrasSize) / 200) * M.awayUltrasPer200;
  if (ctx.tifo) p *= 1 + M.tifo;

  // Nálada táhne oběma směry: spokojená parta nemá důvod, naštvaná hledá záminku.
  p *= 1 + ((50 - Math.max(0, Math.min(100, g.mood))) / 50) * M.moodSwing;

  p *= FAN_SKALY.SEKTOR_RIZIKO[ctx.sector] ?? 1;
  p *= 1 - clamp01(ctx.securityRiskReduction);
  p *= 1 - clamp01(ctx.sectorSeparation);

  return Math.max(0, Math.min(FAN_SKALY.MAX_RATE, p));
}

/** Váhy skutků, které tahle skupina za daných okolností vůbec může provést. */
export function incidentWeights(
  kind: FanGroupKind,
  opts: { awayUltrasPresent: boolean; sector: FanSector },
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of FAN_INCIDENT_KINDS) {
    const def = FAN_INCIDENTS[k];
    if (def.needsAwayUltras && !opts.awayUltrasPresent) continue;
    // Od hlavní tribuny se k hostujícímu kotli nikdo neprobojuje.
    if (def.needsAwayUltras && opts.sector === "hlavni") continue;
    const w = def.weightByGroup[kind];
    if (w && w > 0) out[k] = w;
  }
  return out;
}

/**
 * Závažnost skutku 1–3.
 *
 * Ochranka nesrazí šanci na nulu, ale profesionálové na place uhasí věc dřív, než
 * se rozjede — proto snižuje stupeň, ne jen pravděpodobnost.
 */
export function rollSeverity(
  roll: number,
  dropRoll: number,
  kind: FanIncidentKind,
  opts: { aggression: number; leaderRadikalnost: number; severityDropChance: number },
): number {
  const def = FAN_INCIDENTS[kind];
  const [lo, hi] = def.severityRange;
  // Sklon k horšímu konci roste s agresivitou party a radikálností jejího vůdce.
  const bias = (opts.aggression / 100) * 0.6 + (opts.leaderRadikalnost / 100) * 0.4;
  const span = hi - lo;
  let sev = lo + Math.round(span * (roll * 0.5 + bias * 0.5));
  sev = Math.max(lo, Math.min(hi, sev));

  if (sev > 1 && dropRoll < clamp01(opts.severityDropChance)) sev -= 1;
  return sev;
}

/**
 * Pokuta v korunách.
 *
 * Škáluje se reputací klubu, protože svaz nesází stejnou částku vesnici s rozpočtem
 * na dresy a klubu, co hraje o postup. Rep 50 = tabulková hodnota.
 */
export function fineFor(kind: FanIncidentKind, severity: number, reputation: number): number {
  const base = FAN_INCIDENTS[kind].fine[Math.max(1, Math.min(3, severity))] ?? 0;
  const mul = 0.6 + Math.max(0, Math.min(100, reputation)) / 125;
  return Math.round((base * mul) / 100) * 100;
}

/** Následky skutku, spočítané z katalogu. */
export interface IncidentOutcome {
  kind: FanIncidentKind;
  severity: number;
  label: string;
  fine: number;
  closeSectorMatches: number;
  fansLost: number;
  moraleDelta: number;
}

export function incidentOutcome(
  kind: FanIncidentKind,
  severity: number,
  opts: { reputation: number; groupSize: number },
): IncidentOutcome {
  const def = FAN_INCIDENTS[kind];
  const s = Math.max(1, Math.min(3, severity));
  return {
    kind,
    severity: s,
    label: def.label,
    fine: fineFor(kind, s, opts.reputation),
    closeSectorMatches: def.closeSector[s] ?? 0,
    fansLost: Math.round(Math.max(0, opts.groupSize) * (def.fansLostShare[s] ?? 0)),
    moraleDelta: def.morale[s] ?? 0,
  };
}

/**
 * Kolik z hlasu skupiny dorazí k mužstvu.
 *
 * Uzavřený sektor nechá jen ozvěnu — je to trest, který je vidět na hřišti,
 * ne jen v účetnictví.
 */
export function groupNoiseShare(g: { noise: number; mood: number; sectorClosed: boolean }): number {
  const base = (g.noise / 100) * (0.6 + (Math.max(0, Math.min(100, g.mood)) / 100) * 0.4);
  return g.sectorClosed ? base * FAN_SKALY.CLOSED_SECTOR_NOISE : base;
}

// ── Co party dělají se zápasem ───────────────────────────────────────────────

/** Stav party tak, jak ho potřebuje výpočet dopadů na zápas. */
export interface GroupMatchState {
  size: number;
  mood: number;
  passion: number;
  spending: number;
  noise: number;
  sector: FanSector;
  sectorClosed: boolean;
  /** 0–0.5, sleva na vstupné pro tenhle sektor. */
  ticketDiscount: number;
}

export interface FanGroupMatchEffects {
  /** Násobitel návštěvnosti. Zavřený sektor nepřijde, spokojení a zlevnění přijdou spíš. */
  attendanceMul: number;
  /** Přídavek k domácí výhodě ve stejných jednotkách jako `homeAdvantageFromFanbase().total`. */
  noiseBonus: number;
  /** Násobitel poptávky v bufetu. */
  concessionMul: number;
  /** Podíl výnosu ze vstupného, který zbude po slevách pro sektory. */
  ticketRevenueMul: number;
  /** Kolik lidí se kvůli uzavřenému sektoru na stadion nedostane. */
  lockedOut: number;
}

export const NEUTRAL_GROUP_EFFECTS: FanGroupMatchEffects = {
  attendanceMul: 1,
  noiseBonus: 0,
  concessionMul: 1,
  ticketRevenueMul: 1,
  lockedOut: 0,
};

/**
 * Co party udělají s jedním domácím zápasem.
 *
 * Tohle je místo, kde se z osy v databázi stane něco, co hráč pozná. Bez něj byly
 * `noise`, `spending`, `passion`, `sector` i `ticket_discount` jen čísla v tabulce:
 * přesun sektoru nic nedělal a sleva pro kotel nestála klub ani korunu.
 *
 * Všechno jsou ODCHYLKY od průměrné party, ne absolutní hodnoty — klub s pěti
 * obyčejnými partami vyjde na 1,0 a ekonomika se nehne. Teprve když se party
 * rozejdou od průměru, začne to být znát.
 */
export function fanGroupMatchEffects(groups: readonly GroupMatchState[]): FanGroupMatchEffects {
  const celkem = groups.reduce((s, g) => s + Math.max(0, g.size), 0);
  if (celkem <= 0) return NEUTRAL_GROUP_EFFECTS;

  const N = FAN_SKALY.NEUTRAL;
  let attendance = 1;
  let hlas = 0;
  let concession = 1;
  let slevy = 0;
  let lockedOut = 0;

  for (const g of groups) {
    const podil = Math.max(0, g.size) / celkem;
    if (podil <= 0) continue;

    if (g.sectorClosed) {
      // Zavřený sektor = tihle lidé nepřijdou vůbec. Nic dalšího se u nich nepočítá.
      attendance -= podil;
      lockedOut += Math.max(0, g.size);
      hlas += groupNoiseShare({ noise: g.noise, mood: g.mood, sectorClosed: true }) * podil
        * (FAN_SKALY.SEKTOR_HLAS[g.sector] ?? 1);
      continue;
    }

    attendance += podil * (((g.mood - N.mood) / 100) * 0.25
      + ((g.passion - N.passion) / 100) * 0.3
      + clamp01(g.ticketDiscount) * 0.4);

    hlas += groupNoiseShare({ noise: g.noise, mood: g.mood, sectorClosed: false }) * podil
      * (FAN_SKALY.SEKTOR_HLAS[g.sector] ?? 1);

    concession += podil * ((g.spending - N.spending) / 100) * 0.5;
    slevy += podil * clamp01(g.ticketDiscount);
  }

  return {
    attendanceMul: Math.max(0.4, Math.min(1.4, attendance)),
    // Odečítá se hlas průměrné party, aby normální klub dostal nulu a ne trvalý bonus.
    noiseBonus: Math.max(-1, Math.min(1, (hlas - 0.42) * 2.5)),
    concessionMul: Math.max(0.6, Math.min(1.5, concession)),
    ticketRevenueMul: Math.max(0.5, 1 - slevy),
    lockedOut,
  };
}

/** Nálada slovem — pro UI, aby se nikde nepočítala podruhé. */
export function moodWord(mood: number): string {
  if (mood >= 80) return "nadšení";
  if (mood >= 60) return "spokojení";
  if (mood >= 40) return "vlažní";
  if (mood >= 20) return "nespokojení";
  return "na pokraji vzpoury";
}

/** Naštvanost na vedení slovem. */
export function heatWord(heat: number): string {
  if (heat >= 75) return "otevřeně proti vedení";
  if (heat >= 50) return "napjatý vztah";
  if (heat >= 25) return "reptají";
  return "klid";
}
