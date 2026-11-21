/**
 * Drby o přestupech (F10): pravidla a texty bez databáze.
 *
 * Hospodský slyší, co manažer jinak nevidí: cizí skaut jezdí na jeho hráče, AI klub shání
 * posilu a padlo jméno jeho hráče, AI klub chce hráče pustit, cizí hráč je nespokojený.
 * Drb vznikne jen ze skutečného signálu. Zhruba čtvrtina drbů je nepravdivá: hospodský si
 * spletl hráče nebo klub, jména jsou ale vždy skutečná (nikdy nikoho nevymyslí).
 *
 * Drb o vlastním hráči končí otázkou: pustit to do novin (krátká zpráva ve Zpravodaji, hráč
 * znejistí, cena roste), nebo hráče včas uklidnit (menší nespokojenost po odmítnuté nabídce).
 * Drb o cizím hráči je tip na trh.
 */

import { cleanDashes } from "../lib/dashes";

export type RumourSignalKind = "scout" | "ai_interest" | "ai_sell" | "unhappy";
export type RumourSubject = "own" | "foreign";
export type RumourChoice = "publish" | "calm";

/** Podíl nepravdivých drbů. */
export const FALSE_SHARE = 0.25;
/** Šance na drb v jednom večeru, když je z čeho. S trenérem u stolu dvojnásobná. */
export const RUMOUR_DAY_CHANCE = 0.2;
export const RUMOUR_COACH_CHANCE = 0.4;
/** Kolik dní má trenér na odpověď (dnes a dva další), pak drb vyšumí. */
export const RUMOUR_ANSWER_DAYS = 2;
/** O hráči, o kterém se mluvilo, se tolik dní nemluví znovu. */
export const RUMOUR_REPEAT_DAYS = 14;
/** Drb v novinách zvedne cenu, za kterou hráče kupují AI kluby. */
export const RUMOUR_HYPE_PCT = 0.15;
/** Jak dlouho zvýšená cena drží: pravdivý drb se drží déle, spletený rychle vyšumí. */
export const RUMOUR_HYPE_DAYS = { true: 21, false: 10 } as const;
/** Uklidnění platí měsíc a nespokojenost po odmítnuté nabídce sníží o polovinu. */
export const RUMOUR_CALM_DAYS = 30;
export const RUMOUR_CALM_UNREST_CUT = 0.5;
/** Nálada hráče: po zprávě v novinách znejistí, po rozhovoru s trenérem se trochu zvedne. */
export const RUMOUR_MORALE_PUBLISH = -5;
export const RUMOUR_MORALE_CALM = 2;

export const RUMOUR_OPTIONS: Array<{ id: RumourChoice; label: string; text: string }> = [
  { id: "publish", label: "Pustit do novin", text: "Pusť to dál, ať to napíšou do Zpravodaje." },
  { id: "calm", label: "Uklidnit hráče", text: "Nikomu to neříkej, promluvím s ním sám." },
];

export function isRumourChoice(v: unknown): v is RumourChoice {
  return v === "publish" || v === "calm";
}

export interface RumourPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  teamId: string;
  rating?: number;
}

export interface RumourClub {
  id: string;
  name: string;
}

/** Signál = co se opravdu děje. `clubId` je zájemce (vlastní hráč) nebo hráčův klub (cizí hráč). */
export interface RumourSignal {
  kind: RumourSignalKind;
  playerId: string;
  clubId: string;
}

export interface RumourWorld {
  teamId: string;
  ownPlayers: RumourPlayer[];
  /** Hráči jiných klubů soutěže: pro tipy na trh a pro spletené tipy. */
  foreignPlayers: RumourPlayer[];
  /** Jiné kluby (zájemci i kluby cizích hráčů). Vlastní klub sem nepatří. */
  clubs: RumourClub[];
  signals: RumourSignal[];
  /** Hráči, o kterých se v posledních dnech mluvilo. */
  recentPlayers: Set<string>;
  /** Drb o vlastním hráči čeká na rozhodnutí trenéra. */
  ownPending: boolean;
}

export interface Rumour {
  subject: RumourSubject;
  kind: RumourSignalKind;
  playerId: string;
  clubId: string;
  isTrue: boolean;
  playerName: string;
  firstName: string;
  clubName: string;
  position: string;
  /** Co hospodský slyšel, bez otázky na konci. */
  text: string;
}

/** Náhoda, kterou pravidla potřebují (stačí `random`, `pick` vybírá šablonu). */
export interface RumourRng {
  random(): number;
  pick<T>(arr: readonly T[]): T;
}

export function subjectOf(kind: RumourSignalKind): RumourSubject {
  return kind === "scout" || kind === "ai_interest" ? "own" : "foreign";
}

const POSITION_WORDS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

export function positionWord(position: string): string {
  return POSITION_WORDS[position] ?? "hráč";
}

/** Jméno v prvním pádě: šablony neskloňují, jméno je vždy podmět nebo stojí za „hráče“. */
function fullName(p: RumourPlayer): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Jen signály o lidech a klubech, které opravdu existují. Cizí hráč musí hrát v tom klubu. */
export function validSignals(w: RumourWorld): RumourSignal[] {
  const own = new Set(w.ownPlayers.map((p) => p.id));
  const foreign = new Map(w.foreignPlayers.map((p) => [p.id, p.teamId] as const));
  const clubs = new Set(w.clubs.map((c) => c.id));
  return w.signals.filter((s) => {
    if (!clubs.has(s.clubId) || s.clubId === w.teamId) return false;
    return subjectOf(s.kind) === "own" ? own.has(s.playerId) : foreign.get(s.playerId) === s.clubId;
  });
}

function weightedSignal(signals: RumourSignal[], rng: RumourRng): RumourSignal {
  // Hospoda je hlavně o vlastním klubu: drby o vlastních hráčích mají dvojnásobnou váhu.
  const weight = (s: RumourSignal) => (subjectOf(s.kind) === "own" ? 2 : 1);
  const total = signals.reduce((sum, s) => sum + weight(s), 0);
  let r = rng.random() * total;
  for (const s of signals) {
    r -= weight(s);
    if (r < 0) return s;
  }
  return signals[signals.length - 1];
}

/**
 * Spletený drb: hospodský slyšel skutečnou věc, ale spletl si hráče nebo klub. Výsledek
 * nesmí náhodou odpovídat žádnému skutečnému signálu, jinak by nebyl nepravdivý.
 */
function garble(seed: RumourSignal, w: RumourWorld, valid: RumourSignal[], rng: RumourRng): RumourSignal | null {
  if (subjectOf(seed.kind) === "own") {
    const real = new Set(valid.filter((s) => subjectOf(s.kind) === "own").map((s) => `${s.playerId}|${s.clubId}`));
    const options: RumourSignal[] = [
      ...w.ownPlayers.filter((p) => p.id !== seed.playerId).map((p) => ({ kind: seed.kind, playerId: p.id, clubId: seed.clubId })),
      ...w.clubs.filter((c) => c.id !== seed.clubId && c.id !== w.teamId).map((c) => ({ kind: seed.kind, playerId: seed.playerId, clubId: c.id })),
    ].filter((s) => !real.has(`${s.playerId}|${s.clubId}`));
    return options.length ? rng.pick(options) : null;
  }
  const realPlayers = new Set(valid.filter((s) => subjectOf(s.kind) === "foreign").map((s) => s.playerId));
  const clubs = new Set(w.clubs.map((c) => c.id));
  const options = w.foreignPlayers
    .filter((p) => !realPlayers.has(p.id) && clubs.has(p.teamId) && p.teamId !== w.teamId)
    .map((p) => ({ kind: seed.kind, playerId: p.id, clubId: p.teamId }));
  return options.length ? rng.pick(options) : null;
}

const TEMPLATES: Record<RumourSignalKind, readonly string[]> = {
  scout: [
    "Na posledním zápase prý stál u lajny skaut z klubu {club} a celou dobu si psal poznámky jen o jednom: {player}.",
    "Jeden štamgast přísahá, že viděl skauta z klubu {club}, jak se po zápase vyptával, kolik toho umí {player}.",
    "U výčepu se říká, že {player} je v hledáčku skautů z klubu {club}.",
  ],
  ai_interest: [
    "Prý v klubu {club} shánějí posilu a v jejich kabině padlo jméno {player}.",
    "Někdo od klubu {club} se tu vyptával, kolik by stál {player} a jak dlouho má smlouvu.",
    "U vedlejšího stolu se šuškalo, že {player} by se klubu {club} hodil do sestavy.",
  ],
  ai_sell: [
    "V klubu {club} prý {player} ({position}) přebývá a pustili by ho. Kdo by ho chtěl, ať se ozve brzo.",
    "Od lidí z klubu {club} jsem slyšel, že {player} ({position}) jim přebývá a pustili by ho.",
  ],
  unhappy: [
    "{player} ({position}) z klubu {club} si tu stěžoval, že by nejradši šel jinam.",
    "Prý je {player} ({position}) v klubu {club} nespokojený a poslouchá, kdo by ho vzal.",
  ],
};

function render(kind: RumourSignalKind, p: RumourPlayer, club: RumourClub, rng: RumourRng): string {
  return cleanDashes(
    rng.pick(TEMPLATES[kind])
      .replaceAll("{player}", fullName(p))
      .replaceAll("{club}", club.name)
      .replaceAll("{position}", positionWord(p.position)),
  );
}

/**
 * Drb pro jeden večer v hospodě, nebo null. Bez platného signálu nevznikne nic, ani lež:
 * spletený drb vždy vychází ze skutečné věci, takže podíl nepravdivých drží kolem `FALSE_SHARE`
 * bez ohledu na to, jak často klub nějaký signál má.
 */
export function pickRumour(w: RumourWorld, rng: RumourRng, opts: { coach: boolean }): Rumour | null {
  const valid = validSignals(w);
  const fresh = valid.filter((s) => !w.recentPlayers.has(s.playerId) && !(w.ownPending && subjectOf(s.kind) === "own"));
  if (fresh.length === 0) return null;
  if (rng.random() >= (opts.coach ? RUMOUR_COACH_CHANCE : RUMOUR_DAY_CHANCE)) return null;

  const seed = weightedSignal(fresh, rng);
  const lie = rng.random() < FALSE_SHARE;
  const base = lie ? garble(seed, w, valid, rng) : seed;
  if (!base) return null;

  const subject = subjectOf(base.kind);
  const player = (subject === "own" ? w.ownPlayers : w.foreignPlayers).find((p) => p.id === base.playerId);
  const club = w.clubs.find((c) => c.id === base.clubId);
  if (!player || !club) return null;
  return {
    subject, kind: base.kind, playerId: player.id, clubId: club.id, isTrue: !lie,
    playerName: fullName(player), firstName: player.firstName, clubName: club.name, position: player.position,
    text: render(base.kind, player, club, rng),
  };
}

/** SMS hospodského. U vlastního hráče s volbou, u cizího jako tip na trh. */
export function rumourSms(r: Pick<Rumour, "subject" | "text" | "firstName">): string {
  if (r.subject === "foreign") return cleanDashes(`🍺 Tip od výčepu: ${r.text}`);
  return cleanDashes(
    `🍺 ${r.text} Mám to pustit dál, ať to napíšou do Zpravodaje? Cena by šla nahoru, jenže ${r.firstName} by z toho mohl znejistět. `
    + "Nebo si s ním včas promluv, ať ho to nerozhodí. Rozhodni se do pozítří, pak to vyšumí.",
  );
}

const HEADLINES = [
  "Šušká se: {player} v hledáčku klubu {club}",
  "Kuloáry: {player} by se hodil klubu {club}",
  "Drby od výčepu: {player} a klub {club}",
];

const BODIES: Record<"scout" | "ai_interest", readonly string[]> = {
  scout: [
    "{player} ({team}) prý zaujal skauty klubu {club}. Podle štamgastů si o něm na posledním zápase dělali poznámky. "
    + "Trenér se k tomu nevyjádřil, v kabině se ale o ničem jiném nemluví. Jestli je na tom něco pravdy, ukáže až přestupní trh.",
    "U výčepu se tvrdí, že {player} ({team}) má na zápasech pravidelnou společnost: skauta z klubu {club}. "
    + "Sám hráč prý zatím mlčí a v klubu se tváří, že o ničem nevědí.",
  ],
  ai_interest: [
    "V klubu {club} prý shánějí posilu a nejčastěji tam padá jedno jméno: {player} ({team}). "
    + "Oficiálně to nikdo nepotvrdil, ale v hospodě už se sázejí, kdy přijde první nabídka.",
    "Podle hospodských zdrojů je {player} ({team}) na seznamu přání klubu {club}. "
    + "Trenér se k tomu nevyjádřil. Jestli je na tom něco pravdy, ukáže až přestupní trh.",
  ],
};

/** Krátká zpráva do Zpravodaje, když trenér drb pustí dál. */
export function rumourArticle(
  r: { kind: RumourSignalKind; playerName: string; clubName: string; teamName: string },
  rng: RumourRng,
): { headline: string; body: string } {
  const fill = (s: string) => cleanDashes(s.replaceAll("{player}", r.playerName).replaceAll("{club}", r.clubName).replaceAll("{team}", r.teamName));
  const kind = r.kind === "scout" ? "scout" : "ai_interest";
  return { headline: fill(rng.pick(HEADLINES)), body: fill(rng.pick(BODIES[kind])) };
}

export const RUMOUR_REPLIES = {
  publish: "Platí, už jsem to řekl chlapům, co píšou do Zpravodaje.",
  calm: "Dobře, mlčím jak hrob. Promluv si s ním, ať ví, že s ním počítáš.",
  unclear: "Tak jak? Mám to pustit do novin, nebo si s ním promluvíš?",
  decided: "To už je vyřízený.",
  gone: "To už je stejně jedno, ten u vás nehraje.",
  stale: "To už vyšumělo, nikdo o tom nemluví.",
  expired: "Tak nic, drb vyšuměl. Kdyby se zase něco povídalo, dám vědět.",
};

const CALM_PLAYER_SMS = [
  "Trenére, díky, že jste se mnou mluvil. Na kecy z hospody nedám, jsem tu rád.",
  "Slyšel jsem, co se povídá. Dobře, že jste mi to řekl sám. Nikam se nechystám.",
  "Díky za řeč, trenére. Hlavu mi to nepoplete.",
];

export function calmPlayerSms(rng: RumourRng): string {
  return rng.pick(CALM_PLAYER_SMS);
}

/** Malá písmena bez diakritiky: SMS píšou lidi bez háčků a s překlepy. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Zápor u novin nebo výzva k mlčení: tohle je vždy „uklidnit“, i když padne slovo noviny. */
const SILENCE = /\bne(poust|davej|dej|pis\b|pis(te)?\b|rikej|rikat|roztrub|vykec|kecej)|nikomu|\bmlc|drz (hubu|jazyk|zobak)|ani muk|pod poklic/;
const CALM = /uklidn|promluv|pokecam|domluvim|vysvetl|zavolam mu|reknu mu to sam|nech (to |ho )?(bej?t|byt|plavat|na pokoji)/;
const PUBLISH = /novin|novyn|zprav?ode?j|redakc|\bpust|roztrub|klidne (to )?rekni|at (se )?(to )?vi|celej okres|cely okres|napis|rozkecej|ven s tim/;

/** Odpověď volným textem: pustit do novin, uklidnit, nebo nejasné (null). Při obou platí dřívější. */
export function classifyRumourReply(text: string): RumourChoice | null {
  const t = fold(text ?? "");
  if (!t.trim()) return null;
  if (SILENCE.test(t)) return "calm";
  const calm = t.search(CALM);
  const publish = t.search(PUBLISH);
  if (calm < 0 && publish < 0) return null;
  if (calm < 0) return "publish";
  if (publish < 0) return "calm";
  return calm < publish ? "calm" : "publish";
}

function isDay(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

/**
 * Násobek nespokojenosti po odmítnuté nabídce. Uklidnění platí jen v klubu, kde trenér
 * s hráčem mluvil, a jen do data (`life_context.rumourCalm`).
 */
export function rumourCalmMultiplier(lifeContext: unknown, today: string, clubTeamId: string): number {
  const calm = (lifeContext as { rumourCalm?: unknown } | null)?.rumourCalm as { until?: unknown; teamId?: unknown } | null | undefined;
  if (!calm || typeof calm !== "object" || !isDay(calm.until) || calm.teamId !== clubTeamId) return 1;
  return today.slice(0, 10) <= calm.until.slice(0, 10) ? 1 - RUMOUR_CALM_UNREST_CUT : 1;
}

/** Násobek ceny hráče po drbu v novinách (`life_context.rumourHype`), nejvýš o `RUMOUR_HYPE_PCT`. */
export function rumourHypeMultiplier(hype: { until?: unknown; pct?: unknown } | null | undefined, today: string): number {
  if (!hype || !isDay(hype.until) || typeof hype.pct !== "number" || !(hype.pct > 0)) return 1;
  if (today.slice(0, 10) > hype.until.slice(0, 10)) return 1;
  return 1 + Math.min(hype.pct, RUMOUR_HYPE_PCT);
}

/** Herní den posunutý o `days`. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
