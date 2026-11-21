/**
 * Brigáda a lopaty přes kabinu (F1, docs/superpowers/plans/2026-11-20-winter-features-roadmap.md).
 *
 * Trenér napíše do kabiny výzvu („v sobotu v 9 na hřišti s lopatama, kdo přijde, má pivo“).
 * Síto a model ji rozpoznají stejně jako sázku kabiny (coach-commitments.ts handleSquadBet),
 * čas a pivo vyčte kód. Brigáda se zapíše do `coach_commitments` (kind `brigade`, `due_at` =
 * začátek brigády) a vyhodnotí ji denní `settleCoachCommitments`:
 *
 *  - kdo přijde, rozhoduje vztah k trenérovi, disciplína, kocovina a směna (`brigadeAttendanceChance`),
 *  - u nejbližšího domácího zápasu se sněhem odklidí aspoň 6 lidí sníh zdarma s účinností
 *    jako firma (`stadiums.pitch_snow_clearing_volunteer`, spotřebuje `applyPitchWear`),
 *  - bez sněhu brigáda přidá kondici hřiště, málo lidí znamená polovičatý výsledek,
 *  - kdo nepřišel s chabou výmluvou, toho to trochu stojí (nálada),
 *  - kapitán napíše do kabiny, jak to dopadlo (s fotkou od Workers AI), a obec si to zapíše do kroniky.
 *
 * Nejvýš jedna brigáda za týden. Zápas se kvůli sněhu neodkládá (zasahuje do rozpisu a fronty).
 * AI kluby brigádu svolávají v týdenní správě (ai-coach/weekly-decision.ts, rozhoduje model).
 */

import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { createRng } from "../generators/rng";
import { occupationMatchAbsence } from "../generators/occupations";
import { VOLUNTEER_FULL_CREW } from "../stadium/pitch-care";
import { plainWords } from "./squad-talk";
import type { ChatEnv } from "./ai-player-chat";

const M = "squad-brigade";
const TZ = "Europe/Prague";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Od kolika lidí je brigáda aspoň napůl k něčemu. Plná parta je `VOLUNTEER_FULL_CREW` (6). */
export const BRIGADE_MIN_CREW = 3;
/** O kolik brigáda bez sněhu zvedne kondici hřiště. */
const PITCH_BONUS: Record<Exclude<BrigadeOutcome, "flop">, number> = { full: 8, partial: 4 };
/** Pivo pro brigádníky, když ho trenér slíbil (Kč na hlavu). */
export const BRIGADE_BEER_PER_HEAD = 50;
/** Nálada: kdo přišel, má radost z party; kdo se vymluvil na nic, schytá to od ostatních. */
const MORALE_ATTENDED = 2;
const MORALE_LAME_EXCUSE = -3;
/** Jak daleko po brigádě se hledá domácí zápas, kterému odklizený sníh pomůže. */
const MATCH_HORIZON_MS = 4 * DAY_MS;

// ─── Rozpoznání výzvy ───────────────────────────────────────────────────────

/** Malá písmena bez diakritiky, slova oddělená mezerou. */
function plain(s: string): string {
  return plainWords(s).join(" ");
}

/** Věty zprávy i s koncovým znaménkem. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Slova, která znamenají práci s lopatou nebo na hřišti. Na nich stojí pravidlo bez modelu. */
const STRONG_TERMS_RE = /\b(brigad\w*|lopat\w*|odkl[iy]z\w*|odklid\w*|odhaz\w*|prohrn\w*|uklid(it|ime|ite|te|me|i|u|em)?|ukliz\w*)\b/;
/** Slabší náznaky: model se zeptá, pravidlo je samo nebere. */
const WEAK_TERMS_RE = /\b(hrab\w*|zamet\w*|natr\w*|natir\w*|kolecko\w*|snih z hriste|sneh z hriste)\b/;

const DAY_WORDS: Record<string, number | "today" | "tomorrow" | "after_tomorrow"> = {
  dnes: "today", dneska: "today", dnesko: "today",
  zitra: "tomorrow", zejtra: "tomorrow", pozitri: "after_tomorrow", pozejtri: "after_tomorrow",
  nedele: 0, nedeli: 0, pondeli: 1, pondelka: 1, utery: 2, streda: 3, stredu: 3,
  ctvrtek: 4, ctvrtka: 4, patek: 5, patku: 5, sobota: 6, sobotu: 6, vikend: 6, vikendu: 6,
};
const DAY_RE = new RegExp(`\\b(${Object.keys(DAY_WORDS).join("|")})\\b`);
const HOUR_DIGIT_RE = /\b(?:v|ve|o|od)\s+(\d{1,2})(?:\s+(\d{2}))?\b/;
/** Čas s dvojtečkou bez předložky („v sobotu 9:30“), v původním textu. */
const RAW_CLOCK_RE = /\b(\d{1,2}):(\d{2})\b/;
const HOUR_WORDS: Record<string, number> = {
  jednu: 1, dve: 2, tri: 3, ctyri: 4, pet: 5, sest: 6, sedm: 7, osm: 8, devet: 9, deset: 10, jedenact: 11, dvanact: 12,
};
const HOUR_WORD_RE = new RegExp(`\\b(?:v|ve|o|od)\\s+(${Object.keys(HOUR_WORDS).join("|")})\\b`);
const PART_OF_DAY: Array<[RegExp, number]> = [
  [/\bpo treninku\b/, 19], [/\bpo praci\b/, 16], [/\bvecer\b/, 17], [/\bodpoledne\b/, 14],
  [/\bpo obede\b/, 13], [/\bpoledne\b/, 12], [/\bdopoledne\b/, 10], [/\brano\b/, 9],
];
const AFTERNOON_RE = /\b(odpoledne|vecer|po praci|po treninku|po obede)\b/;
/**
 * „Po práci pivo“, „pivo po tréninku“: odměna po brigádě, ne její čas. Před hledáním času
 * se vynechá, jinak by z „v 9 …, po práci pivo platím“ byla brigáda ve 21:00.
 */
const BEER_AFTER_RE = /\bpo (praci|treninku|obede|brigade|akci)\s+(\w+\s+){0,2}?(piv\w*|basa|basu|bas|rund\w*|gulas\w*|klobas\w*|burt\w*|grilovack\w*|opekan\w*)\b|\b(piv\w*|basa|basu|rund\w*)\s+(\w+\s+)?po (praci|treninku|obede|brigade|akci)\b/g;

/** „Aby bylo hřiště…“, „kdo by byl ochotný“, „bylo by fajn“: podmiňovací způsob, ne minulost. */
const CONDITIONAL_STRIP_RE = /\b(aby|by|bys|bysme|bychom|byste|kdyby|kdybys|kdybysme|kdybychom)\b(\s+\w+)?\s+(byl|byla|bylo|byli)\b|\b(byl|byla|bylo|byli)\s+(by|bys|bysme|bychom|byste)\b/g;
/** Minulost: brigáda, která už byla, a poděkování za ni. */
const PAST_RE = new RegExp([
  "\\b(byl|byla|bylo|byli|probehl\\w*|minul\\w*|vcera|predevcirem|loni|tehdy|tenkrat|onehdy)\\b",
  "\\b(jsme|jste|sme|ste)\\s+(\\w+\\s+)?\\w{2,}(al|il|el|yl|ul)(a|o|i|y)?\\b",
  "\\b\\w{2,}(al|il|el|yl|ul)(a|o|i|y)?\\s+(jsme|jste|sme|ste)\\b",
  "\\b(co|kdo)\\s+(\\w+\\s+)?(prisl\\w*|prisel|dorazil\\w*|pomahal\\w*|makal\\w*|pomohl\\w*)\\b",
].join("|"));
/** Vágní nápad bez termínu („někdy na jaře bysme mohli“). */
const VAGUE_RE = /\b(nekdy|casem|na jare|v lete|na podzim|pristi mesic|po sezone|po zime|az bude cas|az se otepli)\b/;
/** Brigáda jako práce za peníze, ne v klubu („kdo z vás má přes zimu brigádu?“). */
const NOT_A_CALL_RE = /\b(mam|mas|ma|mate|maji)\s+(pres \w+ |v lete |v zime |ted )?brigad\w*\b|\bbrigad\w* (v praci|v mcdonaldu|na pile)\b|\bshani lidi\b/;
/** Sázka o výsledek („když vyhrajem, platím basu“), ne práce. */
const BET_CUE_RE = /\b(kdyz|jestli|jestlize|pokud)\s+(\w+\s+){0,2}(vyhrajem\w*|vyhrajete|udrzime|das|date|dame)\b|\bza (vyhru|gol|nulu|vitezstvi|tri body)\b|\bvsadim\b|\bsazk\w*\b/;
/** Odměna pivem (nebo jídlem, kterým se pivo zapíjí). */
const BEER_RE = /\b(piv\w*|basa|basu|bas|rund\w*|na jedno|platim|zvu|gulas\w*|klobas\w*|burt\w*)\b/;

function isPast(plainSentence: string): boolean {
  return PAST_RE.test(plainSentence.replace(CONDITIONAL_STRIP_RE, " "));
}

function hasTimeMarker(plainText: string): boolean {
  return DAY_RE.test(plainText) || HOUR_DIGIT_RE.test(plainText) || HOUR_WORD_RE.test(plainText)
    || PART_OF_DAY.some(([re]) => re.test(plainText));
}

/** Předběžné síto: model se volá jen u zpráv, ve kterých výzva k brigádě může být. */
export function brigadeHint(message: string): boolean {
  const p = plain(message);
  return STRONG_TERMS_RE.test(p) || WEAK_TERMS_RE.test(p);
}

/**
 * Pravidlo, když model nejede (AI vypnutá, výpadek): výzva je věta se slovem práce na hřišti,
 * která nemluví o minulosti ani o „někdy“, a zpráva má termín. Přísnější než model.
 */
export function looksLikeBrigadeCall(message: string): boolean {
  const all = plain(message);
  if (NOT_A_CALL_RE.test(all)) return false;
  const current = sentences(message).map(plain).filter((s) => s.length > 0 && !isPast(s));
  const clean = current.filter((s) => STRONG_TERMS_RE.test(s) && !VAGUE_RE.test(s));
  if (clean.length === 0) return false;
  return hasTimeMarker(current.join(" ")) || RAW_CLOCK_RE.test(message);
}

/**
 * Pojistka proti tomu, co model přehlédne: citace výzvy musí ve zprávě opravdu být a věta,
 * ve které je, nesmí mluvit o minulosti, o „někdy“ ani být jen sázkou o basu.
 */
export function brigadeQuoteHoldsUp(quote: unknown, message: string): boolean {
  if (typeof quote !== "string" || quote.trim().length < 3) return false;
  const q = plain(quote);
  if (!q || !plain(message).includes(q)) return false;
  const parts = sentences(message);
  const hit = parts.filter((s) => { const p = plain(s); return p.length > 0 && (q.includes(p) || p.includes(q)); });
  const context = hit.length > 0 ? hit : parts.filter((s) => q.includes(plain(s).slice(0, 12)));
  const ctx = plain((context.length > 0 ? context : [message]).join(" "));
  if (isPast(ctx) || VAGUE_RE.test(ctx) || NOT_A_CALL_RE.test(ctx)) return false;
  if (!STRONG_TERMS_RE.test(ctx) && !WEAK_TERMS_RE.test(ctx) && BET_CUE_RE.test(ctx)) return false;
  return true;
}

/** Slíbil trenér pivo (basu, rundu, „pak jdem na jedno“)? */
export function promisesBeer(message: string): boolean {
  return BEER_RE.test(plain(message));
}

// ─── Čas brigády ────────────────────────────────────────────────────────────

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PragueParts { y: number; m: number; d: number; h: number; min: number; dow: number }

function pragueParts(at: Date): PragueParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")), m: Number(get("month")), d: Number(get("day")),
    h: Number(get("hour")) % 24, min: Number(get("minute")), dow: WEEKDAYS_EN.indexOf(get("weekday")),
  };
}

/** Pražský místní čas → okamžik v UTC (zimní i letní čas). Den může přetéct do dalšího měsíce. */
function pragueTimeToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  const wanted = Date.UTC(y, m - 1, d, h, min);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = pragueParts(new Date(guess));
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += wanted - shown;
  }
  return new Date(guess);
}

function pragueDayKey(at: Date): string {
  const p = pragueParts(at);
  return `${p.y}-${p.m}-${p.d}`;
}

/**
 * Kdy brigáda začne, podle textu výzvy (pražský čas). Den: dnes, zítra, pozítří nebo den
 * v týdnu (první zmínka mimo věty v minulém čase), hodina číslem, slovem („ve dvě“ je
 * odpoledne) nebo částí dne. Bez dne zítra, bez hodiny v 10. Čas, který už minul, je za chvíli.
 */
export function parseBrigadeTime(message: string, now: Date): Date {
  const kept = sentences(message).filter((s) => { const p = plain(s); return p.length > 0 && !isPast(p); });
  const current = (kept.map(plain).join(" ") || plain(message)).replace(BEER_AFTER_RE, " ");
  const today = pragueParts(now);
  // Části vět (čárka, středník). Odpoledne podle slov platí jen ve stejné části jako hodina:
  // „v 9 na hřišti, večer grilovačka“ je pořád ráno.
  const parts = (kept.length ? kept : [message]).flatMap((s) => s.split(/[,;]/)).map((s) => s.trim()).filter(Boolean);
  const hourPart = parts.find((s) => { const p = plain(s); return HOUR_DIGIT_RE.test(p) || HOUR_WORD_RE.test(p) || RAW_CLOCK_RE.test(s); });
  const hourContext = hourPart ? plain(hourPart).replace(BEER_AFTER_RE, " ") : current;

  let hour: number | null = null;
  let minute = 0;
  // „v sobotu 9:00“ bez předložky: dvojtečka se v `plain` ztratí, hledá se v původním textu.
  const clock = RAW_CLOCK_RE.exec(kept.join(" ") || message);
  const digit = HOUR_DIGIT_RE.exec(current);
  const word = HOUR_WORD_RE.exec(current);
  const digitAt = digit ? digit.index : Infinity;
  const wordAt = word ? word.index : Infinity;
  if (digit && digitAt <= wordAt) {
    const h = Number(digit[1]);
    if (h >= 0 && h <= 23) {
      hour = h;
      const mm = digit[2] ? Number(digit[2]) : 0;
      minute = mm >= 0 && mm < 60 ? mm : 0;
    }
  } else if (word) {
    hour = HOUR_WORDS[word[1]] ?? null;
  } else if (clock && Number(clock[1]) <= 23 && Number(clock[2]) < 60) {
    hour = Number(clock[1]);
    minute = Number(clock[2]);
  }
  const fromNumber = hour !== null;
  if (hour === null) hour = partOfDayHour(parts);
  const explicitTime = hour !== null;
  if (hour === null) hour = 10;
  // Na brigádu se nechodí ve dvě ráno: „ve dvě“, „v pět“ je odpoledne.
  if (fromNumber && hour >= 1 && hour <= 6) hour += 12;
  else if (fromNumber && hour <= 11 && AFTERNOON_RE.test(hourContext)) hour += 12;

  const at = (offset: number) => pragueTimeToUtc(today.y, today.m, today.d + offset, hour as number, minute);
  const dayMatch = DAY_RE.exec(current);
  let offset: number;
  if (dayMatch) {
    const w = DAY_WORDS[dayMatch[1]];
    if (w === "today") offset = 0;
    else if (w === "tomorrow") offset = 1;
    else if (w === "after_tomorrow") offset = 2;
    else {
      offset = (w - today.dow + 7) % 7;
      if (offset === 0 && at(0).getTime() <= now.getTime()) offset = 7;
    }
  } else {
    offset = explicitTime && at(0).getTime() > now.getTime() + 30 * 60_000 ? 0 : 1;
  }
  const result = at(offset);
  if (result.getTime() <= now.getTime()) return new Date(now.getTime() + 30 * 60_000);
  return result;
}

/**
 * Část dne bez hodiny („ráno brigáda, večer grilovačka“): přednost má část věty s brigádou,
 * pak ostatní v pořadí, v jakém je trenér napsal. Odměna po brigádě se nepočítá.
 */
function partOfDayHour(parts: string[]): number | null {
  const plainParts = parts.map((s) => plain(s).replace(BEER_AFTER_RE, " "));
  const brigade = plainParts.filter((p) => STRONG_TERMS_RE.test(p) || WEAK_TERMS_RE.test(p));
  for (const p of [...brigade, ...plainParts]) {
    const hit = PART_OF_DAY.find(([re]) => re.test(p));
    if (hit) return hit[1];
  }
  return null;
}

const WEEKDAY_ACC = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];

/** Kdy brigáda je, slovy pro kabinu: „dnes v 16:00“, „zítra v 10:00“, „v sobotu v 9:00“. */
export function brigadeWhenText(at: Date, now: Date): string {
  const p = pragueParts(at);
  const time = `${p.h}:${String(p.min).padStart(2, "0")}`;
  if (pragueDayKey(at) === pragueDayKey(now)) return `dnes v ${time}`;
  if (pragueDayKey(at) === pragueDayKey(new Date(now.getTime() + DAY_MS))) return `zítra v ${time}`;
  return `${WEEKDAY_ACC[p.dow] ?? "v sobotu"} v ${time}`;
}

// ─── Rozpoznání přes model ──────────────────────────────────────────────────

export interface BrigadeCall {
  at: Date;
  beer: boolean;
  quote: string;
  /** Kdo výzvu rozpoznal: model, nebo pravidlo při výpadku AI. */
  via: "model" | "rule";
}

/**
 * Výzva k brigádě ve zprávě do kabiny, nebo null. Síto, pak model (jako u sázky kabiny),
 * jeho citaci hlídá `brigadeQuoteHoldsUp`. Když model nejede, rozhodne `looksLikeBrigadeCall`.
 * Čas a pivo vždy vyčte kód, model by je mohl splést.
 */
export async function detectBrigadeCall(env: ChatEnv, message: string, now: Date): Promise<BrigadeCall | null> {
  if (!brigadeHint(message)) return null;
  const make = (quote: string, via: BrigadeCall["via"]): BrigadeCall => ({
    at: parseBrigadeTime(message, now), beer: promisesBeer(message), quote, via,
  });
  let raw: { kind?: unknown; quote?: unknown } | null = null;
  try {
    const chat = await import("./ai-player-chat");
    raw = await chat.askModelJson<{ kind?: unknown; quote?: unknown }>(env, [
      chat.COACH_TEXT_RULE,
      "Trenér vesnického fotbalového týmu napsal do skupinového chatu celé kabiny:",
      chat.coachQuote(message),
      "",
      "Svolává v ní kabinu na brigádu, tedy společnou práci na hřišti nebo v areálu klubu (odklízení sněhu, úklid, hrabání, natírání, opravy) v nejbližších dnech?",
      "Brigáda to NENÍ: vzpomínka na brigádu, která už byla, poděkování za ni, sázka o pivo nebo o výsledek, brigáda v práci nebo jinde než v klubu,",
      "vágní nápad („někdy bychom mohli“, „na jaře“), zpráva jen o počasí nebo o sněhu bez výzvy k práci.",
      "kind: \"brigade\" nebo \"none\". Do quote dej DOSLOVA tu část zprávy, ve které výzva je, u none prázdný řetězec.",
      "Vrať POUZE JSON: {\"kind\": \"brigade\"|\"none\", \"quote\": \"...\"}",
    ].join("\n"), 100);
  } catch (e) {
    logger.warn({ module: M }, "rozpoznání brigády: model nejede, rozhodne pravidlo", e);
    return looksLikeBrigadeCall(message) ? make("", "rule") : null;
  }
  if (!raw) {
    logger.warn({ module: M }, "rozpoznání brigády: model nevrátil JSON, rozhodne pravidlo");
    return looksLikeBrigadeCall(message) ? make("", "rule") : null;
  }
  if (raw.kind !== "brigade" || !brigadeQuoteHoldsUp(raw.quote, message)) return null;
  return make(String(raw.quote), "model");
}

// ─── Kdo přijde ─────────────────────────────────────────────────────────────

export interface BrigadeCandidate {
  coachRelationship: number;
  discipline: number;
  /** Ranní kocovina po hospodě (`life_context.hangover`). */
  hangover: boolean;
  /** Povolání (`life_context.occupation`): směnaři a hospodští mají často službu. */
  occupation?: string | null;
}

const ATTENDANCE_BASE = 0.4;
const ATTENDANCE_BEER = 0.12;
const ATTENDANCE_HANGOVER = 0.3;
/** `occupationMatchAbsence` je pár procent na zápas; ranní brigádu směna bere víc. */
const ATTENDANCE_SHIFT_WEIGHT = 5;

/** Šance, že hráč na brigádu přijde. Stejný styl jako `persuadeChance` (squad-talk.ts). */
export function brigadeAttendanceChance(p: BrigadeCandidate, beer: boolean): number {
  const chance = ATTENDANCE_BASE
    + (beer ? ATTENDANCE_BEER : 0)
    + (p.coachRelationship - 50) / 200
    + (p.discipline - 50) / 250
    - (p.hangover ? ATTENDANCE_HANGOVER : 0)
    - occupationMatchAbsence(p.occupation ?? undefined) * ATTENDANCE_SHIFT_WEIGHT;
  return Math.max(0.05, Math.min(0.9, chance));
}

export type BrigadeOutcome = "full" | "partial" | "flop";

/** Šest a víc lidí plná parta, tři až pět polovičatý výsledek, míň nic. */
export function brigadeOutcome(attendees: number): BrigadeOutcome {
  if (attendees >= VOLUNTEER_FULL_CREW) return "full";
  if (attendees >= BRIGADE_MIN_CREW) return "partial";
  return "flop";
}

// ─── Zápis ──────────────────────────────────────────────────────────────────

export interface BrigadeDetails {
  /** Začátek brigády (ISO), stejný jako `due_at`. */
  at?: string;
  beer?: boolean;
  /** Tým, jehož kabina brigádu svolala (U21 kabina chodí na hřiště áčka). */
  rosterTeamId?: string;
  source?: "kabina" | "ai_weekly";
  // Po vyhodnocení:
  attendees?: number;
  outcome?: BrigadeOutcome;
  snow?: boolean;
  matchId?: string | null;
}

function parseDetails(raw: string | null): BrigadeDetails {
  if (!raw) return {};
  try { return JSON.parse(raw) as BrigadeDetails; } catch (e) {
    logger.warn({ module: M }, "nečitelné detaily brigády", e);
    return {};
  }
}

function trimQuote(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

/**
 * Brigáda, která tento týden brání další: svolaná za posledních 7 dní, nebo ještě neodpracovaná.
 * Zrušená („to nebyla brigáda“) se nepočítá. Neodpracovaná starší než 14 dní je zaseknutá
 * (třeba zástupce kabiny zmizel z hráčů) a další brigádu blokovat nesmí.
 */
const BRIGADE_BLOCKS_SQL = `team_id = ? AND kind = 'brigade' AND status != 'cancelled'
  AND (made_at > ? OR (status = 'active' AND made_at > ?))`;

function blockBinds(clubTeamId: string, now: Date): [string, string, string] {
  return [clubTeamId, new Date(now.getTime() - WEEK_MS).toISOString(), new Date(now.getTime() - 2 * WEEK_MS).toISOString()];
}

export async function brigadeThisWeek(db: D1Database, clubTeamId: string, now: Date): Promise<{ id: string; quote: string | null } | null> {
  return db.prepare(`SELECT id, quote FROM coach_commitments WHERE ${BRIGADE_BLOCKS_SQL} ORDER BY made_at DESC LIMIT 1`)
    .bind(...blockBinds(clubTeamId, now)).first<{ id: string; quote: string | null }>();
}

/**
 * Zapíše brigádu jedním příkazem i s kontrolou „jedna za týden“: dva souběžné běhy (opakovaná
 * fronta, dvě zprávy naráz) nezaloží dvě brigády. Vrací id, nebo null, když už brigáda je.
 */
async function insertBrigade(
  db: D1Database,
  o: { clubTeamId: string; representativeId: string; convId: string | null; at: Date; beer: boolean; quote: string; rosterTeamId: string; source: BrigadeDetails["source"]; now: Date },
): Promise<string | null> {
  const id = crypto.randomUUID();
  const details: BrigadeDetails = { at: o.at.toISOString(), beer: o.beer, rosterTeamId: o.rosterTeamId, source: o.source };
  const res = await db.prepare(
    `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
     SELECT ?, ?, ?, ?, 'brigade', 'active', ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM coach_commitments WHERE ${BRIGADE_BLOCKS_SQL})`,
  ).bind(id, o.clubTeamId, o.representativeId, o.convId, o.now.toISOString(), o.at.toISOString(), o.quote, JSON.stringify(details),
    ...blockBinds(o.clubTeamId, o.now)).run();
  return (res.meta?.changes ?? 0) > 0 ? id : null;
}

async function postSystemNote(db: D1Database, convId: string, body: string, metadata: Record<string, unknown>, now: Date): Promise<void> {
  // O sekundu později než zpráva trenéra, ať je v kabině až pod ní.
  await db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
     VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
  ).bind(crypto.randomUUID(), convId, body, JSON.stringify(metadata), new Date(now.getTime() + 1000).toISOString()).run();
}

/**
 * Zpráva trenéra do kabiny: rozpozná výzvu k brigádě a zapíše ji. Volá se z odpovědi kabiny
 * (coach-initiated.ts) souběžně se sázkou a proslovem, nikdy nehází. Vrací id brigády, nebo null.
 */
export async function handleSquadBrigade(
  db: D1Database,
  env: ChatEnv,
  o: { teamId: string; convId: string; message: string; representative: { id: string; firstName: string }; now?: Date },
): Promise<string | null> {
  try {
    if (!brigadeHint(o.message)) return null;
    const now = o.now ?? new Date();
    const call = await detectBrigadeCall(env, o.message, now);
    if (!call) return null;
    const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(o.teamId).first<{ id: string }>();
    const clubTeamId = club?.id ?? o.teamId;
    const quote = trimQuote(o.message);
    const id = await insertBrigade(db, {
      clubTeamId, representativeId: o.representative.id, convId: o.convId, at: call.at, beer: call.beer, quote,
      rosterTeamId: o.teamId, source: "kabina", now,
    });
    if (!id) {
      const existing = await brigadeThisWeek(db, clubTeamId, now);
      // Stejná zpráva zpracovaná podruhé (opakovaný běh): brigáda už je zapsaná, nic dalšího.
      if (!existing || existing.quote === quote) return existing?.id ?? null;
      const told = await db.prepare(
        "SELECT 1 FROM messages WHERE conversation_id = ? AND json_extract(metadata, '$.type') = 'brigade_refused' AND json_extract(metadata, '$.brigadeId') = ? LIMIT 1",
      ).bind(o.convId, existing.id).first();
      if (!told) {
        await postSystemNote(db, o.convId, "📝 Brigáda už tento týden je domluvená, druhou kabina nebere.",
          { type: "brigade_refused", brigadeId: existing.id }, now);
      }
      return null;
    }
    await postSystemNote(db, o.convId, `📝 Kabina si zapsala brigádu: ${brigadeWhenText(call.at, now)}${call.beer ? ", pivo platí trenér" : ""}.`,
      { type: "coach_commitment_note", commitmentId: id, kind: "brigade", at: call.at.toISOString() }, now);
    logger.info({ module: M, teamId: clubTeamId }, `brigáda ${call.at.toISOString()} (${call.via})`);
    return id;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `brigáda v kabině ${o.convId}`, e);
    return null;
  }
}

/**
 * Brigáda AI klubu z týdenní správy (rozhodl model, nebo pravidlo při výpadku). Bez kabiny:
 * AI trenérovi nikdo nepíše, dopad na hřiště i zápis do kroniky platí stejně. Vrací id, nebo null.
 */
export async function scheduleClubBrigade(
  db: D1Database,
  o: { clubTeamId: string; at: Date; beer: boolean; now?: Date },
): Promise<string | null> {
  const now = o.now ?? new Date();
  const rep = await db.prepare(
    `SELECT COALESCE(
       (SELECT p.id FROM players p JOIN teams t ON t.captain_id = p.id WHERE t.id = ? AND p.team_id = t.id),
       (SELECT p.id FROM players p WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.id LIMIT 1)
     ) AS id`,
  ).bind(o.clubTeamId, o.clubTeamId).first<{ id: string | null }>();
  if (!rep?.id) return null;
  return insertBrigade(db, {
    clubTeamId: o.clubTeamId, representativeId: rep.id, convId: null, at: o.at, beer: o.beer,
    quote: "Brigáda na hřišti z týdenní správy", rosterTeamId: o.clubTeamId, source: "ai_weekly", now,
  });
}

/**
 * Nejbližší domácí mistrovský zápas klubu od daného okamžiku (nejvýš `horizonMs` dopředu),
 * odehraný i neodehraný. `played` = už se odehrál (brigáda se vyhodnotila až po něm).
 */
export async function nextHomeMatchAfter(
  db: D1Database, clubTeamId: string, after: Date, horizonMs: number,
): Promise<{ matchId: string; scheduledAt: string; played: boolean } | null> {
  const row = await db.prepare(
    `SELECT m.id, m.status, c.scheduled_at FROM matches m JOIN season_calendar c ON c.id = m.calendar_id
      WHERE m.home_team_id = ? AND m.status != 'cancelled'
        AND julianday(c.scheduled_at) >= julianday(?) AND julianday(c.scheduled_at) <= julianday(?)
      ORDER BY julianday(c.scheduled_at) LIMIT 1`,
  ).bind(clubTeamId, after.toISOString(), new Date(after.getTime() + horizonMs).toISOString())
    .first<{ id: string; status: string; scheduled_at: string }>();
  return row ? { matchId: row.id, scheduledAt: row.scheduled_at, played: row.status !== "scheduled" && row.status !== "lineups_open" } : null;
}

async function snowAt(db: D1Database, scheduledAt: string): Promise<boolean> {
  const { resolveWeatherForDate } = await import("../season/season-weather");
  return (await resolveWeatherForDate(db, scheduledAt))?.weather === "snow";
}

export interface BrigadeOutlook {
  /** Brigádu jde tento týden svolat (žádná jiná za posledních 7 dní). */
  available: boolean;
  nextHomeMatchAt: string | null;
  snowAtNextHome: boolean;
  /** Kdy by brigáda byla: den před domácím zápasem v 10:00, nejdřív za hodinu. */
  dueAt: string;
}

/** Podklad pro týdenní správu AI klubu (weekly.ts → weekly-decision.ts). */
export async function loadBrigadeOutlook(db: D1Database, clubTeamId: string, now: Date): Promise<BrigadeOutlook> {
  const existing = await brigadeThisWeek(db, clubTeamId, now)
    .catch((e) => { logger.warn({ module: M, teamId: clubTeamId }, "brigáda tento týden", e); return { id: "?", quote: null }; });
  const found = await nextHomeMatchAfter(db, clubTeamId, now, WEEK_MS)
    .catch((e) => { logger.warn({ module: M, teamId: clubTeamId }, "domácí zápas pro brigádu", e); return null; });
  const next = found && !found.played ? found : null;
  const snow = next ? await snowAt(db, next.scheduledAt).catch((e) => {
    logger.warn({ module: M, teamId: clubTeamId }, "předpověď pro brigádu", e);
    return false;
  }) : false;
  const ref = next ? new Date(new Date(next.scheduledAt).getTime() - DAY_MS) : now;
  const p = pragueParts(ref);
  let due = pragueTimeToUtc(p.y, p.m, p.d + (next ? 0 : 1), 10, 0);
  const earliest = new Date(now.getTime() + HOUR_MS);
  if (due.getTime() < earliest.getTime()) due = earliest;
  return { available: !existing, nextHomeMatchAt: next?.scheduledAt ?? null, snowAtNextHome: snow, dueAt: due.toISOString() };
}

// ─── Vyhodnocení ────────────────────────────────────────────────────────────

/** Řádek z `settleCoachCommitments` (coach-commitments.ts), jen co brigáda potřebuje. */
export interface BrigadeSettleRow {
  id: string;
  team_id: string;
  player_id: string;
  due_at: string;
  details: string | null;
  conversation_id: string | null;
  first_name: string;
  last_name: string;
  club_user_id: string | null;
  game_date: string | null;
}

export interface BrigadeEnv {
  AI?: Ai;
  SEED_DATA?: R2Bucket;
  CACHE_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
}

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  personality: string | null;
  life_context: string | null;
  coach_relationship: number | null;
}

type NoShowReason = "work" | "hangover" | "lame";

interface Attendance {
  attended: RosterPlayer[];
  noShows: Array<{ player: RosterPlayer; reason: NoShowReason }>;
}

function jsonOf(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, "nečitelný JSON hráče u brigády", e);
    return {};
  }
}

/** Kdo přišel a proč ostatní ne. Zranění se nepočítají vůbec, s nimi trenér nepočítal. */
function rollAttendance(roster: RosterPlayer[], beer: boolean, rand: () => number): Attendance {
  const out: Attendance = { attended: [], noShows: [] };
  for (const p of roster) {
    const life = jsonOf(p.life_context);
    const personality = jsonOf(p.personality);
    const occupation = typeof life.occupation === "string" ? life.occupation : null;
    const candidate: BrigadeCandidate = {
      coachRelationship: p.coach_relationship ?? 50,
      discipline: typeof personality.discipline === "number" ? personality.discipline : 50,
      hangover: life.hangover === 1 || life.hangover === true,
      occupation,
    };
    if (rand() < brigadeAttendanceChance(candidate, beer)) {
      out.attended.push(p);
      continue;
    }
    // Směna je výmluva, kterou kluci uznají; kocovina a „nějak to nevyšlo“ ne.
    const shift = occupationMatchAbsence(occupation ?? undefined) * ATTENDANCE_SHIFT_WEIGHT;
    const reason: NoShowReason = candidate.hangover ? "hangover" : shift > 0 && rand() < shift * 2 ? "work" : "lame";
    out.noShows.push({ player: p, reason });
  }
  return out;
}

function peopleText(n: number): string {
  if (n === 0) return "nepřišel nikdo";
  if (n === 1) return "přišel 1 hráč";
  if (n <= 4) return `přišli ${n} hráči`;
  return `přišlo ${n} hráčů`;
}

function chronicleText(teamName: string, outcome: BrigadeOutcome, n: number, snow: boolean): string {
  const tail = outcome === "full" ? (snow ? "sníh z hřiště odházený před zápasem" : "hřiště dali do pořádku")
    : outcome === "partial" ? "hotová jen napůl"
      : "nic se neudělalo";
  return `${teamName}: brigáda na hřišti, ${peopleText(n)}, ${tail}.`;
}

const CAPTAIN_TEXT: Record<"full_snow" | "full_pitch" | "partial_snow" | "partial_pitch" | "flop", string[]> = {
  full_snow: [
    "Hotovo, trenére! Bylo nás {n}, hřiště je odházený a na zápas to bude. Lopaty jsou zpátky u kabin. 💪",
    "Sníh je pryč, trenére. Přišlo nás {n}, za dvě hodiny bylo hotovo. Na zápas to bude jak v létě. ❄️",
  ],
  full_pitch: [
    "Brigáda hotová. Přišlo nás {n}, díry zasypaný, brankoviště srovnaný. Hřiště vypadá o dost líp. 💪",
    "Hotovo, trenére. Bylo nás {n}, pohrabali jsme to, zasypali díry a uklidili kolem kabin.",
  ],
  partial_snow: [
    "Bylo nás jen {n}, trenére. Půlku hřiště jsme odházeli, víc to nešlo. Zbytek bude na zápas břečka.",
    "Přišlo nás {n}, na tolik sněhu málo. Pokutový území je čistý, zbytek nestihl nikdo.",
  ],
  partial_pitch: [
    "Přišlo nás jen {n}. Něco jsme udělali, ale na pořádnou brigádu nás bylo málo.",
    "Bylo nás {n}, trenére. Půlka práce hotová, na zbytek nebyly ruce.",
  ],
  flop: [
    "Trenére, přišli jsme {n}. S tímhle se nedalo nic dělat, tak jsme šli domů.",
    "Byli jsme tam {n}, trenére. Na celý hřiště je to k smíchu, nechali jsme to být.",
  ],
};
const CAPTAIN_ALONE = "Trenére, přišel jsem jen já. Sám s lopatou nic nezmůžu, šel jsem domů.";
const CAPTAIN_NOBODY = "Trenére, z brigády nic nebylo, nikdo nedorazil. Hřiště zůstalo, jak bylo.";

function pickText(pool: string[], seed: string): string {
  return pool[seedFromString(seed) % pool.length];
}

/** Co kapitán napíše do kabiny (bez herních čísel, jen kolik lidí přišlo). */
export function brigadeCaptainText(
  o: { id: string; outcome: BrigadeOutcome; attendees: number; snow: boolean; beer: boolean; lameName?: string | null },
): string {
  let text: string;
  if (o.outcome === "flop" && o.attendees === 0) text = CAPTAIN_NOBODY;
  else if (o.outcome === "flop" && o.attendees === 1) text = CAPTAIN_ALONE;
  else {
    const key = o.outcome === "flop" ? "flop" : `${o.outcome}_${o.snow ? "snow" : "pitch"}` as const;
    text = pickText(CAPTAIN_TEXT[key], o.id).replace("{n}", String(o.attendees));
  }
  if (o.beer && o.attendees > 0) text += " Pivo na trenéra jsme si dali, díky! 🍺";
  // Jméno v 1. pádě: jiný pád generovat neumíme.
  if (o.lameName) text += ` A ${o.lameName} se zase na něco vymluvil.`;
  return text;
}

function revertClaim(db: D1Database, id: string): Promise<unknown> {
  return db.prepare("UPDATE coach_commitments SET status = 'active', resolved_at = NULL WHERE id = ? AND status = 'kept'").bind(id).run()
    .catch((e) => logger.error({ module: M }, `vrácení brigády po chybě ${id}`, e));
}

/**
 * Vyhodnotí brigádu, jejíž čas nastal. Nejdřív ji atomicky zabere (`status = 'kept'`), takže
 * opakovaný běh (retry, dvojí cron, souběh) nemá druhý efekt ani druhou zprávu. Když zápis
 * dopadu selže, brigáda se vrátí mezi běžící a příští běh to zkusí znovu. Vrací, jestli ji uzavřel.
 */
export async function settleBrigade(db: D1Database, env: BrigadeEnv, r: BrigadeSettleRow, now: Date): Promise<boolean> {
  const claim = await db.prepare("UPDATE coach_commitments SET status = 'kept', resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(now.toISOString(), r.id).run();
  if ((claim.meta?.changes ?? 0) === 0) return false;

  const d = parseDetails(r.details);
  const rosterTeamId = d.rosterTeamId ?? r.team_id;
  const at = new Date(d.at ?? r.due_at);
  let attendance: Attendance;
  let outcome: BrigadeOutcome;
  let snow = false;
  let matchId: string | null = null;
  let teamName = "Klub";
  let lame: RosterPlayer | undefined;
  try {
    const roster = await db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.personality, p.life_context, p.coach_relationship FROM players p
        WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.id`,
    ).bind(rosterTeamId).all<RosterPlayer>();
    // Zranění zvlášť (spojení, ne korelovaný poddotaz přes injuries, viz D1 CPU limit).
    const injured = await db.prepare(
      "SELECT DISTINCT i.player_id FROM injuries i JOIN players p ON p.id = i.player_id WHERE p.team_id = ? AND i.days_remaining > 0",
    ).bind(rosterTeamId).all<{ player_id: string }>();
    const hurt = new Set(injured.results.map((x) => x.player_id));
    const rng = createRng(seedFromString(r.id));
    attendance = rollAttendance(roster.results.filter((p) => !hurt.has(p.id)), !!d.beer, () => rng.random());
    outcome = brigadeOutcome(attendance.attended.length);
    // Sníh pomůže jen zápasu, který se ještě nehrál. Když se brigáda vyhodnotila až po něm
    // (denní běh je dopoledne, brigáda byla odpoledne v den zápasu), přidá jen kondici hřiště.
    const next = await nextHomeMatchAfter(db, r.team_id, at, MATCH_HORIZON_MS);
    if (next) {
      matchId = next.matchId;
      snow = !next.played && await snowAt(db, next.scheduledAt);
    }
    const team = await db.prepare("SELECT name, village_id FROM teams WHERE id = ?").bind(r.team_id)
      .first<{ name: string | null; village_id: string | null }>();
    teamName = team?.name ?? teamName;
    const lameOnes = attendance.noShows.filter((x) => x.reason !== "work").map((x) => x.player);
    lame = lameOnes.length > 0 ? lameOnes[seedFromString(`${r.id}|lame`) % lameOnes.length] : undefined;

    const n = attendance.attended.length;
    const gameDate = (r.game_date ?? now.toISOString()).slice(0, 10);
    const stmts: D1PreparedStatement[] = [
      db.prepare(
        `UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.attendees', ?, '$.outcome', ?, '$.snow', json(?), '$.matchId', ?)
          WHERE id = ?`,
      ).bind(n, outcome, snow ? "true" : "false", matchId, r.id),
    ];
    if (outcome !== "flop" && !snow) {
      stmts.push(db.prepare("UPDATE stadiums SET pitch_condition = MIN(100, COALESCE(pitch_condition, 50) + ?) WHERE team_id = ?")
        .bind(PITCH_BONUS[outcome], r.team_id));
    }
    const moraleStmt = (ids: string[], delta: number) => db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
        WHERE id IN (${ids.map(() => "?").join(",")})`,
    ).bind(delta, ...ids);
    if (n > 0) stmts.push(moraleStmt(attendance.attended.map((p) => p.id), MORALE_ATTENDED));
    if (lameOnes.length > 0) stmts.push(moraleStmt(lameOnes.map((p) => p.id), MORALE_LAME_EXCUSE));
    if (team?.village_id) {
      stmts.push(db.prepare(
        `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
         VALUES (?, ?, ?, NULL, 'brigade_completed', ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), team.village_id, r.team_id, chronicleText(teamName, outcome, n, snow),
        JSON.stringify({ source: "club_brigade", brigadeId: r.id, attendees: n, outcome, snow }), gameDate, now.toISOString()));
    }
    await db.batch(stmts);
  } catch (e) {
    logger.error({ module: M, teamId: r.team_id }, `vyhodnocení brigády ${r.id}`, e);
    await revertClaim(db, r.id);
    return false;
  }

  const n = attendance.attended.length;
  // Sníh u zápasu: kolik lidí přišlo s lopatou, spotřebuje `applyPitchWear` u nejbližšího domácího zápasu.
  // Zvlášť, ať chybějící sloupec (kód nasazený před migrací 0319) neshodí zbytek brigády.
  if (outcome !== "flop" && snow) {
    await db.prepare("UPDATE stadiums SET pitch_snow_clearing_volunteer = MAX(COALESCE(pitch_snow_clearing_volunteer, 0), ?) WHERE team_id = ?")
      .bind(n, r.team_id).run()
      .catch((e) => logger.warn({ module: M, teamId: r.team_id }, `brigáda ${r.id}: zápis odklizeného sněhu`, e));
  }
  if (d.beer && n > 0) {
    const { recordTransaction } = await import("../season/finance-processor");
    await recordTransaction(db, r.team_id, "manager_social", -BRIGADE_BEER_PER_HEAD * n, "Pivo pro brigádníky",
      (r.game_date ?? now.toISOString()).slice(0, 10), `brigade-${r.id}`)
      .catch((e) => logger.warn({ module: M, teamId: r.team_id }, `brigáda ${r.id}: pivo`, e));
  }
  // AI trenérovi nikdo nepíše (spec AI klubů 3.2), dopad platí dál.
  if (r.club_user_id !== "ai" && r.conversation_id) {
    await postCaptainReport(db, env, r, { outcome, attendance, snow, beer: !!d.beer, lame, now });
  }
  logger.info({ module: M, teamId: r.team_id }, `brigáda ${r.id}: ${n} lidí, ${outcome}${snow ? ", sníh" : ""}`);
  return true;
}

/** Kapitán (nebo kdo přišel) napíše do kabiny, jak brigáda dopadla, s fotkou od Workers AI. */
async function postCaptainReport(
  db: D1Database,
  env: BrigadeEnv,
  r: BrigadeSettleRow,
  o: { outcome: BrigadeOutcome; attendance: Attendance; snow: boolean; beer: boolean; lame: RosterPlayer | undefined; now: Date },
): Promise<void> {
  const convId = r.conversation_id;
  if (!convId) return;
  const attended = o.attendance.attended;
  const poster = attended.find((p) => p.id === r.player_id) ?? attended[0]
    ?? { id: r.player_id, first_name: r.first_name, last_name: r.last_name };
  const text = brigadeCaptainText({
    id: r.id, outcome: o.outcome, attendees: attended.length, snow: o.snow, beer: o.beer,
    lameName: o.lame && o.lame.id !== poster.id ? o.lame.first_name : null,
  });
  let photo: { key: string; alt: string } | null = null;
  if (o.outcome !== "flop" && env.AI && env.SEED_DATA) {
    const { isAiEnabled } = await import("../lib/ai-provider");
    if (await isAiEnabled(env).catch((e) => { logger.warn({ module: M }, "přepínač AI u fotky z brigády", e); return false; })) {
      const { PHOTO_SCENES, generatePlayerPhoto } = await import("./player-photo");
      const scene = PHOTO_SCENES[o.snow ? "brigade_snow" : "brigade_pitch"];
      const key = scene ? await generatePlayerPhoto(env.AI, env.SEED_DATA, scene, crypto.randomUUID(), seedFromString(r.id)) : null;
      if (scene && key) photo = { key, alt: scene.alt };
      else logger.warn({ module: M, teamId: r.team_id }, `fotka z brigády ${r.id} se nepovedla, jde bez ní`);
    }
  }
  const name = `${poster.first_name} ${poster.last_name}`;
  const at = o.now.toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
    ).bind(crypto.randomUUID(), convId, poster.id, name, text, JSON.stringify({
      kabina: true, brigadeId: r.id, ...(photo ? { type: "photo", photoKey: photo.key, photoAlt: photo.alt } : {}),
    }), at),
    db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?")
      .bind(`${name}: ${photo ? "📷 " : ""}${text}`.slice(0, 100), at, convId),
    // Zápis brigády v kabině: proběhla, tlačítko „To nebyla brigáda“ už nemá smysl (web/telefon).
    db.prepare(
      `UPDATE messages SET metadata = json_set(metadata, '$.done', json('true'))
        WHERE conversation_id = ? AND json_extract(metadata, '$.type') = 'coach_commitment_note' AND json_extract(metadata, '$.commitmentId') = ?`,
    ).bind(convId, r.id),
  ]).catch((e) => logger.warn({ module: M, teamId: r.team_id }, `zpráva kapitána po brigádě ${r.id}`, e));
}
