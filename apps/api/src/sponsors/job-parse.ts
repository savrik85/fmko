/**
 * Sežeň mu práci (F8): rozpoznání ze SMS bez modelu. Model se ptá jen tam, kde `jobHint`
 * něco najde; když nejede (ai_provider=off), rozhodnou tahle pravidla.
 *
 * - `parseJobAsk`: shání trenér u majitele firmy práci pro hráče? Prosba o peníze to není.
 * - `findRosterPlayer`: kterého hráče myslí (příjmení ve všech pádech, přezdívka, bez diakritiky).
 * - `matchFirm`: jmenuje trenér firmu („zeptám se u Kubíčka v hospodě")?
 * - `parseJobHelpPromise`: slíbil trenér hráči, který přišel o práci, že se poptá?
 */
import { normalize, parseAmount } from "./request-parse";

/** Práce, místo, flek, brigáda… (bez „místo v sestavě", to se maže předem). */
const WORK = "(?:prac\\w*|mist[oaeu]\\w*|flek\\w*|brigad\\w*|zamestnani|robot[uay]?|sicht\\w*|uplatneni|kseft\\w*)";
const AT_FIRM = "(?:u vas|u tebe|u sebe|ve firme|ve fabrice|na pile|v dilne|ve skladu|v hospode|v pekarne|v kuchyni|v servisu|v provozu)";

const JOB_PATTERNS: readonly RegExp[] = [
  // „místo pro Nováka", „nějakou brigádu pro Lukyna" (ne „práce pro mládež").
  new RegExp(`\\b${WORK}\\b[^.?!]{0,30}?\\bpro\\s+(?!mladez|deti|klub|tym|zaky|dorost|hrist|nas\\b|vas\\b)\\w`),
  // „hledá práci", „přišel o fleka", „zůstal bez práce", „po ztrátě místa".
  new RegExp(`\\b(?:hleda|shani|potrebuje|nema|ztratil|prisel o|prisla o|zustal bez|je bez|bez|po ztrate)\\b[^.?!]{0,20}?\\b${WORK}`),
  // „nevzal byste ho k sobě", „vzít ho do party", „zaučit na pile".
  new RegExp("\\b(?:ne)?(?:vzal\\w*|vzit|vezmete|vezmes|zaucit|zaucil\\w*|zaucite|prijmout|prijal\\w*|prijmete|nabrat|nabral\\w*)\\b"
    + "[^.?!]{0,40}?\\b(?:k sobe|k vam|do (?:dilny|dilen|skladu|party|firmy|fabriky|provozu|prace|kuchyne|pekarny|hospody|servisu|lesa|vyroby)"
    + "|na (?:brigadu|misto|praci|zkousku|pilu))"),
  // „šlo by zaměstnat našeho Černýho".
  /\bzamestna(?:t|l|li|la|te|s|me)\b/,
  // „nesháníte náhodou lidi do skladu", „hledáte pracovníky".
  /\b(?:ne)?(?:shanite|hledate|potrebujete|nabirate|berete|mate)\b[^.?!]{0,25}?\b(?:lidi|chlap\w*|cloveka|pracovnik\w*|brigadnik\w*|zamestnanc\w*|pomocnik\w*)/,
  // „místo u vás", „u vás na pile nějaký místo".
  new RegExp(`\\b${WORK}\\b[^.?!]{0,25}?\\b${AT_FIRM}\\b`),
  new RegExp(`\\b${AT_FIRM}\\b[^.?!]{0,25}?\\b${WORK}`),
];

/** Místo, které s prací nemá nic společného (sestava, tribuna). */
const NOT_WORK_PLACE = /\bmist\w*\s+(?:v|ve|na)\s+(?:sestav|zaklad|tribun|kabin|tabul|lavic|hrist|parkovist)\w*/g;

/** Předběžné síto: model se volá jen u zpráv, kde shánění práce může být. */
const HINT = /prac|mist[oaeu]|flek|brigad|zamestn|uplatn|robot|sicht|vzal|vzit|vezm|zauc|prijm|nabir|nabrat|lidi|chlap|pracovn|kseft/;

export function jobHint(text: string): boolean {
  return HINT.test(normalize(text));
}

/** Shání trenér práci pro hráče? Zpráva s částkou je prosba o peníze, ne o práci. */
export function parseJobAsk(text: string): { intent: boolean } {
  const norm = normalize(text).replace(NOT_WORK_PLACE, " ");
  if (parseAmount(norm) !== null) return { intent: false };
  return { intent: JOB_PATTERNS.some((re) => re.test(norm)) };
}

export interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  /** Běží mu situace „přišel o práci". */
  lostJob: boolean;
}

/**
 * Kmeny jména pro hledání ve skloňovaných tvarech: „Svoboda" → svobod (Svobodu, Svobodovi),
 * „Marek" → mark (Marka), „Černý" → cern (Černýho, Černého).
 */
function nameStems(name: string): string[] {
  const words = normalize(name).split(/[^a-z0-9]+/).filter(Boolean);
  const n = words[words.length - 1] ?? "";
  if (n.length < 3) return [];
  const stems = [n];
  if (/[aeiouy]$/.test(n) && n.length >= 5) stems.push(n.slice(0, -1));
  if (/e[kc]$/.test(n) && n.length >= 5) stems.push(n.slice(0, -2) + n.slice(-1));
  return stems;
}

/** Slova zprávy; oslovení („pane Kučero") se vynechá, to je majitel, ne hráč. */
function words(text: string): string[] {
  const all = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  return all.filter((_, i) => !["pane", "pani", "pan", "sefe", "sef"].includes(all[i - 1] ?? ""));
}

function mentions(tokens: readonly string[], stems: readonly string[]): boolean {
  return tokens.some((t) => stems.some((s) => t.startsWith(s) && t.length - s.length <= 4));
}

/**
 * Hráč, o kterém zpráva mluví. Příjmení a přezdívka váží víc než křestní jméno; dva hráči se
 * stejným skóre („Kučeru", máme dva) = nejasné, majitel se doptá.
 */
export function findRosterPlayer(text: string, roster: readonly RosterPlayer[]): { player: RosterPlayer | null; ambiguous: boolean } {
  const tokens = words(text);
  const scored = roster.map((p) => ({
    p,
    score: (mentions(tokens, nameStems(p.lastName)) ? 2 : 0) + (p.nickname && mentions(tokens, nameStems(p.nickname)) ? 2 : 0)
      + (mentions(tokens, nameStems(p.firstName)) ? 1 : 0),
  })).filter((s) => s.score > 0);
  if (scored.length === 0) return { player: null, ambiguous: false };
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  return top.length === 1 ? { player: top[0].p, ambiguous: false } : { player: null, ambiguous: true };
}

/** Obecná slova v názvech firem, podle kterých se firma poznat nedá. */
const GENERIC_FIRM_WORDS = new Set([
  "pila", "hospoda", "restaurace", "potraviny", "stavby", "autoservis", "pneuservis", "sro", "spol", "obecni", "urad",
  "zemedelske", "druzstvo", "pekarna", "reznictvi", "truhlarstvi", "elektro", "obchod", "firma", "kavarna", "pivovar",
  "cukrarna", "zahradnictvi", "farma", "servis", "auto", "bistro", "hotel", "penzion", "sluzby", "instalace", "podlahy",
  "group", "trade", "plus", "arena", "centrum", "market",
]);

/** Firma jmenovaná ve zprávě, null = žádná (nebo jen obecné „v hospodě"). Příjmení hráče se nepočítá. */
export function matchFirm(text: string, firms: ReadonlyArray<{ id: number; name: string }>, playerNames: readonly string[]): number | null {
  const tokens = words(text);
  const excluded = new Set(playerNames.flatMap(nameStems));
  for (const f of firms) {
    const distinctive = normalize(f.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_FIRM_WORDS.has(w));
    const stems = distinctive.flatMap(nameStems).filter((s) => !excluded.has(s));
    if (stems.length > 0 && mentions(tokens, stems)) return f.id;
  }
  return null;
}

const HELP_PROMISE = /\b(?:zkusim|zeptam|poptam|zavolam|sezenu|domluvim|promluvim|mrknu|obvolam|pohledam|zaridim|poradim se|ozvu se|dam vedet)\b|\bmam (?:jednoho |jednu )?znam\w*/;

/** Slíbil trenér hráči, že mu práci zkusí sehnat? Bez modelu jen podle slov. */
export function parseJobHelpPromise(text: string): boolean {
  return HELP_PROMISE.test(normalize(text));
}
