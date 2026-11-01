/**
 * Trenér: vztah hráčů k němu, dopady jeho vlastností, licence a kurzy.
 *
 * Sdílené mezi serverem a webem, aby profil trenéra ukazoval přesně ta čísla,
 * se kterými počítá hra. Správné odpovědi testů sem NEPATŘÍ (web by je viděl).
 */

// ── Vztah hráče k trenérovi (players.coach_relationship, 0–100) ──

export type CoachRelationBandKey = "idol" | "loyal" | "neutral" | "skeptic" | "hostile";

export interface CoachRelationBand {
  key: CoachRelationBandKey;
  label: string;
  icon: string;
  tone: "good" | "neutral" | "bad";
}

const COACH_RELATION_BANDS: Array<CoachRelationBand & { min: number }> = [
  { min: 80, key: "idol", label: "Jste kamarádi", icon: "❤️", tone: "good" },
  { min: 60, key: "loyal", label: "Má tě rád", icon: "👍", tone: "good" },
  { min: 40, key: "neutral", label: "Bere tě", icon: "🤝", tone: "neutral" },
  { min: 20, key: "skeptic", label: "Nemá tě rád", icon: "🙄", tone: "bad" },
  { min: 0, key: "hostile", label: "Nesnáší tě", icon: "💢", tone: "bad" },
];

/**
 * Slovní pásmo vztahu. Hranice 80/60/40/20 platí v kádru, na profilu hráče i v Kabině.
 * Popisky jsou řečí hráče k trenérovi (2026-10-19), číslo vztahu se v UI neukazuje.
 */
export function coachRelationBand(value: number): CoachRelationBand {
  const band = COACH_RELATION_BANDS.find((b) => value >= b.min) ?? COACH_RELATION_BANDS[COACH_RELATION_BANDS.length - 1];
  return { key: band.key, label: band.label, icon: band.icon, tone: band.tone };
}

export const COACH_RELATION_BAND_ORDER: CoachRelationBandKey[] = ["idol", "loyal", "neutral", "skeptic", "hostile"];

export function coachRelationBandByKey(key: CoachRelationBandKey): CoachRelationBand {
  const band = COACH_RELATION_BANDS.find((b) => b.key === key) ?? COACH_RELATION_BANDS[2];
  return { key: band.key, label: band.label, icon: band.icon, tone: band.tone };
}

// ── Dopady vlastností trenéra ──
//
// Neutrální bod je 40: trenér se čtyřicítkou hraje jako dřív, než vlastnosti
// dostaly plný dopad. Server počítá přesně těmito funkcemi, profil je jen ukazuje.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Math.round vrací u malých záporných čísel −0; v UI by pak svítilo „−0". */
const roundInt = (v: number) => Math.round(v) || 0;

/** Koučink: násobek šance na zlepšení v tréninku. 40 = 1,12, 60 = 1,28, 99 = 1,59. */
export function coachingTrainingMul(coaching: number): number {
  return 0.8 + (coaching / 100) * 0.8;
}

/** Práce s mládeží: násobek tréninku hráčů do 22 let. 40 = 1,14, 60 = 1,26. */
export function youthTrainingMul(youth: number): number {
  return 0.9 + (youth / 100) * 0.6;
}

/** Práce s mládeží: přídavek k růstu hráčů do 22 let z odehraných minut. 40 = 0, 60 = +0,10. */
export function youthMatchGrowthMod(youth: number): number {
  return (youth - 40) / 200;
}

/** Disciplína: posun docházky na trénink (podíl, ±0,1). */
export function disciplineAttendanceMod(discipline: number): number {
  return clamp(((discipline - 40) / 100) * 0.2, -0.1, 0.1);
}

/** Disciplína: násobek šance na faul hráčů týmu. 40 = 1, 60 = 0,95, 99 = 0,85. */
export function disciplineFoulMul(discipline: number): number {
  return 1 - (discipline - 40) * 0.0025;
}

/** Disciplína: násobek šance na žlutou kartu. 40 = 1, 60 = 0,93, 99 = 0,79. */
export function disciplineCardMul(discipline: number): number {
  return 1 - (discipline - 40) * 0.0035;
}

/** Disciplína: násobek průšvihů v hospodě (rvačky, kocoviny). 40 = 1, 99 = 0,65. */
export function disciplinePubExcessMul(discipline: number): number {
  return clamp(1 - (discipline - 40) * 0.006, 0.6, 1.2);
}

/** Taktika: bonus k přihrávkám a obraně celé sestavy v zápase. 10 = −2, 40 = 0, 60 = +1, 99 = +4. */
export function tacticsMatchBonus(tactics: number): number {
  return clamp(roundInt((tactics - 40) / 15), -2, 4);
}

/** Taktika: násobek růstu sehranosti formace (zápasy i taktický trénink). */
export function tacticsFamiliarityMul(tactics: number): number {
  return clamp(1 + (tactics - 40) / 100, 0.7, 1.6);
}

/** Motivace: morálka celé sestavy před výkopem. 40 = +1, 60 = +3, 99 = +6. */
export function motivationMoraleBonus(motivation: number): number {
  return Math.max(0, Math.floor((motivation - 30) / 10));
}

/** Motivace: o kolik menší je zklamání hráče, který nejede na zápas (podíl; záporné = větší). */
export function motivationLeftOutSoftening(motivation: number): number {
  return clamp((motivation - 40) / 150, -0.1, 0.4);
}

/** Motivace: posun šance, že nenominovaný hráč začne trucovat (absolutně, −0,2 až +0,05). */
export function motivationSulkMod(motivation: number): number {
  return -clamp((motivation - 40) / 300, -0.05, 0.2) || 0;
}

/**
 * Kolik bodů vztahu k trenérovi stojí další nenominace v řadě.
 * `previousStreak` = kolikrát v řadě už předtím nejel (první nenominace se neúčtuje).
 */
export function leftOutRelationDrop(previousStreak: number, motivation: number): number {
  if (previousStreak < 1) return 0;
  return Math.min(4, Math.max(1, Math.round(previousStreak * (1 - motivationLeftOutSoftening(motivation)))));
}

export interface CoachStanding {
  reputation: number;
  licence: number;
}

/** Reputace a licence trenéra: kolik bodů zájmu přidá kupující trenér proti prodávajícímu. */
export function coachTransferPull(buyer: CoachStanding, seller: CoachStanding): number {
  return clamp((buyer.reputation - seller.reputation) * 0.25 + (buyer.licence - seller.licence) * 2, -8, 10);
}

/** Reputace a licence trenéra: body k šanci, že volný hráč podepíše. 40 bez licence = 0. */
export function coachSigningFactor(coach: CoachStanding): number {
  return clamp(roundInt((coach.reputation - 40) * 0.3) + coach.licence * 2, -6, 14);
}

// ── Popisky dopadů na profil trenéra ──

export type CoachAttrKey = "coaching" | "motivation" | "tactics" | "youthDevelopment" | "discipline" | "reputation";

export interface CoachAttributeEffect {
  key: CoachAttrKey;
  label: string;
  value: number;
  lines: string[];
}

const fmtNum = (v: number, digits = 2) => v.toFixed(digits).replace(".", ",");
const fmtMul = (v: number) => `×${fmtNum(v)}`;
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");
const pct = (v: number) => roundInt(v * 100);
/** „+1 procentní bod", „−3 procentní body", „+7 procentních bodů", nula „beze změny". */
const pp = (v: number) => {
  if (v === 0) return "beze změny";
  const n = Math.abs(v);
  const unit = n === 1 ? "procentní bod" : n <= 4 ? "procentní body" : "procentních bodů";
  return `${signed(v)} ${unit}`;
};

export function coachAttributeEffects(m: {
  coaching: number;
  motivation: number;
  tactics: number;
  youthDevelopment: number;
  discipline: number;
  reputation: number;
  licence?: number;
}): CoachAttributeEffect[] {
  const foul = pct(disciplineFoulMul(m.discipline) - 1);
  // Karta padá jen z faulu, takže celkový úbytek karet je součin obou násobků.
  const card = pct(disciplineCardMul(m.discipline) * disciplineFoulMul(m.discipline) - 1);
  const pub = pct(disciplinePubExcessMul(m.discipline) - 1);
  const soften = pct(motivationLeftOutSoftening(m.motivation));
  const sulk = pct(motivationSulkMod(m.motivation));
  const youthGrowth = pct(youthMatchGrowthMod(m.youthDevelopment));
  const tb = tacticsMatchBonus(m.tactics);

  return [
    {
      key: "coaching", label: "Koučink", value: m.coaching,
      lines: [`Šance na zlepšení v tréninku ${fmtMul(coachingTrainingMul(m.coaching))}`],
    },
    {
      key: "motivation", label: "Motivace", value: m.motivation,
      lines: [
        `Morálka sestavy před výkopem +${motivationMoraleBonus(m.motivation)}`,
        soften >= 0
          ? `Zklamání hráčů, kteří nejedou na zápas, o ${soften} % menší`
          : `Zklamání hráčů, kteří nejedou na zápas, o ${-soften} % větší`,
        `Šance, že nenominovaný začne trucovat: ${pp(sulk)}`,
        "Spolu s reputací a formou drží fanoušky",
      ],
    },
    {
      key: "tactics", label: "Taktika", value: m.tactics,
      lines: [
        `Přihrávky a obrana celé sestavy v zápase ${signed(tb)}`,
        `Sehranost formace roste ${fmtMul(tacticsFamiliarityMul(m.tactics))}`,
      ],
    },
    {
      key: "youthDevelopment", label: "Práce s mládeží", value: m.youthDevelopment,
      lines: [
        `Trénink hráčů do 22 let ${fmtMul(youthTrainingMul(m.youthDevelopment))}`,
        `Růst hráčů do 22 let z odehraných minut ${signed(youthGrowth)} %`,
      ],
    },
    {
      key: "discipline", label: "Disciplína", value: m.discipline,
      lines: [
        `Docházka na trénink: ${pp(pct(disciplineAttendanceMod(m.discipline)))}`,
        `Fauly ${signed(foul)} %, žluté karty ${signed(card)} %`,
        `Průšvihy v hospodě ${signed(pub)} %`,
      ],
    },
    {
      key: "reputation", label: "Reputace", value: m.reputation,
      lines: [
        `Volní hráči podepisují ochotněji: ${signed(coachSigningFactor({ reputation: m.reputation, licence: m.licence ?? 0 }))} k šanci`,
        "Hráči jiných klubů chtějí přestoupit k trenérovi s větším jménem",
        "Spolu s motivací a formou drží fanoušky",
      ],
    },
  ];
}

// ── Štítky trenéra (jako u hráčů, `apps/web/src/lib/characteristics.ts`) ──

export interface CoachTag {
  key: string;
  label: string;
  emoji: string;
  color: "green" | "gold" | "red" | "blue" | "purple" | "muted";
  /** Co vlastnost ve hře opravdu dělá, se stejnými čísly jako profil trenéra. */
  description: string;
}

/**
 * Prahy štítků: zhruba horních a dolních 15 % trenérů v okrese (kopie produ 11/2026,
 * 59 trenérů). Pevné hodnoty, protože účinek vlastností je absolutní, ne relativní.
 */
export const COACH_TAG_THRESHOLDS = {
  coaching: { high: 62, low: 42 },
  motivation: { high: 61, low: 35 },
  tactics: { high: 59, low: 40 },
  youthDevelopment: { high: 55, low: 38 },
  discipline: { high: 55, low: 37 },
  reputation: { high: 58, low: 22 },
} as const;

/**
 * Štítky z vlastností trenéra: výrazně dobrá i slabá stránka, nejvýraznější první.
 * Popisky říkají jen to, co hra opravdu dělá (stejné výpočty jako `coachAttributeEffects`).
 */
export function coachTags(m: {
  coaching: number; motivation: number; tactics: number; youthDevelopment: number; discipline: number; reputation: number; licence?: number;
}, maxTags = 3): CoachTag[] {
  const T = COACH_TAG_THRESHOLDS;
  const found: Array<CoachTag & { strength: number }> = [];
  const add = (tag: CoachTag, strength: number) => found.push({ ...tag, strength });
  const card = pct(disciplineCardMul(m.discipline) * disciplineFoulMul(m.discipline) - 1);

  if (m.coaching >= T.coaching.high) {
    add({ key: "coaching_high", label: "Brusič", emoji: "🛠️", color: "green",
      description: `Hráči se pod ním na tréninku zlepšují rychleji (šance ${fmtMul(coachingTrainingMul(m.coaching))}).` }, m.coaching - T.coaching.high);
  } else if (m.coaching <= T.coaching.low) {
    add({ key: "coaching_low", label: "Trénink naprázdno", emoji: "🐌", color: "red",
      description: `Na tréninku hráče moc neposune (šance na zlepšení ${fmtMul(coachingTrainingMul(m.coaching))}).` }, T.coaching.low - m.coaching);
  }
  if (m.motivation >= T.motivation.high) {
    add({ key: "motivation_high", label: "Motivátor", emoji: "📣", color: "green",
      description: `Před výkopem zvedne morálku sestavy o ${motivationMoraleBonus(m.motivation)} a nenominovaní u něj méně trucují.` }, m.motivation - T.motivation.high);
  } else if (m.motivation <= T.motivation.low) {
    add({ key: "motivation_low", label: "Kabinu nezvedne", emoji: "😶", color: "red",
      description: motivationMoraleBonus(m.motivation) > 0
        ? `Před výkopem přidá morálce sestavy jen +${motivationMoraleBonus(m.motivation)} a nenominovaní u něj trucují víc.`
        : "Před výkopem morálku sestavy nezvedne a nenominovaní u něj trucují víc." }, T.motivation.low - m.motivation);
  }
  if (m.tactics >= T.tactics.high) {
    add({ key: "tactics_high", label: "Taktik", emoji: "🧠", color: "blue",
      description: `Přihrávky a obrana sestavy v zápase ${signed(tacticsMatchBonus(m.tactics))}, tým se na formaci sehraje rychleji (${fmtMul(tacticsFamiliarityMul(m.tactics))}).` }, m.tactics - T.tactics.high);
  } else if (m.tactics <= T.tactics.low) {
    add({ key: "tactics_low", label: "Bez plánu", emoji: "🌀", color: "red",
      description: `Taktikou sestavě nepřidá (přihrávky a obrana ${signed(tacticsMatchBonus(m.tactics))}) a tým se sehrává pomaleji.` }, T.tactics.low - m.tactics);
  }
  if (m.youthDevelopment >= T.youthDevelopment.high) {
    add({ key: "youth_high", label: "Vychovatel", emoji: "🌱", color: "green",
      description: `Hráči do 22 let pod ním rostou rychleji (trénink ${fmtMul(youthTrainingMul(m.youthDevelopment))}, z odehraných minut ${signed(pct(youthMatchGrowthMod(m.youthDevelopment)))} %).` }, m.youthDevelopment - T.youthDevelopment.high);
  } else if (m.youthDevelopment <= T.youthDevelopment.low) {
    add({ key: "youth_low", label: "Na mladé není", emoji: "🧓", color: "gold",
      description: `Hráči do 22 let pod ním rostou pomaleji (z odehraných minut ${signed(pct(youthMatchGrowthMod(m.youthDevelopment)))} %).` }, T.youthDevelopment.low - m.youthDevelopment);
  }
  if (m.discipline >= T.discipline.high) {
    add({ key: "discipline_high", label: "Pevná ruka", emoji: "🎖️", color: "blue",
      description: `Lepší docházka na trénink, žluté karty ${signed(card)} %, méně průšvihů v hospodě.` }, m.discipline - T.discipline.high);
  } else if (m.discipline <= T.discipline.low) {
    add({ key: "discipline_low", label: "Lajdák", emoji: "🍻", color: "red",
      description: `Horší docházka na trénink, žluté karty ${signed(card)} %, víc průšvihů v hospodě.` }, T.discipline.low - m.discipline);
  }
  if (m.reputation >= T.reputation.high) {
    add({ key: "reputation_high", label: "Velké jméno", emoji: "🏆", color: "gold",
      description: "Volní hráči podepisují ochotněji a hráči jiných klubů k němu chtějí přestoupit." }, m.reputation - T.reputation.high);
  } else if (m.reputation <= T.reputation.low) {
    add({ key: "reputation_low", label: "Zatím bez jména", emoji: "🆕", color: "muted",
      description: "Hráči k němu zatím přestupují zdráhavěji, reputace roste výhrami a umístěním." }, T.reputation.low - m.reputation);
  }
  return found
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxTags)
    .map(({ strength: _s, ...tag }) => tag);
}

// ── Licence ──

export type LicenceLevel = 0 | 1 | 2 | 3 | 4;

export interface LicenceDef {
  level: LicenceLevel;
  label: string;
  short: string;
  /** Strop vlastností trenéra (koučink, motivace, taktika, mládež, disciplína). */
  cap: number;
  /** Reputace trenéra potřebná k přihlášení na licenční kurz. */
  minReputation: number;
}

export const LICENCE_LEVELS: readonly LicenceDef[] = [
  { level: 0, label: "Bez licence", short: "bez", cap: 60, minReputation: 0 },
  { level: 1, label: "Licence C", short: "C", cap: 70, minReputation: 0 },
  { level: 2, label: "UEFA B", short: "B", cap: 80, minReputation: 35 },
  { level: 3, label: "UEFA A", short: "A", cap: 90, minReputation: 50 },
  { level: 4, label: "UEFA Pro", short: "Pro", cap: 99, minReputation: 65 },
];

export const MAX_LICENCE: LicenceLevel = 4;

function licenceDef(level: number): LicenceDef {
  return LICENCE_LEVELS[Math.max(0, Math.min(MAX_LICENCE, Math.round(level)))];
}

export function licenceLabel(level: number): string {
  return licenceDef(level).label;
}

export function licenceCap(level: number): number {
  return licenceDef(level).cap;
}

export function licenceMinReputation(level: number): number {
  return licenceDef(level).minReputation;
}

/**
 * Licence, která odpovídá dnešním vlastnostem: nejnižší, jejíž strop pokryje
 * nejvyšší vlastnost. Takhle se licence přidělí stávajícím a nově založeným trenérům,
 * aby žádnému strop nesebral body, které už má.
 */
export function deriveLicenceLevel(attrs: {
  coaching: number;
  motivation: number;
  tactics: number;
  youthDevelopment: number;
  discipline: number;
}): LicenceLevel {
  const top = Math.max(attrs.coaching, attrs.motivation, attrs.tactics, attrs.youthDevelopment, attrs.discipline);
  return (LICENCE_LEVELS.find((l) => top <= l.cap)?.level ?? MAX_LICENCE) as LicenceLevel;
}

/**
 * Výchozí vztah nového hráče k trenérovi: licencovaný a známý trenér má respekt
 * hned od první šatny. 40 bez licence = 50, UEFA Pro s reputací 75 = 65.
 */
export function newcomerCoachRelationship(coach: CoachStanding): number {
  const licenceBonus = [0, 2, 4, 7, 10][licenceDef(coach.licence).level];
  return 50 + licenceBonus + clamp(roundInt((coach.reputation - 40) / 5), -3, 5);
}

/**
 * Jakou licenci trenéra chce zaměstnanec s danou primární vlastností (škála 1–20).
 * Špičky nejdou dělat pod trenéra bez papírů.
 */
export function staffRequiredLicence(primaryAttr: number): LicenceLevel {
  if (primaryAttr >= 18) return 3;
  if (primaryAttr >= 16) return 2;
  if (primaryAttr >= 13) return 1;
  return 0;
}

// ── Trenérská škola: kurzy ──
// Jen pravidla a ceny. Skripta a otázky (se správnými odpověďmi) jsou výhradně na serveru.

export type CourseKind = "attr_basic" | "attr_advanced" | "licence";
export type CourseAttr = "coaching" | "motivation" | "tactics" | "youth_development" | "discipline";
export type CourseStatus = "in_progress" | "exam_ready" | "retake_available" | "passed" | "failed";

export const COURSE_ATTRS: readonly CourseAttr[] = ["coaching", "tactics", "motivation", "youth_development", "discipline"];

export const COURSE_ATTR_LABELS: Record<CourseAttr, string> = {
  coaching: "Koučink",
  motivation: "Motivace",
  tactics: "Taktika",
  youth_development: "Práce s mládeží",
  discipline: "Disciplína",
};

/** Čím se kurz vlastnosti zabývá — název skript na kartě kurzu. */
export const COURSE_ATTR_TOPIC: Record<CourseAttr, string> = {
  coaching: "Trénink a kondice",
  motivation: "Legendy a kabina",
  tactics: "Taktika a rozestavení",
  youth_development: "Mládežnický fotbal",
  discipline: "Fauly, karty a fair play",
};

export interface ExamRules {
  questions: number;
  passScore: number;
  /** Časový limit testu v minutách. Běží na serveru, nejde zastavit. */
  timeLimitMin: number;
}

export const COURSE_RULES = {
  attr_basic: { points: 3, days: 7, minLicence: 0, exam: { questions: 8, passScore: 6, timeLimitMin: 10 } },
  attr_advanced: { points: 5, days: 14, minLicence: 2, exam: { questions: 10, passScore: 8, timeLimitMin: 12 } },
  licence: { exam: { questions: 15, passScore: 12, timeLimitMin: 20 } },
  /** Opravný termín stojí tuhle část ceny kurzu. */
  retakeShare: 0.2,
  /** Kolik herních dní po konci kurzu je na test (a na opravný termín). */
  examWindowDays: 7,
  /** O kolik sekund se zkrátí čas testu za každý odchod z okna (jiný tab, jiná aplikace). */
  examLeavePenaltySec: 60,
  maxAttrCoursesPerSeason: 3,
  maxLicenceCoursesPerSeason: 1,
} as const;

/** Cena a délka licenčních kurzů podle cílové licence. */
export const LICENCE_COURSES: Record<1 | 2 | 3 | 4, { price: number; days: number }> = {
  1: { price: 25_000, days: 10 },
  2: { price: 60_000, days: 14 },
  3: { price: 120_000, days: 21 },
  4: { price: 250_000, days: 28 },
};

const round100 = (v: number) => Math.round(v / 100) * 100;

/** Cena kurzu vlastnosti. Čím lepší trenér, tím dražší škola. */
export function attrCoursePrice(kind: "attr_basic" | "attr_advanced", current: number): number {
  return kind === "attr_basic" ? round100(10_000 + current * 200) : round100(30_000 + current * 500);
}

export function retakePrice(price: number): number {
  return round100(price * COURSE_RULES.retakeShare);
}

export function examRulesFor(kind: CourseKind): ExamRules {
  return COURSE_RULES[kind].exam;
}

/** Trenér chybí na tréninku: koučink a disciplína pro trénink klesnou k zástupci. */
export function coachAwayValue(value: number, standIn: number): number {
  return Math.min(value, Math.round(value * 0.5 + standIn * 0.5));
}

/** Kdo trénink vede místo trenéra: asistent podle efektivity (1–20), bez něj kdokoli z výboru (20). */
export function standInValue(assistantEffectiveness: number | null): number {
  if (assistantEffectiveness === null) return 20;
  return clamp(20 + assistantEffectiveness * 2.5, 20, 70);
}

/** Efektivita asistenta trenéra (1–20): stejný vzorec jako role asistent v ROLE_DEFS. */
export function assistantEffectiveness(coaching: number, communication: number): number {
  return Math.round((2 * coaching + communication) / 3);
}

export interface CoachAwayImpact {
  /** Koučink a disciplína, se kterými se trénuje, dokud je trenér na kurzu. */
  coachingAway: number;
  disciplineAway: number;
  /** O kolik procent pomaleji se hráči v tréninku zlepšují. */
  slowdownPct: number;
  /** O kolik procentních bodů klesne docházka na trénink. */
  attendanceDropPp: number;
}

/** Co v praxi znamená, že trenér je na kurzu: stejný výpočet jako denní trénink. */
export function coachAwayImpact(
  coach: { coaching: number; discipline: number },
  assistantEff: number | null,
): CoachAwayImpact {
  const standIn = standInValue(assistantEff);
  const coachingAway = coachAwayValue(coach.coaching, standIn);
  const disciplineAway = coachAwayValue(coach.discipline, standIn);
  return {
    coachingAway,
    disciplineAway,
    slowdownPct: roundInt((1 - coachingTrainingMul(coachingAway) / coachingTrainingMul(coach.coaching)) * 100),
    attendanceDropPp: roundInt((disciplineAttendanceMod(coach.discipline) - disciplineAttendanceMod(disciplineAway)) * 100),
  };
}
