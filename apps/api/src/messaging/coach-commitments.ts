/**
 * Dohody z rozhovorů (2026-11-18): co trenér hráči napíše vlastními slovy, bere hra vážně.
 *
 * Na produkci manažeři v SMS slibovali („zítra s tebou počítám do sestavy“, „zkusím tě na
 * křídle“, „tady máš 1 000 Kč prémii“, „pustím tě při další nabídce“). Hráč odpověděl „beru
 * tě za slovo“ a dál se nedělo nic: hlídaly se jen sliby z tlačítek dohody (player_promises).
 * Rozbor: docs/analyza-sms-manazeru-2026-11-18.md.
 *
 * Tok:
 *  1. Zpráva trenéra hráči (routes/messaging.ts) projde `COMMITMENT_HINT_RE`; když v ní může
 *     být slib, model ho rozpozná (`detectCommitment`), jinak se nevolá nic.
 *  2. Slib se zapíše do `coach_commitments`. Peníze se nikdy nepošlou samy: pod zprávou
 *     se objeví tlačítko a vyplatí je až manažer (`fulfilMoneyCommitment`).
 *  3. Denně (transfer-pressure-tick) se běžící sliby vyhodnotí podle zápasů, vyplacení
 *     nebo lhůty (`settleCoachCommitments`). Hráč poděkuje, nebo se ozve, že slib neplatil.
 *  4. Den před zápasem hráč se slíbeným základem připomene (`remindCoachCommitments`).
 *  5. Hráč o běžících i nedávno vyhodnocených slibech ví v každé odpovědi (`commitmentPromptLines`).
 */

import { logger } from "../lib/logger";
import { applyCoachRelationDelta } from "../lib/coach-relation";
import { LINEUP_PROMISE_BROKEN_SMS, LINEUP_PROMISE_KEPT_SMS } from "./promise-texts";
import { sendPlayerTemplateSMS } from "./system-sms";
import { czechDayWords } from "../weddings/wedding";
import {
  LAPS_PENALTY_NOT_PLAN, LAPS_TARGETS, RULE_DUE_DAYS, RULE_KINDS, lapsPunishmentCues, lastChanceStmt, rulePromptLine, ruleText,
  type LapsTarget, type RuleDetails, type RuleKind,
} from "./coach-rules";
import {
  REWARD_BROKEN_SMS, REWARD_KEPT_SMS, REWARD_KINDS, markRewardEarned, parseReward, parseWeightTarget, rewardPrice, rewardPromptLine,
  rewardLabel, rewardText, weightDealDetails, weightDealNote, type RewardKind, type RewardType,
} from "./coach-rewards";
// Chat se načítá až za běhu: ai-player-chat → player-memory → tento modul by jinak byl kruh.
import type { ChatEnv } from "./ai-player-chat";

const M = "coach-commitments";
const DAY_MS = 86_400_000;

export type CommitmentKind = "start_next" | "start_soon" | "position" | "release_offer" | "bonus" | "wage"
  // Bod 2 rozboru: trenér zve hráče (hospoda, schůzka) a sázky o výkon v příštím zápase.
  | "invite_pub" | "invite_talk" | "bet"
  // Bod 4: pokuta napsaná v SMS a úkol „poptej se“ k incidentu (incidents/zprava-trenera.ts).
  | "fine" | "task_inquiry"
  // Pachatel slíbil vrátit lup nebo opravit škodu brigádou (incidents/restitution.ts, amends.ts).
  | "task_return" | "task_repair"
  // Pravidla a tresty pro kabinu i jednotlivce (coach-rules.ts).
  | RuleKind
  // Odměny mimo zápas: dohoda o hubnutí a odměna za službu (coach-rewards.ts).
  | RewardKind;
export type CommitmentStatus = "active" | "kept" | "broken" | "expired" | "cancelled";
export type LineupRole = "GK" | "DEF" | "MID" | "FWD";
export type BetCondition = "goal" | "hattrick" | "assist" | "win" | "clean_sheet";
export type BetReward = "round" | "keg" | "money" | "pub";

/** Druhy, které rozpoznává model ze zprávy trenéra (úkol „poptej se“ zakládá incident). */
export const COMMITMENT_KINDS: readonly CommitmentKind[] = [
  "start_next", "start_soon", "position", "release_offer", "bonus", "wage", "invite_pub", "invite_talk", "bet", "fine",
  ...RULE_KINDS,
  ...REWARD_KINDS,
];
/** Pravidlo nebo trest, který platí pro celou kabinu (zastupuje ji jeden hráč, jako u sázky kabiny). */
export function isSquadRule(kind: CommitmentKind, target?: LapsTarget): boolean {
  return kind === "training_rule" || (kind === "laps_penalty" && (target === "team" || target === "absentees"));
}
const ROLES: readonly LineupRole[] = ["GK", "DEF", "MID", "FWD"];
const BET_CONDITIONS: readonly BetCondition[] = ["goal", "hattrick", "assist", "win", "clean_sheet"];
const BET_REWARDS: readonly BetReward[] = ["round", "keg", "money"];
/** Sázka celé kabiny („když vyhrajeme, platím hospodu“): hospoda pro všechny jako „Pojedeme na jedno“. */
const SQUAD_BET_REWARDS: readonly BetReward[] = ["round", "keg", "pub"];
/** Co stojí runda pro kluky a basa piva, když sázka vyjde (runda jako u pozvání do hospody). */
export const BET_PRICE: Record<Exclude<BetReward, "money">, number> = { round: 600, keg: 500, pub: 1500 };

export interface DetectedCommitment {
  kind: CommitmentKind;
  position?: LineupRole;
  /** Prémie v Kč, u sázky o peníze částka. */
  amount?: number;
  /** Zvýšení odměn v procentech. */
  percent?: number;
  condition?: BetCondition;
  reward?: BetReward;
  /** Sázka celé kabiny (handleSquadBet). */
  squad?: boolean;
  /** Kolečka: komu (coach-rules.ts). */
  target?: LapsTarget;
  /** Dohoda o hubnutí (coach-rewards.ts): kolik kg (null = na normální váhu), za kolik dní, sázka hráče. */
  kg?: number | null;
  days?: number;
  forfeit?: boolean;
  rewardType?: RewardType;
}

export interface CommitmentDetails extends RuleDetails {
  /** Dohoda o hubnutí a odměna (coach-rewards.ts). */
  kg?: number;
  startWeight?: number;
  targetWeight?: number;
  forfeit?: boolean;
  lost?: number;
  rewardType?: RewardType;
  /** Úkol „poptej se“: přinesl hráč jméno? */
  lead?: number;
  position?: LineupRole;
  amount?: number;
  percent?: number;
  condition?: BetCondition;
  reward?: BetReward;
  /** Sázka vyšla v tomhle zápase, trenér má zaplatit. */
  won?: boolean;
  /** Sázka s celou kabinou (squad-talk.ts): hráč u slibu jen zastupuje kabinu, dopad mají všichni. */
  squad?: boolean;
  matchId?: string;
  /** Id systémové zprávy s tlačítkem (peníze). */
  buttonMessageId?: string;
  /** Dodržený slib opravdu změnil vztah (od něj se počítá lhůta proti „farmení“). */
  effect?: number;
  /** Úkol „poptej se“, „vrať to“, „oprav to“: o jaký incident jde. */
  incidentId?: string;
  /** Úkol „vrať to“ / „oprav to“: herní den lhůty `YYYY-MM-DD`. */
  dueOn?: string;
}

/** Jak dlouho slib platí, než se vyhodnotí bez zápasu nebo bez vyplacení. */
const DUE_DAYS: Record<CommitmentKind, number> = {
  start_next: 10, start_soon: 21, position: 10, release_offer: 30, bonus: 7, wage: 7,
  invite_pub: 2, invite_talk: 3, bet: 10, fine: 3, task_inquiry: 1, task_return: 2, task_repair: 2,
  ...RULE_DUE_DAYS,
  // Hubnutí: termín z dohody (výchozí 14 dní), odměna: lhůta na vyplacení.
  weight_target: 14, reward: 5,
};
/** Kolik dní má trenér na zaplacení vyhrané sázky. */
const BET_PAY_DAYS = 5;

/** Za kolik dní hráč připomene nevyplacené peníze. */
const MONEY_REMINDER_DAYS = 3;
/** Dodržený slib sestavy zlepší vztah nejvýš jednou za tolik dní (jinak by šel „farmit“). */
const KEPT_EFFECT_COOLDOWN_DAYS = 14;
/** Peníze (prémie, odměny, sázka) zlepší vztah nejvýš jednou za tolik dní, jinak by šel koupit po stokorunách. */
const MONEY_EFFECT_COOLDOWN_DAYS = 14;
/** Pozvání od trenéra má dopad nejvýš jednou za tolik dní. */
const INVITE_EFFECT_COOLDOWN_DAYS = 7;

/** Začátek a konec slova i s diakritikou (`\b` v JS zná jen ASCII: „odpustím“ by prošlo jako „pustím“). */
const WB = "(?<![\\p{L}\\p{N}])";
const WE = "(?![\\p{L}\\p{N}])";

/**
 * Předběžné síto: model se volá jen u zpráv, kde slib může být. Projde i „platím“ nebo
 * „hraješ dobře“, rozhodne až model; chybí-li tu slovo, slib se nerozpozná vůbec.
 *
 * Každý zbytečný zásah stojí volání modelu a zdrží odpověď hráče. Lokální E2E (22. 11.) chytalo
 * „Domluv“ (omluv), „k dispozici“ (pozic), „platí?“, „nepojedeš“, „odpustím“ (pustím), „ve středu“,
 * „obranou“ i „450 tisíc“ v otázce na nabídku. Proto hranice slov a slibové tvary: pozice jen se
 * slovesem slibu („zkusím tě“, „půjdeš do“), peníze jen s „Kč“ nebo „dám ti“, běhání jen jako trest.
 */
export const COMMITMENT_HINT_RE = new RegExp([
  // Sestava a pozice.
  `z[aá]klad(?:u|n\\p{L}*|${WE})`, "sestav", `${WB}hraje[sš]${WE}`, "nastoup", "od za[cč][aá]tku", "pevn[eé] m[ií]sto",
  `${WB}(?:zkus[ií]m|postav[ií]m|d[aá]m|po[sš]lu|hod[ií]m)\\s+t[eě]${WE}`, `${WB}p[uů]jde[sš]\\s+(?:do|na)${WE}`,
  `${WB}bude[sš]\\s+(?:hr[aá]t|nastupovat|za[cč][ií]nat)`,
  // Odchod, peníze.
  `${WB}pust[ií]m${WE}`, "nebudu (?:ti )?br[aá]nit", "pr[eé]mi", "odm[eě]n", `${WB}plat(?:u|em|y|[ií]m)?${WE}`, `${WB}p[rř]id[aá]m${WE}`,
  `${WB}zv(?:ednu|ed[aá]m|[yý][sš][ií]m)${WE}`, `${WB}k[cč]${WE}`, `${WB}korun`, `${WB}d[aá]m\\s+ti${WE}`, `${WB}ti\\s+d[aá]m${WE}`,
  "stov(?:k|[aá]k)", "p[eě]tistov", "tis[ií]covk", `${WB}litr`, `${WB}na\\s+m[eě]${WE}`,
  // Pozvání a sázky (sázka má vždy odměnu: „platím“, „piv“, „basa“, „Kč“, „na mě“).
  `${WB}piv`, "hospod", `${WB}rund`, `${WB}bas(?:a|u|y)?${WE}`, "pan[aá]k", "zajd", `${WB}(?:za)?stav\\s+se${WE}`, "sejd", "sej[ií]t",
  "prober", "probrat", "pokec", "kancel", `na\\s+jedno${WE}`, "na\\s+kafe", "hattrick", "hatrik", "hetrik",
  // Pokuta.
  "pokut", "strhn", "sr[aá][zž]k", "z\\s+v[yý]plat", "ze\\s+mzdy",
  // Odměny mimo zápas: hubnutí, flaška, „litr“.
  "hubn", "shod[ií]", `${WB}kil(?:o|a|ama|ech)?${WE}`, "fla[sš]k", "l[aá]hev", `${WB}rum(?:u|a|em)?${WE}`, "valk", "d[aá]rek", "koup[ií]m",
  // Pravidla a tresty: „kdo nechodí, nehraje“, kolečka, poslední šance, omluva kabině. Plán tréninku
  // („budeme hodně běhat“, „bude hodně běhání“) slibem není.
  `${WB}nehraje${WE}`, "nebude\\s+hr[aá]t", "kole[cč]k", "za\\s+trest", "trestn", "odb[eě]h", "pob[eě][zž][ií]",
  `${WB}bude(?:[sš]|te)\\s+b[eě]hat`, "posledn[ií]\\s+[sš]anc", `${WB}let[ií][sš]${WE}`, "vyhod[ií]m", `${WB}omluv(?:[ií][sš]|[ií]te|it)${WE}`,
].join("|"), "iu");

const ROLE_WORDS: Record<LineupRole, string> = { GK: "do brány", DEF: "do obrany", MID: "do zálohy", FWD: "do útoku" };

/** Co trenér slíbil, česky pro hráče i manažera (bez herních čísel, jen podmínky slibu). */
export function commitmentText(kind: CommitmentKind, d: CommitmentDetails = {}): string {
  switch (kind) {
    case "start_next": return "Místo v základu v příštím zápase";
    case "start_soon": return "Místo v základu ve 2 ze 3 příštích zápasů";
    case "position": return `Že ho v příštím zápase postaví ${ROLE_WORDS[d.position ?? "MID"]}`;
    case "release_offer": return "Pustit ho při další slušné nabídce";
    case "bonus": return `Prémii ${(d.amount ?? 0).toLocaleString("cs-CZ")} Kč`;
    case "wage": return `Vyšší odměny (o ${d.percent ?? 0} %)`;
    case "invite_pub": return "Pozvání na pivo";
    case "invite_talk": return "Schůzku, ať to spolu proberou";
    case "bet": return `Když ${BET_CONDITION_TEXT[d.condition ?? "goal"]}, trenér ${betRewardText(d)}`;
    case "fine": return `Pokutu ${(d.amount ?? 0).toLocaleString("cs-CZ")} Kč`;
    case "task_inquiry": return "Poptat se kvůli incidentu";
    case "task_return": return "Vrátit, co vzal";
    case "task_repair": return "Opravit škodu brigádou";
    case "training_rule": case "laps_penalty": case "last_chance": case "squad_apology": return ruleText(kind, d);
    case "weight_target": case "reward": return rewardText(kind, { ...d, reward: d.rewardType });
  }
}

const BET_CONDITION_TEXT: Record<BetCondition, string> = {
  goal: "dá gól", hattrick: "dá hattrick", assist: "na gól přihraje", win: "tým vyhraje", clean_sheet: "tým udrží čisté konto",
};

function betRewardText(d: CommitmentDetails): string {
  return d.reward === "round" ? "platí rundu" : d.reward === "keg" ? "platí basu"
    : d.reward === "pub" ? "platí celé kabině hospodu" : `dá ${(d.amount ?? 0).toLocaleString("cs-CZ")} Kč`;
}

/** Kolik vyhraná sázka stojí. */
export function betPrice(d: CommitmentDetails): number {
  return d.reward === "money" ? d.amount ?? 0 : BET_PRICE[d.reward ?? "keg"];
}

/** Malé první písmeno doprostřed věty („Kč“ zůstane „Kč“). */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// ─── Rozpoznání ─────────────────────────────────────────────────────────────

const ROLE_CZ: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

function detectionPrompt(
  o: { playerFirstName: string; playerPosition: string; coachMessage: string; previousPlayerMessage?: string | null },
  chat: { COACH_TEXT_RULE: string; coachQuote: (body: string) => string },
): string {
  const { COACH_TEXT_RULE, coachQuote } = chat;
  return [
    COACH_TEXT_RULE,
    `Trenér vesnického fotbalového týmu napsal hráči ${o.playerFirstName} (${ROLE_CZ[o.playerPosition] ?? "hráč"}) SMS:`,
    coachQuote(o.coachMessage),
    o.previousPlayerMessage ? `Předtím mu hráč psal (jen kontext): „${o.previousPlayerMessage.replace(/\s+/g, " ").slice(0, 200)}“` : "",
    "",
    "Dává v ní trenér hráči KONKRÉTNÍ slib, který se dá ve hře ověřit? Vyber jednu možnost:",
    "- \"start_next\": hráč bude v základní sestavě v příštím zápase („zítra hraješ“, „v sobotu jsi v základu“, „příští zápas jdeš od začátku“, „zítra s tebou počítám do sestavy“).",
    "- \"start_soon\": místo v základu v příštích zápasech nebo napořád („v dalších zápasech jsi v základu“, „máš u mě pevné místo“).",
    "- \"position\": postaví ho na jiné místo, než kde hraje („zkusím tě na křídle“, „v neděli půjdeš do útoku“). Vyplň position: GK brankář, DEF obrana (stoper, bek), MID záloha (křídlo, střed, šestka, desítka), FWD útok (hrot, útočník).",
    "- \"release_offer\": pustí ho při další nabídce, nebo mu nebude bránit v odchodu.",
    "- \"bonus\": vyplatí mu jednorázově peníze a částka je v textu („tady máš 1 000 Kč prémii“, „dám ti pětistovku“). Vyplň amount v Kč.",
    "- \"wage\": natrvalo mu zvedne plat nebo odměny („od příštího týdne ti přidám o pětinu“). Vyplň percent (o třetinu = 33, o pětinu = 20), když v textu není, dej null.",
    "- \"invite_pub\": zve ho na pivo nebo do hospody dnes nebo v nejbližších dnech („pojď na pivo, platím“, „zajdeme dneska na jedno?“). Obecné „někdy zajdeme“ není pozvání.",
    "- \"invite_talk\": chce, ať se za ním staví nebo se sejdou a něco proberou („stav se zítra po tréninku“, „sejdeme se a probereme to“).",
    "- \"fine\": dá mu pokutu nebo mu strhne peníze z výplaty („dostaneš pokutu 500 Kč“, „strhnu ti to z výplaty“). Vyplň amount v Kč, když v textu není, null. Výhrůžka s podmínkou („jestli ještě jednou…“) to není.",
    "- \"weight_target\": dohoda o hubnutí: trenér dá odměnu, když hráč zhubne („1000 Kč, když zhubneš“, „shodíš 5 kilo za 2 týdny a dám ti litr“), nebo hráč platí, když nezhubne („když neshodíš 5 kilo, platíš pivo všem“). Vyplň kg (kolik kilo, „na normální váhu“ = null), days (za kolik dní, 2 týdny = 14, není-li = null), reward (money peníze a amount, round runda, keg basa, bottle flaška, none trenér nic nedá), forfeit (true, když hráč platí, pokud nezhubne). „Litr“ = 1000 Kč.",
    "- \"reward\": dárek nebo odměna za službu mimo zápas („zjisti, kdo to byl, a koupím ti flašku rumu“, „za tu pomoc ti dám pětistovku“). Vyplň reward (bottle flaška, round runda nebo pivo, keg basa, money peníze a amount). „Litr“ = 1000 Kč.",
    "- \"training_rule\": pravidlo pro celý tým, že kdo nechodí nebo vynechá trénink, nehraje („kdo nebude chodit na tréninky, nebude hrát“).",
    "- \"laps_penalty\": TREST kolečky nebo běháním na tréninku („za trest budeš běhat kolečka“, „za omluvenku kolečka“). Vyplň target: self (jen tenhle hráč), absentees (každý, kdo se omluví nebo nepřijde na zápas), team (celá kabina, jen když to trenér výslovně řekne: „celá kabina za trest poběží“).",
    `  ${LAPS_PENALTY_NOT_PLAN}`,
    "- \"last_chance\": poslední šance, při dalším průšvihu letí z klubu („máš poslední šanci, jedna blbost a letíš“).",
    "- \"squad_apology\": ať se omluví celé kabině nebo týmu („omluvíš se celé kabině“).",
    "- \"bet\": sázka o výkon v příštím zápase („dej gól a platím basu“, „když vyhrajeme, platím rundu“, „za hattrick ti dám 500 Kč“). Vyplň condition: goal (gól), hattrick, assist (přihrávka na gól), win (výhra), clean_sheet (čisté konto, nula). Vyplň reward: round (runda), keg (basa, sud), money (peníze, pak i amount v Kč).",
    "- \"none\": nic z toho. Sem patří:",
    "  - podmínka, která není sázka o zápas, dohoda o hubnutí ani odměna za službu („když budeš makat, budeš hrát“, „jestli ukážeš, můžeme se bavit“),",
    "  - váhání a neurčitost („možná“, „uvidíme“, „zkusím zařídit“, „jakmile to půjde“, „rotace“),",
    "  - otázka („200 Kč za zápas?“, „co bys chtěl?“), přemlouvání, ať přijde („pojď, potřebujeme tě“),",
    "  - lavička nebo nominace bez základu („mám tě jako zálohu“, „jedeš s námi na zápas“),",
    "  - šetření nebo volno („šetřím tě na Hradčany“, „dám ti volno“, „odpočiň si“): slib základu to není, spíš naopak,",
    "  - plán nebo popis tréninku („budeme hodně běhat“, „bude hodně běhání“, „v úterý dáme kondičku“),",
    "  - slib na příští sezónu nebo až po sezóně, minulost, vtip, slib někomu jinému",
    "  - a obecná podpora („počítám s tebou“, „věřím ti“, „šanci dostaneš“),",
    "  - odpověď na pozvánku na svatbu: přijdu na svatbu, svatební dar nebo obálka, zákaz pití na svatbě (to řeší svatba zvlášť).",
    "Když si nejsi jistý, je to \"none\".",
    "",
    "Do quote dej DOSLOVA tu část SMS, ve které slib je (bez úprav), u none prázdný řetězec.",
    "Vrať POUZE JSON: {\"kind\": \"start_next\"|\"start_soon\"|\"position\"|\"release_offer\"|\"bonus\"|\"wage\"|\"invite_pub\"|\"invite_talk\"|\"bet\"|\"fine\"|\"training_rule\"|\"laps_penalty\"|\"last_chance\"|\"squad_apology\"|\"weight_target\"|\"reward\"|\"none\", \"quote\": \"...\", \"position\": \"GK\"|\"DEF\"|\"MID\"|\"FWD\"|null, \"amount\": číslo|null, \"percent\": číslo|null, \"condition\": \"goal\"|\"hattrick\"|\"assist\"|\"win\"|\"clean_sheet\"|null, \"reward\": \"round\"|\"keg\"|\"money\"|\"bottle\"|\"none\"|null, \"target\": \"self\"|\"absentees\"|\"team\"|null, \"kg\": číslo|null, \"days\": číslo|null, \"forfeit\": true|false|null}",
  ].filter(Boolean).join("\n");
}

/** Malá písmena bez diakritiky a interpunkce, ať se citace porovná se zprávou i s překlepy v mezerách. */
function plain(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Citace slibu začíná podmínkou („když dáš gól…“, „jestli ukážeš…“): to slib není. */
const CONDITIONAL_RE = /^(kdyz|jestli|jestlize|pokud|kdyby|az budes|az das|az ukazes|az se)\b/;
/**
 * Věta se slibem, která slibem není: podmínka uprostřed, přemlouvání, ať přijde, neurčitost
 * a vzdálená budoucnost. Skutečné SMS z produ, které slabší model bral za slib:
 * „hrajeme až v šest, pojď, potřebujeme tě“, „slibujeme vyšší odměnu, jakmile to bude
 * technicky možné“, „příští sezónu tě chci do základní sestavy“.
 */
const CONDITION_WORDS = "kdyz|jestli|pokud|kdyby";
const PERSUADE_WORDS = "pojd|potrebuj\\w*|potreboval\\w*|nehecl\\w*|hodil|hodi|hodis|chtel jsem|chtel bych";
const VAGUE_WORDS = "zkusim zaridit|jakmile|technicky|mozna|uvidime|uvidim|rotace|pristi sezon\\w*|po sezon\\w*|dalsi sezon\\w*";
const NOT_A_PROMISE_RE = new RegExp(`\\b(${CONDITION_WORDS}|${PERSUADE_WORDS}|${VAGUE_WORDS})\\b`);
/** U sázky je podmínka podstata („když dáš gól…“), přemlouvání a neurčitost ne. */
const NOT_A_BET_RE = new RegExp(`\\b(${PERSUADE_WORDS}|${VAGUE_WORDS})\\b`);
/** Pozvání je klidně „pojď na pivo?“, ale ne „někdy zajdeme“ ani „když vyhrajeme“ (to je sázka). */
const NOT_AN_INVITE_RE = new RegExp(`\\b(${CONDITION_WORDS}|${VAGUE_WORDS}|nekdy|casem)\\b`);
/**
 * Šetření nebo volno slib základu není: „Neber to jako trest, šetřím tě na Hradčany. Dám ti
 * volno…“ se zapsalo jako místo v základu (přetest 3, 22. 11.). Jen ve větě se slibem.
 */
const REST_NOT_START_RE = /\b(setri\w* te|te setri\w*|setrit te|dam ti volno|davam ti volno|mas (ode me |ode mne )?volno|odpocin si|necham te odpocinout)\b/;
const START_KINDS: readonly CommitmentKind[] = ["start_next", "start_soon"];

/**
 * Zpráva mluví o příští sezóně („příští sezónu s tebou mám plány. Chci tě do základu“):
 * slib sestavy nebo odchodu se pak netýká nejbližších zápasů a hra by ho vyhodnotila
 * dřív, než mohl platit.
 */
const FAR_FUTURE_RE = /\b(pristi sezon\w*|po sezon\w*|dalsi sezon\w*|od leta|v lete|na jare|po zime)\b/;

/**
 * Pozvání musí mít čas: „pokecáme určitě“ ani „ozvi se a proberem to“ schůzka není,
 * „nedáme večer dvě piva?“ nebo „pojď, vyzvednu tě“ ano.
 */
const INVITE_TIME_RE = /\b(dnes|dneska|vecer|zitra|ted|hned|pojd|pojdte|po treninku|po zapase|odpoledne|rano|o vikendu|v (pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli)|v \d{1,2})\b/;
/** Sázka je o příštím zápase: „když dáš gól…“, „dej hattrick a…“, „za výhru…“. „Dneska platím!“ po výhře je oslava. */
const BET_CUE_RE = /\b(kdyz|jestli|jestlize|pokud|dej|das|date|dame|vyhrajem\w*|vyhrajete|udrzis|udrzite|nahrajes|za (gol|golem|goly|hattrick|vyhru|nulu|vitezstvi))\b/;

/** Věty zprávy i s koncovým znaménkem. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Věta (nebo věty) zprávy, přes kterou citace vede (`q` už v `plain`). Citace může přesahovat do další věty. */
function quoteSentences(q: string, message: string): string[] {
  const parts = sentences(message);
  const hit = parts.filter((s) => { const p = plain(s); return p.length > 0 && (q.includes(p) || p.includes(q)); });
  return hit.length > 0 ? hit : parts.filter((s) => q.includes(plain(s).slice(0, 12)));
}

/** Věty zprávy, ve kterých je citace slibu, jako jeden text (kolečka: je to trest? coach-rules.ts). */
export function quoteContext(quote: string, message: string): string {
  return quoteSentences(plain(quote), message).join(" ");
}

/**
 * Pojistka proti tomu, co model přehlédne: citace slibu musí ve zprávě opravdu být a věta,
 * ve které je, nesmí být otázka, podmínka, přemlouvání ani slib na dalekou budoucnost.
 * Slabší model (Workers AI) bral za slib i „Dobře, když dáš ten hattrick, basu platím já“
 * nebo „200–300 Kč za zápas?“.
 */
export function quoteHoldsUp(quote: unknown, coachMessage: string, kind: CommitmentKind = "start_next"): boolean {
  if (typeof quote !== "string" || quote.trim().length < 3) return false;
  const q = plain(quote);
  // Pravidlo a trest bývají podmínkou („kdo nechodí, nehraje“, „jestli ještě něco provedeš, letíš“).
  const bet = kind === "bet" || (RULE_KINDS as readonly string[]).includes(kind) || (REWARD_KINDS as readonly string[]).includes(kind);
  const invite = kind === "invite_pub" || kind === "invite_talk";
  if (!q || !plain(coachMessage).includes(q) || (!bet && CONDITIONAL_RE.test(q))) return false;
  const context = quoteSentences(q, coachMessage);
  // „Zajdeme dneska na jedno?“ je pozvání, „200 Kč za zápas?“ slib není.
  if (!invite && context.some((s) => s.endsWith("?"))) return false;
  const not = bet ? NOT_A_BET_RE : invite ? NOT_AN_INVITE_RE : NOT_A_PROMISE_RE;
  if (context.some((s) => not.test(plain(s)))) return false;
  if (invite && !context.some((s) => INVITE_TIME_RE.test(plain(s)))) return false;
  if (kind === "bet" && !context.some((s) => BET_CUE_RE.test(plain(s)))) return false;
  if (START_KINDS.includes(kind) && context.some((s) => REST_NOT_START_RE.test(plain(s)))) return false;
  return true;
}

/** Odpověď modelu → slib, nebo null. Kontroluje meze, ať model nenadiktuje nesmysl. */
export function parseDetection(
  raw: {
    kind?: unknown; quote?: unknown; position?: unknown; amount?: unknown; percent?: unknown; condition?: unknown; reward?: unknown; target?: unknown;
    kg?: unknown; days?: unknown; forfeit?: unknown;
  } | null,
  playerPosition: string,
  coachMessage?: string,
): DetectedCommitment | null {
  if (!raw || typeof raw.kind !== "string" || !(COMMITMENT_KINDS as readonly string[]).includes(raw.kind)) return null;
  if (coachMessage !== undefined && !quoteHoldsUp(raw.quote, coachMessage, raw.kind as CommitmentKind)) return null;
  if (coachMessage !== undefined && raw.kind !== "bonus" && raw.kind !== "wage" && FAR_FUTURE_RE.test(plain(coachMessage))) return null;
  const kind = raw.kind as CommitmentKind;
  if (kind === "position") {
    const position = typeof raw.position === "string" && (ROLES as readonly string[]).includes(raw.position) ? raw.position as LineupRole : null;
    if (!position) return null;
    // „V neděli půjdeš do útoku“ útočníkovi = slib základu, ne nové pozice.
    return position === playerPosition ? { kind: "start_next" } : { kind, position };
  }
  if (kind === "bonus") {
    const amount = Math.round(Number(raw.amount));
    if (!Number.isFinite(amount) || amount < 100 || amount > 200_000) return null;
    return { kind, amount };
  }
  if (kind === "wage") {
    const pct = raw.percent == null ? 33 : Math.round(Number(raw.percent));
    if (!Number.isFinite(pct) || pct < 5 || pct > 100) return null;
    return { kind, percent: pct };
  }
  if (kind === "fine") {
    // Bez částky se strhne týdenní odměna (doplní recordCommitment), mimo meze nic.
    if (raw.amount == null) return { kind };
    const amount = Math.round(Number(raw.amount));
    if (!Number.isFinite(amount) || amount < 100 || amount > 20_000) return null;
    return { kind, amount };
  }
  if (kind === "weight_target") {
    const w = parseWeightTarget(raw);
    return w ? { kind, kg: w.kg ?? null, days: w.days, forfeit: w.forfeit, rewardType: w.reward, ...(w.amount ? { amount: w.amount } : {}) } : null;
  }
  if (kind === "reward") {
    const w = parseReward(raw);
    return w ? { kind, rewardType: w.reward, ...(w.amount ? { amount: w.amount } : {}) } : null;
  }
  if (kind === "laps_penalty") {
    let target: LapsTarget = (LAPS_TARGETS as readonly unknown[]).includes(raw.target) ? raw.target as LapsTarget : "self";
    if (coachMessage !== undefined) {
      // Jen výslovný trest, plán tréninku ne (coach-rules.ts). Jednomu hráči v SMS je „budete“
      // vykání: celá kabina jen při „celá kabina“ nebo „všichni“, omluvení jen při „kdo…“.
      const cues = lapsPunishmentCues(quoteContext(String(raw.quote), coachMessage));
      if (!cues.punishment) return null;
      if (target === "team" && !cues.wholeSquad) target = "self";
      if (target === "absentees" && !cues.anyone) target = "self";
    }
    return { kind, target };
  }
  if (kind === "bet") {
    const condition = (BET_CONDITIONS as readonly unknown[]).includes(raw.condition) ? raw.condition as BetCondition : null;
    const reward = (BET_REWARDS as readonly unknown[]).includes(raw.reward) ? raw.reward as BetReward : null;
    if (!condition || !reward) return null;
    if (reward !== "money") return { kind, condition, reward };
    const amount = Math.round(Number(raw.amount));
    if (!Number.isFinite(amount) || amount < 100 || amount > 50_000) return null;
    return { kind, condition, reward, amount };
  }
  return { kind };
}

export async function detectCommitment(
  env: ChatEnv,
  o: { playerFirstName: string; playerPosition: string; coachMessage: string; previousPlayerMessage?: string | null },
  /** Rozpočet práce na pozadí (lib/time-budget.ts): rozpoznání běží souběžně s odpovědí hráče. */
  opts: { deadline?: number } = {},
): Promise<DetectedCommitment | null> {
  if (!COMMITMENT_HINT_RE.test(o.coachMessage)) return null;
  const chat = await import("./ai-player-chat");
  const parsed = await chat.askModelJson<{
    kind?: unknown; quote?: unknown; position?: unknown; amount?: unknown; percent?: unknown; condition?: unknown; reward?: unknown; target?: unknown;
    kg?: unknown; days?: unknown; forfeit?: unknown;
  }>(env, detectionPrompt(o, chat), 220, { deadline: opts.deadline });
  return parseDetection(parsed, o.playerPosition, o.coachMessage);
}

// ─── Zápis ──────────────────────────────────────────────────────────────────

/** Zkrácená trenérova slova do historie slibu. */
function quoteOf(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

/**
 * Zapíše slib. Starší běžící slib téhož druhu nahradí (vyprší): „zítra hraješ“ dvakrát za sebou
 * je jeden slib, ne dva. U peněz přidá do konverzace zprávu s tlačítkem.
 */
export async function recordCommitment(
  db: D1Database,
  o: {
    clubTeamId: string; playerId: string; convId: string; coachMessage: string; detected: DetectedCommitment;
    playerFirstName: string; weeklyWage?: number | null; now?: Date;
  },
): Promise<string> {
  const now = o.now ?? new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();
  // Pokuta: bez částky týdenní odměna hráče („strhnu ti to z výplaty“), vždy nejvýš `fineCap`.
  const amount = o.detected.kind === "fine" ? fineCap(o.detected.amount ?? o.weeklyWage ?? 500, o.weeklyWage) : o.detected.amount;
  const details: CommitmentDetails = {
    ...(o.detected.position ? { position: o.detected.position } : {}),
    ...(amount ? { amount } : {}),
    ...(o.detected.percent ? { percent: o.detected.percent } : {}),
    ...(o.detected.condition ? { condition: o.detected.condition } : {}),
    ...(o.detected.reward ? { reward: o.detected.reward } : {}),
    ...(o.detected.squad || isSquadRule(o.detected.kind, o.detected.target) ? { squad: true } : {}),
    ...(o.detected.target ? { target: o.detected.target } : {}),
    ...(o.detected.kind === "laps_penalty" && !isSquadRule(o.detected.kind, o.detected.target) ? { playerIds: [o.playerId] } : {}),
  };
  let dueAt = new Date(now.getTime() + DUE_DAYS[o.detected.kind] * DAY_MS).toISOString();
  if (o.detected.rewardType) details.rewardType = o.detected.rewardType;
  if (o.detected.kind === "weight_target") {
    // Cíl podle skutečné váhy hráče; bez váhy, nebo když už je pod cílem, dohoda nedává smysl.
    const { loadWeight } = await import("./coach-rewards");
    const { weight, fit } = await loadWeight(db, o.playerId);
    const deal = weightDealDetails({ reward: o.detected.rewardType, ...(o.detected.kg ? { kg: o.detected.kg } : {}), ...(o.detected.forfeit ? { forfeit: true } : {}) }, weight, fit);
    if (!deal) return "";
    Object.assign(details, { kg: deal.kg, startWeight: deal.startWeight, targetWeight: deal.targetWeight, ...(deal.forfeit ? { forfeit: true } : {}) });
    dueAt = new Date(now.getTime() + (o.detected.days ?? 14) * DAY_MS).toISOString();
  }
  if (o.detected.kind === "reward") {
    // Odměna za pátrání po pachateli: platí, až hráč přinese jméno (úkol „poptej se“).
    const task = await db.prepare(
      "SELECT json_extract(details, '$.incidentId') AS incident_id FROM coach_commitments WHERE player_id = ? AND kind = 'task_inquiry' AND status = 'active' ORDER BY made_at DESC LIMIT 1",
    ).bind(o.playerId).first<{ incident_id: string | null }>();
    if (task?.incident_id) details.incidentId = task.incident_id;
  }
  const stmts: D1PreparedStatement[] = [
    // Pravidlo celé kabiny je jedno na klub (druhé „kdo nechodí, nehraje“ jen posune lhůtu),
    // trest jednotlivce jeden na hráče.
    details.squad && o.detected.kind !== "bet"
      ? db.prepare(
        `UPDATE coach_commitments SET status = 'expired', resolved_at = ? WHERE team_id = ? AND kind = ? AND status = 'active'
            AND json_extract(details, '$.squad') = 1 AND COALESCE(json_extract(details, '$.target'), '') = ?`,
      ).bind(nowIso, o.clubTeamId, o.detected.kind, details.target ?? "")
      : db.prepare(
        "UPDATE coach_commitments SET status = 'expired', resolved_at = ? WHERE player_id = ? AND kind = ? AND status = 'active'",
      ).bind(nowIso, o.playerId, o.detected.kind),
  ];
  if (o.detected.kind === "last_chance") stmts.push(lastChanceStmt(db, o.playerId, dueAt));

  if (o.detected.kind === "invite_pub" || o.detected.kind === "invite_talk") {
    // Pozvání bez poznámky: jestli přijde, řekne hráč sám v odpovědi (accepts_invite).
  } else if (o.detected.kind === "weight_target") {
    stmts.push(db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
    ).bind(crypto.randomUUID(), o.convId,
      weightDealNote(o.playerFirstName, { ...details, reward: details.rewardType }, dueAt, o.detected.days ?? 14),
      JSON.stringify({ type: "coach_commitment_note", commitmentId: id }),
      new Date(now.getTime() + 1000).toISOString()));
  } else if (o.detected.kind === "reward" && !details.incidentId) {
    // Odměna bez podmínky: tlačítko „Vyplatit“ přidá markRewardEarned po zápisu.
  } else if (o.detected.kind !== "bonus" && o.detected.kind !== "wage" && o.detected.kind !== "fine") {
    // Manažer vidí, co si hra ze zprávy zapsala: jinak by se o slibu dozvěděl až z výčitky.
    const rule = (RULE_KINDS as readonly string[]).includes(o.detected.kind);
    const what = o.detected.kind === "bet" ? "sázku" : o.detected.kind === "training_rule" ? "pravidlo" : rule ? "pokyn" : "slib";
    const who = details.squad ? `Kabina si ${what} zapamatovala` : `${o.playerFirstName} si ${what} zapamatoval`;
    const text = lowerFirst(commitmentText(o.detected.kind, details));
    stmts.push(db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
    ).bind(crypto.randomUUID(), o.convId,
      `📝 ${who}: ${text}.`,
      JSON.stringify({ type: "coach_commitment_note", commitmentId: id }),
      new Date(now.getTime() + 1000).toISOString()));
  } else {
    const buttonMessageId = crypto.randomUUID();
    details.buttonMessageId = buttonMessageId;
    // Jméno v 1. pádě před dvojtečkou: pátý pád („Jakubovi“) generovat neumíme.
    const body = o.detected.kind === "bonus"
      ? `💰 ${o.playerFirstName}: slíbil jsi mu prémii ${(o.detected.amount ?? 0).toLocaleString("cs-CZ")} Kč. Vyplatit ji musíš sám.`
      : o.detected.kind === "fine"
        ? `⚖️ ${o.playerFirstName}: pokuta ${(amount ?? 0).toLocaleString("cs-CZ")} Kč${(o.detected.amount ?? 0) > (amount ?? 0) ? " (víc než týdenní odměnu, nejvýš 1 000 Kč, strhnout nejde)" : ""}. Udělit ji musíš sám, peníze půjdou do kasy.`
        : `📈 ${o.playerFirstName}: slíbil jsi mu vyšší odměny o ${o.detected.percent} %${o.weeklyWage ? `, týdně ${o.weeklyWage} → ${raisedBy(o.weeklyWage, o.detected.percent ?? 0)} Kč` : ""}. Zvýšit je musíš sám.`;
    // O sekundu později než zpráva trenéra, ať je v konverzaci až pod ní.
    stmts.push(db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
    ).bind(buttonMessageId, o.convId, body,
      JSON.stringify({ type: "coach_commitment", commitmentId: id, kind: o.detected.kind, done: false }),
      new Date(now.getTime() + 1000).toISOString()));
  }

  stmts.push(db.prepare(
    `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).bind(id, o.clubTeamId, o.playerId, o.convId, o.detected.kind, nowIso, dueAt, quoteOf(o.coachMessage), JSON.stringify(details)));
  await db.batch(stmts);
  logger.info({ module: M, teamId: o.clubTeamId }, `slib ${o.detected.kind} hráči ${o.playerId}`);
  // Odměna bez podmínky je splatná hned: tlačítko jako u prémie.
  if (o.detected.kind === "reward" && !details.incidentId) {
    await markRewardEarned(db, {
      id, team_id: o.clubTeamId, player_id: o.playerId, kind: "reward", conversation_id: o.convId,
      first_name: o.playerFirstName, last_name: "", nickname: null, avatar: null, details: JSON.stringify({ ...details, reward: details.rewardType }),
    }, now);
  }
  return id;
}

/**
 * Pokuta jde do kasy, takže by šlo „tisknout peníze“ („pokuta 20 000“ každému). Strop:
 * týdenní odměna hráče a nejvýš 1 000 Kč, nejméně 100 Kč.
 */
export function fineCap(amount: number, weeklyWage: number | null | undefined): number {
  const cap = Math.min(FINE_MAX, Math.max(100, weeklyWage ?? FINE_MAX));
  return Math.max(100, Math.min(Math.round(amount), cap));
}
const FINE_MAX = 1000;
/** Pokut z SMS nejvýš: jednomu hráči jedna za 7 dní, klubu tři za 7 dní. */
const FINE_PLAYER_DAYS = 7;
const FINE_CLUB_PER_WEEK = 3;

export function raisedBy(wage: number, percent: number): number {
  return Math.round((wage * (100 + percent)) / 100);
}

/**
 * Jak dlouho odpověď hráče počká na rozpoznání slibu. Rychlý model (Gemini, 1–3 s) to stihne
 * a hráč o slibu ví už v první odpovědi (pozvání na pivo může rovnou přijmout). Pomalý model
 * odpověď nezdrží: dřív na rozpoznání čekala celá a s Workers AI (12–21 s na volání) skončilo
 * ~40 % odpovědí jako „odpoví později“ (lokální E2E 22. 11.). Slib se pak zapíše po odpovědi
 * a hráč o něm ví od další zprávy (`commitmentPromptLines` se načítá u každé odpovědi znovu).
 */
export const COMMITMENT_REPLY_WAIT_MS = 3_000;

/**
 * Zpráva trenéra hráči: rozpozná slib a zapíše ho. Volá se ve waitUntil po odeslání SMS,
 * nikdy nehází (slib nesmí shodit odeslání zprávy ani odpověď hráče).
 * `deadline`: vlastní rozpočet rozpoznání (běží souběžně s odpovědí hráče, ne před ní).
 */
/** Odpověď hráče na zprávu trenéra `text`, když už přišla (po té zprávě), a podle ní kývnutí na pokyn. */
async function answerFromEarlierReply(
  db: D1Database, o: { commitmentId: string; kind: CommitmentKind; target?: string; convId: string; playerId: string; text: string },
): Promise<void> {
  const { REQUEST_KINDS } = await import("./player-memory");
  if (!REQUEST_KINDS.includes(o.kind) || o.target === "team" || o.target === "absentees") return;
  const reply = await db.prepare(
    `SELECT m.body FROM messages m
      WHERE m.conversation_id = ? AND m.sender_type = 'player' AND m.sender_id = ?
        AND julianday(m.sent_at) > (SELECT MAX(julianday(c.sent_at)) FROM messages c
              WHERE c.conversation_id = ? AND c.sender_type = 'user' AND TRIM(c.body) = TRIM(?))
      ORDER BY julianday(m.sent_at) ASC LIMIT 1`,
  ).bind(o.convId, o.playerId, o.convId, o.text).first<{ body: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `odpověď hráče na pokyn ${o.commitmentId}`, e); return null; });
  if (!reply?.body) return;
  const { answerRequestFromReply } = await import("./coach-rules");
  await answerRequestFromReply(db, { commitmentId: o.commitmentId, playerId: o.playerId, replyBody: reply.body });
}

/** Jak dlouho po uzavření incidentu srážkou nebo pokutou patří „strhnu ti to“ ještě k němu (herní dny). */
const INCIDENT_PUNISHMENT_DAYS = 2;

interface PunishingIncident { id: string; kind: string; open: boolean }

/**
 * Incident, za který se odhalenému pachateli trest dává (otevřený), nebo právě dal (uzavřený
 * srážkou či pokutou nejvýš před `INCIDENT_PUNISHMENT_DAYS` dny). Jinak null.
 */
async function incidentPunishingPlayer(db: D1Database, clubTeamId: string, playerId: string): Promise<PunishingIncident | null> {
  const row = await db.prepare(
    `SELECT i.id, i.kind, i.status FROM club_incidents i
      WHERE i.team_id = ? AND i.culprit_type = 'hrac' AND i.culprit_player_id = ? AND i.culprit_revealed = 1
        AND (i.status IN ('otevreny', 'policie')
             OR (i.status = 'uzavreny' AND i.resolution IN ('srazka', 'pokuta')
                 AND julianday(substr(i.resolved_on, 1, 10))
                   >= julianday(substr(COALESCE((SELECT game_date FROM teams WHERE id = i.team_id), ?), 1, 10)) - ?))
      ORDER BY (i.status != 'uzavreny') DESC, i.game_date DESC LIMIT 1`,
  ).bind(clubTeamId, playerId, new Date().toISOString(), INCIDENT_PUNISHMENT_DAYS).first<{ id: string; kind: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, `incident pachatele ${playerId} k pokutě`, e); return null; });
  return row ? { id: row.id, kind: row.kind, open: row.status !== "uzavreny" } : null;
}

/** Poznámka jen pro trenéra pod jeho zprávou (jako coach-claims.ts): trest za incident patří k incidentu. */
async function noteIncidentPunishment(
  db: D1Database, o: { convId: string; name: string; incident: PunishingIncident; now?: Date },
): Promise<void> {
  const { nazevIncidentu } = await import("../incidents/katalog");
  const title = nazevIncidentu(o.incident.kind);
  const body = o.incident.open
    ? `ℹ️ ${o.name} je odhalený pachatel (${title}). Srážku nebo pokutu za to dáš u incidentu, pokuta z SMS se nezapsala.`
    : `ℹ️ ${o.name} už za incident (${title}) trest má. Druhá pokuta z SMS se nezapsala.`;
  const at = new Date((o.now ?? new Date()).getTime() + 1000).toISOString();
  await db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
     VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
  ).bind(crypto.randomUUID(), o.convId, body, JSON.stringify({
    type: "coach_claim_note", kind: "incident_fine", href: `/incidenty?id=${encodeURIComponent(o.incident.id)}`, label: "Otevřít incident",
  }), at).run()
    .catch((e) => logger.warn({ module: M }, `poznámka o trestu u incidentu ${o.incident.id}`, e));
}

export async function handleCoachMessageForCommitment(
  db: D1Database,
  env: ChatEnv,
  o: { teamId: string; convId: string; playerId: string; text: string },
  opts: { deadline?: number } = {},
): Promise<string | null> {
  try {
    if (!COMMITMENT_HINT_RE.test(o.text)) return null;
    const p = await db.prepare(
      `SELECT p.first_name, p.last_name, p.position, p.weekly_wage, COALESCE(t.parent_team_id, t.id) AS club_id
         FROM players p LEFT JOIN teams t ON t.id = ? WHERE p.id = ?`,
    ).bind(o.teamId, o.playerId).first<{ first_name: string; last_name: string | null; position: string; weekly_wage: number | null; club_id: string | null }>();
    if (!p) return null;
    const prev = await db.prepare(
      `SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' ORDER BY sent_at DESC LIMIT 1`,
    ).bind(o.convId).first<{ body: string }>()
      .catch((e) => { logger.warn({ module: M }, "poslední zpráva hráče", e); return null; });
    const detected = await detectCommitment(env, {
      playerFirstName: p.first_name, playerPosition: p.position, coachMessage: o.text, previousPlayerMessage: prev?.body ?? null,
    }, { deadline: opts.deadline });
    if (!detected) return null;
    // Trest a pokyn jednotlivci jen hráči z vlastního kádru (áčko nebo U21): hráč na hostování
    // jinde ani bývalý hráč kolečka ani poslední šanci od cizího trenéra nedostane.
    if (((RULE_KINDS as readonly string[]).includes(detected.kind) && !isSquadRule(detected.kind, detected.target))
      || (REWARD_KINDS as readonly string[]).includes(detected.kind)) {
      const { ownSquadTeamId } = await import("./player-reach");
      if (!(await ownSquadTeamId(db, o.playerId, p.club_id ?? o.teamId))) return null;
    }
    // „Strhnu ti to z výplaty“ odhalenému pachateli patří k incidentu: tam je srážka i pokuta.
    // Chatová pokuta by byla druhý trest za totéž (Turek, FaSta, E2E 22. 11.: srážka 1 172 Kč
    // u incidentu a vedle ní tlačítko na pokutu 293 Kč). Trenér dostane jen odkaz na incident.
    if (detected.kind === "fine") {
      const incident = await incidentPunishingPlayer(db, p.club_id ?? o.teamId, o.playerId);
      if (incident) {
        await noteIncidentPunishment(db, { convId: o.convId, name: `${p.first_name} ${p.last_name ?? ""}`.trim(), incident });
        return null;
      }
    }
    const id = await recordCommitment(db, {
      clubTeamId: p.club_id ?? o.teamId, playerId: o.playerId, convId: o.convId, coachMessage: o.text, detected,
      playerFirstName: p.first_name, weeklyWage: p.weekly_wage,
    });
    // Pokyn nebo dohoda, na které hráč kývá: když už na zprávu odpověděl (rozpoznání trvalo déle
    // než odpověď, COMMITMENT_REPLY_WAIT_MS), kývnutí se vezme z textu té odpovědi.
    if (id) await answerFromEarlierReply(db, { commitmentId: id, kind: detected.kind, target: detected.target, convId: o.convId, playerId: o.playerId, text: o.text });
    return id;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `rozpoznání slibu v konverzaci ${o.convId}`, e);
    return null;
  }
}

// ─── Sázka celé kabiny ──────────────────────────────────────────────────────

/** Zpráva do kabiny, ve které může být sázka o příští zápas („když vyhrajeme, platím hospodu“). */
const SQUAD_BET_HINT_RE = /(vyhr|v[yý]hr|bod[yůu]|nul[auy]\b|[cč]ist[eé] kont)/i;
const SQUAD_BET_REWARD_HINT_RE = /(plat[ií]m|na m[eě]\b|zvu|hospod|rund|\bbas[auy]?\b|\bsud|piv)/i;

/**
 * Sázka celé kabiny: trenér slíbí odměnu, když tým vyhraje nebo udrží nulu. Zastupuje ji
 * kapitán (nebo první, kdo odpověděl), dopad má celá kabina. Vrací id slibu, nebo null.
 */
export async function handleSquadBet(
  db: D1Database,
  env: ChatEnv,
  o: { teamId: string; convId: string; message: string; representative: { id: string; firstName: string } },
): Promise<string | null> {
  try {
    if (!SQUAD_BET_HINT_RE.test(o.message) || !SQUAD_BET_REWARD_HINT_RE.test(o.message)) return null;
    const chat = await import("./ai-player-chat");
    const raw = await chat.askModelJson<{ kind?: unknown; quote?: unknown; condition?: unknown; reward?: unknown }>(env, [
      chat.COACH_TEXT_RULE,
      "Trenér vesnického fotbalového týmu napsal do skupinového chatu celé kabiny:",
      chat.coachQuote(o.message),
      "",
      "Slibuje v ní kabině odměnu za výsledek PŘÍŠTÍHO zápasu (sázka)? Například „když vyhrajeme, platím hospodu“,",
      "„za tři body je basa na mě“, „udržíte nulu a platím rundu“. Oslava už vyhraného zápasu („dneska platím!“) sázka není.",
      "kind: \"bet\" nebo \"none\". condition: win (výhra, tři body) | clean_sheet (nula). reward: pub (hospoda pro všechny) | round (runda) | keg (basa, sud).",
      "Do quote dej DOSLOVA tu část zprávy, ve které sázka je.",
      "Vrať POUZE JSON: {\"kind\": \"bet\"|\"none\", \"quote\": \"...\", \"condition\": \"win\"|\"clean_sheet\"|null, \"reward\": \"pub\"|\"round\"|\"keg\"|null}",
    ].join("\n"), 120);
    if (raw?.kind !== "bet" || !quoteHoldsUp(raw.quote, o.message, "bet")) return null;
    const condition = raw.condition === "win" || raw.condition === "clean_sheet" ? raw.condition : null;
    const reward = (SQUAD_BET_REWARDS as readonly unknown[]).includes(raw.reward) ? raw.reward as BetReward : null;
    if (!condition || !reward) return null;
    const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(o.teamId).first<{ id: string }>();
    return await recordCommitment(db, {
      clubTeamId: club?.id ?? o.teamId, playerId: o.representative.id, convId: o.convId, coachMessage: o.message,
      detected: { kind: "bet", condition, reward, squad: true }, playerFirstName: o.representative.firstName,
    });
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `sázka kabiny ${o.convId}`, e);
    return null;
  }
}

// ─── Úkol „poptej se“ ───────────────────────────────────────────────────────

/**
 * Trenér hráče požádal, ať se kvůli incidentu poptá („zkus se nenápadně optat“). Hráč se
 * druhý den ozve s tím, co podle DB opravdu slyšel (`deliverInquiry`). Jednou na incident.
 */
export async function recordInquiryTask(
  db: D1Database,
  o: { teamId: string; convId: string; playerId: string; incidentId: string; coachMessage: string; now?: Date },
): Promise<string | null> {
  const now = o.now ?? new Date();
  const dup = await db.prepare(
    "SELECT 1 FROM coach_commitments WHERE player_id = ? AND kind = 'task_inquiry' AND json_extract(details, '$.incidentId') = ? LIMIT 1",
  ).bind(o.playerId, o.incidentId).first();
  if (dup) return null;
  const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(o.teamId).first<{ id: string }>();
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
     VALUES (?, ?, ?, ?, 'task_inquiry', 'active', ?, ?, ?, ?)`,
  ).bind(id, club?.id ?? o.teamId, o.playerId, o.convId, now.toISOString(), new Date(now.getTime() + DAY_MS).toISOString(),
    quoteOf(o.coachMessage), JSON.stringify({ incidentId: o.incidentId })).run();
  return id;
}

const INQUIRY_HINT_SMS = [
  "Ptal jsem se kluků u piva. Prý {name} ví víc, ale mně nic neřekl.",
  // Jméno v 1. pádě: jiný pád generovat neumíme.
  "Trenére, poptal jsem se. Něco prý viděl {name}.",
];
const INQUIRY_NOTHING_SMS = [
  "Ptal jsem se, trenére, ale nikdo nic neví. Nebo to nechce říct.",
  "Poptal jsem se, ale všichni dělají, že nic. Sorry, trenére.",
];

/**
 * Co hráč zjistil: jméno spoluhráče, který podle DB něco ví a trenér ho ještě nevyslýchal.
 * Pachatel ani jeho kamarád nikoho neprozradí a tváří se, že nikdo nic neví.
 */
async function deliverInquiry(db: D1Database, r: SettleRow): Promise<void> {
  if (r.club_user_id === "ai") return;
  const incidentId = detailsOf(r.details).incidentId;
  if (!incidentId) return;
  const own = await db.prepare(
    "SELECT role FROM club_incident_knowledge WHERE incident_id = ? AND player_id = ?",
  ).bind(incidentId, r.player_id).all<{ role: string }>()
    .catch((e) => { logger.warn({ module: M }, "role hráče u poptávání", e); return { results: [] as Array<{ role: string }> }; });
  const covers = own.results.some((x) => x.role === "pachatel" || x.role === "kamarad");
  const lead = covers ? null : await db.prepare(
    `SELECT p.first_name, p.last_name FROM club_incident_knowledge k JOIN players p ON p.id = k.player_id
      WHERE k.incident_id = ? AND k.player_id != ? AND k.role IN ('svedek', 'kamarad', 'rival') AND k.interrogation IS NULL
        AND p.team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
      ORDER BY k.willingness DESC LIMIT 1`,
  ).bind(incidentId, r.player_id, r.team_id, r.team_id).first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "kdo ví víc u poptávání", e); return null; });
  const pool = lead
    ? INQUIRY_HINT_SMS.map((t) => t.replace("{name}", `${lead.first_name} ${lead.last_name}`))
    : INQUIRY_NOTHING_SMS;
  // Odměna za pátrání (coach-rewards.ts) platí, jen když hráč jméno opravdu přinesl.
  await db.prepare("UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.lead', ?) WHERE id = ?")
    .bind(lead ? 1 : 0, r.id).run().catch((e) => logger.warn({ module: M }, `výsledek pátrání ${r.id}`, e));
  await sendPlayerTemplateSMS(db, r.team_id, { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
    pool, { seed: r.id, metadata: { type: "commitment", kind: r.kind } })
    .catch((e) => logger.warn({ module: M }, `zpráva po poptávání ${r.id}`, e));
}

// ─── Vyhodnocení ────────────────────────────────────────────────────────────

export interface CommitmentMatch {
  id?: string;
  /** Tým klubu, který v zápase hrál. */
  teamId: string;
  inSquad: boolean;
  started: boolean;
  goals?: number;
  assists?: number;
  /** Góly týmu a soupeře (sázka o výhru a čisté konto). */
  scored?: number | null;
  conceded?: number | null;
  /** Pozice ze sestavy (GK/DEF/MID/FWD), jen když začínal. */
  role: string | null;
  minutes: number | null;
}

export type Verdict = "kept" | "broken" | "pending" | "expired";

/**
 * Verdikt slibu sestavy podle zápasů od slibu. Počítají se zápasy, kde hráč byl v nominaci
 * nebo hrál, a zápasy týmu, kde je teď (tam ho trenér mohl postavit). Stejné pravidlo jako
 * u slibu z tlačítka (`minutesPledgeVerdict`), jen základ se pozná ze sestavy, ne z minut:
 * kdo začal a v 30. minutě se zranil, slib dostal.
 */
export function lineupVerdict(
  kind: "start_next" | "start_soon" | "position",
  matches: CommitmentMatch[],
  rosterTeamId: string,
  opts: { duePassed: boolean; position?: LineupRole },
): Verdict {
  const counted = matches.filter((m) => m.inSquad || m.minutes != null || m.teamId === rosterTeamId);
  if (kind === "start_soon") {
    const first3 = counted.slice(0, 3);
    if (first3.length < 3 && !opts.duePassed) return "pending";
    if (first3.length === 0) return "expired";
    const starts = first3.filter((m) => m.started).length;
    return starts >= (first3.length >= 3 ? 2 : 1) ? "kept" : "broken";
  }
  const first = counted[0];
  if (!first) return opts.duePassed ? "expired" : "pending";
  if (kind === "position") return first.started && first.role === opts.position ? "kept" : "broken";
  return first.started ? "kept" : "broken";
}

/** Zápasy klubu (áčko i U21) od slibu, chronologicky, s účastí hráče. */
async function loadCommitmentMatches(db: D1Database, playerId: string, clubTeamId: string, madeAt: string): Promise<CommitmentMatch[]> {
  const clubTeams = "(SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)";
  const rows = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.home_lineup_data, m.away_lineup_data, m.home_score, m.away_score,
            s.minutes_played AS minutes, s.goals, s.assists,
            m.home_team_id IN ${clubTeams} AS club_home
       FROM matches m
       LEFT JOIN match_player_stats s ON s.match_id = m.id AND s.player_id = ?
      WHERE m.status = 'simulated' AND m.simulated_at > ?
        AND (m.home_team_id IN ${clubTeams} OR m.away_team_id IN ${clubTeams})
      ORDER BY m.simulated_at ASC LIMIT 10`,
  ).bind(clubTeamId, clubTeamId, playerId, madeAt, clubTeamId, clubTeamId, clubTeamId, clubTeamId)
    .all<{
      id: string; home_team_id: string; away_team_id: string; home_lineup_data: string | null; away_lineup_data: string | null;
      home_score: number | null; away_score: number | null; minutes: number | null; goals: number | null; assists: number | null; club_home: number;
    }>()
    .catch((e) => { logger.warn({ module: M }, "zápasy ke slibu", e); return { results: [] as never[] }; });
  return rows.results.map((r) => {
    const home = r.club_home === 1;
    const raw = home ? r.home_lineup_data : r.away_lineup_data;
    let started = false;
    let inSquad = false;
    let role: string | null = null;
    if (raw) {
      try {
        const lineup = JSON.parse(raw) as { starters?: Array<{ id?: string; position?: string }>; subs?: Array<{ id?: string }> };
        const s = (lineup.starters ?? []).find((p) => p.id === playerId);
        started = !!s;
        role = s?.position ?? null;
        inSquad = started || (lineup.subs ?? []).some((p) => p.id === playerId);
      } catch (e) {
        logger.warn({ module: M }, "nečitelná sestava zápasu u slibu", e);
      }
    }
    return {
      id: r.id, teamId: home ? r.home_team_id : r.away_team_id, inSquad, started, role, minutes: r.minutes,
      goals: r.goals ?? 0, assists: r.assists ?? 0,
      scored: home ? r.home_score : r.away_score, conceded: home ? r.away_score : r.home_score,
    };
  });
}

/**
 * Sázka o příští zápas. O výkon hráče (gól, hattrick, přihrávka, čisté konto) se rozhoduje
 * v prvním zápase, kde hrál; když v něm nebyl, sázka propadá bez výčitek. O výhru týmu
 * v prvním zápase jeho týmu.
 */
export function betVerdict(
  d: Pick<CommitmentDetails, "condition">,
  matches: CommitmentMatch[],
  rosterTeamId: string,
  opts: { duePassed: boolean },
): { verdict: "won" | "lost" | "pending" | "expired"; match?: CommitmentMatch } {
  const teamMatch = matches.find((m) => m.teamId === rosterTeamId || m.inSquad || m.minutes != null);
  if (!teamMatch) return { verdict: opts.duePassed ? "expired" : "pending" };
  if (d.condition === "win") {
    if (teamMatch.scored == null || teamMatch.conceded == null) return { verdict: "pending" };
    return { verdict: teamMatch.scored > teamMatch.conceded ? "won" : "lost", match: teamMatch };
  }
  // Hráč nehrál: o výkon se sázet nedá.
  if (!((teamMatch.minutes ?? 0) > 0)) return { verdict: "expired", match: teamMatch };
  const won = d.condition === "goal" ? (teamMatch.goals ?? 0) >= 1
    : d.condition === "hattrick" ? (teamMatch.goals ?? 0) >= 3
    : d.condition === "assist" ? (teamMatch.assists ?? 0) >= 1
    : teamMatch.conceded === 0;
  return { verdict: won ? "won" : "lost", match: teamMatch };
}

// Varianty bez paměti dřív chodily pořád stejné („díky že jste dodržel slovo s tou sestavou“
// 10×, prod 9–11/2026). Hráč teď dostane tu, kterou ještě neposlal (sendPlayerTemplateSMS).
const KEPT_SMS: Record<CommitmentKind, readonly string[]> = {
  start_next: LINEUP_PROMISE_KEPT_SMS,
  start_soon: LINEUP_PROMISE_KEPT_SMS,
  position: [
    "Díky, že jste mě fakt zkusil na novým místě, trenére. Bavilo mě to.",
    "Slíbil jste to a dodržel. Na novým místě jsem se cítil dobře.",
  ],
  release_offer: [],
  invite_pub: [],
  invite_talk: [],
  task_inquiry: [],
  task_return: [],
  task_repair: [],
  training_rule: [],
  laps_penalty: [],
  last_chance: [],
  squad_apology: [],
  weight_target: REWARD_KEPT_SMS,
  reward: REWARD_KEPT_SMS,
  fine: [
    "No jo, trenére. Zasloužil jsem si to.",
    "Dobře, pokutu beru. Ale radost z toho nemám.",
    "To snad nemyslíte vážně… No co, zaplatím.",
  ],
  bet: [
    "Díky, trenére! Sázka je sázka, a vy jste ji dodržel. 🍻",
    "Na zdraví, trenére! Takhle se to dělá. 🍺",
  ],
  bonus: [
    "Prémie dorazila, trenére. Díky, to potěší!",
    "Díky za tu prémii, trenére. Nečekal jsem, že to fakt pošlete.",
  ],
  wage: [
    "Trenére, vidím vyšší odměny. Díky, tohle se počítá.",
    "Díky za přidání, trenére. Vážím si toho.",
  ],
};

const BROKEN_SMS: Record<CommitmentKind, readonly string[]> = {
  start_next: LINEUP_PROMISE_BROKEN_SMS,
  start_soon: LINEUP_PROMISE_BROKEN_SMS,
  position: [
    "Měl jsem jít na jiný místo, trenére. Nic z toho nebylo.",
    "Slíbil jste mi, že mě zkusíte jinde. Asi jste zapomněl.",
  ],
  release_offer: [
    "Slíbil jste, že mě při další nabídce pustíte. A teď jste ji zamítl. Tohle vám nezapomenu.",
  ],
  invite_pub: [],
  invite_talk: [],
  task_inquiry: [],
  task_return: [],
  task_repair: [],
  fine: [],
  training_rule: [],
  laps_penalty: [],
  last_chance: [],
  squad_apology: [],
  weight_target: REWARD_BROKEN_SMS,
  reward: REWARD_BROKEN_SMS,
  bet: [
    "Trenére, sázka platila a pořád nic. Tak tolik k vašemu slovu.",
    "Pořád čekám, až tu sázku zaplatíte, trenére. Kluci se mi smějou.",
  ],
  bonus: [
    "Trenére, ta prémie, co jste slíbil, nikde. Tak tolik k vašemu slovu.",
    "Pořád čekám na tu slíbenou prémii. Asi jste to myslel jinak.",
  ],
  wage: [
    "Trenére, sliboval jste přidat na odměnách. Pořád nic.",
  ],
};

/** Sázka vyšla: hráč se trenérovi připomene. */
const BET_WON_SMS: Record<BetCondition, string[]> = {
  goal: ["Tak trenére, gól je doma! Kdy platíte? 🍺", "Gól jsem dal, trenére. Sázka je sázka. 😏"],
  hattrick: ["Hattrick, trenére! Teď jste na tahu vy. 🍺", "Tři kusy, trenére. Pamatujete, co jste slíbil?"],
  assist: ["Přihrávka na gól, trenére. Sázka platí! 🍺", "Nahrál jsem, jak jste chtěl. Kdy platíte?"],
  win: ["Vyhráli jsme, trenére! Pamatujete, co jste slíbil? 🍺", "Tři body jsou doma. Sázka platí, trenére. 😏"],
  clean_sheet: ["Nula vzadu, trenére! Kdy platíte? 🍺", "Čisté konto, trenére. Sázka je sázka."],
};
const SQUAD_BET_KEPT = ["Díky, trenére! Sázka je sázka. 🍻", "Trenér platí, kluci! Takhle se to dělá. 🍺"];
const SQUAD_BET_BROKEN = ["Tak co, trenére, ta slíbená sázka? Asi nic, co… 🙄", "Kluci se pořád ptají, kdy trenér zaplatí tu sázku."];

/** Sázka nevyšla: hráč to vezme s humorem (jen u výkonu, výhra týmu se neřeší). */
const BET_LOST_SMS = ["Tak to nevyšlo, trenére. Příště to tam dám. 😅", "Dneska ne, trenére. Ale sázka platí i příště, ne? 😄"];

const MONEY_REMINDER_SMS: Record<"bonus" | "wage", string[]> = {
  bonus: ["Trenére, kdy dorazí ta prémie, co jste slíbil?", "Jen se ptám, trenére: platí ta prémie?"],
  wage: ["Trenére, platí to s těma vyššíma odměnama? Zatím nic.", "Jen připomínám, trenére: slíbil jste přidat na odměnách."],
};

const LINEUP_REMINDER_SMS: readonly string[] = [
  "Trenére, zítra hrajeme. Pamatujete, co jste mi slíbil?",
  "Zítra je zápas. Doufám, že platí, co jsme si řekli.",
  "Trenére, jen ať nezapomenete, na čem jsme se domluvili. Zítra se hraje.",
  "Zítra to platí, trenére? Já se na to připravuju.",
  "Trenére, zítra je ten zápas. Beru vás za slovo.",
  "Jen připomínám, trenére: zítra hrajeme a vy jste mi něco slíbil.",
  "Trenére, těším se na zítřek. Doufám, že to dopadne, jak jsme si řekli.",
  "Zítra zápas, trenére. Co jsme si řekli, to platí, ne?",
];

function pick(pool: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/** Dopad na vztah a náladu podle druhu slibu. */
const EFFECTS: Record<CommitmentKind, { kept: [number, number]; broken: [number, number] }> = {
  start_next: { kept: [4, 3], broken: [-8, -6] },
  start_soon: { kept: [6, 4], broken: [-10, -8] },
  position: { kept: [3, 2], broken: [-5, -4] },
  release_offer: { kept: [0, 0], broken: [-12, -10] },
  // Pozvání: dopad přijde s poděkováním po akci (follow-ups.ts, INVITES coach_pub / coach_talk).
  invite_pub: { kept: [0, 0], broken: [0, 0] },
  invite_talk: { kept: [0, 0], broken: [0, 0] },
  bet: { kept: [5, 4], broken: [-8, -5] },
  // Udělená pokuta vztah i náladu zhorší, neudělená nic (hráč si nestěžuje, že pokutu nedostal).
  fine: { kept: [-5, -4], broken: [0, 0] },
  task_inquiry: { kept: [0, 0], broken: [0, 0] },
  // Úkol pachatele: splnění i nesplnění řeší amends.ts (vrácení, oprava, SMS), vztah se nemění.
  task_return: { kept: [0, 0], broken: [0, 0] },
  task_repair: { kept: [0, 0], broken: [0, 0] },
  bonus: { kept: [6, 5], broken: [-8, -5] },
  wage: { kept: [8, 6], broken: [-8, -5] },
  // Pravidla a tresty mají dopad v coach-rules.ts (settleRule), ne přes vztah ke slibu.
  training_rule: { kept: [0, 0], broken: [0, 0] },
  laps_penalty: { kept: [0, 0], broken: [0, 0] },
  last_chance: { kept: [0, 0], broken: [0, 0] },
  squad_apology: { kept: [0, 0], broken: [0, 0] },
  // Odměna za splněnou dohodu jako sázka (bet), odměna za službu o stupeň menší.
  weight_target: { kept: [5, 4], broken: [-8, -5] },
  reward: { kept: [4, 3], broken: [-6, -4] },
};

interface SettleRow {
  id: string; team_id: string; player_id: string; kind: CommitmentKind; made_at: string; due_at: string;
  details: string | null; last_reminder_key: string | null; conversation_id: string | null;
  first_name: string; last_name: string; nickname: string | null; avatar: string | null;
  roster_team_id: string | null; player_club_id: string | null; club_user_id: string | null; game_date: string | null;
  injured: number;
}

function detailsOf(raw: string | null): CommitmentDetails {
  if (!raw) return {};
  try { return JSON.parse(raw) as CommitmentDetails; } catch (e) {
    logger.warn({ module: M }, "nečitelné detaily slibu", e);
    return {};
  }
}

/**
 * Uzavře slib a provede dopad: vztah, nálada, SMS od hráče. U dodrženého slibu sestavy
 * se vztah zlepší nejvýš jednou za `KEPT_EFFECT_COOLDOWN_DAYS`, jinak by šlo slibovat
 * základ hráči, který hraje stejně, a sbírat body vztahu.
 */
async function resolveCommitment(
  db: D1Database,
  r: Pick<SettleRow, "id" | "team_id" | "player_id" | "kind" | "details" | "first_name" | "last_name" | "nickname" | "avatar" | "club_user_id" | "game_date">,
  status: "kept" | "broken" | "expired",
  now: Date,
  /** Slib už zabral volající (vyplacení tlačítkem): jen dopad. */
  opts: { claimed?: boolean } = {},
): Promise<void> {
  const nowIso = now.toISOString();
  if (!opts.claimed) {
    const upd = await db.prepare("UPDATE coach_commitments SET status = ?, resolved_at = ? WHERE id = ? AND status = 'active'")
      .bind(status, nowIso, r.id).run()
      .catch((e) => { logger.warn({ module: M }, `uzavření slibu ${r.id}`, e); return null; });
    // Souběžné vyhodnocení (tlačítko a denní běh): dopad jen jednou.
    if ((upd?.meta?.changes ?? 0) === 0) return;
    // Propadlý slib s tlačítkem (odměna, sázka, prémie): tlačítko zmizí, klik by vrátil 409
    // „Tenhle slib už neplatí“ (Marek, E2E 22. 11.).
    const buttonId = detailsOf(r.details).buttonMessageId;
    if (status !== "kept" && buttonId) {
      await db.prepare("UPDATE messages SET metadata = json_set(COALESCE(metadata, '{}'), '$.closed', ?) WHERE id = ? AND json_extract(metadata, '$.done') IS NOT 1")
        .bind(status, buttonId).run()
        .catch((e) => logger.warn({ module: M }, `tlačítko propadlého slibu ${r.id}`, e));
    }
  }
  if (status === "expired") return;
  const dd = detailsOf(r.details);
  if (dd.squad) {
    // Sázka celé kabiny: nálada všech, žádný vztah jednoho hráče; ozve se v kabině.
    const moraleAll = status === "kept" ? 3 : -3;
    await db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
      // Kabina klubu, kterému sázka patří: zástupce mezitím mohl odejít třeba na hostování.
    ).bind(moraleAll, r.team_id).run().catch((e) => logger.warn({ module: M }, `nálada kabiny po sázce ${r.id}`, e));
    const conv = await db.prepare("SELECT conversation_id FROM coach_commitments WHERE id = ?").bind(r.id).first<{ conversation_id: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "kabina sázky", e); return null; });
    if (conv?.conversation_id && r.club_user_id !== "ai") {
      await postInSquad(db, conv.conversation_id, { id: r.player_id, firstName: r.first_name, lastName: r.last_name },
        pick(status === "kept" ? SQUAD_BET_KEPT : SQUAD_BET_BROKEN, r.id), now);
    }
    return;
  }

  let [relation, morale] = EFFECTS[r.kind][status];
  if (status === "kept" && (r.kind === "bonus" || r.kind === "wage" || r.kind === "bet" || r.kind === "weight_target" || r.kind === "reward")) {
    // Prémie pod týdenní odměnu potěší, ale vztah nezmění; peníze zlepší vztah nejvýš jednou
    // za 14 dní. Jinak by šel vztah koupit po stokorunách.
    const d = detailsOf(r.details);
    const wage = await db.prepare("SELECT weekly_wage FROM players WHERE id = ?").bind(r.player_id).first<{ weekly_wage: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "odměna hráče u prémie", e); return null; });
    const recentMoney = await db.prepare(
      `SELECT 1 FROM coach_commitments WHERE player_id = ? AND id != ? AND status = 'kept'
         AND kind IN ('bonus', 'wage', 'bet', 'weight_target', 'reward') AND resolved_at > ? AND json_extract(details, '$.effect') = 1 LIMIT 1`,
    ).bind(r.player_id, r.id, new Date(now.getTime() - MONEY_EFFECT_COOLDOWN_DAYS * DAY_MS).toISOString()).first()
      .catch((e) => { logger.warn({ module: M }, "nedávné peníze od trenéra", e); return null; });
    if (recentMoney || (r.kind === "bonus" && (d.amount ?? 0) < (wage?.weekly_wage ?? 0))) [relation, morale] = [0, 1];
  }
  if (status === "kept" && (r.kind === "start_next" || r.kind === "start_soon" || r.kind === "position")) {
    const recent = await db.prepare(
      `SELECT 1 FROM coach_commitments WHERE player_id = ? AND id != ? AND status = 'kept'
         AND kind IN ('start_next', 'start_soon', 'position') AND resolved_at > ? AND json_extract(details, '$.effect') = 1 LIMIT 1`,
    ).bind(r.player_id, r.id, new Date(now.getTime() - KEPT_EFFECT_COOLDOWN_DAYS * DAY_MS).toISOString()).first()
      .catch((e) => { logger.warn({ module: M }, "nedávno dodržený slib", e); return null; });
    if (recent) return;
  }
  if (relation !== 0) {
    // Lhůta proti „farmení“ se počítá jen od slibu, který vztah opravdu změnil.
    if (status === "kept") {
      await db.prepare("UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.effect', 1) WHERE id = ?")
        .bind(r.id).run().catch((e) => logger.warn({ module: M }, `značka dopadu slibu ${r.id}`, e));
    }
    await applyCoachRelationDelta(db, {
      playerId: r.player_id, delta: relation, source: "promise",
      description: `${status === "kept" ? "Dodržel jsi" : "Nedodržel jsi"} slib: ${lowerFirst(commitmentText(r.kind, detailsOf(r.details)))}`,
      gameDate: r.game_date, referenceId: `commitment-${r.id}`,
    }).catch((e) => logger.warn({ module: M }, `vztah po slibu ${r.id}`, e));
  }
  if (morale !== 0) {
    await db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?))) WHERE id = ?`,
    ).bind(morale, r.player_id).run().catch((e) => logger.warn({ module: M }, `nálada po slibu ${r.id}`, e));
  }
  // AI trenérovi hráči nepíšou (spec AI klubů 3.2), dopad platí dál.
  if (r.club_user_id === "ai") return;
  const pool = status === "kept" ? KEPT_SMS[r.kind] : BROKEN_SMS[r.kind];
  if (pool.length === 0) return;
  await sendPlayerTemplateSMS(db, r.team_id, { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
    pool, { seed: r.id, metadata: { type: "commitment", kind: r.kind, status } }).catch((e) => logger.warn({ module: M }, `SMS po slibu ${r.id}`, e));
}

/** Denně: vyhodnotí běžící sliby. Vrací počet uzavřených. */
export async function settleCoachCommitments(db: D1Database, now: Date = new Date(), env?: ChatEnv): Promise<number> {
  const rows = await db.prepare(
    `SELECT cc.id, cc.team_id, cc.player_id, cc.kind, cc.made_at, cc.due_at, cc.details, cc.last_reminder_key, cc.conversation_id,
            p.first_name, p.last_name, p.nickname, p.avatar, p.team_id AS roster_team_id,
            COALESCE(rt.parent_team_id, rt.id) AS player_club_id, club.user_id AS club_user_id, club.game_date,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0) AS injured
       FROM coach_commitments cc
       JOIN players p ON p.id = cc.player_id
       LEFT JOIN teams rt ON rt.id = p.team_id
       LEFT JOIN teams club ON club.id = cc.team_id
      WHERE cc.status = 'active'`,
  ).all<SettleRow>()
    .catch((e) => { logger.warn({ module: M }, "běžící sliby", e); return { results: [] as SettleRow[] }; });

  let closed = 0;
  for (const r of rows.results) {
    try {
      const duePassed = new Date(r.due_at).getTime() < now.getTime();
      if ((RULE_KINDS as readonly string[]).includes(r.kind)) {
        const { onRuleCancelled, settleRule } = await import("./coach-rules");
        // Trest jednotlivce hráči, který mezitím odešel z kádru, propadne (pravidlo kabiny platí dál).
        if (!detailsOf(r.details).squad && r.player_club_id !== r.team_id) {
          await db.prepare("UPDATE coach_commitments SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'active'")
            .bind(now.toISOString(), r.id).run();
          await onRuleCancelled(db, r.kind, r.player_id);
          closed++;
          continue;
        }
        if (await settleRule(db, env, r as Parameters<typeof settleRule>[2], now)) closed++;
        continue;
      }
      // Hráč z klubu odešel: slib odchodu dodržel, ostatní vypršely.
      const loanedAway = await db.prepare("SELECT loan_from_team_id FROM players WHERE id = ?").bind(r.player_id)
        .first<{ loan_from_team_id: string | null }>().then((x) => x?.loan_from_team_id ?? null)
        .catch((e) => { logger.warn({ module: M }, "hostování hráče u slibu", e); return null; });
      if (r.player_club_id !== r.team_id && loanedAway !== r.team_id) {
        await resolveCommitment(db, r, r.kind === "release_offer" ? "kept" : "expired", now);
        closed++;
        continue;
      }
      if (r.kind === "weight_target" || r.kind === "reward") {
        const { settleReward } = await import("./coach-rewards");
        const outcome = await settleReward(db, env, r as Parameters<typeof settleReward>[2], now);
        if (outcome === "earned") await markRewardEarned(db, { ...r, kind: r.kind }, now);
        else if (outcome === "broken" || outcome === "expired") { await resolveCommitment(db, r, outcome, now); closed++; }
        continue;
      }
      if (r.kind === "start_next" || r.kind === "start_soon" || r.kind === "position") {
        // Na hostování ho trenér postavit nemůže, slib jen vyprší.
        if (loanedAway === r.team_id) { await resolveCommitment(db, r, "expired", now); closed++; continue; }
        const matches = await loadCommitmentMatches(db, r.player_id, r.team_id, r.made_at);
        let verdict = lineupVerdict(r.kind, matches, r.roster_team_id ?? r.team_id, { duePassed, position: detailsOf(r.details).position });
        // Zraněného trenér postavit nemohl: výčitka by byla křivda.
        if (verdict === "broken" && r.injured > 0) verdict = "expired";
        if (verdict !== "pending") { await resolveCommitment(db, r, verdict, now); closed++; }
        continue;
      }
      if (r.kind === "release_offer" || r.kind === "invite_pub" || r.kind === "invite_talk") {
        // Pozvání, na které hráč do lhůty nekývl, propadne (přijetí řeší afterPlayerReply).
        if (duePassed) { await resolveCommitment(db, r, "expired", now); closed++; }
        continue;
      }
      if (r.kind === "bet") {
        const d = detailsOf(r.details);
        // Vyhraná sázka čeká na zaplacení, po lhůtě je porušená.
        if (d.won) {
          if (duePassed) { await resolveCommitment(db, r, "broken", now); closed++; }
          continue;
        }
        const { verdict, match } = betVerdict(d, await loadCommitmentMatches(db, r.player_id, r.team_id, r.made_at), r.roster_team_id ?? r.team_id, { duePassed });
        if (verdict === "pending") continue;
        if (verdict === "won" && match) { await markBetWon(db, r, d, match, now); continue; }
        if (verdict === "lost" && d.condition !== "win" && r.club_user_id !== "ai") {
          await sendPlayerTemplateSMS(db, r.team_id, { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
            BET_LOST_SMS, { seed: r.id, metadata: { type: "commitment", kind: r.kind } }).catch((e) => logger.warn({ module: M }, "SMS po prohrané sázce", e));
        }
        await resolveCommitment(db, r, "expired", now);
        closed++;
        continue;
      }
      if (r.kind === "fine") {
        // Neudělená pokuta tiše propadne: hráč si nestěžuje, že ji nedostal.
        if (duePassed) { await resolveCommitment(db, r, "expired", now); closed++; }
        continue;
      }
      if (r.kind === "task_inquiry") {
        if (duePassed) { await deliverInquiry(db, r); await resolveCommitment(db, r, "kept", now); closed++; }
        continue;
      }
      if (r.kind === "task_return" || r.kind === "task_repair") {
        // Lhůta pachatele uplynula: vrátí/opraví, nebo se vymluví (incidents/amends.ts si úkol zabere sám).
        if (duePassed) {
          const { settleAmendsTask } = await import("../incidents/amends");
          if (await settleAmendsTask(db, r, now)) closed++;
        }
        continue;
      }
      if (r.kind !== "bonus" && r.kind !== "wage") continue;
      // Peníze: po lhůtě porušeno, v polovině hráč připomene.
      if (duePassed) { await resolveCommitment(db, r, "broken", now); closed++; continue; }
      const reminderDue = new Date(r.made_at).getTime() + MONEY_REMINDER_DAYS * DAY_MS < now.getTime();
      if (reminderDue && r.last_reminder_key !== "money" && r.club_user_id !== "ai") {
        await sendPlayerTemplateSMS(db, r.team_id, { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
          MONEY_REMINDER_SMS[r.kind], { seed: r.id, metadata: { type: "commitment", kind: r.kind } });
        await db.prepare("UPDATE coach_commitments SET last_reminder_key = 'money' WHERE id = ?").bind(r.id).run()
          .catch((e) => logger.warn({ module: M }, "připomínka peněz", e));
      }
    } catch (e) {
      logger.warn({ module: M }, `vyhodnocení slibu ${r.id}`, e);
    }
  }
  return closed;
}

/** Hráč napíše do kabiny (sázka celé kabiny). */
async function postInSquad(
  db: D1Database, convId: string, player: { id: string; firstName: string; lastName: string }, body: string, now: Date,
): Promise<void> {
  const name = `${player.firstName} ${player.lastName}`;
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
    ).bind(crypto.randomUUID(), convId, player.id, name, body, JSON.stringify({ kabina: true }), now.toISOString()),
    db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?")
      .bind(`${name}: ${body}`.slice(0, 100), now.toISOString(), convId),
  ]).catch((e) => logger.warn({ module: M }, "zpráva do kabiny ke sázce", e));
}

const BET_REWARD_LABEL: Record<BetReward, string> = { round: "Runda pro kluky", keg: "Basa", money: "Sázka", pub: "Hospoda pro celou kabinu" };

/**
 * Sázka vyšla: hráč se připomene a pod jeho zprávou je tlačítko „Zaplatit“. Na zaplacení
 * má trenér `BET_PAY_DAYS` dní, pak je sázka porušená.
 */
async function markBetWon(db: D1Database, r: SettleRow, d: CommitmentDetails, match: CommitmentMatch, now: Date): Promise<void> {
  const buttonMessageId = crypto.randomUUID();
  const won: CommitmentDetails = { ...d, won: true, matchId: match.id, buttonMessageId };
  const upd = await db.prepare("UPDATE coach_commitments SET details = ?, due_at = ? WHERE id = ? AND status = 'active'")
    .bind(JSON.stringify(won), new Date(now.getTime() + BET_PAY_DAYS * DAY_MS).toISOString(), r.id).run();
  if ((upd.meta?.changes ?? 0) === 0 || r.club_user_id === "ai") return;
  const player = { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar };
  if (d.squad && r.conversation_id) {
    // Sázka kabiny: připomene se v kabině, ne v soukromé SMS.
    await postInSquad(db, r.conversation_id, player, pick(BET_WON_SMS[d.condition ?? "win"], r.id), now);
  } else {
    await sendPlayerTemplateSMS(db, r.team_id, player, BET_WON_SMS[d.condition ?? "goal"], { seed: r.id, metadata: { type: "commitment", kind: r.kind } });
  }
  const { getOrCreatePlayerConversation } = await import("./ai-player-spawn");
  const convId = r.conversation_id ?? await getOrCreatePlayerConversation(db, r.team_id, player);
  await db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
     VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
  ).bind(buttonMessageId, convId,
    `🍺 ${r.first_name}: sázka vyšla, ${BET_CONDITION_TEXT[d.condition ?? "goal"]}. ${BET_REWARD_LABEL[d.reward ?? "keg"]} ${betPrice(d).toLocaleString("cs-CZ")} Kč, zaplatit musíš sám.`,
    JSON.stringify({ type: "coach_commitment", commitmentId: r.id, kind: "bet", done: false, won: true }),
    new Date(now.getTime() + 1000).toISOString()).run()
    .catch((e) => logger.warn({ module: M }, `tlačítko vyhrané sázky ${r.id}`, e));
}

/** Den před zápasem: hráč se slíbeným základem nebo pozicí se ozve (jednou na zápas). */
export async function remindCoachCommitments(db: D1Database, rosterTeamId: string, matchKey: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT cc.id, cc.team_id, p.id AS player_id, p.first_name, p.last_name, p.nickname, p.avatar
       FROM coach_commitments cc JOIN players p ON p.id = cc.player_id
       JOIN teams club ON club.id = cc.team_id AND COALESCE(club.user_id, '') != 'ai'
      WHERE p.team_id = ? AND cc.status = 'active' AND cc.kind IN ('start_next', 'start_soon', 'position')
        AND COALESCE(cc.last_reminder_key, '') != ?`,
  ).bind(rosterTeamId, matchKey).all<{ id: string; team_id: string; player_id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "sliby před zápasem", e); return { results: [] as never[] }; });
  const seen = new Set<string>();
  for (const r of rows.results) {
    if (seen.has(r.player_id)) continue;
    seen.add(r.player_id);
    await sendPlayerTemplateSMS(db, r.team_id, { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
      LINEUP_REMINDER_SMS, { seed: `${r.id}|${matchKey}`, metadata: { type: "commitment_reminder" } }).catch((e) => logger.warn({ module: M }, "připomínka slibu", e));
    await db.prepare("UPDATE coach_commitments SET last_reminder_key = ? WHERE player_id = ? AND status = 'active' AND kind IN ('start_next', 'start_soon', 'position')")
      .bind(matchKey, r.player_id).run().catch((e) => logger.warn({ module: M }, "připomínka slibu, zápis", e));
  }
  return seen.size;
}

/**
 * Trenér zamítl nabídku na hráče, kterému slíbil, že ho při další nabídce pustí.
 * Volá se z odmítnutí nabídky (offer-rejection-impact.ts).
 */
export async function breakReleaseCommitment(db: D1Database, playerId: string, now: Date = new Date()): Promise<boolean> {
  const r = await db.prepare(
    `SELECT cc.id, cc.team_id, cc.player_id, cc.kind, cc.details, p.first_name, p.last_name, p.nickname, p.avatar,
            club.user_id AS club_user_id, club.game_date
       FROM coach_commitments cc JOIN players p ON p.id = cc.player_id LEFT JOIN teams club ON club.id = cc.team_id
      WHERE cc.player_id = ? AND cc.status = 'active' AND cc.kind = 'release_offer' ORDER BY cc.made_at DESC LIMIT 1`,
  ).bind(playerId).first<SettleRow>()
    .catch((e) => { logger.warn({ module: M }, "slib odchodu při zamítnutí", e); return null; });
  if (!r) return false;
  await resolveCommitment(db, r, "broken", now);
  return true;
}

// ─── Vyplacení tlačítkem ────────────────────────────────────────────────────

/**
 * Manažer klepl na „Vyplatit“ nebo „Zvýšit“ pod slibem peněz. Peníze se pohnou jen tady,
 * nikdy jen z textu SMS: model by mohl přečíst částku špatně.
 */
export async function fulfilMoneyCommitment(
  db: D1Database,
  o: { teamId: string; commitmentId: string; now?: Date },
): Promise<{ ok: true; effect: string } | { ok: false; error: string; status: number }> {
  const now = o.now ?? new Date();
  const r = await db.prepare(
    `SELECT cc.id, cc.team_id, cc.player_id, cc.kind, cc.status, cc.details, cc.conversation_id,
            p.first_name, p.last_name, p.nickname, p.avatar, p.weekly_wage, p.team_id AS roster_team_id,
            COALESCE(rt.parent_team_id, rt.id) AS player_club_id, club.user_id AS club_user_id, club.game_date, club.budget
       FROM coach_commitments cc JOIN players p ON p.id = cc.player_id
       LEFT JOIN teams rt ON rt.id = p.team_id LEFT JOIN teams club ON club.id = cc.team_id
      WHERE cc.id = ?`,
  ).bind(o.commitmentId).first<SettleRow & { status: string; conversation_id: string | null; weekly_wage: number | null; budget: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "slib k vyplacení", e); return null; });
  const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(o.teamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "klub u vyplacení", e); return null; });
  if (!r || r.team_id !== (club?.id ?? o.teamId)
    || (r.kind !== "bonus" && r.kind !== "wage" && r.kind !== "bet" && r.kind !== "fine" && r.kind !== "weight_target" && r.kind !== "reward")) {
    return { ok: false, error: "Slib nenalezen.", status: 404 };
  }
  if (r.status !== "active") return { ok: false, error: r.status === "kept" ? "Už je to vyplacené." : "Tenhle slib už neplatí.", status: 409 };
  if (r.player_club_id !== r.team_id) return { ok: false, error: "Hráč už v klubu není.", status: 409 };
  const d = detailsOf(r.details);
  const name = `${r.first_name} ${r.last_name}`;
  const gameDate = r.game_date ?? now.toISOString().slice(0, 10);
  const { recordTransaction } = await import("../season/finance-processor");

  // Kontroly bez zápisu. Peníze se pohnou až po atomickém zabrání slibu níž (dvojklik nesmí
  // vyplatit prémii ani udělit pokutu dvakrát).
  let move: () => Promise<string>;
  if (r.kind === "fine") {
    const fine = fineCap(d.amount ?? 0, r.weekly_wage);
    move = async () => {
      await recordTransaction(db, r.team_id, "incident_fine", fine, `Pokuta: ${name}`, gameDate, r.player_id);
      return `Pokuta ${fine.toLocaleString("cs-CZ")} Kč udělena`;
    };
  } else if (r.kind === "bet") {
    if (!d.won) return { ok: false, error: "Sázka ještě nevyšla.", status: 409 };
    const price = betPrice(d);
    if ((r.budget ?? 0) < price) return { ok: false, error: `Na ${price.toLocaleString("cs-CZ")} Kč v kase nemáš.`, status: 400 };
    move = async () => {
      if (d.reward === "pub") {
        // Hospoda pro celou kabinu jako „Pojedeme na jedno“ (routes/game.ts /pub-visit): posezení s příběhy.
        const { createCoachLedSession } = await import("../season/pub");
        const session = await createCoachLedSession(db, r.roster_team_id ?? r.team_id, gameDate.slice(0, 10), "all")
          .catch((e) => { logger.warn({ module: M }, `hospoda za sázku ${r.id}`, e); return null; });
        if (session && !session.ok) logger.warn({ module: M }, `hospoda za sázku ${r.id} se nezapsala: ${session.reason}`);
        await recordTransaction(db, r.team_id, "event", -price, "Hospoda za sázku s kabinou", gameDate);
      } else {
        await recordTransaction(db, r.team_id, d.reward === "money" ? "player_bonus" : "manager_social", -price,
          d.squad ? "Sázka s kabinou" : `Sázka s hráčem: ${name}`, gameDate, r.player_id);
      }
      return `Sázka zaplacena (${price.toLocaleString("cs-CZ")} Kč)`;
    };
  } else if (r.kind === "weight_target" || r.kind === "reward") {
    if (!d.won) return { ok: false, error: r.kind === "weight_target" ? "Dohoda ještě není splněná." : "Odměnu si ještě nezasloužil.", status: 409 };
    const reward = { reward: d.rewardType, amount: d.amount };
    const price = rewardPrice(reward);
    if ((r.budget ?? 0) < price) return { ok: false, error: `Na ${price.toLocaleString("cs-CZ")} Kč v kase nemáš.`, status: 400 };
    move = async () => {
      if (price > 0) {
        await recordTransaction(db, r.team_id, d.rewardType === "money" ? "player_bonus" : "manager_social", -price, `Odměna: ${name}`, gameDate, r.player_id);
      }
      // Peníze jen částkou, věc v 1. pádě s cenou („flaška, 300 Kč“), ne „1 000 Kč, 1 000 Kč“.
      return `Odměna předána (${reward.reward === "money" ? rewardLabel(reward) : `${rewardLabel(reward)}, ${price.toLocaleString("cs-CZ")} Kč`})`;
    };
  } else if (r.kind === "bonus") {
    const amount = d.amount ?? 0;
    if ((r.budget ?? 0) < amount) return { ok: false, error: `Na prémii ${amount.toLocaleString("cs-CZ")} Kč v kase nemáš.`, status: 400 };
    move = async () => {
      await recordTransaction(db, r.team_id, "player_bonus", -amount, `Prémie: ${name}`, gameDate, r.player_id);
      return `Prémie ${amount.toLocaleString("cs-CZ")} Kč vyplacena`;
    };
  } else {
    const oldWage = r.weekly_wage ?? 0;
    const newWage = raisedBy(oldWage, d.percent ?? 0);
    move = async () => {
      await db.prepare("UPDATE players SET weekly_wage = ? WHERE id = ?").bind(newWage, r.player_id).run();
      return `Týdenní odměna ${oldWage} → ${newWage} Kč`;
    };
  }

  // Atomické zabrání: jeden příkaz, D1 ho provede celý najednou. U pokuty v něm jsou i limity
  // (jednomu hráči jedna za 7 dní, klubu tři), ať je dva souběžné požadavky neobejdou.
  const weekAgo = new Date(now.getTime() - FINE_PLAYER_DAYS * DAY_MS).toISOString();
  const fineCaps = r.kind === "fine"
    ? ` AND NOT EXISTS (SELECT 1 FROM coach_commitments x WHERE x.player_id = ? AND x.kind = 'fine' AND x.status = 'kept' AND x.resolved_at > ?)
        AND (SELECT COUNT(*) FROM coach_commitments x WHERE x.team_id = ? AND x.kind = 'fine' AND x.status = 'kept' AND x.resolved_at > ?) < ${FINE_CLUB_PER_WEEK}`
    : "";
  const claim = await db.prepare(
    `UPDATE coach_commitments SET status = 'kept', resolved_at = ? WHERE id = ? AND status = 'active'${fineCaps}`,
  ).bind(now.toISOString(), r.id, ...(r.kind === "fine" ? [r.player_id, weekAgo, r.team_id, weekAgo] : [])).run();
  if ((claim.meta?.changes ?? 0) === 0) {
    if (r.kind !== "fine") return { ok: false, error: "Už je to vyřízené.", status: 409 };
    const recent = await db.prepare(
      "SELECT 1 FROM coach_commitments WHERE player_id = ? AND kind = 'fine' AND status = 'kept' AND resolved_at > ? AND id != ? LIMIT 1",
    ).bind(r.player_id, weekAgo, r.id).first();
    return { ok: false, error: recent ? "Tenhle hráč už pokutu tento týden dostal." : "Víc pokut tento týden kabina nesnese.", status: 409 };
  }
  let effect: string;
  try {
    effect = await move();
  } catch (e) {
    // Peníze se nepohnuly: slib zase platí, ať ho jde vyplatit znovu.
    logger.error({ module: M }, `vyplacení slibu ${r.id}`, e);
    await db.prepare("UPDATE coach_commitments SET status = 'active', resolved_at = NULL WHERE id = ?").bind(r.id).run()
      .catch((err) => logger.error({ module: M }, `vrácení slibu po chybě ${r.id}`, err));
    return { ok: false, error: "Platba se nepovedla, zkus to znovu.", status: 500 };
  }
  await resolveCommitment(db, r, "kept", now, { claimed: true });
  if (d.buttonMessageId) {
    await db.prepare("UPDATE messages SET metadata = json_set(metadata, '$.done', json('true'), '$.effect', ?) WHERE id = ?")
      .bind(effect, d.buttonMessageId).run().catch((e) => logger.warn({ module: M }, "tlačítko slibu po vyplacení", e));
  }
  return { ok: true, effect };
}

/** Jak dlouho po zprávě smí manažer říct „to nebyl slib“. Pak už slib platí. */
export const CANCEL_WINDOW_MS = 60 * 60 * 1000;

/**
 * Manažer klepl na „To nebyl slib“: hra si ze zprávy vyčetla slib, který nedal.
 * Jde to jen hodinu po zprávě, jinak by to byla cesta, jak se vyhnout porušenému slibu.
 */
export async function cancelCommitment(
  db: D1Database,
  o: { teamId: string; commitmentId: string; now?: Date },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = o.now ?? new Date();
  const r = await db.prepare("SELECT team_id, kind, status, made_at, details FROM coach_commitments WHERE id = ?").bind(o.commitmentId)
    .first<{ team_id: string; kind: CommitmentKind; status: string; made_at: string; details: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "slib ke zrušení", e); return null; });
  const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?").bind(o.teamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "klub u zrušení slibu", e); return null; });
  if (!r || r.team_id !== (club?.id ?? o.teamId)) return { ok: false, error: "Slib nenalezen.", status: 404 };
  if (r.status !== "active") return { ok: false, error: "Tenhle slib už neplatí.", status: 409 };
  // Vyhraná sázka už slibem byla. Pozvání se neruší, odpovídá na něj hráč.
  if (((r.kind === "bet" || r.kind === "weight_target" || r.kind === "reward") && detailsOf(r.details).won) || r.kind === "invite_pub" || r.kind === "invite_talk") {
    return { ok: false, error: "Tohle zrušit nejde.", status: 409 };
  }
  if (now.getTime() - new Date(r.made_at).getTime() > CANCEL_WINDOW_MS) {
    return { ok: false, error: "Už je pozdě, hráč s tím slibem počítá.", status: 409 };
  }
  if ((RULE_KINDS as readonly string[]).includes(r.kind)) {
    const pid = await db.prepare("SELECT player_id FROM coach_commitments WHERE id = ?").bind(o.commitmentId).first<{ player_id: string }>();
    const { onRuleCancelled } = await import("./coach-rules");
    if (pid) await onRuleCancelled(db, r.kind, pid.player_id);
  }
  await db.batch([
    db.prepare("UPDATE coach_commitments SET status = 'cancelled', resolved_at = ? WHERE id = ? AND status = 'active'").bind(now.toISOString(), o.commitmentId),
    db.prepare(
      `UPDATE messages SET metadata = json_set(metadata, '$.cancelled', json('true'))
        WHERE json_extract(metadata, '$.commitmentId') = ? AND conversation_id = (SELECT conversation_id FROM coach_commitments WHERE id = ?)`,
    ).bind(o.commitmentId, o.commitmentId),
  ]);
  return { ok: true };
}

// ─── Paměť hráče a přehled ──────────────────────────────────────────────────

export interface CommitmentMemory {
  id: string;
  kind: CommitmentKind;
  status: CommitmentStatus;
  details: CommitmentDetails;
  madeAt: string;
  resolvedAt: string | null;
  dueAt?: string;
}

/** Běžící sliby a sliby vyhodnocené za posledních 14 dní (pro prompt hráče). */
export async function loadCommitmentMemory(db: D1Database, playerId: string, now: Date = new Date()): Promise<CommitmentMemory[]> {
  const rows = await db.prepare(
    `SELECT id, kind, status, details, made_at, resolved_at, due_at FROM coach_commitments
      WHERE player_id = ? AND (status = 'active' OR (status IN ('kept', 'broken') AND resolved_at > ?))
        -- Pravidla celé kabiny zná každý hráč z faktů o klubu (loadClubRules), ne jako vlastní slib.
        AND NOT (kind IN ('training_rule', 'laps_penalty') AND COALESCE(json_extract(details, '$.squad'), 0) = 1)
      ORDER BY made_at DESC LIMIT 6`,
  ).bind(playerId, new Date(now.getTime() - 14 * DAY_MS).toISOString())
    .all<{ id: string; kind: CommitmentKind; status: CommitmentStatus; details: string | null; made_at: string; resolved_at: string | null; due_at: string }>()
    .catch((e) => { logger.warn({ module: M }, "sliby do paměti hráče", e); return { results: [] as never[] }; });
  return rows.results.map((r) => ({ id: r.id, kind: r.kind, status: r.status, details: detailsOf(r.details), madeAt: r.made_at, resolvedAt: r.resolved_at, dueAt: r.due_at }));
}

/** Pozvání, na které hráč ještě neodpověděl: jen čerstvé (12 h), starší už neplatí. */
export function pendingInviteOf(list: CommitmentMemory[] | undefined, now: Date = new Date()): { commitmentId: string; kind: "invite_pub" | "invite_talk" } | undefined {
  const c = (list ?? []).find((x) => x.status === "active" && (x.kind === "invite_pub" || x.kind === "invite_talk")
    && now.getTime() - new Date(x.madeAt).getTime() < 12 * 3600 * 1000);
  return c ? { commitmentId: c.id, kind: c.kind as "invite_pub" | "invite_talk" } : undefined;
}

/**
 * Hráč na pozvání od trenéra odpověděl (`accepts_invite` v odpovědi modelu). Kývl: proběhne
 * to jako pozvání od hráče (casual-messages.ts applyAcceptedInvite): hospoda s rundou, druhý
 * den poděkování s fotkou a lepší vztah. Odmítl: pozvání propadne.
 */
export async function respondToCoachInvite(
  db: D1Database,
  o: { teamId: string; convId: string; playerId: string; playerFirstName: string; commitmentId: string; kind: "invite_pub" | "invite_talk"; accepted: boolean; now?: Date },
): Promise<boolean> {
  const now = o.now ?? new Date();
  const upd = await db.prepare("UPDATE coach_commitments SET status = ?, resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(o.accepted ? "kept" : "expired", now.toISOString(), o.commitmentId).run()
    .catch((e) => { logger.warn({ module: M }, `odpověď na pozvání ${o.commitmentId}`, e); return null; });
  if ((upd?.meta?.changes ?? 0) === 0 || !o.accepted) return false;
  // Pozvání od trenéra má dopad nejvýš jednou za týden: schůzka je zdarma a denní „stav se“
  // by jinak vztah jen sbíral. Hráč přijde, ale poděkování ani vztah navíc nedostane.
  const recent = await db.prepare(
    `SELECT 1 FROM coach_commitments WHERE player_id = ? AND id != ? AND status = 'kept'
       AND kind IN ('invite_pub', 'invite_talk') AND resolved_at > ? AND json_extract(details, '$.effect') = 1 LIMIT 1`,
  ).bind(o.playerId, o.commitmentId, new Date(now.getTime() - INVITE_EFFECT_COOLDOWN_DAYS * DAY_MS).toISOString()).first()
    .catch((e) => { logger.warn({ module: M }, "nedávné pozvání od trenéra", e); return null; });
  if (recent) return false;
  const { applyAcceptedInvite } = await import("./casual-messages");
  const applied = await applyAcceptedInvite(db, {} as Parameters<typeof applyAcceptedInvite>[1], {
    kind: o.kind === "invite_pub" ? "coach_pub" : "coach_talk", topicId: "coach_invite",
    teamId: o.teamId, playerId: o.playerId, playerFirstName: o.playerFirstName, convId: o.convId,
  }, now);
  if (applied) {
    await db.prepare("UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.effect', 1) WHERE id = ?")
      .bind(o.commitmentId).run().catch((e) => logger.warn({ module: M }, `značka dopadu pozvání ${o.commitmentId}`, e));
  }
  return applied;
}

/** Řádky do promptu: hráč o slibech ví a může se na ně odvolat. */
export function commitmentPromptLines(list: CommitmentMemory[] | undefined): string[] {
  if (!list || list.length === 0) return [];
  return list.map((c) => {
    const text = lowerFirst(commitmentText(c.kind, c.details));
    if (c.status === "active" && (c.kind === "invite_pub" || c.kind === "invite_talk")) {
      return `- Trenér tě v SMS pozval: ${c.kind === "invite_pub" ? "na pivo" : "ať se sejdete a probere to s tebou"}. Rozhodni se podle nálady, času a vztahu k němu, jestli přijdeš, a řekni mu to jasně.`;
    }
    if (c.status === "active" && c.kind === "bet") {
      return c.details.won
        ? `- Vyhrál jsi s trenérem sázku (${text}). Čekáš, až zaplatí, a klidně mu to připomeneš.`
        : `- Máte s trenérem sázku: ${text}. Těšíš se na to.`;
    }
    if ((RULE_KINDS as readonly string[]).includes(c.kind)) return rulePromptLine(c.kind as RuleKind, c.status, c.details, c.dueAt ?? c.madeAt);
    if ((REWARD_KINDS as readonly string[]).includes(c.kind)) {
      return rewardPromptLine(c.kind as RewardKind, c.status, { ...c.details, reward: c.details.rewardType }, c.dueAt ?? c.madeAt);
    }
    if (c.kind === "task_inquiry") {
      return c.status === "active" ? "- Trenér tě požádal, ať se poptáš kvůli incidentu v klubu. Kývl jsi na to a ozveš se mu, až něco zjistíš (zítra)." : "";
    }
    if (c.kind === "task_return" || c.kind === "task_repair") return amendsPromptLine(c);
    if (c.kind === "fine") {
      return c.status === "active" ? `- Trenér ti napsal, že dostaneš pokutu (${(c.details.amount ?? 0).toLocaleString("cs-CZ")} Kč). Víš o tom, klidně se ohraď nebo ji přijmi podle povahy.`
        : c.status === "kept" ? `- Trenér ti nedávno dal pokutu (${(c.details.amount ?? 0).toLocaleString("cs-CZ")} Kč). Pamatuješ si to.` : "";
    }
    if (c.status === "active") return `- Trenér ti v SMS slíbil: ${text}. Platí to a pamatuješ si to. Když na to přijde řeč, drž ho za slovo.`;
    if (c.status === "kept") return `- Trenér ti nedávno dodržel slib: ${text}. Vážíš si toho.`;
    return `- Trenér ti nedávno NEDODRŽEL slib: ${text}. Pořád tě to mrzí a jeho dalším slibům tolik nevěříš.`;
  }).filter((line) => line.length > 0);
}

/** Pachatel slíbil vrátit nebo opravit (incidents/amends.ts): co platí a jak to dopadlo. */
function amendsPromptLine(c: CommitmentMemory): string {
  const ret = c.kind === "task_return";
  const when = c.details.dueOn ? `nejpozději ${czechDayWords(c.details.dueOn)}` : "do dvou dnů";
  if (c.status === "active") {
    return ret
      ? `- Slíbil jsi trenérovi, že vrátíš, co jsi vzal, ${when}. Platí to: věci opravdu vrátíš, jen nevíš přesně kdy během té doby. Nic jiného neslibuj.`
      : `- Slíbil jsi trenérovi, že škodu s brigádou opravíš, ${when}. Platí to. Nic jiného neslibuj.`;
  }
  if (c.status === "kept") return ret ? "- Nedávno jsi klubu vrátil, co jsi vzal." : "- Nedávno jsi škodu s brigádou opravil, bolí tě z toho ještě záda.";
  if (c.status === "broken") {
    return ret
      ? "- Slíbil jsi trenérovi vrátit, co jsi vzal, a nevrátil jsi to. Víš o tom a je ti to trapné."
      : "- Slíbil jsi trenérovi opravit škodu brigádou a neopravil jsi ji. Víš o tom a je ti to trapné.";
  }
  return "";
}

/** Sliby z rozhovorů pro profil hráče (sekce Sliby), ve stejném tvaru jako player_promises. */
export async function listCommitments(db: D1Database, playerId: string, clubTeamId: string): Promise<Array<{
  id: string; text: string; status: Exclude<CommitmentStatus, "cancelled">; madeAt: string; resolvedAt: string | null; quote: string | null;
}>> {
  // Zrušené („to nebyl slib“) se neukazují: slib nikdy nebyl.
  const rows = await db.prepare(
    `SELECT id, kind, status, details, made_at, resolved_at, quote FROM coach_commitments
      WHERE player_id = ? AND team_id = ? AND status != 'cancelled'
        AND kind NOT IN ('fine', 'task_inquiry', 'task_return', 'task_repair', 'training_rule', 'laps_penalty', 'last_chance', 'squad_apology')
      ORDER BY status = 'active' DESC, made_at DESC LIMIT 20`,
  ).bind(playerId, clubTeamId)
    .all<{ id: string; kind: CommitmentKind; status: Exclude<CommitmentStatus, "cancelled">; details: string | null; made_at: string; resolved_at: string | null; quote: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "sliby z rozhovorů pro profil", e); return { results: [] as never[] }; });
  return rows.results.map((r) => ({
    id: r.id, text: commitmentText(r.kind, detailsOf(r.details)), status: r.status, madeAt: r.made_at, resolvedAt: r.resolved_at, quote: r.quote,
  }));
}
