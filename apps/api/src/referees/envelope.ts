/**
 * Obálka pro sudího (F16), čisté funkce bez databáze.
 *
 * Úplatný sudí (vysoká úplatnost, typicky bafuňář nebo ambiciózní) delegovaný na derby pošle
 * jednomu z klubů nejasnou SMS: za „cestovné“ by si v zápase „dal větší pozor“. Trenér má tři
 * cesty: zaplatit (sporná situace v tom jednom zápase padne jeho týmu), ignorovat, nebo sudího
 * nahlásit komisaři rozhodčích. Zaplacená obálka zůstane v účetnictví jako hotovost bez dokladu
 * a revize účetnictví ji do 60 dní najde.
 *
 * Úplatnost NENÍ nový archetyp: pool rozhodčích (`REFEREE_POOL_MIX`) se nesmí měnit, jinak by
 * se sudí přejmenovali. Odvozuje se z archetypu a id, uložená hodnota má přednost.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { rivalitaHorka } from "../engine/fan-groups";
import { FINE_MAX } from "../competition/discipline";
import type { AiCoachProfile } from "../ai-coach/profile";
import { cleanReason, czk as czkEn, isRecord } from "../ai-coach/buy-decision";
import { promptName } from "../ai-coach/prompt-text";
import { styleText } from "../ai-coach/weekly-decision";

/** Předpona `participant_id` konverzace se sudím: `rf-<refereeId>`. */
export const ENVELOPE_PARTICIPANT_PREFIX = "rf-";

/** Od téhle úplatnosti sudí na derby obálku zkusí. */
export const ENVELOPE_CORRUPTIBILITY_THRESHOLD = 60;

/** Obálka bez odpovědi propadne nejpozději po tolika dnech (zápas se třeba po konci sezóny nehrál). */
export const ENVELOPE_EXPIRY_DAYS = 5;

/** Nejmenší pokuta za úplatek odhalený revizí účetnictví. */
export const BRIBE_FINE_MIN = 5_000;

export type EnvelopeChoice = "pay" | "ignore" | "report";

/**
 * Rozsah úplatnosti podle archetypu. Bafuňář se rád nechá pozvat na guláš, ambiciózní chce
 * výš a peníze na kurzy se hodí. Puntičkář a kartoví fanatici obálku neberou.
 */
const CORRUPTIBILITY_RANGE: Record<string, readonly [number, number]> = {
  bafunar: [55, 90],
  ambiciozni: [45, 80],
  domaci_kamarad: [30, 55],
  ustvany: [20, 45],
  pohodar: [15, 40],
  zelenac: [10, 35],
  klidny_veteran: [5, 25],
  piskavy_kohout: [5, 20],
  kartovy_cvok: [5, 20],
  puntickar: [0, 10],
};
const DEFAULT_RANGE: readonly [number, number] = [10, 30];

/** Výchozí úplatnost: stejný sudí má vždy stejnou hodnotu. */
export function defaultCorruptibility(archetype: string, refereeId: string): number {
  const [lo, hi] = CORRUPTIBILITY_RANGE[archetype] ?? DEFAULT_RANGE;
  return lo + (seedFromString(`corruptibility|${refereeId}`) % (hi - lo + 1));
}

/** Úplatnost sudího: uložená, jinak odvozená z archetypu a id. */
export function effectiveCorruptibility(r: { id: string; archetype: string; corruptibility?: number | null }): number {
  if (typeof r.corruptibility === "number" && Number.isFinite(r.corruptibility)) {
    return Math.max(0, Math.min(100, Math.round(r.corruptibility)));
  }
  return defaultCorruptibility(r.archetype, r.id);
}

/** Šance, že úplatný sudí na derby obálku opravdu nabídne. */
export function envelopeChance(corruptibility: number): number {
  if (corruptibility < ENVELOPE_CORRUPTIBILITY_THRESHOLD) return 0;
  return Math.min(0.8, (corruptibility - 40) / 50);
}

/**
 * Nabídne sudí obálku? Jen na derby (horká rivalita táborů, fans/fan-rivalries.ts) a jen úplatný.
 * Deterministické podle zápasu, takže opakovaný běh rozhodne stejně.
 */
export function shouldOfferEnvelope(matchId: string, corruptibility: number, rivalryHeat: number): boolean {
  if (!rivalitaHorka(rivalryHeat)) return false;
  const chance = envelopeChance(corruptibility);
  if (chance <= 0) return false;
  return createRng(seedFromString(`envelope|offer|${matchId}`)).random() < chance;
}

/** Kolik si sudí řekne: 3 000 až 8 000 Kč po pětistovkách, úplatnější víc. */
export function envelopeAmount(matchId: string, corruptibility: number): number {
  const rng = createRng(seedFromString(`envelope|amount|${matchId}`));
  const base = 3000 + Math.round(((Math.max(0, corruptibility - 50)) / 50) * 3000);
  const amount = base + rng.int(0, 4) * 500;
  return Math.min(8000, Math.max(3000, Math.round(amount / 500) * 500));
}

/**
 * Komu sudí napíše. Lidský trenér má přednost dvě ku jedné: obálka u AI klubu je jen stopa
 * v účetnictví, u člověka je to rozhodnutí.
 */
export function pickEnvelopeTarget(
  matchId: string,
  home: { id: string; human: boolean },
  away: { id: string; human: boolean },
): string {
  const roll = createRng(seedFromString(`envelope|target|${matchId}`)).random();
  if (home.human === away.human) return roll < 0.5 ? home.id : away.id;
  const human = home.human ? home : away;
  const other = home.human ? away : home;
  return roll < 2 / 3 ? human.id : other.id;
}

/** Stabilní klíče obálky: id řádku a reference platby. */
export function envelopeId(matchId: string): string {
  return `env-${matchId}`;
}
export function envelopeReferenceId(matchId: string): string {
  return `envelope-${matchId}`;
}

/** Pokuta za úplatek odhalený revizí: dvojnásobek obálky, aspoň 5 000 Kč, nejvýš strop sazebníku. */
export function bribeFine(amount: number): number {
  const doubled = Math.round((Math.max(0, amount) * 2) / 500) * 500;
  return Math.min(FINE_MAX, Math.max(BRIBE_FINE_MIN, doubled));
}

/** Částka po česku s mezerou jako oddělovačem tisíců. */
export function czk(n: number): string {
  return `${Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
}

const WEEKDAY_PHRASE = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];

/** „v neděli“ podle dne výkopu (herní čas, UTC). */
export function kickoffDayPhrase(kickoff: string): string {
  const d = new Date(kickoff);
  return Number.isFinite(d.getTime()) ? WEEKDAY_PHRASE[d.getUTCDay()] : "v příštím kole";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface EnvelopeSmsInput {
  matchId: string;
  refereeName: string;
  refereeGender: string;
  opponentName: string;
  kickoff: string;
  amount: number;
}

/**
 * Nejasná SMS od sudího. Slovo úplatek v ní nepadne, jen „cestovné“, „guláš“ a „větší pozor“.
 * Číslo je jen u peněz.
 */
export function envelopeSmsText(o: EnvelopeSmsInput): string {
  const f = o.refereeGender === "f";
  const day = kickoffDayPhrase(o.kickoff);
  const money = czk(o.amount);
  const variants = [
    `Dobrý den, pane trenére, tady ${o.refereeName}. ${capitalize(day)} pískám vaše derby s ${o.opponentName}. `
      + `Takové zápasy mívají vždycky pár sporných chvil a já jezdím z daleka, benzín je drahý. `
      + `Kdyby se našlo ${money} na cestovné, nemusíme to nikde rozebírat. Rozumíme si?`,
    `Zdravím, ${o.refereeName}. Delegovali mě na váš zápas s ${o.opponentName}, hraje se ${day}. `
      + `${f ? "Říkala" : "Říkal"} jsem si, že bychom se mohli domluvit, ať je to v klidu. `
      + `Obálka s ${money} by mi udělala radost a vám možná taky. Jak to myslím, si domyslíte.`,
    `Dobrý den, tady ${o.refereeName}, rozhodčí. ${capitalize(day)} se uvidíme na derby s ${o.opponentName}. `
      + `Kluci od vás jsou šikovní, byla by škoda, kdyby je o body připravila nějaká hloupá píšťalka. `
      + `Za ${money} na guláš a pivo bych si ${f ? "dala" : "dal"} větší pozor. Ozvěte se.`,
  ];
  return variants[seedFromString(`envelope|text|${o.matchId}`) % variants.length];
}

/** Hotové odpovědi pod SMS sudího. Cena v tlačítku není, je v SMS. */
export const ENVELOPE_OPTIONS: ReadonlyArray<{ id: EnvelopeChoice; label: string; text: string }> = [
  { id: "pay", label: "Zaplatit", text: "Dobře, domluveno. Obálku dostanete před zápasem." },
  { id: "ignore", label: "Ignorovat", text: "Nevím, o čem mluvíte. Uvidíme se na hřišti." },
  { id: "report", label: "Nahlásit komisaři", text: "Tohle jde rovnou komisaři rozhodčích." },
];

/** Co sudí odepíše. */
export const ENVELOPE_REPLIES = {
  paid: "Výborně, rozumíme si. Obálku nechte u správce v kabině a nikomu ani slovo.",
  noMoney: "Na to teď na účtu nemáte, pane trenére. Tak to nechme být, nebo se ozvěte, až to půjde.",
  ignored: "Jak myslíte. Tak se uvidíme na hřišti.",
  reported: "Cože? To byl jen vtip, nic víc. Uvidíme se na hřišti.",
  unclear: "Tak jak, domluvíme se, nebo ne? Stačí napsat.",
  closed: "Teď nemám čas, pane trenére. Uvidíme se na hřišti.",
};

// ── Rozpoznání odpovědi trenéra ──────────────────────────────────────────────

function plain(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const REPORT_RE = /\b(nahlas\w*|komisar\w*|komis\w*|udam|udat|udavat|svaz\w*|polici\w*|policajt\w*|stezova\w*|stiznost\w*|oznam\w*|prask\w*|bonzn\w*|zavr\w*|kriminal\w*|basu|base)\b/;
const IGNORE_RE = /\b(ne+|nikdy|nechci|neplatim|nezaplatim|nedam|neposlu|neprinesu|nedostan\w*|zadn\w*|zapomen\w*|ani korunu|ani halir|nemam zajem|o cem mluvite|nevim o cem|ignor\w*|neotravuj\w*|nepis\w*|kdepak|vylouceno|smula)\b/;
const PAY_RE = /\b(ano|jo+|jasne|ok|oki|okay|dobre|platim|zaplatim|zaplatime|platime|plati|poslu|posleme|dam|dame|prinesu|predam|beru|bereme|domluveno|dohodnuto|souhlasim|domluvime se|budete mit)\b/;

/**
 * Síto bez modelu. Vrací volbu, když z textu jasně plyne jedna; `"unclear"`, když nic;
 * `null`, když si odpověď protiřečí a rozhodnout má model.
 */
export function sieveEnvelopeReply(text: string): EnvelopeChoice | "unclear" | null {
  const t = plain(text);
  const hits = new Set<EnvelopeChoice>();
  if (REPORT_RE.test(t)) hits.add("report");
  if (IGNORE_RE.test(t)) hits.add("ignore");
  if (PAY_RE.test(t)) hits.add("pay");
  if (hits.size === 0) return "unclear";
  if (hits.size === 1) return [...hits][0];
  // „Ne, nahlásím vás“ je udání, ne ignorování.
  if (hits.has("report") && !hits.has("pay")) return "report";
  return null;
}

/** Odpověď modelu na volný text trenéra. */
export function readModelEnvelopeReply(raw: unknown): EnvelopeChoice | "unclear" | null {
  if (!isRecord(raw)) return null;
  const c = typeof raw.choice === "string" ? raw.choice.trim().toLowerCase() : "";
  return c === "pay" || c === "ignore" || c === "report" || c === "unclear" ? c : null;
}

// ── AI klub ──────────────────────────────────────────────────────────────────

export interface EnvelopeDecisionContext {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  /** Rezerva na provoz podle šetrnosti (`budgetReserve`). */
  reserve: number;
  amount: number;
  opponentName: string;
  refereeName: string;
}

export type EnvelopeCheck = { ok: true; choice: EnvelopeChoice; reason: string } | { ok: false; reason: string };

export function canAffordEnvelope(c: Pick<EnvelopeDecisionContext, "budget" | "reserve" | "amount">): boolean {
  return c.budget - c.amount >= c.reserve;
}

export const ENVELOPE_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "The referee delegated to your derby hinted by SMS that for some cash he would 'take better care' of the match.",
  "Decide as a sensible real manager with YOUR personality would. The game has already checked the money.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

export function renderEnvelopePrompt(c: EnvelopeDecisionContext): string {
  const p = c.profile;
  const options: string[] = [];
  if (canAffordEnvelope(c)) {
    options.push(`- "pay": you hand him ${czkEn(c.amount)} in cash. The disputed calls of this one match will go your way, but it is a bribe: a later audit of your club accounts can find the cash and the disciplinary board then fines the club.`);
  }
  options.push(`- "ignore": you pretend not to understand. Nothing happens, he referees the match as usual.`);
  options.push(`- "report": you report him to the referee commissioner. He is likely suspended for a few rounds, but he may hold a grudge against your club.`);
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${promptName(c.teamName)}: budget ${czkEn(c.budget)}, keep at least ${czkEn(c.reserve)} as a reserve.`,
    `MATCH: derby against ${promptName(c.opponentName)}. Referee ${promptName(c.refereeName, "the referee")} asks for ${czkEn(c.amount)}.`,
    "",
    "OPTIONS:",
    ...options,
    "",
    `Return {"choice": ${canAffordEnvelope(c) ? "\"pay\"|" : ""}"ignore"|"report", "reason": "one short English sentence"}.`,
  ].join("\n");
}

export function envelopeSchema(c: EnvelopeDecisionContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      choice: { type: "string", enum: canAffordEnvelope(c) ? ["pay", "ignore", "report"] : ["ignore", "report"] },
      reason: { type: "string" },
    },
    required: ["choice", "reason"],
    additionalProperties: false,
  };
}

/** Model smí jen nabídnuté volby; zaplatit jen nad rezervou. */
export function checkEnvelopeDecision(raw: unknown, c: EnvelopeDecisionContext): EnvelopeCheck {
  if (!isRecord(raw)) return { ok: false, reason: "odpověď není objekt" };
  const choice = typeof raw.choice === "string" ? raw.choice.trim().toLowerCase() : "";
  const reason = cleanReason(raw.reason);
  if (choice === "ignore" || choice === "report") return { ok: true, choice, reason };
  if (choice !== "pay") return { ok: false, reason: `neznámá volba ${String(raw.choice).slice(0, 40)}` };
  if (!canAffordEnvelope(c)) return { ok: false, reason: "obálka by sáhla na rezervu" };
  return { ok: true, choice: "pay", reason };
}

/**
 * Pravidlo podle povahy, když model mlčí: odvážný ambiciózní trenér (risk 65+, ambice 60+)
 * zaplatí, má-li na to nad rezervou; opatrný (risk do 30) sudího nahlásí; ostatní dělají,
 * že nerozumí.
 */
export function fallbackEnvelopeDecision(c: EnvelopeDecisionContext): EnvelopeChoice {
  const p = c.profile;
  if (p.risk >= 65 && p.ambition >= 60 && canAffordEnvelope(c)) return "pay";
  if (p.risk <= 30) return "report";
  return "ignore";
}
