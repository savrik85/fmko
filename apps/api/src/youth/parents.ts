/**
 * Fotbaloví rodiče v U21 (F12): rodič hráče z dorostu píše trenérovi přes Telefon (předpona `yp-`).
 *
 * Povahy:
 *  - ambitious_father: táta, který kdysi hrál okres a chce, aby kluk hrál,
 *  - worried_mother: máma, která se bojí o zdraví a po ignorování pohrozí přestupem do Vimperka,
 *  - sponsor_dad: táta s firmou, který klubu nabídne příspěvek, když kluk nastoupí od začátku,
 *  - quiet: tichý rodič, ozve se jen při zranění a po výhře.
 *
 * Tady jsou čisté funkce: kdo jsou rodiče, kdy píšou, prompty, kontrola textu od modelu,
 * rozpoznání odpovědi trenéra bez modelu a připravené texty. Databáze je v parents-db.ts.
 */
import { parseModelJson } from "../ai-coach/llm";
import { cleanDashes } from "../lib/dashes";
import { pragueHour } from "../lib/match-tick-schedule";
import { seedFromString } from "../lib/seed";
import { createRng } from "../generators/rng";
import { feminizeSurname, generateStaffFace } from "../staff/staff-generator";

export const PARENT_PARTICIPANT_PREFIX = "yp-";
export const PARENT_ARCHETYPES = ["ambitious_father", "worried_mother", "sponsor_dad", "quiet"] as const;
export type ParentArchetype = (typeof PARENT_ARCHETYPES)[number];
export type ParentTopic = "benched" | "injury" | "win";
export type ParentMood = "calm" | "pleased" | "upset" | "offended";
export type CoachIntent = "accept" | "decline" | "none";
export type CoachTone = "kind" | "neutral" | "rude";
export type ReplyOutcome = "deal_accepted" | "deal_declined" | "rude" | "kind" | "neutral";

/** Rodiče píšou jen přes den (Praha): od 8 do 21 hodin. */
export const PARENT_DAY_START = 8;
export const PARENT_DAY_END = 21;
/** Kam máma vyhrožuje, že kluk přestoupí. */
export const THREAT_TOWN = "Vimperk";

export function isParentArchetype(v: unknown): v is ParentArchetype {
  return typeof v === "string" && (PARENT_ARCHETYPES as readonly string[]).includes(v);
}

export function parentParticipantId(playerId: string): string {
  return `${PARENT_PARTICIPANT_PREFIX}${playerId}`;
}

export function isMother(archetype: ParentArchetype): boolean {
  return archetype === "worried_mother";
}

// ── Kdo jsou rodiče ─────────────────────────────────────────────────────────

/** Kolik rodičů má dorost klubu (dva nebo tři, stabilně podle klubu). */
export function parentCountFor(clubId: string): number {
  return 2 + (seedFromString(`parents:${clubId}`) % 2);
}

/** Povahy pro nové rodiče klubu: v pořadí podle klubu, bez těch, které už klub má. */
export function archetypesForClub(clubId: string, taken: readonly ParentArchetype[], n: number): ParentArchetype[] {
  const rng = createRng(seedFromString(`parent-archetypes:${clubId}`));
  const order = [...PARENT_ARCHETYPES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.filter((a) => !taken.includes(a)).slice(0, Math.max(0, n));
}

const FATHER_NAMES = [
  "Petr", "Jiří", "Martin", "Tomáš", "Pavel", "Jaroslav", "Miroslav", "Zdeněk", "Michal", "Roman",
  "Radek", "Aleš", "Libor", "Karel", "Josef", "Milan", "Luboš", "Vladimír", "Stanislav", "Jan",
];
const MOTHER_NAMES = [
  "Jana", "Petra", "Lenka", "Martina", "Hana", "Ivana", "Monika", "Markéta", "Kateřina", "Romana",
  "Pavla", "Dana", "Alena", "Simona", "Šárka", "Iveta", "Radka", "Zuzana", "Eva", "Jitka",
];

export interface ParentIdentity {
  firstName: string;
  lastName: string;
  avatar: string;
  age: number;
}

/** Jméno a obličej rodiče: příjmení po synovi (máma přechýlené), stabilně podle syna. */
export function generateParentIdentity(son: { id: string; lastName: string }, archetype: ParentArchetype): ParentIdentity {
  const rng = createRng(seedFromString(`parent:${son.id}`));
  const female = isMother(archetype);
  const age = rng.int(40, 54);
  return {
    firstName: rng.pick(female ? MOTHER_NAMES : FATHER_NAMES),
    lastName: female ? feminizeSurname(son.lastName) : son.lastName,
    avatar: JSON.stringify(generateStaffFace(rng, female, age)),
    age,
  };
}

/** Příspěvek táty podnikatele: 3 000 až 6 000 Kč po pětistovkách. */
export function dealAmount(seed: number): number {
  return 3000 + (Math.abs(seed) % 7) * 500;
}

export function formatKc(amount: number): string {
  return `${amount.toLocaleString("cs-CZ")} Kč`;
}

// ── Kdy rodič píše ──────────────────────────────────────────────────────────

export function isParentDaytime(now: Date): boolean {
  const hour = pragueHour(now);
  return hour !== null && hour >= PARENT_DAY_START && hour < PARENT_DAY_END;
}

/**
 * Kdy SMS po spouštěči odejde: za 25 až 150 minut (než si rodič zprávy všimne a napíše ji).
 * Když by to vyšlo na noc, napíše ráno mezi osmou a půl desátou.
 */
export function parentDeliveryTime(from: Date, seed: number): Date {
  const at = new Date(from.getTime() + (25 + (Math.abs(seed) % 126)) * 60_000);
  if (isParentDaytime(at)) return at;
  let t = at.getTime();
  for (let i = 0; i < 24 * 4 && pragueHour(new Date(t)) !== PARENT_DAY_START; i++) t += 15 * 60_000;
  const morning = new Date(t);
  morning.setUTCMinutes(0, 0, 0);
  return new Date(morning.getTime() + (Math.abs(seed) % 90) * 60_000);
}

/** Tichý rodič si na lavičku nestěžuje. */
export function parentWritesAbout(archetype: ParentArchetype, topic: ParentTopic): boolean {
  return !(archetype === "quiet" && topic === "benched");
}

/** Čeká rodič na odpověď? Stížnost a starost ano, pochvala po výhře a tichý rodič ne. */
export function topicNeedsReply(archetype: ParentArchetype, topic: ParentTopic): boolean {
  if (archetype === "quiet" || topic === "win") return false;
  if (archetype === "sponsor_dad" && topic === "injury") return false;
  return true;
}

// ── Odpověď trenéra bez modelu ──────────────────────────────────────────────

function plain(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const RUDE_RE = new RegExp([
  "\\bdebil", "\\bkreten", "\\bidiot", "\\bblbec", "\\bblba\\b", "\\bvul\\b", "kurv", "kurw", "\\bzmrd", "\\bhovad",
  "\\bsrack", "\\bprdel", "\\bserte\\b", "\\bseres\\b", "\\bnaser", "\\bpolib", "\\bdrz(te)? (hubu|zobak)", "\\bzavri\\b",
  "\\bnestarej", "\\bneotravuj", "\\bvypadn", "\\bzmiz", "do toho (vam|ti) nic", "\\bjdi(te)? do haje", "\\btrhni",
].join("|"));
const DECLINE_RE = new RegExp([
  "\\bne\\b", "\\bnebude\\b", "\\bneslib", "\\bnemuzu\\b", "\\bnejde\\b", "\\bnepujde\\b", "\\bnehraje\\b", "\\bnenastoupi",
  "\\bnechte si\\b", "\\bsi nechte\\b", "\\bnepotrebuj", "\\bneberu\\b", "\\bsestavu (si )?(delam|urcuju|skladam)",
  "\\bo sestave rozhoduj",
].join("|"));
const ACCEPT_RE = new RegExp([
  "\\bplati\\b", "\\bberu\\b", "\\bdohodnut", "\\bdomluven", "\\bjasne\\b", "\\bjasny\\b", "\\bano\\b", "\\bjo\\b", "\\bjj\\b",
  "\\bok\\b", "\\bokej", "\\bdobre\\b", "\\bsouhlas", "\\bbude hrat\\b", "\\bnastoupi\\b", "\\bpostavim\\b", "\\bod zacatku\\b",
  "\\bv zakladu\\b", "\\bdam ho\\b", "\\bmate to\\b",
].join("|"));
const KIND_RE = new RegExp([
  "\\bdek", "\\bdik", "\\brozumim", "\\bchapu", "\\bomlouv", "\\bpromin", "\\bneboj", "\\bv poradku", "\\bvazim",
  "\\bpozdrav", "\\buvidime", "\\bsikovn", "\\bsnazi", "\\bsanc",
].join("|"));

/**
 * Co trenér rodiči napsal, bez modelu (AI vypnutá) a jako pojistka proti modelu: kývl na
 * nabídku, odmítl ji, nebo nic; a jestli byl vlídný, nebo hrubý. Odmítnutí přebije kývnutí
 * („jasně že ne“).
 */
export function classifyCoachReply(text: string): { intent: CoachIntent; tone: CoachTone } {
  const t = plain(text);
  const intent: CoachIntent = DECLINE_RE.test(t) ? "decline" : ACCEPT_RE.test(t) ? "accept" : "none";
  const tone: CoachTone = RUDE_RE.test(t) ? "rude" : KIND_RE.test(t) ? "kind" : "neutral";
  return { intent, tone };
}

// ── Prompty ─────────────────────────────────────────────────────────────────

export interface ParentFacts {
  firstName: string;
  lastName: string;
  archetype: ParentArchetype;
  sonFirstName: string;
  sonLastName: string;
  clubName: string;
  mood: ParentMood;
  /** Rodič trenérovi ještě nepsal: představí se. */
  firstMessage: boolean;
}

export interface ParentHistoryLine {
  from: "coach" | "parent";
  body: string;
}

function g(f: Pick<ParentFacts, "archetype">, masculine: string, feminine: string): string {
  return isMother(f.archetype) ? feminine : masculine;
}

const PERSONA: Record<ParentArchetype, (f: ParentFacts) => string> = {
  ambitious_father: (f) => `Jsi ctižádostivý táta. Sám jsi kdysi hrál okres a myslíš si, že ${f.sonFirstName} je lepší, než si trenér myslí. Píšeš rázně a chceš, aby kluk hrál, ale sprostý nejsi.`,
  worried_mother: (f) => `Jsi starostlivá máma. Bojíš se, aby se ${f.sonFirstName} nezranil, a trápí tě, když je smutný. Píšeš zdvořile, ale citově. Když tě trenér přehlíží, umíš pohrozit, že kluk přestoupí do Vimperka.`,
  sponsor_dad: (f) => `Jsi táta, který má ve vsi firmu. Klubu rád přispěješ, ale chceš, aby ${f.sonFirstName} hrál. Píšeš věcně, jako podnikatel.`,
  quiet: () => "Jsi tichý rodič. Píšeš málo a krátce, trenéra nechceš otravovat.",
};

const MOOD_WORDS: Record<ParentMood, (f: ParentFacts) => string> = {
  calm: () => "Na trenéra nic nemáš.",
  pleased: (f) => `Z trenéra máš teď radost, ${g(f, "jsi spokojený", "jsi spokojená")}.`,
  upset: (f) => `Na trenéra ${g(f, "jsi naštvaný", "jsi naštvaná")}.`,
  offended: (f) => `Na trenéra ${g(f, "jsi uražený", "jsi uražená")}, protože tě přehlížel.`,
};

function personaHeader(f: ParentFacts): string {
  return `Jsi ${f.firstName} ${f.lastName}, ${g(f, "táta", "máma")} hráče ${f.sonFirstName} ${f.sonLastName}, který hraje za dorost (U21) klubu ${f.clubName}. ${PERSONA[f.archetype](f)} ${MOOD_WORDS[f.mood](f)}`;
}

function historyBlock(history: readonly ParentHistoryLine[] | undefined): string {
  const lines = (history ?? []).map((m) => `${m.from === "coach" ? "Trenér" : "Ty"}: ${m.body}`);
  return lines.length > 0 ? lines.join("\n") : "(zatím nic)";
}

function smsRules(f: ParentFacts, money: boolean): string {
  return `Pravidla:
- česky, jako obyčejná SMS: jedna až tři krátké věty, hovorově, podle své povahy
- trenérovi vykáš a oslovuješ ho „trenére“
- o synovi mluv jménem ${f.sonFirstName}
- nevymýšlej si výsledky, góly, jména dalších hráčů ani zápasy
- ${money ? "jediné číslo ve zprávě je částka v Kč ze zadání" : "žádná čísla"}
- nepoužívej dlouhou pomlčku (—)${f.firstMessage ? "\n- trenérovi píšeš poprvé: představ se celým jménem" : ""}`;
}

/** Co má rodič napsat po spouštěči. */
function topicTask(f: ParentFacts, topic: ParentTopic, amount: number | undefined): string {
  if (topic === "benched") {
    if (f.archetype === "sponsor_dad" && amount) {
      return `${f.sonFirstName} v posledních dvou zápasech dorostu vůbec nenastoupil. Nabídni trenérovi dohodu: když v příštím zápase nastoupí od začátku, pošleš klubu ${formatKc(amount)}. Částku napiš přesně a zeptej se, jestli to platí.`;
    }
    return isMother(f.archetype)
      ? `${f.sonFirstName} v posledních dvou zápasech dorostu vůbec nenastoupil a doma je smutný. Napiš trenérovi, jak se kluk trápí, a zeptej se, co dělá špatně.`
      : `${f.sonFirstName} v posledních dvou zápasech dorostu vůbec nenastoupil. Napiš trenérovi, co si o tom myslíš, a zeptej se, na čem kluk je.`;
  }
  if (topic === "injury") return `${f.sonFirstName} se zranil. Napiš trenérovi podle své povahy.`;
  return `Dorost vyhrál a ${f.sonFirstName} hrál. Napiš trenérovi pár slov podle své povahy.`;
}

export function buildParentSmsPrompt(
  f: ParentFacts, topic: ParentTopic, ctx: { dealAmount?: number; history?: readonly ParentHistoryLine[] },
): string {
  const money = topic === "benched" && f.archetype === "sponsor_dad" && !!ctx.dealAmount;
  return `${personaHeader(f)}
Píšeš SMS trenérovi klubu ${f.clubName}.

Rozhovor od nejstaršího:
${historyBlock(ctx.history)}

CO MÁŠ NAPSAT: ${topicTask(f, topic, ctx.dealAmount)}

${smsRules(f, money)}

Odpověz jen JSON: {"body": "text SMS"}`;
}

/** Rodič se urazil: trenér neodpověděl do lhůty, nebo byl hrubý. */
export function buildOffendedPrompt(f: ParentFacts, reason: "silence" | "rude", history: readonly ParentHistoryLine[]): string {
  const why = reason === "silence" ? "Napsal jsi trenérovi a on ti vůbec neodpověděl." : "Trenér ti odpověděl hrubě.";
  const task = isMother(f.archetype)
    ? `Napiš mu, že se s ním nedá domluvit a že ${f.sonFirstName} přestoupí do Vimperka, kde si kluků váží. Slovo Vimperk tam musí být.`
    : f.archetype === "sponsor_dad"
      ? "Napiš mu, že když o odpověď nestojí, peníze dáš radši jinam."
      : `Napiš mu, že tě to uráží a že si ${f.sonFirstName} zaslouží víc.`;
  return `${personaHeader({ ...f, mood: "offended" })}
${why}

Rozhovor od nejstaršího:
${historyBlock(history)}

CO MÁŠ NAPSAT: ${task}

${smsRules(f, false)}

Odpověz jen JSON: {"body": "text SMS"}`;
}

/** Dohoda o příspěvku se vyhodnotila: syn nastoupil od začátku (peníze jdou), nebo ne. */
export function buildDealResultPrompt(f: ParentFacts, verdict: "kept" | "broken", amount: number): string {
  const task = verdict === "kept"
    ? `${f.sonFirstName} nastoupil od začátku, jak jste se s trenérem domluvili. Napiš mu, že slovo platí a klubu posíláš ${formatKc(amount)}. Částku napiš přesně.`
    : `${f.sonFirstName} zase nezačínal, i když jste se s trenérem domluvili. Napiš mu, že dohoda neplatí a peníze si necháš. Částku nepiš.`;
  return `${personaHeader(f)}
Píšeš SMS trenérovi klubu ${f.clubName}.

CO MÁŠ NAPSAT: ${task}

${smsRules(f, verdict === "kept")}

Odpověz jen JSON: {"body": "text SMS"}`;
}

export interface ReplyContext {
  /** Otevřená nabídka příspěvku (táta podnikatel), na kterou trenér odpovídá. */
  offerAmount?: number | null;
  /** Dohoda už platí a čeká se na zápas. */
  activeDealAmount?: number | null;
}

export function buildParentReplyPrompt(
  f: ParentFacts, history: readonly ParentHistoryLine[], coachText: string, ctx: ReplyContext,
): string {
  const situation = ctx.offerAmount
    ? `Nabídl jsi trenérovi, že když ${f.sonFirstName} v příštím zápase nastoupí od začátku, pošleš klubu ${formatKc(ctx.offerAmount)}. Trenér na to teď odpovídá. Když kývl, potvrď dohodu i s částkou. Když odmítl, vezmi to podle povahy.`
    : ctx.activeDealAmount
      ? `S trenérem máte dohodu: když ${f.sonFirstName} nastoupí od začátku, pošleš klubu ${formatKc(ctx.activeDealAmount)}.`
      : "";
  const threat = isMother(f.archetype) ? " Když je hrubý, pohrozíš, že kluk přestoupí do Vimperka." : "";
  return `${personaHeader(f)}
Píšeš si SMS s trenérem klubu ${f.clubName}.${situation ? `\n${situation}` : ""}

Rozhovor od nejstaršího:
${historyBlock(history)}

Poslední zpráva trenéra: "${coachText}"

CO MÁŠ NAPSAT: odpověz mu na to, co napsal. Když je vlídný, uklidníš se. Když je hrubý, urazíš se.${threat} Nic neslibuj za klub.

${smsRules({ ...f, firstMessage: false }, !!(ctx.offerAmount || ctx.activeDealAmount))}

Zhodnoť i trenérovu zprávu:
- intent: "accept", když kývl na tvou nabídku příspěvku, "decline", když ji odmítl, jinak "none"
- tone: "kind", když byl vlídný nebo se omluvil, "rude", když byl hrubý nebo tě odbyl, jinak "neutral"

Odpověz jen JSON: {"body": "text SMS", "intent": "accept"|"decline"|"none", "tone": "kind"|"neutral"|"rude"}`;
}

// ── Kontrola textu od modelu ────────────────────────────────────────────────

/**
 * SMS od modelu: očistit a ověřit délku. Nabídka musí mít přesnou částku, výhrůžka Vimperk.
 * Jinak null a platí připravená věta.
 */
export function checkParentSms(raw: unknown, opts: { requireAmount?: number; requireWord?: string } = {}): string | null {
  const parsed = parseModelJson(raw);
  const text = typeof parsed?.body === "string" ? parsed.body : "";
  const body = cleanDashes(text.trim().replace(/^["„“]+|["“”]+$/g, "")).trim();
  if (body.length < 2 || body.length > 600) return null;
  if (opts.requireAmount && !body.replace(/[\s.]/g, "").includes(String(opts.requireAmount))) return null;
  if (opts.requireWord && !plain(body).includes(plain(opts.requireWord))) return null;
  return body;
}

export function parseParentReply(raw: unknown): { body: string; intent: CoachIntent; tone: CoachTone } | null {
  const parsed = parseModelJson(raw);
  if (!parsed) return null;
  const body = checkParentSms(parsed);
  if (!body) return null;
  const intent: CoachIntent = parsed.intent === "accept" || parsed.intent === "decline" ? parsed.intent : "none";
  const tone: CoachTone = parsed.tone === "kind" || parsed.tone === "rude" ? parsed.tone : "neutral";
  return { body, intent, tone };
}

// ── Připravené texty ────────────────────────────────────────────────────────

function pick(pool: readonly string[], seed: number): string {
  return pool[Math.abs(seed) % pool.length];
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Oslovení: poprvé se rodič představí, jinak „Trenére, …“. */
function address(f: ParentFacts, body: string): string {
  return f.firstMessage ? `Dobrý den, trenére, tady ${f.firstName} ${f.lastName}. ${upperFirst(body)}` : `Trenére, ${body}`;
}

const TOPIC_SMS: Record<ParentArchetype, Partial<Record<ParentTopic, string[]>>> = {
  ambitious_father: {
    benched: [
      "náš {son} zase dva zápasy jen seděl. Kluk maká na každém tréninku, tak proč nehraje? Chci vědět, na čem je.",
      "{son} už podruhé za sebou ani nenastoupil. Já jsem okres hrával a vím, že na to má. Co mu chybí?",
    ],
    injury: [
      "náš {son} je zraněný. Hlavně ať na něj po návratu nezapomenete a nesedí zase na lavičce.",
      "{son} se zranil. Doufám, že se o něj v klubu postaráte a pak dostane šanci.",
    ],
    win: [
      "tak vidíte, {son} na hřišti a hned výhra. Doufám, že příště půjde od začátku.",
      "{son} hrál a kluci vyhráli. To snad stačí jako důkaz, že patří do sestavy.",
    ],
  },
  worried_mother: {
    benched: [
      "náš {son} je smutný, že zase nehrál. Doma skoro nemluví. Můžete mi říct, co dělá špatně?",
      "{son} už dva zápasy jen sedí a trápí se tím. Mohl byste mu dát šanci? Strašně se snaží.",
    ],
    injury: [
      "náš {son} přišel domů zraněný. Jsem z toho celá špatná. Dáváte na kluky vůbec pozor?",
      "{son} se zranil a já nespím. Prosím vás, ať ho nikdo nežene na hřiště, dokud se to nezahojí.",
    ],
    win: [
      "{son} měl ze zápasu ohromnou radost. Hlavně ať se mu nic nestane.",
      "náš {son} přišel domů celý šťastný. Děkuju, že jste ho nechal hrát.",
    ],
  },
  sponsor_dad: {
    benched: [
      "náš {son} zase seděl. Mám firmu a klubu rád pomůžu: když v příštím zápase nastoupí od začátku, pošlu klubu {amount}. Platí?",
      "{son} dva zápasy nehrál. Navrhuju dohodu: když příště půjde od začátku, dám klubu {amount} na míče a dresy. Co vy na to?",
    ],
    injury: [
      "{son} je zraněný. Kdyby bylo potřeba něco zaplatit na doktora nebo maséra, dejte vědět.",
      "náš {son} se zranil. Ať se o něj v klubu dobře postarají, a kdyby bylo něco potřeba zaplatit, ozvěte se.",
    ],
    win: [
      "pěkný zápas. Když bude {son} hrát takhle často, klub ode mě něco dostane.",
      "{son} hrál a vyhráli jste. Takhle se mi to líbí, firma klubu ráda pomůže.",
    ],
  },
  quiet: {
    injury: ["{son} je zraněný, jen ať víte, že o tom doma víme. Díky za starost."],
    win: ["díky. {son} měl radost.", "{son} přišel ze zápasu spokojený. Děkujeme."],
  },
};

function fill(text: string, f: ParentFacts, amount?: number): string {
  return text.replace("{son}", f.sonFirstName).replace("{amount}", formatKc(amount ?? 0));
}

/** Připravená SMS rodiče po spouštěči (AI vypnutá nebo text od modelu neprošel). */
export function fallbackParentSms(f: ParentFacts, topic: ParentTopic, seed: number, ctx: { dealAmount?: number } = {}): string {
  const pool = TOPIC_SMS[f.archetype][topic] ?? TOPIC_SMS[f.archetype].win ?? TOPIC_SMS.quiet.win!;
  return address(f, fill(pick(pool, seed), f, ctx.dealAmount));
}

const OFFENDED_SMS: Record<Exclude<ParentArchetype, "quiet">, string[]> = {
  ambitious_father: [
    "Trenére, napsal jsem vám slušně a vy nic. Tak takhle to tedy chodí. {son} si zaslouží lepšího trenéra.",
    "Trenére, ani odpověď? Tak to jsem si o vás myslel víc. {son} to doma ode mě uslyší.",
  ],
  worried_mother: [
    "Trenére, když se s vámi nedá ani domluvit, {son} půjde do Vimperka. Tam si kluků váží.",
    "Trenére, tohle si nenechám líbit. Ve Vimperku by {son} hrál a nikdo by ho nepřehlížel.",
  ],
  sponsor_dad: [
    "Trenére, když nestojíte ani o odpověď, peníze dám radši jinam. Škoda.",
    "Trenére, tak nic. Firma má i jiné kluby, kterým může pomoct.",
  ],
};

/** SMS uraženého rodiče; tichý rodič se urazí mlčky (null). */
export function fallbackOffendedSms(f: ParentFacts, seed: number): string | null {
  if (f.archetype === "quiet") return null;
  return fill(pick(OFFENDED_SMS[f.archetype], seed), f);
}

const DEAL_KEPT_SMS = [
  "Trenére, {son} hrál od začátku, slovo platí. Posílám klubu {amount}.",
  "Trenére, díky. {son} nastoupil od začátku, takže posílám klubu {amount}, jak jsme se domluvili.",
];
const DEAL_BROKEN_SMS = [
  "Trenére, {son} zase nezačínal. Tak si peníze nechám, dohoda neplatí.",
  "Trenére, domluvili jsme se, a {son} stejně seděl. Peníze nebudou.",
];

export function fallbackDealResultSms(f: ParentFacts, verdict: "kept" | "broken", amount: number, seed: number): string {
  return fill(pick(verdict === "kept" ? DEAL_KEPT_SMS : DEAL_BROKEN_SMS, seed), f, amount);
}

const KIND_REPLIES: Record<ParentArchetype, string[]> = {
  ambitious_father: ["Dobře, trenére. Budu věřit, že {son} brzo dostane šanci.", "Tak jo, trenére. Hlavně ať kluk hraje."],
  worried_mother: ["Děkuju, trenére, uklidnil jste mě.", "Děkuju, trenére. Hned mi je líp, když vím, že na něj myslíte."],
  sponsor_dad: ["Dobře, trenére, domluvíme se.", "Rozumím, trenére. Kdyby něco, víte, kde mě najdete."],
  quiet: ["Děkujeme, trenére.", "Dobře, díky."],
};
const NEUTRAL_REPLIES = ["Rozumím, trenére.", "Dobře, trenére, uvidíme.", "Beru na vědomí, trenére."];
const DECLINED_REPLIES = ["Škoda, trenére. Tak nic, peníze si nechám.", "Dobře, trenére, jak myslíte. Nabídka padá."];
const ACCEPTED_REPLIES = [
  "Platí, trenére. Jakmile {son} nastoupí od začátku, pošlu klubu {amount}.",
  "Výborně, trenére, ruku na to. Jak {son} půjde od začátku, posílám klubu {amount}.",
];

/** Odpověď rodiče bez modelu podle toho, co trenér napsal. */
export function fallbackParentReply(f: ParentFacts, outcome: ReplyOutcome, seed: number, amount?: number): string {
  if (outcome === "deal_accepted") return fill(pick(ACCEPTED_REPLIES, seed), f, amount);
  if (outcome === "deal_declined") return pick(DECLINED_REPLIES, seed);
  if (outcome === "rude") return fallbackOffendedSms(f, seed) ?? "Dobře. Už vás nebudu otravovat.";
  if (outcome === "kind") return fill(pick(KIND_REPLIES[f.archetype], seed), f);
  return pick(NEUTRAL_REPLIES, seed);
}
