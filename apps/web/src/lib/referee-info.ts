// Popisy rozhodčích a překlad jejich vlastností do rad pro manažera.
// Cílem je, aby delegace dva dny předem měla praktický dopad na sestavu a taktiku,
// ne aby hráč koukal na šest čísel a nevěděl, co s nimi.

export interface RefereeProfileView {
  id: string;
  name: string;
  nickname?: string | null;
  age: number;
  occupation: string;
  archetype: string;
  archetypeLabel: string;
  bio: string;
  hlaska: string;
  strictness: number;
  cardHappiness: number;
  experience: number;
  homeBias: number;
  advantage: number;
  fitness: number;
  avatar?: Record<string, unknown> | null;
}

export interface RefereeStatsView {
  matches: number;
  avgGrade: number | null;
  cardsPerMatch: number | null;
  foulsPerMatch: number | null;
  yellowCards?: number;
  redCards?: number;
  penalties?: number;
  incidents?: number;
}

/** Osy profilu tak, jak se ukazují v kartě sudího. */
export const REFEREE_AXES = [
  { key: "strictness", label: "Přísnost", low: "nechá hrát", high: "píská všechno" },
  { key: "cardHappiness", label: "Karetní ruka", low: "šetří kapsu", high: "sáhne hned" },
  { key: "experience", label: "Zkušenost", low: "zelenáč", high: "veterán" },
  { key: "homeBias", label: "Domácí prostředí", low: "nedá se ovlivnit", high: "podléhá kotli" },
  { key: "advantage", label: "Pouštění výhody", low: "přeruší hru", high: "nechá hrát" },
  { key: "fitness", label: "Kondice", low: "v závěru stojí", high: "běhá do konce" },
] as const;

export type RefereeAxisKey = (typeof REFEREE_AXES)[number]["key"];

/** Slovní hodnocení osy 0–100 — čísla sama o sobě hráči nic neřeknou. */
export function axisWord(value: number): string {
  if (value >= 80) return "velmi vysoká";
  if (value >= 62) return "vysoká";
  if (value >= 38) return "průměrná";
  if (value >= 20) return "nízká";
  return "velmi nízká";
}

/** Barva pruhu osy. Vysoká hodnota není sama o sobě dobrá ani špatná. */
export function axisColor(value: number): string {
  if (value >= 75) return "bg-card-red";
  if (value >= 55) return "bg-gold-500";
  return "bg-pitch-500";
}

/**
 * Rady k sestavě podle povahy sudího. Tohle je celý smysl toho, že se rozhodčí
 * delegují dva dny předem — bez konkrétních vět by to byla jen dekorace.
 */
export function refereeAdviceCz(r: RefereeProfileView, isHome: boolean): string[] {
  const out: string[] = [];

  if (r.strictness >= 75) {
    out.push("Píská úplně všechno. Tvrdé stopery a vysoký presink si dnes vykoledují karty.");
  } else if (r.strictness <= 35) {
    out.push("Nechá toho hodně být. Souboje projdou a hra se skoro nepřerušuje.");
  }

  if (r.cardHappiness >= 78) {
    out.push("Do kapsy sahá okamžitě. Hráči s nízkou disciplínou a výbušnou povahou jsou riziko.");
  } else if (r.cardHappiness <= 30) {
    out.push("Karty rozdává nerad — dostat od něj žlutou chce opravdovou hloupost.");
  }

  if (r.advantage >= 75) {
    out.push("Rád pouští výhodu. Míň standardek pro obě strany, víc plynulé hry.");
  } else if (r.advantage <= 25) {
    out.push("Nepouští nic. Každý faul znamená přerušení a standardku.");
  }

  if (r.homeBias >= 70) {
    out.push(isHome
      ? "Doma se s ním hraje líp — hraniční situace mívají domácí na své straně."
      : "Venku u něj pozor: sporné momenty spíš odpíská pro domácí.");
  }

  if (r.experience <= 30) {
    out.push("Zelenáč. Šance, že něco zkazí, je vysoká — a může to jít na obě strany.");
  } else if (r.experience >= 82) {
    out.push("Ostřílený sudí. Sporných momentů u něj bývá minimum.");
  }

  if (r.fitness <= 32) {
    out.push("V závěru už jen odhaduje. Posledních dvacet minut bývá s ním divokých.");
  }

  return out;
}

/** Slovní shrnutí do jednoho řádku nad volbu sestavy. */
export function refereeOneLiner(r: RefereeProfileView): string {
  const parts = [r.archetypeLabel];
  if (r.strictness >= 72) parts.push("přísný");
  else if (r.strictness <= 35) parts.push("benevolentní");
  if (r.cardHappiness >= 75) parts.push("hodně karet");
  else if (r.cardHappiness <= 30) parts.push("málo karet");
  if (r.experience <= 30) parts.push("nezkušený");
  return parts.join(" · ");
}

// ── Známka ──

/** Slovní popis známky na školní stupnici. */
export function gradeWord(grade: number): string {
  if (grade <= 1.5) return "výborný";
  if (grade <= 2.2) return "dobrý";
  if (grade <= 3.0) return "průměrný";
  if (grade <= 3.8) return "slabý";
  return "špatný";
}

export function gradeColor(grade: number | null): string {
  if (grade == null) return "text-muted";
  if (grade <= 1.8) return "text-pitch-600";
  if (grade <= 2.6) return "text-ink";
  if (grade <= 3.4) return "text-gold-600";
  return "text-card-red";
}

/** Známka na dvě desetinná místa s českou desetinnou čárkou. */
export function formatGrade(grade: number | null, digits = 2): string {
  if (grade == null) return "—";
  return grade.toFixed(digits).replace(".", ",");
}

// ── Sporné situace ──

export const INCIDENT_LABELS: Record<string, string> = {
  neuznany_gol: "Neuznaný gól",
  vymyslena_penalta: "Vymyšlená penalta",
  neodpiskana_penalta: "Neodpískaná penalta",
  chybna_cervena: "Chybná červená",
  prehlednuta_cervena: "Přehlédnutá červená",
  sporny_primak: "Sporný přímý kop",
};

export interface RefereeIncidentView {
  minute: number;
  kind: string;
  severity: "high" | "medium" | "low";
  playerName: string;
  text: string;
  againstTeamId: string;
  favourTeamId: string;
}

export function incidentLabel(kind: string): string {
  return INCIDENT_LABELS[kind] ?? "Sporná situace";
}

// ── Paměť rozhodčího vůči klubu ──────────────────────────────────────────────

export interface RefereeMemoryView {
  sentiment: number;
  duvod: string | null;
  /** O kolik procent se posunou hraniční verdikty. Nikdy víc než 3. */
  biasPct: number;
}

/**
 * Slovní škála, aby paměť nebyla jen číslo.
 *
 * Karta zápasu tyká, profil sudího vyká — bez volby tvaru by v jedné větě
 * stálo „jde po tobě … proti vám".
 */
export function memoryWord(sentiment: number, tvar: "ty" | "vy" = "ty"): string {
  const vy = tvar === "vy";
  if (sentiment >= 12) return vy ? "drží vám palce" : "drží ti palce";
  if (sentiment >= 4) return vy ? "má vás rád" : "má tě rád";
  if (sentiment > -4) return "neutrální";
  if (sentiment > -12) return vy ? "má vás v merku" : "má tě v merku";
  return vy ? "jde po vás" : "jde po tobě";
}

/** České skloňování počtu — „1 výhra", ne „1 výher". */
export function pocet(n: number, jedna: string, dva: string, pet: string): string {
  const slovo = n === 1 ? jedna : n >= 2 && n <= 4 ? dva : pet;
  return `${n} ${slovo}`;
}

export function memoryColor(sentiment: number): string {
  if (sentiment >= 4) return "text-pitch-600";
  if (sentiment > -4) return "text-muted";
  return "text-card-red";
}
