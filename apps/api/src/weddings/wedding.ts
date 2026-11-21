/**
 * Svatba v kabině (F3): čisté funkce bez databáze.
 *
 * Hráč, kterému padla životní situace `svatba_spoluhrace`, ohlásí svatbu s datem, často na pátek
 * před zápasem. Trenér odpoví vlastními slovy a hra z nich pozná jednu ze tří cest:
 *  - přijde (a pohlídá kluky): kocovina jen poloviční,
 *  - pošle dar: peníze jednou přes `recordTransaction` (`wedding_gift`), kocovina plná,
 *  - zakáže pít nebo jezdit: bez kocoviny, ženich je ale dotčený.
 * Kdo neodpoví do dne před svatbou, ten nic nerozhodl: kocovina plná, vztah beze změny.
 *
 * Kocovina se do sestavy dostane jako incidentní absence (`prikazAbsence`) nejtvrdších pijáků
 * na zápas den po svatbě. Los omluvenek se nemění: absence se přidá až po něm a musí být
 * ohlášená aspoň `MIN_OHLASENI_ABSENCE_DNI` dopředu, proto se rozhodnutí uzavírá den před svatbou.
 *
 * Zápis do databáze: wedding-db.ts.
 */

import type { Rng } from "../generators/rng";
import { MIN_OHLASENI_ABSENCE_DNI } from "../incidents/nastaveni";

export type WeddingChoice = "attend" | "gift" | "ban" | "none";
export type WeddingDecider = "coach" | "ai" | "ai_fallback" | "default";

/** Svatba je nejdřív tolik dní po ohlášení: trenér má na odpověď aspoň tři dny. */
export const WEDDING_MIN_LEAD_DAYS = 4;
/** Zápas, před který svatba padne, se hledá nejvýš tak daleko. */
export const WEDDING_MAX_LEAD_DAYS = 12;
/** Jak často padne svatba na předvečer zápasu („často pátek před zápasem“). */
export const WEDDING_EVE_CHANCE = 0.75;
/** Rozlučka se svobodou (incident `stag_party`) se může stát tolik dní před svatbou a míň. */
export const STAG_PARTY_DAYS_BEFORE = 3;

export const WEDDING_GIFT_MIN = 500;
export const WEDDING_GIFT_MAX = 10_000;
/** Dar bez částky („pošlu dárek“). */
export const WEDDING_GIFT_DEFAULT = 2_000;

/** Kdo pije aspoň takhle, ten to druhý den pozná. */
export const WEDDING_DRINKER_ALCOHOL = 50;
/** Tvrdý piják: s plnou kocovinou na zápas den po svatbě nepřijde. */
export const WEDDING_HEAVY_DRINKER_ALCOHOL = 75;
/** Nejvýš tolik hráčů chybí kvůli kocovině, ať jedna svatba nesloží celý tým. */
export const WEDDING_MAX_ABSENT = 3;
const CONDITION_DROP_MIN = 10;
const CONDITION_DROP_MAX = 20;

const DAY_MS = 86_400_000;

/** Herní den posunutý o `days`, tvar YYYY-MM-DD. */
export function dayPlus(day: string, days: number): string {
  return new Date(Date.parse(`${day.slice(0, 10)}T12:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00.000Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00.000Z`)) / DAY_MS);
}

function weekday(day: string): number {
  return new Date(`${day.slice(0, 10)}T12:00:00.000Z`).getUTCDay();
}

export interface WeddingPlan {
  weddingDate: string;
  /** Zápas den po svatbě, `null` když se druhý den nehraje. */
  matchDate: string | null;
}

/**
 * Kdy bude svatba. Většinou předvečer nejbližšího zápasu, na který se dá svatbu ohlásit včas
 * (s přednostním pátkem), jinak sobota, kdy se ani druhý den nehraje. Náhoda jen přes `rng.random()`.
 */
export function planWeddingDate(o: { today: string; matchDays: readonly string[]; rng: Pick<Rng, "random"> }): WeddingPlan {
  const earliest = dayPlus(o.today, WEDDING_MIN_LEAD_DAYS);
  const latest = dayPlus(o.today, WEDDING_MAX_LEAD_DAYS);
  const matches = [...new Set(o.matchDays.map((d) => d.slice(0, 10)))].sort();
  const isMatch = (d: string) => matches.includes(d);
  const eves = matches.map((m) => ({ wedding: dayPlus(m, -1), match: m }))
    .filter((e) => e.wedding >= earliest && e.wedding <= latest && !isMatch(e.wedding));
  if (o.rng.random() < WEDDING_EVE_CHANCE && eves.length > 0) {
    const pick = eves.find((e) => weekday(e.wedding) === 5) ?? eves[0];
    return { weddingDate: pick.wedding, matchDate: pick.match };
  }
  const free = (d: string) => !isMatch(d) && !isMatch(dayPlus(d, 1));
  for (let i = 0; i < 14; i++) {
    const d = dayPlus(earliest, i);
    if (weekday(d) === 6 && free(d)) return { weddingDate: d, matchDate: null };
  }
  for (let i = 0; i < 14; i++) {
    const d = dayPlus(earliest, i);
    if (free(d)) return { weddingDate: d, matchDate: null };
  }
  return { weddingDate: earliest, matchDate: isMatch(dayPlus(earliest, 1)) ? dayPlus(earliest, 1) : null };
}

/** Den, kdy se rozhodnutí uzavře: kdo do té doby neodpověděl, nic nerozhodl. */
export function decisionClosesOn(weddingDate: string): string {
  return dayPlus(weddingDate, -1);
}

/** Jde ještě nahlásit kocovinu na zápas tak, aby SMS den předem i simulace viděly totéž? */
export function canAnnounceHangover(today: string, matchDate: string | null): boolean {
  return !!matchDate && daysBetween(today, matchDate) >= MIN_OHLASENI_ABSENCE_DNI;
}

export interface WeddingGuest {
  id: string;
  alcohol: number;
}

export interface HangoverPlan {
  /** Na zápas den po svatbě nepřijdou (incidentní absence). */
  absent: string[];
  /** Ostatní pijáci: ráno po svatbě o tolik kondice méně. */
  conditionDrops: Array<{ playerId: string; drop: number }>;
}

/**
 * Kocovina po svatbě. Ženicha volající nepředává. Náhoda se táhne pro každého pijáka ve stejném
 * pořadí bez ohledu na rozhodnutí, takže „přijdu“ je přesně polovina plné kocoviny se stejným seedem.
 */
export function planHangover(guests: readonly WeddingGuest[], choice: WeddingChoice, rng: Pick<Rng, "int">): HangoverPlan {
  if (choice === "ban") return { absent: [], conditionDrops: [] };
  const drinkers = guests
    .filter((g) => g.alcohol >= WEDDING_DRINKER_ALCOHOL)
    .sort((a, b) => b.alcohol - a.alcohol || a.id.localeCompare(b.id));
  const base = drinkers.map((g) => ({ playerId: g.id, drop: rng.int(CONDITION_DROP_MIN, CONDITION_DROP_MAX) }));
  const heavy = drinkers.filter((g) => g.alcohol >= WEDDING_HEAVY_DRINKER_ALCOHOL).slice(0, WEDDING_MAX_ABSENT).map((g) => g.id);
  const half = choice === "attend";
  const absent = half ? heavy.slice(0, Math.floor(heavy.length / 2)) : heavy;
  const conditionDrops = base
    .filter((d) => !absent.includes(d.playerId))
    .map((d) => ({ playerId: d.playerId, drop: half ? Math.round(d.drop / 2) : d.drop }));
  return { absent, conditionDrops };
}

// ─── Odpověď trenéra ────────────────────────────────────────────────────────

export interface WeddingReply {
  attend: boolean;
  ban: boolean;
  gift: boolean;
  /** Částka daru v Kč, když je ve zprávě. */
  amount: number | null;
}

/** Malá písmena, bez diakritiky, jedna mezera. */
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Předběžné síto: model se volá jen u zpráv, kde odpověď na pozvánku může být. Projde i obyčejné
 * „gratuluju“, rozhodne až model. Bez slova odsud se odpověď nerozpozná vůbec.
 */
const HINT_RE = new RegExp([
  "\\bsvatb", "\\bgratul", "\\bprijd", "\\bprijed", "\\bprijit", "\\bdoraz", "\\bdojd", "\\bdojed", "\\bbudu\\b", "\\bbudem",
  "\\bjdu\\b", "\\bukazu", "\\bstavim", "\\bzastavim", "\\bpohlid", "\\bohlid", "\\buhlid", "\\bdohl", "\\bchybet",
  "\\bdar", "\\bobalk", "\\bprispe", "\\bpenez", "\\bpenize", "\\bkc\\b", "\\bkorun", "\\btisic", "\\blitr", "\\btac",
  "\\bpetistov", "\\bposlu", "\\bposil", "\\d{3,}", "\\d+ ?k\\b",
  "\\bpit\\b", "\\bpij", "\\bnepi", "\\bchlast", "\\bnechlast", "\\balkohol", "\\bpivo", "\\bkapku", "\\bstrizl", "\\bzakaz",
  "\\bnesm", "\\bnejezd", "\\bnikam", "\\bkofol", "\\blimo",
].join("|"));

export function mightBeWeddingReply(text: string): boolean {
  return HINT_RE.test(normalizeText(text));
}

/** Slib, že přijde. Zápor („nepřijdu“, „nebudu tam“) díky `\b` neprojde. */
const ATTEND_RE = new RegExp([
  "\\bprijdu\\b", "\\bprijdem(e)?\\b", "\\bprijedu\\b", "\\bprijedem(e)?\\b", "\\bdorazim\\b", "\\bdorazime\\b", "\\bdojdu\\b",
  "\\bdojedu\\b", "\\bbudu tam\\b", "\\bbudem(e)? tam\\b", "\\btam budu\\b", "\\bbudu u toho\\b", "\\bukazu se\\b",
  "\\bstavim se\\b", "\\bzastavim se\\b", "\\bjdu\\b", "\\bnenecham si (to )?ujit\\b", "\\bnevynecham\\b",
  "\\bnesmim (tam )?chybet\\b", "\\bpohlidam\\b", "\\bohlidam\\b", "\\buhlidam\\b", "\\bdohlidnu\\b", "\\bdohlednu\\b",
  "\\bvem(u)? si oblek\\b", "\\bvezmu si oblek\\b", "\\bjsem tam\\b",
].join("|"));

/** Váhání: „možná dorazím“ ještě slib není. */
const HESITATION_RE = /\b(mozna|uvidim|uvidime|nevim|zkusim|kdyz to vyjde|jestli to vyjde|kdyby|asi ne|neslibuj\w*|nejsem si jist\w*)\b/;

/** Výslovný zákaz pití nebo jízdy na svatbu. „Ať se neztřískaj“ u slibu, že pohlídá, zákaz není. */
const BAN_RE = new RegExp([
  "\\bzakaz\\b", "\\bzakazuj\\w*", "\\bzakazal\\w*", "\\bzakazano\\b", "\\bnesmi\\w*(?: \\w+){0,3} (?:pit|chlast\\w*|pivo|alkohol\\w*|ozrat|nachlast\\w*)\\b",
  "\\bnepit\\b", "\\bnepijte\\b", "\\bnechlast\\w*", "\\bzadn\\w* (?:chlast\\w*|piti|alkohol\\w*|pivo|panak\\w*)\\b",
  "\\bbez (?:chlastu|alkoholu|piti)\\b", "\\bani kapku\\b", "\\bani (?:jedno )?pivo\\b", "\\bani panaka\\b",
  "\\bjen (?:limo\\w*|kofol\\w*|vodu)\\b", "\\bstrizliv\\w*", "\\bnejezdete\\b", "\\bnikam nejezd\\w*", "\\bnikam nechod\\w*",
  "\\bnechodte\\b", "\\bnepojedete\\b", "\\bnepustim\\b", "\\b(?:chlastat|pit) se nebude\\b", "\\bnebude se (?:chlastat|pit)\\b",
  "\\bnechci,? aby se (?:\\w+ )?(?:ozral|zkurvil|ztriskal|nachlastal|opil|zrizil)\\w*",
].join("|"));

/** Dar: podstatné jméno, nebo částka. */
const GIFT_RE = /\b(dar|darek|darem|darkem|darecek|darecky|darky|obalk\w*|prispevek|prispeju|prispej\w*|penize|penez|penizky)\b/;

const NUMBER_WORDS: Record<string, number> = {
  jeden: 1, jedna: 1, jednu: 1, dva: 2, dve: 2, dvema: 2, tri: 3, trema: 3, tremi: 3, ctyri: 4, ctyrma: 4,
  pet: 5, sest: 6, sedm: 7, osm: 8, devet: 9, deset: 10, patnact: 15, dvacet: 20,
};

/** Jednotka a kolik je v korunách. */
function unitValue(word: string): number | null {
  if (/^(tisic\w*|tis|k|litr\w*|tac\w*|tisicovk\w*)$/.test(word)) return 1000;
  if (/^(petistov\w*|petikil\w*)$/.test(word)) return 500;
  if (/^stov\w*$/.test(word)) return 100;
  return null;
}

const UNIT = "(tisicovk\\w*|tisic\\w*|tis|k|litr\\w*|tac\\w*|petistov\\w*|petikil\\w*|stov\\w*)";

/**
 * Částka daru ze zprávy: „2 000 Kč“, „5k“, „pět tisíc“, „dva litry“, „tisícovku“, „pětistovku“.
 * Číslo pod 100 bez jednotky není částka („v 6“).
 */
export function parseGiftAmount(text: string): number | null {
  const t = normalizeText(text);
  const numeric = new RegExp(`(\\d{1,3}(?:[ .]\\d{3})+|\\d+)(?: ?${UNIT}\\b)?`, "g");
  for (const m of t.matchAll(numeric)) {
    const n = Number(m[1].replace(/[ .]/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    const unit = m[2] ? unitValue(m[2]) : null;
    if (unit && n < 1000) return n * unit;
    if (n >= 100 && n <= 1_000_000) return n;
  }
  const words = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")}) ${UNIT}\\b`);
  const w = words.exec(t);
  if (w) {
    const unit = unitValue(w[2]);
    if (unit) return NUMBER_WORDS[w[1]] * unit;
  }
  const alone = /\b(tisicovk\w*|tisic|litr\w*|tac\w*|petistov\w*|petikil\w*)\b/.exec(t);
  if (alone) return unitValue(alone[1]);
  return null;
}

/** Pravidlo, když model nejde nebo je vypnutý. `null` = ve zprávě odpověď na pozvánku není. */
export function readWeddingReplyByRules(text: string): WeddingReply | null {
  const t = normalizeText(text);
  if (!HINT_RE.test(t)) return null;
  const ban = BAN_RE.test(t);
  const attend = ATTEND_RE.test(t) && !HESITATION_RE.test(t);
  const amount = parseGiftAmount(t);
  const gift = GIFT_RE.test(t) || amount !== null;
  if (!ban && !attend && !gift) return null;
  return { attend, ban, gift, amount };
}

/** Opora ve zprávě pro to, co tvrdí model: bez ní model nesmí nic rozhodnout. */
const ATTEND_LOOSE_RE = /\b(prijd|prijed|doraz|dojd|dojed|budu|budem|tam budu|jdu|ukazu|stavim|zastavim|pohlid|ohlid|uhlid|dohl|nevynech|nenech|chybet|jsem tam|oblek|prijit)/;
const BAN_LOOSE_RE = /\b(zakaz|nesm|nepi|nechlast|chlast|pit|pij|alkohol|ozr|zkurv|ztrisk|kapku|strizl|nejezd|nikam|limo|kofol|nepust)/;
const GIFT_LOOSE_RE = /\b(dar|obalk|prispe|penez|penize|kc|korun|tisic|litr|tac|stov|petikil|poslu|posil)|\d{3,}|\d+ ?k\b/;

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * Odpověď modelu (`{attend, ban, gift, amount}`) zkontrolovaná proti zprávě: model smí rozhodnout
 * jen to, pro co je ve zprávě opora, a částku vezme, jen když nějaká ve zprávě je.
 */
export function checkModelWeddingReply(raw: unknown, text: string): WeddingReply | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const t = normalizeText(text);
  const amountInText = parseGiftAmount(t);
  const modelAmount = typeof r.amount === "number" ? r.amount : typeof r.amount === "string" && r.amount.trim() ? Number(r.amount) : null;
  const hasAmountWords = amountInText !== null || /\d/.test(t) || /\b(tac|litr|tisic|stov|petikil)/.test(t);
  const gift = bool(r.gift) && GIFT_LOOSE_RE.test(t);
  const amount = gift && hasAmountWords
    ? (modelAmount !== null && Number.isFinite(modelAmount) && modelAmount > 0 ? Math.round(modelAmount) : amountInText)
    : null;
  return {
    attend: bool(r.attend) && ATTEND_LOOSE_RE.test(t),
    ban: bool(r.ban) && BAN_LOOSE_RE.test(t),
    gift,
    amount,
  };
}

export function clampWeddingGift(amount: number): number {
  return Math.min(WEDDING_GIFT_MAX, Math.max(WEDDING_GIFT_MIN, Math.round(amount / 100) * 100));
}

/**
 * Rozhodnutí z odpovědi. Zákaz vyhrává (bez kocoviny), pak „přijdu“ (poloviční), pak samotný dar.
 * Dar jde zaplatit i spolu s „přijdu“ nebo se zákazem. `null` = trenér nic nerozhodl.
 */
export function weddingDecisionFromReply(reply: WeddingReply): { choice: Exclude<WeddingChoice, "none">; giftAmount: number | null } | null {
  const giftAmount = reply.gift ? clampWeddingGift(reply.amount ?? WEDDING_GIFT_DEFAULT) : null;
  if (reply.ban) return { choice: "ban", giftAmount };
  if (reply.attend) return { choice: "attend", giftAmount };
  if (reply.gift) return { choice: "gift", giftAmount };
  return null;
}

// ─── Dopady ─────────────────────────────────────────────────────────────────

export interface WeddingEffect {
  relation: number;
  morale: number;
  /** Důvod pro hráče, česky a bez čísel. */
  description: string;
}

/** Trenér na svatbu přišel: počítá se den po svatbě. */
export const ATTEND_EFFECT: WeddingEffect = { relation: 8, morale: 4, description: "Přišel jsi na jeho svatbu" };

/** Dopad hned po rozhodnutí: zákaz ženicha dotkne, dar potěší. „Přijdu“ se počítá až po svatbě. */
export function decisionEffect(choice: WeddingChoice, giftAmount: number | null): WeddingEffect | null {
  const giftRelation = giftAmount ? (giftAmount >= 5000 ? 6 : giftAmount >= 2000 ? 4 : 2) : 0;
  if (choice === "ban") {
    return { relation: -6 + giftRelation, morale: -3, description: "Zakázal jsi klukům pít na jeho svatbě" };
  }
  if (giftAmount) return { relation: giftRelation, morale: 3, description: "Poslal jsi mu svatební dar" };
  return null;
}

// ─── Texty ──────────────────────────────────────────────────────────────────

/** „2 000 Kč“ s obyčejnou mezerou (toLocaleString dává nezlomitelnou). */
export function formatCzk(amount: number): string {
  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
}

const DAY_ACCUSATIVE = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];
const DAY_GENITIVE = ["neděle", "pondělí", "úterý", "středy", "čtvrtka", "pátku", "soboty"];

/** „v pátek 27. 11.“ */
export function czechDayWords(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00.000Z`);
  return `${DAY_ACCUSATIVE[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** „do středy“ */
export function czechDeadlineWords(day: string): string {
  return `do ${DAY_GENITIVE[weekday(day)]}`;
}

/** Poznámka pro manažera pod jeho zprávou: co si hra z odpovědi zapsala. */
export function weddingNoteText(firstName: string, choice: Exclude<WeddingChoice, "none">, giftAmount: number | null): string {
  const what = choice === "attend" ? "přijdeš na svatbu a dohlédneš na kluky"
    : choice === "ban" ? "na jeho svatbě kluci pít nebudou. Nadšený z toho moc není"
      : "na svatbu nepřijdeš, ale poslal jsi dar";
  const gift = giftAmount ? ` Svatební dar ${formatCzk(giftAmount)} je stržený z rozpočtu.` : "";
  return `💍 ${firstName} si zapamatoval: ${what}.${gift}`;
}

const ARTICLE_FALLBACK: Record<WeddingChoice, Array<{ headline: string; text: string }>> = {
  attend: [
    {
      headline: "Svatba v kabině: {groom} se oženil a trenér hlídal kluky",
      text: "Klub {team} slavil svatbu svého hráče. {groom} si odvedl nevěstu před oltář a v sále se pak jedlo, pilo a tancovalo. Trenér na svatbu přišel, připil novomanželům a celý večer hlídal, aby to kluci nepřehnali. Prý se mu to povedlo napůl.",
    },
    {
      headline: "{groom} se ženil, trenér dohlížel na kabinu",
      text: "Svatba hráče z kabiny klubu {team} se vydařila. {groom} řekl své ano a hosté slavili dlouho do noci. Trenér dorazil, chvíli tančil s nevěstou a pak držel kluky na uzdě. Kdo chtěl další rundu, musel kolem něj.",
    },
  ],
  gift: [
    {
      headline: "Svatba v kabině: {groom} se oženil, trenér poslal dar",
      text: "Klub {team} má v kádru dalšího ženáče. {groom} se oženil a svatba se v sále protáhla do rána. Trenér sám nedorazil, ale poslal novomanželům dar. Kabina to oslavila za něj, a pořádně.",
    },
  ],
  ban: [
    {
      headline: "Svatba v kabině: {groom} se oženil, kabina pila limonádu",
      text: "Svatba hráče klubu {team} byla nejsušší, jakou ves pamatuje. {groom} se oženil, jenže trenér klukům pití zakázal. Hosté připíjeli kofolou a ženich se prý tvářil, jako by mu někdo snědl dort.",
    },
  ],
  none: [
    {
      headline: "Svatba v kabině: {groom} se oženil, slavilo se do rána",
      text: "Klub {team} slavil svatbu svého hráče. {groom} se oženil a kluci z kabiny dali najevo, jak moc mu to přejí. V sále se pilo do rána a domů se odcházelo, až když svítalo.",
    },
  ],
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

/** Článek do Zpravodaje, když model nejde. Jméno v 1. pádě jako podmět, tým za „klubu“ nebo jako podmět. */
export function weddingArticleFallback(
  o: { groom: string; teamName: string; choice: WeddingChoice }, rng: Pick<Rng, "pick">,
): { headline: string; text: string } {
  const t = rng.pick(ARTICLE_FALLBACK[o.choice]);
  const values = { groom: o.groom, team: o.teamName };
  return { headline: fill(t.headline, values), text: fill(t.text, values) };
}
