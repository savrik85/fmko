/**
 * Do které skupiny patří důvod, proč hráč chyběl na tréninku (sazebník pokut).
 *
 * Důvody jsou volné věty z několika zásobníků (season/training.ts, multiplayer/left-out.ts,
 * events/youth-excuses.ts, attendance-pledge.ts), proto se třídí podle slov, ne podle přesného
 * textu. Co se nepozná, je omluvené: pokuta za „neznámý“ důvod by trestala práci nebo rodinu.
 */

export type TrainingAbsenceCategory =
  /** Zaspal, zapomněl, nebere telefon, myslel, že je zítra. */
  | "slacking"
  /** Hospoda, oslava, zabijačka. */
  | "pub"
  /** Truc po nenominaci, „prý stejně nehraje“. */
  | "sulk"
  /** Zapomněl kopačky. */
  | "boots"
  /** Volno od trenéra. Nikdy se nepokutuje. */
  | "coach_rest"
  /** Předem se omluvil (řekl trenérovi, že nepřijde). */
  | "announced"
  /** Práce, rodina, zdraví, doprava, škola a vše ostatní. */
  | "excused";

const BOOTS_RE = /boty zapomn|kopa[cč]ky zapomn|zapomn[eě]l (si )?(boty|kopa[cč]ky)/i;
const SULK_RE = /trucuj|stejn[eě] nehraje|nebere[sš]? ani na lavi|kv[uů]li nominaci|a[zž] ho bude[sš] pot[rř]ebovat|j[aá] tohle nepot[rř]ebuju/i;
const PUB_RE = /hospod|zabija[cč]k|narozenin|oslav|pivo|piv[ae]m?\b|slavii|kocovin|jedno v[eě]dlo/i;
const PUB_EXCEPT_RE = /otev[ií]r[aá] hospodu/i;
const SLACKING_RE = /zasp[aě]l|zapomn[eě]l|myslel,? [zž]e je z[ií]tra|nebere telefon|nezd[aá] telefon|vybit[yý] telefon|nikoho nezavolal|p[rř]i[sš]el pozd[eě]|p[rř]ijde, ale nep[rř]i[sš]el/i;

export function classifyTrainingAbsence(a: { reason?: string | null; restByCoach?: boolean; pledge?: string | null }): TrainingAbsenceCategory {
  if (a.restByCoach) return "coach_rest";
  if (a.pledge === "skip") return "announced";
  const r = a.reason ?? "";
  if (BOOTS_RE.test(r)) return "boots";
  if (SULK_RE.test(r)) return /hospod/i.test(r) ? "pub" : "sulk";
  if (PUB_RE.test(r) && !PUB_EXCEPT_RE.test(r)) return "pub";
  if (SLACKING_RE.test(r)) return "slacking";
  return "excused";
}

/** Splní absence podmínku položky „Vynechaný trénink“? */
export function trainingConditionMatches(condition: string, category: TrainingAbsenceCategory): boolean {
  if (category === "coach_rest") return false;
  switch (condition) {
    case "slacking": return category === "slacking";
    case "pub": return category === "pub";
    case "unexcused": return category === "slacking" || category === "pub" || category === "sulk";
    case "any": return true;
    default: return false;
  }
}

/** Důvody omluvenek na zápas (matches.absences.reason), které se nikdy nepokutují. */
const NEVER_FINED_MATCH_REASONS = /^(zran[eě]n[ií]|stopka za karty|po obvin[eě]n[ií]|osobn[ií] volno|narodilo se mu d[ií]t[eě]|nemocn[yý] rodi[cč])$/i;
const HANGOVER_MATCH_REASONS = /^(kocovina|alkohol)$/i;

export function matchExcuseConditionMatches(condition: string, a: { reason: string; announcedOnMatchDay: boolean }): boolean {
  if (NEVER_FINED_MATCH_REASONS.test(a.reason.trim())) return false;
  switch (condition) {
    case "hangover": return HANGOVER_MATCH_REASONS.test(a.reason.trim());
    case "match_day": return a.announcedOnMatchDay;
    case "any": return true;
    default: return false;
  }
}
