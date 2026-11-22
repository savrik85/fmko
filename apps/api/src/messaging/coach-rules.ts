/**
 * Pravidla a tresty trenéra z chatu (2026-11-22): „kdo nebude chodit na tréninky, nebude hrát“,
 * „kdo se omluví, bude běhat kolečka“, „máš poslední šanci, jedna blbost a letíš“, „omluvíš se
 * celé kabině“. Dřív zůstaly jen v textu (rozbor SMS 9–11/2026: poslední šance 14 zpráv ve 12
 * konverzacích, omluva kabině 15 v 11). Teď je rozpozná `detectCommitment` (SMS) nebo
 * `handleSquadRule` (kabina), zapíšou se do `coach_commitments` a hra je hlídá:
 *
 *  - `training_rule`: platí 3 týdny. Dokud ho trenér nezruší porušením, chodí kabina na trénink
 *    o 5 bodů víc. Když postaví do základu hráče, který v týdnu před zápasem vynechal trénink,
 *    kabina to vidí: nálada dolů, pravidlo padá a jeden z kluků mu to napíše.
 *  - `laps_penalty`: jmenovaný hráč (nebo každý, kdo se omluví ze zápasu, nebo celá kabina) na
 *    nejbližším tréninku odběhá kolečka: kondice dolů, podle povahy (a toho, co trenérovi
 *    odepsal) odběhá, nebo odmítne. Trenér dostane SMS.
 *  - `last_chance`: 30 dní menší šance, že bude pachatelem (incidents/pachatel.ts); když se přesto
 *    provalí jeho další průšvih, asistent trenérovi připomene, co slíbil. Vyhodit musí trenér sám.
 *  - `squad_apology`: hráč se do druhého dne omluví v kabině (upřímně, nebo kostrbatě podle
 *    povahy), nebo to odmítne a kabina to vidí.
 *
 * Nic z toho nemění sestavu ani kádr: rozhoduje trenér. Všechno dopadá jen na vlastní kádr klubu.
 */

import { logger } from "../lib/logger";
import { coachRelationStmts } from "../lib/coach-relation";
import type { ChatEnv } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { dayPhrase, datePhrase, lifeOf, shiftDay } from "./attendance-pledge";
import { ownSquadTeamId } from "./player-reach";

const M = "coach-rules";
const DAY_MS = 86_400_000;

export type RuleKind = "training_rule" | "laps_penalty" | "last_chance" | "squad_apology";
export const RULE_KINDS: readonly RuleKind[] = ["training_rule", "laps_penalty", "last_chance", "squad_apology"];
/** Komu kolečka: jen tomuhle hráči, každému, kdo se omluví ze zápasu, nebo celé kabině. */
export type LapsTarget = "self" | "absentees" | "team";
export const LAPS_TARGETS: readonly LapsTarget[] = ["self", "absentees", "team"];
export type LapsOutcome = "ran" | "refused";
export type ApologyTone = "sincere" | "clumsy" | "refused";

/** Malá písmena bez diakritiky a interpunkce. */
function plainText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const RUN_RE = /\b(?:kolec\w*|beh(?:at|ani|a|as|ate|aji|y|u)?|pobez\w*|odbeh\w*|bezis|bezite)\b/;
const LAPS_RE = /\bkolec\w*/;
const EXPLICIT_PUNISHMENT_RE = /\b(?:za trest|trestn\w*|potrestam|trestem)\b/;
/** Důvod trestu: „za tu omluvenku“, „za tenhle výkon“, „za pozdní příchod“. */
const PUNISHMENT_REASON_RE = new RegExp("\\bza (?:to|tohle|tenhle|tento|ten|tu|tuhle|tuto|takov\\w*|dnesn\\w*|vcerejs\\w*|posledn\\w*|kazd\\w*"
  + "|omluvenk\\w*|pozdn\\w*|vykon\\w*|absenc\\w*|chyb\\w*|kart\\w*|ostud\\w*|neucast\\w*|vynechan\\w*|nedochvil\\w*|flakan\\w*)\\b");
/** Podmínka podle člověka: „kdo se omluví, poběží“. */
const ANYONE_RE = /\b(?:kdo|kdokoli|kdokoliv|kazdy kdo|ten kdo)\b/;
const YOU_RE = /\b(?:pobezis|pobezite|odbehas|odbehate|budes|budete|bezis|bezite|behas|behate)\b/;
const YOU_PLURAL_RE = /\b(?:pobezite|odbehate|budete|bezite|behate)\b/;
/** Trenér běhá s nimi, nebo popisuje trénink: „budeme hodně běhat“, „začínáme v šest“. */
const PLAN_RE = /\b(?:budeme|pobezime|odbehame|bezime|behame|zaciname|dame si|jdeme)\b/;
const WHOLE_SQUAD_RE = /\b(?:cela kabina|celou kabinu|cele kabine|vsichni|cely tym|celej tym|cely team|cele muzstvo|cely mancaft|celej mancaft)\b/;

/**
 * Je věta výslovný trest kolečky? Trest = „za trest“, důvod („za tu omluvenku poběžíš“), podmínka
 * („kdo se omluví, poběží kolečka“) nebo kolečka uložená hráči („budeš běhat kolečka“). Plán
 * a popis tréninku („budeme hodně běhat“, „bude hodně běhání“) ani vtip trest nejsou: lokální E2E
 * (22. 11.) z „začínáme v půl šesté a bude hodně běhání“ udělalo kolečka celé kabině.
 * `wholeSquad`: výslovně celá kabina („celá kabina“, „všichni“); `plural`: „budete běhat“
 * (v kabině všem, v SMS jednomu hráči je to vykání); `anyone`: podmínka „kdo…“.
 */
export function lapsPunishmentCues(sentence: string): { punishment: boolean; wholeSquad: boolean; plural: boolean; anyone: boolean } {
  const p = plainText(sentence);
  const anyone = ANYONE_RE.test(p);
  const run = RUN_RE.test(p);
  const laps = LAPS_RE.test(p);
  const you = YOU_RE.test(p);
  const reason = PUNISHMENT_REASON_RE.test(p);
  const punishment = run && (EXPLICIT_PUNISHMENT_RE.test(p)
    || (!PLAN_RE.test(p) && (anyone || (you && (laps || reason)) || (reason && laps))));
  return { punishment, wholeSquad: WHOLE_SQUAD_RE.test(p), plural: YOU_PLURAL_RE.test(p), anyone };
}

/** Pokyn modelu, co trest kolečky je a co ne (SMS i kabina). */
export const LAPS_PENALTY_NOT_PLAN =
  "Plán nebo popis tréninku trest NENÍ („budeme hodně běhat“, „bude hodně běhání“, „dáme kondičku“, „vemte si boty na běhání“), ani vtip. "
  + "Trest trenér ukládá za něco nebo s podmínkou („za trest“, „za tu omluvenku poběžíš kolečka“, „kdo se omluví, poběží kolečka“).";

/** Část `CommitmentDetails`, kterou používají pravidla. */
export interface RuleDetails {
  squad?: boolean;
  target?: LapsTarget;
  /** Komu kolečka patří (jednotlivě), u celé kabiny chybí. */
  playerIds?: string[];
  /** Co hráč trenérovi odepsal (accepts_request): kývl, nebo odmítl. */
  accepted?: boolean;
  /** Kolečka: kdo už je na tréninku odběhal nebo odmítl, a jestli o tom trenér dostal SMS. */
  done?: Array<{
    playerId: string; outcome: LapsOutcome; day: string; notified?: boolean;
    /** Kondice za kolečka čeká na denní regeneraci (`applyPendingLapsFatigue`), pak „applied“. */
    fatigue?: "pending" | "applied";
  }>;
  /** Pravidlo docházky: zápasy už zkontrolované a kolik jich trenér dodržel. */
  checkedAt?: string;
  keptMatches?: number;
  /** Kdo pravidlo porušil (nastoupil po vynechaném tréninku). */
  violatorId?: string;
  /** Poslední šance: incident, kterým ji hráč promarnil. */
  violatedIncidentId?: string;
  /** Omluva kabině: jak dopadla. */
  tone?: ApologyTone;
}

/** Jak dlouho pravidlo nebo trest platí. */
export const RULE_DUE_DAYS: Record<RuleKind, number> = { training_rule: 21, laps_penalty: 10, last_chance: 30, squad_apology: 2 };

/**
 * Pravidlo „kdo nechodí, nehraje“, dokud platí: docházka celé kabiny +0,05. Polovina toho, co
 * docházce přidá nejpřísnější trenér (`disciplineAttendanceMod` hýbe nejvýš o 0,10); lidský hráč
 * chodí na 65 % tréninků (prod 22. 11.), takže zhruba jeden trénink navíc za čtyři týdny.
 */
export const TRAINING_RULE_ATTENDANCE_BONUS = 0.05;
/** Vynechaný trénink se počítá, když byl v týdnu před zápasem. */
export const RULE_LOOKBACK_DAYS = 7;
/** Trenér pravidlo sám porušil: nálada kabiny −2, stejně jako přestupek za incident (akce.ts). */
export const RULE_BROKEN_SQUAD_MORALE = -2;
/**
 * Kolečka seberou kondici jako jeden tvrdý kondiční trénink navíc: odběr kondičního tréninku 3
 * × intenzita tvrdého 1,6 ≈ 5 (training.ts).
 */
export const LAPS_CONDITION = 5;
export const LAPS_RAN_MORALE = -1;
export const LAPS_REFUSED_RELATION = -3;
/**
 * Vzdorovitá povaha: vznětlivost o víc než 25 nad disciplínou. Na produ je takových 21 %
 * hráčů lidských klubů (334 z 1 582, 22. 11.): ti trest ani omluvu bez slibu neudělají.
 */
export const DEFIANCE_GAP = 25;
/** Omluva kabině vrátí část nálady, kterou incident vzal (incidenty berou kabině 2 až 4). */
export const APOLOGY_SINCERE_SQUAD_MORALE = 2;
export const APOLOGY_CLUMSY_SQUAD_MORALE = 1;
export const APOLOGY_RELATION = 2;
export const APOLOGY_REFUSED_RELATION = -3;
export const APOLOGY_REFUSED_SQUAD_MORALE = -1;
/** Omluva přijde nejdřív tolik hodin po trenérově zprávě, nejpozději druhý den. */
const APOLOGY_DELAY_MS = 6 * 3600_000;
/** Na kývnutí trenérovi (accepts_request) se ptá jen u čerstvého pokynu. */
export const REQUEST_FRESH_MS = 24 * 3600_000;

// ─── Čisté funkce ───────────────────────────────────────────────────────────

/** Seznam vynechaných tréninků (`life_context.missedTrainings`): posledních 6, nejvýš 14 dní zpátky. */
export function missedTrainingsAfter(prev: unknown, day: string): string[] {
  const d = day.slice(0, 10);
  const from = shiftDay(d, -14);
  const list = Array.isArray(prev) ? prev.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= from && x !== d) : [];
  return [...list, d].slice(-6);
}

/** Vynechal hráč trénink v týdnu před zápasem (`matchDay`)? */
export function missedBefore(missed: unknown, matchDay: string, days = RULE_LOOKBACK_DAYS): boolean {
  if (!Array.isArray(missed)) return false;
  const to = matchDay.slice(0, 10);
  const from = shiftDay(to, -days);
  return missed.some((x) => typeof x === "string" && x >= from && x < to);
}

/** Odběhá kolečka? Co trenérovi slíbil, platí; jinak rozhodne povaha. */
export function lapsOutcome(p: { discipline: number; temper: number }, accepted?: boolean): LapsOutcome {
  if (accepted === true) return "ran";
  if (accepted === false) return "refused";
  return p.temper - p.discipline > DEFIANCE_GAP ? "refused" : "ran";
}

/** Omluva kabině: odmítne (řekl to, nebo vzdorovitá povaha), upřímná u ukázněných a klidných, jinak kostrbatá. */
export function apologyTone(p: { discipline: number; temper: number }, accepted?: boolean): ApologyTone {
  if (accepted === false || (accepted === undefined && p.temper - p.discipline > DEFIANCE_GAP)) return "refused";
  return p.discipline >= 50 && p.temper < 60 ? "sincere" : "clumsy";
}

/** Text pravidla pro hráče a trenéra (`commitmentText`). */
export function ruleText(kind: RuleKind, d: RuleDetails = {}): string {
  switch (kind) {
    case "training_rule": return "Kdo vynechá trénink, nehraje";
    case "laps_penalty": return d.target === "team" ? "Celá kabina běhá na tréninku kolečka"
      : d.target === "absentees" ? "Kdo se omluví ze zápasu, běhá na tréninku kolečka" : "Na tréninku odběhá trestná kolečka";
    case "last_chance": return "Poslední šance: další průšvih a letí z klubu";
    case "squad_apology": return "Omluvit se celé kabině";
  }
}

/** Řádek do promptu hráče, kterého se pravidlo týká osobně. */
export function rulePromptLine(kind: RuleKind, status: string, d: RuleDetails, dueAt: string): string {
  if (kind === "last_chance") {
    if (status === "active") return `- Trenér ti dal POSLEDNÍ ŠANCI: další průšvih a letíš z klubu (platí do ${datePhrase(dueAt)}). Víš to a dáváš si bacha.`;
    if (status === "broken") return "- Trenér ti dal poslední šanci a teď se provalilo, že jsi zase něco provedl. Víš, že ti hrozí vyhazov.";
    return "";
  }
  if (kind === "squad_apology") {
    if (status === "active") return "- Trenér chce, aby ses omluvil celé kabině. Rozhodni se podle povahy, jestli to uděláš, a řekni mu to.";
    if (status === "broken") return "- Trenér chtěl, aby ses omluvil kabině, a ty jsi odmítl. Kluci to vědí.";
    if (status === "kept") return "- Omluvil ses kabině, jak trenér chtěl.";
    return "";
  }
  if (kind === "laps_penalty") {
    if (status === "active" && d.target !== "team" && d.target !== "absentees") {
      return "- Trenér ti za trest nařídil kolečka na nejbližším tréninku. Rozhodni se podle povahy, jestli je odběháš, a řekni mu to.";
    }
    return "";
  }
  return "";
}

/** Řádky pravidel celé kabiny do faktů o klubu (zná je každý hráč). */
export function clubRuleLines(rules: ReadonlyArray<{ kind: string; details: RuleDetails; dueAt: string }>): string[] {
  const lines: string[] = [];
  for (const r of rules) {
    if (r.kind === "training_rule") lines.push(`- Trenér vyhlásil pravidlo: kdo vynechá trénink, nehraje (platí do ${datePhrase(r.dueAt)}). Bereš ho vážně.`);
    else if (r.kind === "laps_penalty" && r.details.target === "absentees") lines.push("- Trenér v kabině vyhlásil: kdo se omluví ze zápasu, odběhá na tréninku trestná kolečka.");
    else if (r.kind === "laps_penalty" && r.details.target === "team") lines.push("- Trenér nařídil celé kabině trestná kolečka na nejbližším tréninku.");
  }
  return lines;
}

/** Na co hráč trenérovi kývne nebo odmítne (accepts_request) a jak to pole vysvětlit modelu. */
export function requestRule(kind: string): string {
  const what = kind === "squad_apology" ? "se omluvíš celé kabině"
    : kind === "laps_penalty" ? "trestná kolečka odběháš"
      : kind === "weight_target" ? "do dohody o hubnutí jdeš"
        : "do toho jdeš (dohoda s trenérem)";
  return `- accepts_request: true, když v téhle zprávě trenérovi kývneš, že ${what}; false, když odmítneš; null, když se k tomu nevyjádříš.`;
}

// ─── Texty ──────────────────────────────────────────────────────────────────

/** Hráč po kolečkách trenérovi (≥ 8 variant, vybírá se ta, kterou neposlal). */
export const LAPS_RAN_SMS: readonly string[] = [
  "Odběhal jsem to, trenére. Plíce mám na vodě, ale máte to.",
  "Kolečka hotová, trenére. Příště se omluvím líp. 😅",
  "Trenére, odběháno. Nohy mám jak z olova, ale beru to.",
  "Tak jsem to odmakal, trenére. Zasloužil jsem si to.",
  "Kolečka mám za sebou, trenére. Snad jsme si kvit.",
  "Odběhal jsem to bez keců, trenére. Ať je klid.",
  "Hotovo, trenére. Na tréninku jsem to vyběhal do posledního kola.",
  "Trenére, kolečka jsou odběhaná. Víc se to opakovat nebude.",
];
export const LAPS_REFUSED_SMS: readonly string[] = [
  "Kolečka běhat nebudu, trenére. Jsem tu kvůli fotbalu, ne kvůli trestům.",
  "Trenére, to fakt ne. Běhat jak kůň kvůli tomu nebudu.",
  "Žádný kolečka, trenére. Za tohle se trestat nenechám.",
  "Trenére, běhat za trest nejdu. Klidně mě posaďte.",
  "To si nechte, trenére. Kolečka nebudou.",
  "Nebudu se tu ponižovat kolečkama, trenére. Sorry.",
  "Trenére, na trest kašlu. Přišel jsem trénovat, ne běhat dokola.",
  "Běhat nebudu, trenére. Jestli vám to vadí, řekněte mi to do očí.",
];
/** Kabina po společných kolečkách (píše jeden za všechny). */
export const TEAM_LAPS_KABINA: readonly string[] = [
  "Odběhali jsme to, trenére. V neděli jim to tam napereme.",
  "Kolečka hotová. Snad to stálo za to, trenére. 😅",
  "Tak jsme to vyběhali, trenére. Příště radši dáme góly.",
  "Odběháno, trenére. Nohy bolí, ale kabina drží.",
  "Kluci to vyběhali, trenére. Teď ať je to vidět i na hřišti.",
  "Hotovo, trenére. Takový kolečka si budem pamatovat.",
  "Vyběhali jsme to všichni, trenére. Bez reptání. Skoro.",
  "Trenére, kolečka za námi. Teď makat na zápas.",
];
/** Kluk z kabiny trenérovi po porušeném pravidle; {name} je hráč, který nastoupil (1. pád). */
export const RULE_BROKEN_SMS: readonly string[] = [
  "Trenére, říkal jste, že kdo nechodí na trénink, nehraje. A {name} hrál.",
  "Tak jak je to s tím pravidlem, trenére? {name} na tréninku nebyl a v základu byl.",
  "Trenére, kluci se ptaj. {name} vynechal trénink a stejně nastoupil. To pravidlo už neplatí?",
  "Pravidlo bylo jasný, trenére. {name} netrénoval a hrál. Tak na co chodíme my?",
  "Trenére, sorry, ale {name} na tréninku chyběl a šel od začátku. Kabina to vidí.",
  "Mysleli jsme, že to s tím tréninkem myslíte vážně, trenére. {name} hrál, i když nechodil.",
  "Trenére, {name} netrénoval a hrál. Tak už nevím, co platí.",
  "Kdo nechodí, nehraje, říkal jste. {name} nechodil a hrál, trenére.",
];
export const APOLOGY_SINCERE_KABINA: readonly string[] = [
  "Kluci, sorry. Posral jsem to a mrzí mě to. Už se to nestane.",
  "Chci se vám všem omluvit. Byla to blbost a vím to.",
  "Kluci, omlouvám se. Nechal jsem vás v tom a to se nedělá.",
  "Sorry, chlapi. Udělal jsem chybu a beru to na sebe.",
  "Omlouvám se celý kabině. Zasloužíte si lepšího spoluhráče, budu se snažit.",
  "Kluci, fakt se omlouvám. Ostuda, kterou jsem udělal, padá na nás všechny.",
  "Chlapi, omluva. Bylo to ode mě hloupý a mrzí mě to.",
  "Kluci, omlouvám se vám. Dlužím vám to a odmakám to na hřišti.",
];
export const APOLOGY_CLUMSY_KABINA: readonly string[] = [
  "No… tak sorry, no. Trenér chtěl, abych se omluvil, tak se omlouvám.",
  "Kluci, tak jo, omlouvám se. Ale neberte to tak hrozně.",
  "Sorry teda. Víc k tomu asi nemám.",
  "Tak se omlouvám, jo? Ať je klid.",
  "No tak promiňte, no. Stalo se.",
  "Kluci, sorry za ten bordel. Nějak to vyřešíme, ne?",
  "Omlouvám se, no. Příště si dám bacha, asi.",
  "Tak jo, sorry. Hlavně ať už se o tom nemluví.",
];
export const APOLOGY_REFUSED_KABINA: readonly string[] = [
  "Omlouvat se nebudu. Kdo chce, ať si to se mnou vyřídí osobně.",
  "Trenér chce omluvu, ale já nemám za co. Tečka.",
  "Žádný omlouvání, kluci. Udělal bych to znova.",
  "Nebudu se tady nikomu plazit. Jdu trénovat.",
  "Omluva? To si nechte. Já to tak nevidím.",
  "Kluci, omlouvat se nebudu. Kdo mě zná, ví, jak to bylo.",
  "Nemám se za co omlouvat. Fakt ne.",
  "Na omluvy jsem nikdy nebyl. Ani teď nebudu.",
];
/** Asistent trenérovi: hráč s poslední šancí zase něco provedl. {name} v 1. pádě. */
export const LAST_CHANCE_REMINDERS: readonly string[] = [
  "{name} má poslední šanci, jak jste mu slíbil. A teď se provalilo, že zase něco provedl. Je to na vás, trenére.",
  "Trenére, {name} je ten, co měl poslední šanci. Další průšvih je venku. Co s ním?",
  "Připomínám, trenére: {name} dostal poslední šanci. Teď je jasné, že ji promarnil.",
  "{name} zase něco provedl, trenére. Slíbil jste mu, že pak letí. Rozhodnutí je na vás.",
  "Trenére, jak jste psal, {name} měl poslední šanci. Teď se ukázalo, že to byl zase on.",
  "{name} si poslední šanci nepohlídal, trenére. Kabina čeká, co uděláte.",
  "Trenére, {name} je v tom znova. Pamatujete, co jste mu slíbil?",
  "Další průšvih a letí, tak jste to {name} řekl, trenére. Průšvih je tady.",
];

// ─── Pomocné zápisy ─────────────────────────────────────────────────────────

/** JSON pole z `json_extract` (text), nečitelné se zaloguje. */
function jsonList(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : [];
  } catch (e) {
    logger.warn({ module: M }, "nečitelný seznam vynechaných tréninků", e);
    return [];
  }
}

function pick(pool: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

const MORALE = `life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END, '$.morale',
  MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))`;

/** Nálada aktivního kádru týmu kromě `except`. */
function squadMoraleStmt(db: D1Database, teamId: string, delta: number, except: readonly string[] = []): D1PreparedStatement {
  const ph = except.map(() => "?").join(", ");
  return db.prepare(
    `UPDATE players SET ${MORALE} WHERE team_id = ? AND (status IS NULL OR status = 'active')${except.length > 0 ? ` AND id NOT IN (${ph})` : ""}`,
  ).bind(delta, teamId, ...except);
}

function playerMoraleStmt(db: D1Database, playerId: string, delta: number): D1PreparedStatement {
  return db.prepare(`UPDATE players SET ${MORALE} WHERE id = ?`).bind(delta, playerId);
}

interface PlayerRow { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null; personality: string | null; life_context: string | null; team_id: string | null }

async function loadPlayer(db: D1Database, id: string): Promise<PlayerRow | null> {
  return db.prepare("SELECT id, first_name, last_name, nickname, avatar, personality, life_context, team_id FROM players WHERE id = ?")
    .bind(id).first<PlayerRow>()
    .catch((e) => { logger.warn({ module: M }, `hráč ${id}`, e); return null; });
}

function traits(row: Pick<PlayerRow, "personality">): { discipline: number; temper: number } {
  const p = lifeOf(row.personality);
  return { discipline: Number(p.discipline ?? 50) || 0, temper: Number(p.temper ?? 40) || 0 };
}

const sender = (r: PlayerRow) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar });

/** Id Kabiny klubu (skupinový chat), založí ji, když chybí. */
export async function kabinaConversationId(db: D1Database, clubTeamId: string): Promise<string> {
  const found = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group' AND title = 'Kabina' LIMIT 1")
    .bind(clubTeamId).first<{ id: string }>();
  if (found) return found.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO conversations (id, team_id, type, title, pinned, last_message_text, last_message_at, unread_count, created_at) VALUES (?, ?, 'squad_group', 'Kabina', 1, '', ?, 0, ?)",
  ).bind(id, clubTeamId, now, now).run();
  return id;
}

/** Hráč napíše do Kabiny. Text vybere z variant tu, kterou tam ještě nenapsal. */
async function postToKabina(
  db: D1Database, clubTeamId: string, player: PlayerRow, variants: readonly string[], seed: string, metadata: Record<string, unknown>, now: Date,
): Promise<string> {
  const convId = await kabinaConversationId(db, clubTeamId);
  const { loadOwnRecentLines, pickFreshVariant } = await import("./repetition");
  const previous = await loadOwnRecentLines(db, { playerId: player.id, convId, limit: 40 })
    .catch((e) => { logger.warn({ module: M }, "poslední věty hráče v kabině", e); return [] as string[]; });
  const body = pickFreshVariant(variants, previous, seed).text;
  const name = `${player.first_name} ${player.last_name}`;
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
    ).bind(crypto.randomUUID(), convId, player.id, name, body, JSON.stringify({ kabina: true, ...metadata }), now.toISOString()),
    db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?")
      .bind(`${name}: ${body}`.slice(0, 100), now.toISOString(), convId),
  ]);
  return body;
}

/** SMS od hráče kvůli trestu: model s fakty, jinak předem napsaná varianta. */
async function smsFromPlayer(
  db: D1Database, env: ChatEnv | undefined,
  o: { clubTeamId: string; player: PlayerRow; instruction: string; fallback: readonly string[]; seed: string; scenarioId: string },
): Promise<void> {
  const { sendEventSms } = await import("./event-sms");
  await sendEventSms(db, env, {
    clubTeamId: o.clubTeamId, player: sender(o.player), instruction: o.instruction, fallback: o.fallback,
    seed: o.seed, scenarioId: o.scenarioId, metadata: { type: "coach_rule" },
  }).catch((e) => logger.warn({ module: M }, `SMS ${o.scenarioId} od ${o.player.id}`, e));
}

// ─── Zápis a dotazy ─────────────────────────────────────────────────────────

/** Pravidla celé kabiny, která teď platí (pro fakta v promptu a bonus k docházce). */
export async function loadClubRules(db: D1Database, clubTeamId: string): Promise<Array<{ id: string; kind: string; details: RuleDetails; dueAt: string }>> {
  const rows = await db.prepare(
    `SELECT id, kind, details, due_at FROM coach_commitments
      WHERE team_id = ? AND status = 'active' AND (kind = 'training_rule' OR (kind = 'laps_penalty' AND json_extract(details, '$.squad') = 1))`,
  ).bind(clubTeamId).all<{ id: string; kind: string; details: string | null; due_at: string }>()
    .catch((e) => { logger.warn({ module: M }, `pravidla klubu ${clubTeamId}`, e); return { results: [] as never[] }; });
  return rows.results.map((r) => ({ id: r.id, kind: r.kind, details: lifeOf(r.details) as RuleDetails, dueAt: r.due_at }));
}

/** Bonus k docházce za platné pravidlo „kdo nechodí, nehraje“. */
export async function trainingRuleBonus(db: D1Database, clubTeamId: string): Promise<number> {
  const rules = await loadClubRules(db, clubTeamId);
  return rules.some((r) => r.kind === "training_rule") ? TRAINING_RULE_ATTENDANCE_BONUS : 0;
}

/**
 * Hráč trenérovi odepsal na pokyn (kolečka, omluva kabině): kývl, nebo odmítl. Zapíše se jen
 * k běžícímu pokynu, na který ještě neodpověděl.
 */
export async function respondToCoachRequest(db: D1Database, o: { commitmentId: string; playerId: string; accepted: boolean }): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.accepted', json(?))
      WHERE id = ? AND player_id = ? AND status = 'active' AND json_extract(details, '$.accepted') IS NULL`,
  ).bind(o.accepted ? "true" : "false", o.commitmentId, o.playerId).run()
    .catch((e) => { logger.warn({ module: M }, `odpověď na pokyn ${o.commitmentId}`, e); return null; });
  if ((r?.meta?.changes ?? 0) === 0) return false;
  // Dohoda o hubnutí (coach-rewards.ts): kývl → do termínu omezí hospodu; odmítl → dohoda neplatí.
  const c = await db.prepare("SELECT kind, due_at FROM coach_commitments WHERE id = ?").bind(o.commitmentId).first<{ kind: string; due_at: string }>();
  if (c?.kind === "weight_target") {
    if (o.accepted) {
      const { dietPledgeStmt } = await import("./coach-rewards");
      await dietPledgeStmt(db, o.playerId, c.due_at).run();
    } else {
      await db.prepare("UPDATE coach_commitments SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'active'")
        .bind(new Date().toISOString(), o.commitmentId).run();
    }
  }
  return true;
}

/** Na co má hráč v odpovědi kývnout (nejnovější čerstvý pokyn bez odpovědi). */
export function pendingRequestOf(
  list: ReadonlyArray<{ id: string; kind: string; status: string; details: RuleDetails; madeAt: string }> | undefined,
  kinds: readonly string[],
  now: Date = new Date(),
): PlayerSnapshot["pendingRequest"] {
  const c = (list ?? []).find((x) => x.status === "active" && kinds.includes(x.kind) && x.details.accepted === undefined
    && x.details.target !== "team" && x.details.target !== "absentees"
    && now.getTime() - new Date(x.madeAt).getTime() < REQUEST_FRESH_MS);
  return c ? { commitmentId: c.id, kind: c.kind } : undefined;
}

// ─── Trénink: kolečka ───────────────────────────────────────────────────────

/**
 * Po tréninku (denní tick): kdo měl kolečka a na trénink přišel, odběhá je, nebo odmítne.
 * Kondice a vztah se zapíšou hned, SMS pošle až denní běh v 10:00 (`settleRule`).
 *
 * `deferCondition` (denní tick): kondice se odečte až po denní regeneraci (`applyPendingLapsFatigue`).
 * Jinak −5 smazala regenerace v tomtéž ticku (Marek 92 → 87 → 100, E2E 22. 11.) a kolečka
 * u hráče nad ~85 neměla žádný dopad.
 */
export async function applyLapsAtTraining(
  db: D1Database,
  o: { clubTeamId: string; teamId: string; gameDay: string; attended: ReadonlyMap<string, boolean>; deferCondition?: boolean },
): Promise<number> {
  const rows = await db.prepare(
    "SELECT id, player_id, details FROM coach_commitments WHERE team_id = ? AND kind = 'laps_penalty' AND status = 'active'",
  ).bind(o.clubTeamId).all<{ id: string; player_id: string; details: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kolečka klubu", e); return { results: [] as never[] }; });
  let applied = 0;
  const day = o.gameDay.slice(0, 10);
  for (const c of rows.results) {
    try {
      const d = lifeOf(c.details) as RuleDetails;
      // Kolečka celé kabiny patří áčku, ne tréninku dorostu.
      if (d.target === "absentees" || (d.target === "team" && o.teamId !== o.clubTeamId)) continue;
      const done = d.done ?? [];
      // Kolečka celé kabiny platí jen na nejbližší trénink.
      if (d.target === "team" && done.length > 0) continue;
      const targets = d.target === "team"
        ? [...o.attended].filter(([, a]) => a).map(([id]) => id)
        : (d.playerIds ?? [c.player_id]).filter((id) => o.attended.get(id) === true);
      const fresh = targets.filter((id) => !done.some((x) => x.playerId === id));
      if (fresh.length === 0) continue;
      const stmts: D1PreparedStatement[] = [];
      for (const id of fresh) {
        const row = await loadPlayer(db, id);
        if (!row) continue;
        // Společná kolečka celé kabiny nikdo jednotlivě neslíbil: rozhodne povaha.
        const outcome = lapsOutcome(traits(row), d.target === "team" ? undefined : d.accepted);
        done.push({ playerId: id, outcome, day, ...(outcome === "ran" && o.deferCondition ? { fatigue: "pending" as const } : {}) });
        if (outcome === "ran" && o.deferCondition) {
          stmts.push(playerMoraleStmt(db, id, LAPS_RAN_MORALE));
        } else if (outcome === "ran") {
          const cond = Number(lifeOf(row.life_context).condition ?? 100);
          const next = Math.max(5, cond - LAPS_CONDITION);
          stmts.push(db.prepare(
            `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(5, COALESCE(json_extract(life_context, '$.condition'), 100) - ?)) WHERE id = ?`,
          ).bind(LAPS_CONDITION, id), playerMoraleStmt(db, id, LAPS_RAN_MORALE));
          if (next !== cond) {
            const { logConditionStmt } = await import("../lib/condition-log");
            stmts.push(logConditionStmt(db, id, o.teamId, cond, next, "training", "Trestná kolečka", day));
          }
        } else {
          stmts.push(...coachRelationStmts(db, {
            playerId: id, delta: LAPS_REFUSED_RELATION, source: "promise", description: "Odmítl odběhat trestná kolečka", gameDate: day,
          }));
        }
        applied++;
      }
      // Uzavře se až v 10:00 po SMS trenérovi (`settleLaps`), jinak by se o tom nedozvěděl.
      stmts.push(db.prepare("UPDATE coach_commitments SET details = ? WHERE id = ? AND status = 'active'")
        .bind(JSON.stringify({ ...d, done }), c.id));
      await db.batch(stmts);
    } catch (e) {
      logger.warn({ module: M }, `kolečka ${c.id}`, e);
    }
  }
  return applied;
}

/**
 * Denní tick po regeneraci kondice: kolečka odběhaná dnes na tréninku ubírají kondici až teď,
 * ať je regenerace nesmaže. Každý záznam jen jednou (`fatigue: applied`). Vrací počet hráčů.
 */
export async function applyPendingLapsFatigue(db: D1Database, gameDay: string): Promise<number> {
  const day = gameDay.slice(0, 10);
  const rows = await db.prepare(
    `SELECT id, team_id, details FROM coach_commitments WHERE kind = 'laps_penalty' AND status IN ('active', 'kept')
        AND details LIKE '%"fatigue":"pending"%'`,
  ).all<{ id: string; team_id: string; details: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kolečka čekající na regeneraci", e); return { results: [] as never[] }; });
  let applied = 0;
  for (const c of rows.results) {
    try {
      const d = lifeOf(c.details) as RuleDetails;
      const stmts: D1PreparedStatement[] = [];
      for (const x of d.done ?? []) {
        if (x.fatigue !== "pending" || x.outcome !== "ran") continue;
        x.fatigue = "applied";
        // Kolečka ze starších dnů (tick spadl před regenerací) už jen označí, kondice se neodečítá zpětně.
        if (x.day !== day) continue;
        const row = await loadPlayer(db, x.playerId);
        if (!row) continue;
        const cond = Number(lifeOf(row.life_context).condition ?? 100);
        const next = Math.max(5, cond - LAPS_CONDITION);
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(5, COALESCE(json_extract(life_context, '$.condition'), 100) - ?)) WHERE id = ?`,
        ).bind(LAPS_CONDITION, x.playerId));
        if (next !== cond) {
          const { logConditionStmt } = await import("../lib/condition-log");
          stmts.push(logConditionStmt(db, x.playerId, row.team_id ?? c.team_id, cond, next, "training", "Trestná kolečka", day));
        }
        applied++;
      }
      stmts.push(db.prepare("UPDATE coach_commitments SET details = ? WHERE id = ?").bind(JSON.stringify(d), c.id));
      await db.batch(stmts);
    } catch (e) {
      logger.warn({ module: M }, `kondice za kolečka ${c.id}`, e);
    }
  }
  return applied;
}

// ─── Denní vyhodnocení ──────────────────────────────────────────────────────

export interface RuleRow {
  id: string; team_id: string; player_id: string; kind: RuleKind; made_at: string; due_at: string;
  details: string | null; conversation_id: string | null; club_user_id: string | null; game_date: string | null;
}

async function close(db: D1Database, id: string, status: "kept" | "broken" | "expired", now: Date, details?: RuleDetails): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE coach_commitments SET status = ?, resolved_at = ?${details ? ", details = ?" : ""} WHERE id = ? AND status = 'active'`,
  ).bind(status, now.toISOString(), ...(details ? [JSON.stringify(details)] : []), id).run();
  return (r.meta?.changes ?? 0) > 0;
}

async function saveDetails(db: D1Database, id: string, details: RuleDetails): Promise<void> {
  await db.prepare("UPDATE coach_commitments SET details = ? WHERE id = ? AND status = 'active'").bind(JSON.stringify(details), id).run();
}

/** Denně (settleCoachCommitments): vyhodnotí jedno pravidlo nebo trest. Vrací true, když se uzavřel. */
export async function settleRule(db: D1Database, env: ChatEnv | undefined, r: RuleRow, now: Date): Promise<boolean> {
  const d = lifeOf(r.details) as RuleDetails;
  const duePassed = new Date(r.due_at).getTime() < now.getTime();
  const human = !!r.club_user_id && r.club_user_id !== "ai";
  switch (r.kind) {
    case "training_rule": return settleTrainingRule(db, env, r, d, duePassed, human, now);
    case "laps_penalty": return settleLaps(db, env, r, d, duePassed, human, now);
    case "last_chance": return settleLastChance(db, r, d, duePassed, human, now);
    case "squad_apology": return settleApology(db, r, d, human, now);
  }
}

/** Zápasy áčka klubu od `since` s herním dnem (z kalendáře kola) a základní sestavou klubu. */
async function clubMatchesSince(db: D1Database, clubTeamId: string, since: string): Promise<Array<{ id: string; at: string; day: string; starters: string[] }>> {
  const rows = await db.prepare(
    `SELECT m.id, m.home_team_id, m.home_lineup_data, m.away_lineup_data, m.simulated_at, sc.scheduled_at
       FROM matches m LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.status = 'simulated' AND m.simulated_at > ?1 AND (m.home_team_id = ?2 OR m.away_team_id = ?2)
      ORDER BY m.simulated_at ASC LIMIT 10`,
  ).bind(since, clubTeamId).all<{ id: string; home_team_id: string; home_lineup_data: string | null; away_lineup_data: string | null; simulated_at: string; scheduled_at: string | null }>();
  return rows.results.map((m) => {
    const lineup = lifeOf(m.home_team_id === clubTeamId ? m.home_lineup_data : m.away_lineup_data) as { starters?: Array<{ id?: string }> };
    return {
      id: m.id, at: m.simulated_at, day: (m.scheduled_at ?? m.simulated_at).slice(0, 10),
      starters: (lineup.starters ?? []).map((s) => s.id).filter((x): x is string => typeof x === "string"),
    };
  });
}

/**
 * Pravidlo docházky: po každém zápase áčka se podívá, jestli trenér nepostavil hráče, který
 * v týdnu před zápasem vynechal trénink. Pak pravidlo padá a kabina to vidí. Do konce lhůty
 * dodržené pravidlo se uzavře jako dodržené.
 */
async function settleTrainingRule(
  db: D1Database, env: ChatEnv | undefined, r: RuleRow, d: RuleDetails, duePassed: boolean, human: boolean, now: Date,
): Promise<boolean> {
  const matches = await clubMatchesSince(db, r.team_id, d.checkedAt ?? r.made_at);
  for (const m of matches) {
    const ph = m.starters.map(() => "?").join(", ");
    const starters = m.starters.length === 0 ? [] : (await db.prepare(
      `SELECT id, first_name, last_name, json_extract(life_context, '$.missedTrainings') AS missed FROM players WHERE id IN (${ph})`,
    ).bind(...m.starters).all<{ id: string; first_name: string; last_name: string; missed: string | null }>()).results;
    const violator = starters.find((s) => missedBefore(jsonList(s.missed), m.day));
    if (violator) {
      const next: RuleDetails = { ...d, checkedAt: m.at, violatorId: violator.id };
      if (!(await close(db, r.id, "broken", now, next))) return false;
      await db.batch([squadMoraleStmt(db, r.team_id, RULE_BROKEN_SQUAD_MORALE, [violator.id])])
        .catch((e) => logger.warn({ module: M }, `nálada kabiny po porušeném pravidle ${r.id}`, e));
      if (human) await complainAboutRule(db, env, r, violator, m.day, now);
      return true;
    }
    d = { ...d, checkedAt: m.at, keptMatches: (d.keptMatches ?? 0) + 1 };
  }
  if (duePassed) return close(db, r.id, "kept", now, d);
  if (matches.length > 0) await saveDetails(db, r.id, d);
  return false;
}

/** Nejukázněnější hráč kádru, který trénink nevynechal, trenérovi napíše, že pravidlo neplatí. */
async function complainAboutRule(
  db: D1Database, env: ChatEnv | undefined, r: RuleRow, violator: { id: string; first_name: string; last_name: string }, matchDay: string, now: Date,
): Promise<void> {
  const squad = await db.prepare(
    `SELECT id, first_name, last_name, nickname, avatar, personality, life_context, team_id FROM players
      WHERE team_id = ? AND id != ? AND (status IS NULL OR status = 'active')`,
  ).bind(r.team_id, violator.id).all<PlayerRow>();
  const who = squad.results
    .filter((p) => !missedBefore(lifeOf(p.life_context).missedTrainings, matchDay))
    .sort((a, b) => traits(b).discipline - traits(a).discipline)[0];
  if (!who) return;
  const name = `${violator.first_name} ${violator.last_name}`;
  await smsFromPlayer(db, env, {
    clubTeamId: r.team_id, player: who,
    instruction: `Trenér vyhlásil v kabině pravidlo „kdo vynechá trénink, nehraje“. Teď ale postavil do základu spoluhráče ${name}, `
      + "který v týdnu před zápasem na tréninku chyběl. Ty jsi chodil. Napiš trenérovi, co si o tom kabina myslí, podle své povahy.",
    fallback: RULE_BROKEN_SMS.map((t) => t.replace("{name}", name)),
    seed: `rule|${r.id}|${now.toISOString().slice(0, 10)}`, scenarioId: "training_rule_broken",
  });
}

/**
 * Kolečka: „kdo se omluví“ se po prvním zápase od pravidla převede na jmenovité tresty
 * omluvených (z kabiny zápasu). O odběhaných a odmítnutých kolečkách přijde trenérovi SMS.
 */
async function settleLaps(
  db: D1Database, env: ChatEnv | undefined, r: RuleRow, d: RuleDetails, duePassed: boolean, human: boolean, now: Date,
): Promise<boolean> {
  if (d.target === "absentees") {
    const match = await db.prepare(
      `SELECT m.calendar_id FROM matches m WHERE m.status = 'simulated' AND m.simulated_at > ?1 AND (m.home_team_id = ?2 OR m.away_team_id = ?2)
        ORDER BY m.simulated_at ASC LIMIT 1`,
    ).bind(r.made_at, r.team_id).first<{ calendar_id: string | null }>();
    if (!match) return duePassed ? close(db, r.id, "expired", now) : false;
    const { recordedExcuses } = await import("../events/match-absences");
    const excused = match.calendar_id ? [...(await recordedExcuses(db, r.team_id, match.calendar_id))?.keys() ?? []] : [];
    const own: string[] = [];
    for (const id of excused) if (await ownSquadTeamId(db, id, r.team_id)) own.push(id);
    const stmts = own.map((id) => db.prepare(
      `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
       SELECT ?, ?, ?, ?, 'laps_penalty', 'active', ?, ?, quote, ? FROM coach_commitments WHERE id = ?`,
    ).bind(crypto.randomUUID(), r.team_id, id, r.conversation_id, now.toISOString(),
      new Date(now.getTime() + 7 * DAY_MS).toISOString(), JSON.stringify({ target: "self", playerIds: [id], fromRule: r.id }), r.id));
    if (stmts.length > 0) await db.batch(stmts);
    // Pravidlo splnilo účel: omluvení teď mají každý svůj trest.
    return close(db, r.id, own.length > 0 ? "kept" : "expired", now);
  }
  // Odběhaná a odmítnutá kolečka: trenér dostane SMS (u celé kabiny jednu do Kabiny).
  const pending = (d.done ?? []).filter((x) => !x.notified);
  if (pending.length > 0) {
    for (const x of pending) x.notified = true;
    await db.prepare("UPDATE coach_commitments SET details = ? WHERE id = ?").bind(JSON.stringify(d), r.id).run();
    if (human) {
      if (d.target === "team") {
        const runner = pending.find((x) => x.outcome === "ran");
        const row = runner ? await loadPlayer(db, runner.playerId) : null;
        if (row) await postToKabina(db, r.team_id, row, TEAM_LAPS_KABINA, `laps|${r.id}`, { type: "coach_rule", kind: "laps_penalty" }, now);
      }
      for (const x of pending) {
        if (d.target === "team" && x.outcome === "ran") continue;
        const row = await loadPlayer(db, x.playerId);
        if (!row) continue;
        await smsFromPlayer(db, env, {
          clubTeamId: r.team_id, player: row,
          instruction: x.outcome === "ran"
            ? `Trenér ti za trest nařídil kolečka a ty jsi je ${dayPhrase(x.day)} na tréninku odběhal. Napiš mu to podle své povahy (s úlevou, kysele, nebo s humorem).`
            : `Trenér ti za trest nařídil kolečka a ty jsi je ${dayPhrase(x.day)} na tréninku odmítl běhat. Napiš mu to podle své povahy, vzdorovitě, ale ne sprostě.`,
          fallback: x.outcome === "ran" ? LAPS_RAN_SMS : LAPS_REFUSED_SMS,
          seed: `laps|${r.id}|${x.playerId}`, scenarioId: x.outcome === "ran" ? "laps_ran" : "laps_refused",
        });
      }
    }
  }
  // Všichni potrestaní na tréninku byli (odběhali nebo odmítli): trest je vykonaný.
  const done = d.done ?? [];
  const allDone = d.target === "team" ? done.length > 0 : (d.playerIds ?? [r.player_id]).every((id) => done.some((x) => x.playerId === id));
  if (allDone) return close(db, r.id, "kept", now, d);
  return duePassed ? close(db, r.id, "expired", now) : false;
}

/**
 * Poslední šance: když se po ní provalí další průšvih hráče (incident s odhaleným pachatelem),
 * trenér dostane připomínku od asistenta a šance je pryč. Do konce lhůty čistý = dodržel.
 */
async function settleLastChance(db: D1Database, r: RuleRow, d: RuleDetails, duePassed: boolean, human: boolean, now: Date): Promise<boolean> {
  const incident = await db.prepare(
    `SELECT id FROM club_incidents WHERE culprit_player_id = ? AND culprit_revealed = 1 AND created_at > ? AND status != 'hrozi'
      ORDER BY created_at ASC LIMIT 1`,
  ).bind(r.player_id, r.made_at).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `průšvih po poslední šanci ${r.id}`, e); return null; });
  if (!incident && !duePassed) return false;
  const status = incident ? "broken" : "kept";
  if (!(await close(db, r.id, status, now, incident ? { ...d, violatedIncidentId: incident.id } : d))) return false;
  await db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.lastChanceUntil') WHERE id = ? AND json_valid(life_context)")
    .bind(r.player_id).run();
  if (incident && human) {
    const p = await loadPlayer(db, r.player_id);
    if (p) {
      const { sendSystemSMS } = await import("./system-sms");
      await sendSystemSMS(db, r.team_id, "Asistent trenéra",
        pick(LAST_CHANCE_REMINDERS, `${r.id}|${incident.id}`).replace("{name}", `${p.first_name} ${p.last_name}`),
        { type: "incident", incidentId: incident.id });
    }
  }
  return true;
}

/**
 * Omluva kabině: nejdřív 6 hodin po pokynu (hráč napíše „do druhého dne“). Kývl-li trenérovi,
 * omluví se; odmítl-li, kabina se to dozví od něj. Když neodpověděl, rozhodne povaha.
 */
async function settleApology(db: D1Database, r: RuleRow, d: RuleDetails, human: boolean, now: Date): Promise<boolean> {
  if (now.getTime() - new Date(r.made_at).getTime() < APOLOGY_DELAY_MS) return false;
  const p = await loadPlayer(db, r.player_id);
  if (!p || !(await ownSquadTeamId(db, p.id, r.team_id)) || !p.team_id) return close(db, r.id, "expired", now);
  const tone = apologyTone(traits(p), d.accepted);
  if (!(await close(db, r.id, tone === "refused" ? "broken" : "kept", now, { ...d, tone }))) return false;
  const day = (r.game_date ?? now.toISOString()).slice(0, 10);
  const stmts: D1PreparedStatement[] = tone === "refused"
    ? [squadMoraleStmt(db, p.team_id, APOLOGY_REFUSED_SQUAD_MORALE, [p.id]), ...coachRelationStmts(db, {
      playerId: p.id, delta: APOLOGY_REFUSED_RELATION, source: "promise", description: "Odmítl se omluvit kabině", gameDate: day,
    })]
    : [squadMoraleStmt(db, p.team_id, tone === "sincere" ? APOLOGY_SINCERE_SQUAD_MORALE : APOLOGY_CLUMSY_SQUAD_MORALE, [p.id]), ...coachRelationStmts(db, {
      playerId: p.id, delta: APOLOGY_RELATION, source: "promise", description: "Omluvil se kabině, jak jsi chtěl", gameDate: day,
    })];
  await db.batch(stmts).catch((e) => logger.warn({ module: M }, `dopad omluvy kabině ${r.id}`, e));
  // AI klub: dopad platí, do Kabiny nikdo nepíše (AI trenér chat nečte).
  if (human) {
    const pool = tone === "sincere" ? APOLOGY_SINCERE_KABINA : tone === "clumsy" ? APOLOGY_CLUMSY_KABINA : APOLOGY_REFUSED_KABINA;
    await postToKabina(db, r.team_id, p, pool, `apology|${r.id}`, { type: "coach_rule", kind: "squad_apology", tone }, now)
      .catch((e) => logger.warn({ module: M }, `omluva v kabině ${r.id}`, e));
  }
  return true;
}

/** Ruční zrušení („to nebyl slib“): poslední šance přestane hráče krotit. */
export async function onRuleCancelled(db: D1Database, kind: string, playerId: string): Promise<void> {
  if (kind !== "last_chance") return;
  await db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.lastChanceUntil') WHERE id = ? AND json_valid(life_context)")
    .bind(playerId).run();
}

/** Zápis poslední šance do hráče: incidenty ho berou jako méně pravděpodobného pachatele. */
export function lastChanceStmt(db: D1Database, playerId: string, dueAt: string): D1PreparedStatement {
  return db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.lastChanceUntil', ?) WHERE id = ?")
    .bind(dueAt.slice(0, 10), playerId);
}

/** Vynechaný trénink do `life_context.missedTrainings` (pravidlo docházky). */
export function missedTrainingStmt(db: D1Database, playerId: string, lifeContext: unknown, day: string): D1PreparedStatement {
  return db.prepare("UPDATE players SET life_context = json_set(life_context, '$.missedTrainings', json(?)) WHERE id = ?")
    .bind(JSON.stringify(missedTrainingsAfter(lifeOf(lifeContext).missedTrainings, day)), playerId);
}

// ─── Kabina ─────────────────────────────────────────────────────────────────

/** Zpráva do kabiny, ve které může být pravidlo nebo trest (stejné síto jako u SMS, coach-commitments.ts). */
const SQUAD_RULE_HINT_RE = /(?<![\p{L}])nehraje(?![\p{L}])|nebude hr[aá]t|kole[cč]k|za trest|trestn|odb[eě]h|pob[eě][zž][ií]|(?<![\p{L}])bude(?:[sš]|te) b[eě]hat|posledn[ií] [sš]anc|(?<![\p{L}])let[ií](?:[sš]|te)(?![\p{L}])|vyhod[ií]m|(?<![\p{L}])omluv(?:[ií][sš]|[ií]te|it)(?![\p{L}])/iu;

/**
 * Pravidlo nebo trest napsaný do kabiny: „kdo nebude chodit na tréninky, nebude hrát“, „kdo se
 * omluví, bude běhat kolečka“, „za tenhle výkon budete běhat“, „Nováku, poslední šance“.
 * Pravidlo celé kabiny zastupuje kapitán (nebo kdo odpověděl), trest jednotlivce dostane každý
 * jmenovaný hráč zvlášť. Vrací id zapsaných pravidel. Nikdy nehází.
 */
export async function handleSquadRule(
  db: D1Database,
  env: ChatEnv,
  o: {
    teamId: string; convId: string; message: string;
    squad: ReadonlyArray<{ id: string; firstName: string; lastName: string; nickname?: string | null }>;
    representative: Pick<PlayerSnapshot, "id" | "firstName">;
  },
): Promise<string[]> {
  try {
    if (!SQUAD_RULE_HINT_RE.test(o.message)) return [];
    const chat = await import("./ai-player-chat");
    const raw = await chat.askModelJson<{ kind?: unknown; quote?: unknown; target?: unknown }>(env, [
      chat.COACH_TEXT_RULE,
      "Trenér vesnického fotbalového týmu napsal do skupinového chatu celé kabiny:",
      chat.coachQuote(o.message),
      "",
      "Vyhlašuje v ní pravidlo nebo trest? Vyber jednu možnost:",
      "- \"training_rule\": kdo nechodí nebo vynechá trénink, nehraje („kdo nebude chodit na tréninky, nebude hrát“).",
      "- \"laps_penalty\": TREST kolečky nebo běháním na tréninku. target: team (celá kabina, „za tenhle výkon budete běhat“, „za trest běhá celá kabina“), absentees (kdo se omluví nebo nepřijde na zápas), named (jen jmenovaní hráči).",
      `  ${LAPS_PENALTY_NOT_PLAN}`,
      "- \"last_chance\": jmenovaný hráč má poslední šanci, při dalším průšvihu letí.",
      "- \"squad_apology\": jmenovaný hráč se má omluvit celé kabině.",
      "- \"none\": nic z toho (nadávka bez trestu, kritika výkonu, plán tréninku, vtip, otázka).",
      "Do quote dej DOSLOVA tu část zprávy, ve které pravidlo nebo trest je.",
      "Vrať POUZE JSON: {\"kind\": \"training_rule\"|\"laps_penalty\"|\"last_chance\"|\"squad_apology\"|\"none\", \"quote\": \"...\", \"target\": \"team\"|\"absentees\"|\"named\"|null}",
    ].join("\n"), 140);
    const kind = typeof raw?.kind === "string" && (RULE_KINDS as readonly string[]).includes(raw.kind) ? raw.kind as RuleKind : null;
    if (!kind) return [];
    const { quoteContext, quoteHoldsUp, recordCommitment } = await import("./coach-commitments");
    if (!quoteHoldsUp(raw?.quote, o.message, kind)) return [];
    let target: LapsTarget | "named" = raw?.target === "team" || raw?.target === "absentees" ? raw.target : "named";
    if (kind === "laps_penalty") {
      // Kolečka jen jako výslovný trest; celé kabině jen „celá kabina“, „všichni“ nebo „budete“.
      const cues = lapsPunishmentCues(quoteContext(String(raw?.quote), o.message));
      if (!cues.punishment) return [];
      if (target === "team" && !cues.wholeSquad && !cues.plural) target = "named";
      if (target === "absentees" && !cues.anyone) target = "named";
    }
    const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(o.teamId).first<{ id: string }>();
    const clubTeamId = club?.id ?? o.teamId;
    if (kind === "training_rule" || (kind === "laps_penalty" && target !== "named")) {
      return [await recordCommitment(db, {
        clubTeamId, playerId: o.representative.id, convId: o.convId, coachMessage: o.message,
        detected: kind === "laps_penalty" ? { kind, target: target as LapsTarget } : { kind }, playerFirstName: o.representative.firstName,
      })];
    }
    // Jmenovaní hráči: trest každému zvlášť, jen vlastnímu kádru.
    const { addressedPlayers } = await import("./squad-talk");
    const ids: string[] = [];
    for (const p of addressedPlayers(o.squad, o.message)) {
      if (!(await ownSquadTeamId(db, p.id, clubTeamId))) continue;
      ids.push(await recordCommitment(db, {
        clubTeamId, playerId: p.id, convId: o.convId, coachMessage: o.message,
        detected: kind === "laps_penalty" ? { kind, target: "self" } : { kind }, playerFirstName: p.firstName,
      }));
    }
    return ids;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `pravidlo v kabině ${o.convId}`, e);
    return [];
  }
}
