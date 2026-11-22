/**
 * Co hráč trenérovi v SMS řekl o docházce (2026-11-22): „v pátek dorazím, slibuju“, „na trénink
 * se zatím vykašlu“, „v neděli prostě nemůžu“. Dřív to zůstalo jen v textu a docházka na trénink
 * byla dál čistá náhoda (season/training.ts), takže hráč slíbil a nepřišel, nebo řekl, že nepřijde,
 * a přišel. Rozbor: SMS 17.–21. 11. (cca6f9, dcebda, 8b1ffa, ec260a, 3f2f4d).
 *
 * Tok:
 *  1. Model v odpovědi hráče vrací `attendance_pledge` (ai-player-chat.ts); `afterPlayerReply`
 *     ho přes `recordAttendancePledge` převede na herní dny podle rozpisu tréninků týmu a uloží
 *     do `life_context.trainingPledge` nebo `life_context.matchPledge`. Trenér pod zprávou vidí
 *     poznámku, co si hra zapsala.
 *  2. Trénink (daily-tick → simulateAttendance): slíbil přijít → přijde skoro jistě, řekl, že
 *     nepřijde → skoro jistě chybí s důvodem „dal vědět předem“. Přemluvení v dalším chatu slib
 *     přepíše.
 *  3. Zápas: slib jde do kabiny zápasu („⚽ vs …“) jako jeho odpověď „přijdu“ / „nemůžu“, ze které
 *     se omluvenky berou (events/match-absences.ts `recordedExcuses`). Když kabina ještě není,
 *     použije se, až vznikne (season/team-day.ts).
 *  4. Denně v 10:00 UTC (transfer-pressure-tick): porušený slib „přijdu“ = horší vztah a omluvná SMS.
 */

import { logger } from "../lib/logger";
import { applyCoachRelationDelta } from "../lib/coach-relation";
import type { ChatEnv } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { ownSquadTeamId } from "./player-reach";

const M = "attendance-pledge";

export type PledgeIntent = "attend" | "skip";
export type PledgeEvent = "training" | "match";
/** Dny v týdnu v pořadí `Date.getUTCDay()`. */
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
export type PledgeWhen = "next" | "week" | WeekdayKey;

/** Jak to hráč řekl (odpověď modelu, už zkontrolovaná). */
export interface RawAttendancePledge {
  event: PledgeEvent;
  intent: PledgeIntent;
  when: PledgeWhen;
}

/** `life_context.trainingPledge`. Data jsou herní dny YYYY-MM-DD. */
export interface TrainingPledge {
  intent: PledgeIntent;
  /** První a poslední herní den, kdy slib platí. */
  from: string;
  until: string;
  /** Jen jeden trénink (příští, konkrétní den), nebo všechny do `until`. */
  once: boolean;
  /** Kdy to hráč řekl (reálný čas). */
  at: string;
  convId: string;
  /** Tým, za který hráč hrál, když slib dal. Po přestupu nebo odchodu na hostování slib neplatí. */
  teamId?: string;
  /** Doplní trénink: „kept“ / „broken“, a den, kdy se to stalo. Slib s výsledkem už neplatí. */
  outcome?: "kept" | "broken";
  outcomeDay?: string;
}

/** `life_context.matchPledge`: příští zápas týmu (calendar_id u ligy, id zápasu u přáteláku). */
export interface MatchPledge {
  intent: PledgeIntent;
  matchKey: string;
  matchDay: string;
  at: string;
  convId: string;
  /** Tým hráče, když slib dal: kalendář kola sdílí celá liga, slib platí jen pro tenhle tým. */
  teamId?: string;
}

/** Nejdál kolik dní dopředu slib platí („do týdne“, „v pátek“). */
export const PLEDGE_WINDOW_DAYS = 7;

/**
 * Šance, že hráč, který slíbil přijít, opravdu přijde: zbyde jen 30 % z toho, co mu jinak chybělo.
 * Na produkci chodí lidský hráč na 65 % tréninků a jen desetina hráčů na 90 % a víc (docházka
 * 40 964 / 63 136, 1 569 hráčů s aspoň 10 tréninky, 22. 11.). Slib tak průměrného hráče zvedne
 * na úroveň nejspolehlivější desetiny (0,65 → 0,895), věčný absentér (0,3) pořád chybí zhruba
 * na každém pátém slíbeném tréninku. Strop 0,95 jako u běžné docházky.
 */
export const PLEDGE_ATTEND_MISS_SHARE = 0.3;
/** Řekl, že nepřijde: přijde jen výjimečně, stejně jako nejhorší docházka (spodní mez 0,05). */
export const PLEDGE_SKIP_ATTEND_PROB = 0.05;
/**
 * Porušený slib „přijdu“: vztah k trenérovi −2. Je to třetina stropu jednoho rozhovoru od trenéra
 * (`COACH_CHAT_MAX_RELATION` 6) a čtvrtina porušeného slibu základu od trenéra (−8): malé
 * zklamání, ne zrada.
 */
export const BROKEN_PLEDGE_RELATION = -2;

export function pledgedAttendProb(base: number, intent: PledgeIntent): number {
  if (intent === "skip") return PLEDGE_SKIP_ATTEND_PROB;
  return Math.min(0.95, 1 - (1 - base) * PLEDGE_ATTEND_MISS_SHARE);
}

/** Výmluvy do docházky, když hráč trenérovi předem řekl, že nepřijde (třetí osoba jako ostatní). */
export const SKIP_PLEDGE_REASONS: readonly string[] = [
  "Dal ti předem vědět, že nepřijde",
  "Psal ti, že dneska nedorazí",
  "Říkal ti to dopředu, na trénink nepřišel",
  "Omluvil se už předem v SMS",
  "Jak ti psal, tentokrát vynechal",
  "Ohlásil to předem, dneska nebyl",
  "Napsal ti, že nepřijde, a nepřišel",
  "Předem hlásil, že tenhle trénink pouští",
];

/** Odpověď hráče do kabiny zápasu, když trenérovi už v SMS řekl, že nemůže (≥ 8 variant). */
export const MATCH_SKIP_PLEDGE_TEXTS: readonly string[] = [
  "Jak jsem psal trenérovi, tentokrát nemůžu.",
  "Já to trenérovi už říkal, na zápas nedorazím.",
  "Bez urážky, kluci, ale já to tentokrát pouštím. Trenér to ví.",
  "Trenére, jak jsme si psali, nemůžu. Držím palce.",
  "Já tam nebudu, trenérovi jsem to psal.",
  "Tentokrát beze mě, trenér o tom ví. Ať to klapne.",
  "Nemůžu, kluci. Trenérovi jsem se omluvil předem.",
  "Já vynechám, psal jsem to trenérovi. Snad to urvete.",
];

/** Odpověď do kabiny zápasu, když ho trenér v SMS přemluvil (≥ 8 variant). */
export const MATCH_ATTEND_PLEDGE_TEXTS: readonly string[] = [
  "Nakonec dorazím, domluvil jsem se s trenérem.",
  "Beru zpátky, budu tam.",
  "Trenér mě ukecal, přijdu.",
  "Tak jo, zařídil jsem to a přijdu.",
  "Počítejte se mnou, nakonec to stihnu.",
  "Budu tam, slíbil jsem to trenérovi.",
  "Změna plánu, přijdu, kluci.",
  "Dorazím. S trenérem jsme to vyřešili.",
];

// ─── Odpověď modelu ─────────────────────────────────────────────────────────

/** Zkontroluje pole `attendance_pledge` z odpovědi modelu. Cokoli mimo schéma = žádný slib. */
export function parseAttendancePledge(raw: unknown): RawAttendancePledge | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { event?: unknown; intent?: unknown; when?: unknown };
  if (r.event !== "training" && r.event !== "match") return null;
  if (r.intent !== "attend" && r.intent !== "skip") return null;
  const when = r.when === "next" || r.when === "week" || (WEEKDAY_KEYS as readonly unknown[]).includes(r.when)
    ? r.when as PledgeWhen : "next";
  return { event: r.event, intent: r.intent, when };
}

/** Zpráva trenéra do kabiny, po které může někdo slíbit, že přijde, nebo říct, že nepřijde. */
export const SQUAD_ATTENDANCE_TOPIC_RE = /(tr[eé]nin|z[aá]pas|doraz|omluv|chod[ií]t|p[rř][ií]j[dď]|nedostav|chyb[eě]t)/i;

/** Pravidlo do promptu odpovědi. Schéma pole je v `ATTENDANCE_PLEDGE_SCHEMA`. */
export const ATTENDANCE_PLEDGE_RULE =
  "- attendance_pledge: když v téhle zprávě trenérovi JASNĚ řekneš, že přijdeš, nebo že nepřijdeš na trénink či na zápas, vyplň "
  + "event (\"training\" trénink, \"match\" zápas), intent (\"attend\" přijdu, \"skip\" nepřijdu) a when (\"next\" nejbližší trénink nebo zápas, "
  + "\"week\" všechny tréninky do týdne, nebo den: \"mon\" \"tue\" \"wed\" \"thu\" \"fri\" \"sat\" \"sun\"). Hra to bere vážně: co slíbíš, platí. "
  + "Obecné „budu makat“, „uvidíme“ nebo „snad“ bez rozhodnutí slib není, pak null.";
export const ATTENDANCE_PLEDGE_SCHEMA =
  `, "attendance_pledge": null|{"event": "training"|"match", "intent": "attend"|"skip", "when": "next"|"week"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"}`;

// ─── Herní dny ──────────────────────────────────────────────────────────────

export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/**
 * Převede slib na herní dny. `gameDay` je dnešní herní den týmu: jeho trénink už proběhl
 * (denní tick ho simuluje ráno), slib se tedy týká až dalších dnů. Tréninky jen ve dny
 * z rozpisu (`trainingDays`, 0 = neděle), ne v den zápasu. Bez tréninku v okně nic.
 */
export function resolveTrainingPledge(
  raw: RawAttendancePledge,
  o: { gameDay: string; trainingDays: readonly number[]; matchDays?: ReadonlySet<string>; at: string; convId: string },
): TrainingPledge | null {
  if (raw.event !== "training") return null;
  const candidates: string[] = [];
  for (let i = 1; i <= PLEDGE_WINDOW_DAYS; i++) {
    const day = shiftDay(o.gameDay, i);
    if (o.trainingDays.includes(weekdayOf(day)) && !o.matchDays?.has(day)) candidates.push(day);
  }
  if (candidates.length === 0) return null;
  const base = { intent: raw.intent, at: o.at, convId: o.convId };
  if (raw.when === "week") return { ...base, from: candidates[0], until: candidates[candidates.length - 1], once: false };
  let day = candidates[0];
  if (raw.when !== "next") {
    // „V pátek dorazím“: nejbližší pátek, a když se v pátek netrénuje, nejbližší trénink po něm.
    const wanted = WEEKDAY_KEYS.indexOf(raw.when);
    let target = shiftDay(o.gameDay, 1);
    while (weekdayOf(target) !== wanted) target = shiftDay(target, 1);
    day = candidates.find((d) => d >= target) ?? candidates[0];
  }
  return { ...base, from: day, until: day, once: true };
}

/** Platí slib pro trénink v herní den `day`? Vrací záměr, nebo undefined. */
export function trainingPledgeIntent(raw: unknown, day: string, teamId?: string): PledgeIntent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Partial<TrainingPledge>;
  if (p.intent !== "attend" && p.intent !== "skip") return undefined;
  if (p.outcome) return undefined;
  if (teamId !== undefined && p.teamId !== undefined && p.teamId !== teamId) return undefined;
  const d = day.slice(0, 10);
  if (typeof p.from !== "string" || typeof p.until !== "string" || d < p.from || d > p.until) return undefined;
  return p.intent;
}

/** Platí slib pro zápas `matchKey`? */
export function matchPledgeIntent(raw: unknown, matchKey: string, teamId?: string): PledgeIntent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Partial<MatchPledge>;
  if (p.matchKey !== matchKey) return undefined;
  if (teamId !== undefined && p.teamId !== teamId) return undefined;
  return p.intent === "attend" || p.intent === "skip" ? p.intent : undefined;
}

/**
 * Kabina zápasu den předem: komu slib z SMS změní odpověď. „Nemůžu“ omluví toho, kdo by jinak
 * přišel (dostane větu z `MATCH_SKIP_PLEDGE_TEXTS`), „přijdu“ vrátí toho, koho omluvil los.
 * Omluvu kvůli incidentu (výslech, soud) slib nepřebije.
 */
export function matchPledgeOverrides(
  squad: ReadonlyArray<{ id: string; life_context: unknown }>,
  lottery: ReadonlyMap<string, { category: string }>,
  matchKey: string,
  /** Tým, jehož kabina zápasu vzniká: slib hráče, který mezitím přestoupil k soupeři v lize, neplatí. */
  teamId: string,
): { skip: Map<string, string>; attend: Set<string> } {
  const skip = new Map<string, string>();
  const attend = new Set<string>();
  for (const row of squad) {
    const intent = matchPledgeIntent(lifeOf(row.life_context).matchPledge, matchKey, teamId);
    const drawn = lottery.get(row.id);
    if (intent === "skip" && !drawn) skip.set(row.id, variantFor(MATCH_SKIP_PLEDGE_TEXTS, `${row.id}|${matchKey}`));
    else if (intent === "attend" && drawn && drawn.category !== "incident") attend.add(row.id);
  }
  return { skip, attend };
}

/**
 * Výsledek tréninku pro hráče se slibem. Slib „přijdu“ na konkrétní trénink: přišel = splněno,
 * nepřišel = porušeno. „Přijdu na tréninky do týdne“ se poruší prvním vynechaným tréninkem
 * a splní posledním dnem. „Nepřijdu“ se jen spotřebuje (přišel-li nakonec, nic se neděje).
 * Null = slib běží dál.
 */
export function pledgeOutcome(p: TrainingPledge, day: string, attended: boolean): "kept" | "broken" | null {
  if (p.intent === "attend" && !attended) return "broken";
  if (p.once || day.slice(0, 10) >= p.until) return "kept";
  return null;
}

// ─── Text pro hráče a trenéra ───────────────────────────────────────────────

const DAY_NAMES = ["neděli", "pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu"];

/** „v pátek 21. 11.“ */
export function dayPhrase(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  const name = DAY_NAMES[d.getUTCDay()];
  return `${name === "středu" || name === "čtvrtek" ? "ve" : "v"} ${name} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** „28. 11.“ */
export function datePhrase(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** Rozpis tréninků do faktů promptu: „v úterý a ve čtvrtek“. */
export function trainingScheduleText(days: readonly number[]): string {
  if (days.length === 0) return "";
  const names = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => {
    const name = DAY_NAMES[d];
    return `${name === "středu" || name === "čtvrtek" ? "ve" : "v"} ${name}`;
  });
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} a ${names[names.length - 1]}`;
}

/** Věta končí datem („20. 11.“): druhá tečka by byla navíc. */
function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

/** Poznámka pod zprávu hráče: trenér vidí, co si hra zapsala. */
export function pledgeNote(firstName: string, p: TrainingPledge | MatchPledge): string {
  if ("matchKey" in p) {
    return p.intent === "attend"
      ? sentence(`📝 ${firstName} slíbil, že přijde na zápas ${dayPhrase(p.matchDay)}`)
      : `📝 ${firstName} na zápas ${dayPhrase(p.matchDay)} nepřijde.`;
  }
  if (p.intent === "attend") {
    return p.once ? sentence(`📝 ${firstName} slíbil, že přijde na trénink ${dayPhrase(p.from)}`)
      : `📝 ${firstName} slíbil, že bude chodit na tréninky (do ${datePhrase(p.until)}).`;
  }
  return p.once ? `📝 ${firstName} na trénink ${dayPhrase(p.from)} nepřijde.`
    : `📝 ${firstName} na tréninky do ${datePhrase(p.until)} nepřijde.`;
}

/** Řádky do promptu: hráč ví, co trenérovi řekl, a drží se toho (nebo si nechá domluvit). */
export function pledgePromptLines(player: Pick<PlayerSnapshot, "trainingPledge" | "matchPledge">): string[] {
  const lines: string[] = [];
  const t = player.trainingPledge;
  if (t?.outcome === "broken") {
    lines.push(`- Trenérovi jsi slíbil, že přijdeš na trénink, a ${dayPhrase(t.outcomeDay ?? t.from)} jsi nepřišel. Trenér to ví, nezapírej to.`);
  } else if (t && !t.outcome) {
    lines.push(t.intent === "attend"
      ? `- Trenérovi jsi slíbil, že přijdeš na trénink ${t.once ? dayPhrase(t.from) : `(všechny do ${datePhrase(t.until)}).`} Platí to.`
      : `- Trenérovi jsi řekl, že na trénink ${t.once ? dayPhrase(t.from) : `do ${datePhrase(t.until)}`} nepřijdeš. Když tě přemluví, řekni mu jasně, že přijdeš.`);
  }
  const m = player.matchPledge;
  if (m) {
    lines.push(m.intent === "attend"
      ? `- Trenérovi jsi slíbil, že na zápas ${dayPhrase(m.matchDay)} přijdeš.`
      : `- Trenérovi jsi řekl, že na zápas ${dayPhrase(m.matchDay)} nepřijdeš. Když tě přemluví, řekni mu jasně, že přijdeš.`);
  }
  return lines;
}

// ─── Přemluvení omluveného ──────────────────────────────────────────────────

/** Omluvenky, které přemluvit nejde: nemoc, incident (výslech, soud). Zranění a stopka řeší volající. */
const HARD_ABSENCE_REASONS = new Set(["Zdraví", "Po obvinění", "Zranění", "Stopka za karty", "Osobní volno"]);
/** Omluvenka z textu vážná, i když los dal „Osobní“: nemoc, nemocnice, pohřeb, porod. */
const HARD_ABSENCE_TEXT_RE = /(nemoc|nemocn|doktor|l[eé]ka[rř]|operac|hore[cč]k|ch[rř]ipk|ang[ií]n|poh[rř]eb|um[rř]el|zem[rř]el|porod|rodi[lč]k)/i;
/** Jak snadno se dá rozmluvit podle důvodu (squad-talk.ts `PERSUADE_BASE`: kocovina a výmluvy snadno, práce těžko). */
const PERSUADE_EASE: Record<string, number> = {
  "": 2, Kocovina: 2, Alkohol: 2, "Jiné": 2, Celebrita: 1, Doprava: 1, "Osobní": 1, "Práce": 0, Dluhy: 0, "Bez řidičáku": 0, "Bez práce": 1,
};

/**
 * Hráč s omluvenkou na zítřek ji drží, dokud ho trenér rozumně nepřemluví (podle důvodu, povahy
 * a vztahu); pak slíbí, že přijde, a slib omluvenku přepíše (`answerInMatchGroup`). Prompt dřív
 * psal „drž se omluvenky, NIKDY netvrď, že přijdeš“ proti „když tě přemluví, řekni, že přijdeš“:
 * Jelínek ani Přibyl (E2E 22. 11.) se nedali přemluvit ani jednou ze sedmi pokusů.
 * Null = přemluvit nejde (nemoc, pohřeb, zranění, stopka, výslech).
 */
export function absencePersuasionLine(
  a: { reason: string; text: string }, p: Pick<PlayerSnapshot, "discipline" | "coachRelationship">,
): string | null {
  if (HARD_ABSENCE_REASONS.has(a.reason) || HARD_ABSENCE_TEXT_RE.test(a.text)) return null;
  let ease = PERSUADE_EASE[a.reason] ?? 1;
  if (p.coachRelationship >= 60 || p.discipline >= 70) ease++;
  if (p.coachRelationship < 35) ease--;
  const how = ease >= 2
    ? "Když tě trenér rozumně přemluví (potřebuje tě, nabídne řešení, vezme zpátky volno), dáš se přemluvit."
    : ease === 1
      ? "Přemluvit se necháš, jen když ti trenér nabídne rozumné řešení nebo tě opravdu nutně potřebuje."
      : "Přemluvit se skoro nedáš: musel by ti nabídnout opravdu dobré řešení.";
  return `${how} Dokud tě nepřemluví, drž se omluvenky a netvrď, že přijdeš. `
    + "Když tě přemluví, řekni mu jasně, že nakonec přijdeš: hra to vezme jako slib a omluvenka padá.";
}

/** `life_context` z řádku hráče jako objekt; nečitelný JSON se zaloguje a bere jako prázdný. */
export function lifeOf(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, "nečitelný life_context", e);
    return {};
  }
}

/** Z `life_context` do snapshotu: jen platné tvary. */
export function pledgesFromLife(life: Record<string, unknown>): Pick<PlayerSnapshot, "trainingPledge" | "matchPledge"> {
  const t = life.trainingPledge as Partial<TrainingPledge> | undefined;
  const m = life.matchPledge as Partial<MatchPledge> | undefined;
  return {
    trainingPledge: t && (t.intent === "attend" || t.intent === "skip") && typeof t.from === "string" && typeof t.until === "string"
      ? t as TrainingPledge : undefined,
    matchPledge: m && (m.intent === "attend" || m.intent === "skip") && typeof m.matchKey === "string" && typeof m.matchDay === "string"
      ? m as MatchPledge : undefined,
  };
}

// ─── Zápis ──────────────────────────────────────────────────────────────────

/** Rozpis tréninků týmu (0 = neděle). Tým bez nastaveného tréninku netrénuje: prázdné pole. */
export async function loadTrainingDays(db: D1Database, teamId: string): Promise<number[]> {
  const row = await db.prepare(
    "SELECT user_id, training_type, training_sessions, training_days, training_plan FROM teams WHERE id = ?",
  ).bind(teamId).first<{ user_id: string | null; training_type: string | null; training_sessions: number | null; training_days: string | null; training_plan: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `rozpis tréninků ${teamId}`, e); return null; });
  if (!row) return [];
  const { parseTrainingPlan } = await import("../season/daily-tick");
  const { trainingWeekdays } = await import("../season/training");
  return trainingWeekdays(row, parseTrainingPlan(row.training_plan, teamId));
}

/** Herní dny se zápasem týmu v okně slibu: v den zápasu se netrénuje. */
async function loadMatchDays(db: D1Database, teamId: string, gameDay: string): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT DISTINCT substr(sc.scheduled_at, 1, 10) AS day FROM season_calendar sc
       JOIN matches m ON m.calendar_id = sc.id AND (m.home_team_id = ?1 OR m.away_team_id = ?1)
      WHERE sc.status = 'scheduled' AND substr(sc.scheduled_at, 1, 10) > ?2 AND substr(sc.scheduled_at, 1, 10) <= ?3`,
  ).bind(teamId, gameDay, shiftDay(gameDay, PLEDGE_WINDOW_DAYS)).all<{ day: string }>()
    .catch((e) => { logger.warn({ module: M }, `zápasy týmu ${teamId}`, e); return { results: [] as Array<{ day: string }> }; });
  return new Set(rows.results.map((r) => r.day));
}

/**
 * Hráč v odpovědi řekl, že přijde nebo nepřijde. Uloží slib (nový přepíše starší téhož druhu,
 * takže přemlouvání funguje) a pod zprávu dá poznámku pro trenéra. U zápasu rovnou odpoví
 * do kabiny zápasu, když už existuje. Nikdy nehází.
 */
export async function recordAttendancePledge(
  db: D1Database,
  o: { clubTeamId: string; convId: string; playerId: string; playerFirstName: string; pledge: RawAttendancePledge; now?: Date },
): Promise<TrainingPledge | MatchPledge | null> {
  try {
    const now = o.now ?? new Date();
    // Jen vlastní kádr (áčko nebo U21 klubu konverzace). Hráč na hostování jinde ani cizí hráč
    // si slibem nesmí vyrobit omluvenku nebo vynechaný trénink v cizím klubu.
    const rosterTeamId = await ownSquadTeamId(db, o.playerId, o.clubTeamId);
    if (!rosterTeamId) return null;
    const p = await db.prepare(
      `SELECT p.team_id, p.first_name, p.last_name, COALESCE(t.game_date, club.game_date) AS game_date
         FROM players p LEFT JOIN teams t ON t.id = p.team_id LEFT JOIN teams club ON club.id = ?
        WHERE p.id = ? AND p.team_id = ?`,
    ).bind(o.clubTeamId, o.playerId, rosterTeamId).first<{ team_id: string | null; first_name: string; last_name: string; game_date: string | null }>();
    if (!p?.team_id || !p.game_date) return null;
    const gameDay = p.game_date.slice(0, 10);
    const at = now.toISOString();
    let stored: TrainingPledge | MatchPledge | null = null;
    if (o.pledge.event === "training") {
      const resolved = resolveTrainingPledge(o.pledge, {
        gameDay, trainingDays: await loadTrainingDays(db, p.team_id), matchDays: await loadMatchDays(db, p.team_id, gameDay), at, convId: o.convId,
      });
      if (!resolved) return null;
      stored = { ...resolved, teamId: p.team_id };
      await db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.trainingPledge', json(?)) WHERE id = ?")
        .bind(JSON.stringify(stored), o.playerId).run();
    } else {
      const { findUpcomingMatchContext } = await import("../events/match-absences");
      const ctx = await findUpcomingMatchContext(db, p.team_id);
      if (!ctx) return null;
      const matchDay = ctx.scheduledAt.slice(0, 10);
      if (matchDay > shiftDay(gameDay, PLEDGE_WINDOW_DAYS)) return null;
      stored = { intent: o.pledge.intent, matchKey: ctx.matchKey, matchDay, at, convId: o.convId, teamId: p.team_id };
      await db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.matchPledge', json(?)) WHERE id = ?")
        .bind(JSON.stringify(stored), o.playerId).run();
      await answerInMatchGroup(db, { teamId: p.team_id, playerId: o.playerId, name: `${p.first_name} ${p.last_name}`, pledge: stored, now });
    }
    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
    ).bind(crypto.randomUUID(), o.convId, pledgeNote(o.playerFirstName, stored),
      JSON.stringify({ type: "attendance_pledge_note", event: o.pledge.event, intent: o.pledge.intent }),
      new Date(now.getTime() + 1000).toISOString()).run();
    logger.info({ module: M, teamId: o.clubTeamId }, `slib docházky ${o.pledge.event}/${o.pledge.intent} hráče ${o.playerId}`);
    return stored;
  } catch (e) {
    logger.warn({ module: M, teamId: o.clubTeamId }, `slib docházky hráče ${o.playerId}`, e);
    return null;
  }
}

/** Index varianty podle semínka (stejné semínko, stejná věta). */
export function variantFor(pool: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/**
 * Kabina zápasu už existuje (den před zápasem a v den zápasu): hráč v ní odpoví podle slibu.
 * Omluvenky se berou z poslední odpovědi hráče (`recordedExcuses`), takže „přijdu“ ho do zápasu
 * vrátí a „nemůžu“ ho omluví. Když už odpověděl stejně, nic se nepíše.
 */
async function answerInMatchGroup(
  db: D1Database, o: { teamId: string; playerId: string; name: string; pledge: MatchPledge; now: Date },
): Promise<void> {
  const conv = await db.prepare(
    `SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.team_id = ? AND c.type = 'squad_group' AND json_extract(m.metadata, '$.calendarId') = ? LIMIT 1`,
  ).bind(o.teamId, o.pledge.matchKey).first<{ id: string }>();
  if (!conv) return;
  const last = await db.prepare(
    `SELECT json_extract(metadata, '$.response') AS response FROM messages
      WHERE conversation_id = ? AND sender_type = 'player' AND sender_id = ? AND json_extract(metadata, '$.response') IS NOT NULL
      ORDER BY julianday(sent_at) DESC LIMIT 1`,
  ).bind(conv.id, o.playerId).first<{ response: string | null }>();
  const wanted = o.pledge.intent === "attend" ? "yes" : "no";
  if (last?.response === wanted) return;
  const body = variantFor(o.pledge.intent === "attend" ? MATCH_ATTEND_PLEDGE_TEXTS : MATCH_SKIP_PLEDGE_TEXTS, `${o.playerId}|${o.pledge.matchKey}`);
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
    ).bind(crypto.randomUUID(), conv.id, o.playerId, o.name, body,
      JSON.stringify({ type: "attendance", response: wanted, timing: "pledge", calendarId: o.pledge.matchKey }), o.now.toISOString()),
    db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?")
      .bind(`${o.name}: ${body}`.slice(0, 100), o.now.toISOString(), conv.id),
  ]);
}

// ─── Vyhodnocení ────────────────────────────────────────────────────────────

/** Omluvná SMS po porušeném slibu, když model nejede (≥ 8 variant, hráč dostane tu, kterou ještě neposlal). */
export const BROKEN_PLEDGE_SMS: readonly string[] = [
  "Trenére, sorry. Slíbil jsem, že na trénink přijdu, a nepřišel jsem. Příště to fakt dodržím.",
  "Vím, že jsem sliboval trénink. Nevyšlo to, omlouvám se, trenére.",
  "Trenére, posral jsem to, na trénink jsem nedorazil, i když jsem slíbil. Mrzí mě to.",
  "Omlouvám se za ten trénink, trenére. Slíbil jsem a nepřišel jsem, to se nedělá.",
  "Trenére, slovo jsem nedodržel, na tréninku jsem nebyl. Příště budu první na place.",
  "Sorry, trenére. Sliboval jsem, že dorazím, a pak to nedopadlo. Napravím to.",
  "Trenére, vím, že jsem měl být na tréninku. Neklaplo to, omlouvám se.",
  "Nedorazil jsem, i když jsem to sliboval. Trenére, fakt se omlouvám.",
];

interface PledgeRow {
  id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null;
  team_id: string | null; club_id: string | null; club_user_id: string | null; game_date: string | null;
  pledge: string | null; match_pledge: string | null; absence: string | null;
}

function parsePledge<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch (e) {
    logger.warn({ module: M }, "nečitelný slib docházky", e);
    return null;
  }
}

/**
 * Denně (transfer-pressure-tick, 10:00 UTC, po ranním tréninku): porušený slib „přijdu“ zhorší
 * vztah k trenérovi a hráč se omluví (model s fakty, jinak předem napsaná varianta). Spotřebované
 * a prošlé sliby se smažou. Vrací počet porušených.
 */
export async function settleAttendancePledges(db: D1Database, env?: ChatEnv, now: Date = new Date()): Promise<number> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.team_id,
            COALESCE(t.parent_team_id, t.id) AS club_id, club.user_id AS club_user_id, t.game_date,
            json_extract(p.life_context, '$.trainingPledge') AS pledge,
            json_extract(p.life_context, '$.matchPledge') AS match_pledge,
            json_extract(p.life_context, '$.absence') AS absence
       FROM players p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN teams club ON club.id = COALESCE(t.parent_team_id, t.id)
      WHERE json_valid(p.life_context)
        AND (json_extract(p.life_context, '$.trainingPledge') IS NOT NULL OR json_extract(p.life_context, '$.matchPledge') IS NOT NULL)`,
  ).all<PledgeRow>()
    .catch((e) => { logger.warn({ module: M }, "sliby docházky", e); return { results: [] as PledgeRow[] }; });

  let broken = 0;
  for (const r of rows.results) {
    try {
      const day = (r.game_date ?? now.toISOString()).slice(0, 10);
      const t = parsePledge<TrainingPledge>(r.pledge);
      const m = parsePledge<MatchPledge>(r.match_pledge);
      const drop: string[] = [];
      if (t && (t.outcome || t.until < day)) drop.push("'$.trainingPledge'");
      if (m && m.matchDay < day) drop.push("'$.matchPledge'");
      if (t?.outcome === "broken" && r.club_id) {
        broken++;
        await applyCoachRelationDelta(db, {
          playerId: r.id, delta: BROKEN_PLEDGE_RELATION, source: "promise",
          description: "Slíbil, že přijde na trénink, a nepřišel",
          gameDate: day, referenceId: `pledge-${r.id}-${t.outcomeDay ?? day}`,
        }).catch((e) => logger.warn({ module: M }, `vztah po porušeném slibu ${r.id}`, e));
        if (r.club_user_id && r.club_user_id !== "ai") await sendApology(db, env, r, t);
      }
      if (drop.length > 0) {
        await db.prepare(`UPDATE players SET life_context = json_remove(life_context, ${drop.join(", ")}) WHERE id = ?`).bind(r.id).run();
      }
    } catch (e) {
      logger.warn({ module: M }, `vyhodnocení slibu docházky ${r.id}`, e);
    }
  }
  return broken;
}

async function sendApology(db: D1Database, env: ChatEnv | undefined, r: PledgeRow, t: TrainingPledge): Promise<void> {
  const absence = parsePledge<{ reason?: string; category?: string }>(r.absence);
  const reason = absence?.category === "training" && absence.reason ? ` Proč jsi nepřišel: ${absence.reason}.` : "";
  const { sendEventSms } = await import("./event-sms");
  await sendEventSms(db, env, {
    clubTeamId: r.club_id!,
    player: { id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
    instruction: `Trenérovi jsi slíbil, že přijdeš na trénink ${dayPhrase(t.outcomeDay ?? t.from)}, a nepřišel jsi.${reason} `
      + "Omluv se mu podle své povahy (upřímně, nebo s výmluvou), nic dalšího neslibuj naprázdno.",
    fallback: BROKEN_PLEDGE_SMS,
    seed: `pledge|${r.id}|${t.outcomeDay ?? t.from}`,
    scenarioId: "attendance_pledge_broken",
    metadata: { type: "attendance_pledge", outcome: "broken" },
  }).catch((e) => logger.warn({ module: M }, `omluva za trénink ${r.id}`, e));
}
