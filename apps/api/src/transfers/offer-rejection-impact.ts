/**
 * Dopad odmítnutí/vypršení přestupové nabídky na hráče + zpracování trucu.
 *
 * Hráč NIKDY neodejde bez souhlasu manažera — nejhorší dopad je morálka,
 * docházka a simulované ("fake") zranění. Stav trucu žije v
 * players.life_context → $.transferUnrest:
 *   { level: 0-100, reason, offerId, teamName, since, lastImpactAt, lastActionAt,
 *     fakeInjuryUsed, fakeInjuryAt, fakeInjuryHintSent, wageRaised,
 *     pledge: {type: "minutes"|"transfer"|"release", madeAt, deadline, offerId?} | null,
 *     reasons, offer, deals }
 */

import { computeInterestForOffer, interestOfferOf, INTEREST_LABELS } from "./player-interest";
import { sendPlayerSMS, sendPlayerTemplateSMS, sendSystemSMS } from "../messaging/system-sms";
import { logger } from "../lib/logger";
import { deadlineIn } from "../lib/time-budget";
import { applyCoachRelationDelta } from "../lib/coach-relation";
import { reasonSmsVariants, reasonsText, unrestReasonsFromFactors, type ClubStep, type UnrestReason } from "./unrest-reasons";
import { repeatsAny } from "../messaging/repetition";
import { LEVEL_RANK } from "../league/district-leagues";
import { resolvePromises } from "./promises";
import { LINEUP_PROMISE_BROKEN_SMS, LINEUP_PROMISE_KEPT_SMS } from "../messaging/promise-texts";
import { stanceForOffer } from "../messaging/player-memory";
import { marketValue } from "@okresni-masina/shared";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const DAY_MS = 86400000;

export interface TransferUnrest {
  level: number;
  reason?: string;
  offerId?: string;
  teamName?: string;
  since?: string;
  lastImpactAt?: string;
  lastActionAt?: string;
  fakeInjuryUsed?: boolean;
  fakeInjuryAt?: string;
  fakeInjuryHintSent?: boolean;
  wageRaised?: boolean;
  /**
   * Slib: místo v sestavě, prodej při další nabídce, nebo „pustit“ = trenér si u klubu
   * vyžádal novou nabídku (`offerId`) a slíbil ji přijmout.
   */
  pledge?: { type: "minutes" | "transfer" | "release"; madeAt: string; deadline: string; offerId?: string } | null;
  /** Proč chtěl odejít (unrest-reasons.ts), od nejsilnějšího důvodu. */
  reasons?: UnrestReason[];
  /** Odmítnutá nabídka: kvůli prémii (podíl z částky) a „pustit ho“ (stejný klub, stejná částka). */
  offer?: { amount: number; fromTeamId: string; virtualTeamData: string | null; at: string };
  /** Dohody uzavřené v tomhle truci (každá jen jednou). Nové odmítnutí je smaže. */
  deals?: Array<{ id: string; at: string }>;
  /** Kam by šel: vyšší soutěž, áčko z U21, Německo, nebo jen silnější tým (clubStepFor). */
  clubStep?: ClubStep;
  /** Věta o soutěžích pro prompt rozhovoru, ať si model soutěž nevymýšlí. */
  leagueNote?: string;
}

/**
 * Kam by hráč přestupem šel a jak to říct. Dřív první SMS u „lepšího klubu“ vždy psala
 * „pořádnou soutěž“, i když nabídka byla ze stejného přeboru (2026-10-19).
 */
export async function clubStepFor(
  db: D1Database,
  input: { fromTeamId: string; rosterTeamId: string; teamName: string; virtualCountry: string | null },
): Promise<{ step: ClubStep; note: string }> {
  const { fromTeamId, rosterTeamId, teamName, virtualCountry } = input;
  if (fromTeamId === "virtual_ai") {
    return virtualCountry && virtualCountry !== "CZ"
      ? { step: "abroad", note: `${teamName} je bavorský klub, hrál bys v Německu.` }
      : { step: "stronger_team", note: `${teamName} nehraje vaši soutěž. Jakou soutěž hraje, přesně nevíš, tak si to nevymýšlej.` };
  }
  const row = await db.prepare(
    `SELECT bt.parent_team_id AS buyer_parent, bl.level AS buyer_level, bl.name AS buyer_league,
            st.parent_team_id AS roster_parent, sl.level AS roster_level
     FROM teams bt LEFT JOIN leagues bl ON bl.id = bt.league_id, teams st LEFT JOIN leagues sl ON sl.id = st.league_id
     WHERE bt.id = ? AND st.id = ?`,
  ).bind(fromTeamId, rosterTeamId).first<{ buyer_parent: string | null; buyer_level: string | null; buyer_league: string | null; roster_parent: string | null; roster_level: string | null }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "soutěž kupujícího a hráče", e); return null; });
  const league = row?.buyer_league ?? "neznámou soutěž";
  if (row?.roster_parent && !row.buyer_parent) {
    return { step: "seniors", note: `${teamName} hraje ${league} mezi dospělými, ty zatím hraješ za U21.` };
  }
  if ((LEVEL_RANK[row?.buyer_level ?? ""] ?? 0) > (LEVEL_RANK[row?.roster_level ?? ""] ?? 0)) {
    return { step: "higher_league", note: `${teamName} hraje ${league}, o soutěž výš než ty.` };
  }
  return { step: "stronger_team", note: `${teamName} hraje ${league}, to není vyšší soutěž než ta tvoje. Netvrď, že bys tam hrál lepší soutěž.` };
}

/**
 * Vede klub AI trenér? Truc jeho hráčů běží podle stejných pravidel, jen bez zpráv (spec AI
 * klubů 3.2): žádná SMS, rozhovor ani oznámení. Při chybě čtení se zprávy pošlou jako dřív,
 * ať lidský klub o nic nepřijde.
 */
async function isAiClub(db: D1Database, clubTeamId: string): Promise<boolean> {
  const row = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(clubTeamId).first<{ user_id: string | null }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, `typ klubu ${clubTeamId}`, e); return null; });
  return row?.user_id === "ai";
}

export function parseUnrest(lifeContext: string | null | undefined): TransferUnrest | null {
  try {
    const lc = lifeContext ? JSON.parse(lifeContext) : {};
    return lc.transferUnrest ?? null;
  } catch {
    return null;
  }
}

// ── SMS hráče po odmítnuté nabídce ──
// Píše ji model podle faktů (`rejectionSmsInstruction`, messaging/event-sms.ts). Tyhle
// varianty jdou, když model nejede, a hráč dostane tu, kterou ještě neposlal. Dřív byly
// po dvou až třech a bez paměti: 9 vět dělalo 29 % všech šablon (prod 9–11/2026).
// Klub stojí v 1. pádě jako podmět („{team} o mě stál“) nebo nesklonně za předložkou.
export const REJECTED_SMS_WANTS: readonly string[] = [
  "Trenére, slyšel jsem, že {team} o mě stál. A vy jste to smetl ze stolu? Tohle si budu pamatovat.",
  "Trenére, proč jste mi neřekl o té nabídce od {team}? Chtěl jsem to aspoň probrat. Zklamání.",
  "Trenére, {team} mě chtěl a vy jste to zařízl. Nevím, jestli tu ještě vidím budoucnost.",
  "Takže nabídka od {team} šla do koše a mně nikdo nic neřekne? To mě fakt mrzí, trenére.",
  "Trenére, od kluků se dozvídám, že jste odmítl {team}. Aspoň zeptat jste se mě mohl.",
  "Nabídka od {team} a vy ani slovo? Trenére, tohle mě dost zklamalo.",
  "Trenére, já bych do {team} šel. Škoda, že o mně rozhodujete beze mě.",
  "Tak {team} o mě stál a skončilo to u vás na stole. Těžko se mi to polyká, trenére.",
];
export const REJECTED_SMS_WANTS_HOT: readonly string[] = [
  "To si děláte srandu?! {team} mě chtěl a vy to hodíte do koše bez jediného slova?!",
  "Tak takhle teda ne, trenére. Nabídka od {team} byla moje šance a vy jste mi ji sebral. Uvidíme, jak se vám bude hrát beze mě.",
  "Trenére, to je fakt síla. {team} o mě stál a vy to smetete ze stolu, aniž byste mi něco řekl?!",
  "Já se z toho picnu. Nabídka od {team} a vy ji pošlete k šípku? Tohle vám nezapomenu.",
  "Super, trenére. {team} mě chtěl, já jsem chtěl jít a vy to zaříznete. Tak si to užijte.",
  "Tohle si nenechám líbit, trenére! Odmítnout {team} a ani mi nezavolat? Teď na mě nemluvte.",
  "Trenére, jste normální? Takovou nabídku od {team} jen tak odmítnout? Mám toho dost.",
  "Fakt díky, trenére. Moje šance v {team} je pryč a vy se mě ani nezeptáte. Tohle se nedělá.",
];
// Trenér s hráčem o nabídce psal, takže „bez jediného slova“ by nebyla pravda.
export const REJECTED_SMS_WANTS_TALKED: readonly string[] = [
  "Trenére, vím, že jsme o tom mluvili, ale stejně mě štve, že jste {team} odmítl. Tohle si budu pamatovat.",
  "Psali jsme si o tom, já vím. Ale nabídka od {team} byla moje šance a vy jste ji zařízl. Zklamání, trenére.",
  "Trenére, vysvětlil jste mi to, ale stejně mě to hlodá. {team} o mě fakt stál.",
  "Dobře, řekl jste mi to na rovinu. Ale že jste {team} odmítl, mě pořád štve.",
  "Trenére, beru, že jste mi to řekl předem. Spokojenej ale nejsem, do {team} jsem chtěl.",
  "Chápu vaše důvody, trenére, jenže mně ta nabídka od {team} nejde z hlavy.",
  "Aspoň jste mi to řekl, trenére. Radost ale nemám, {team} by pro mě byl krok dopředu.",
  "Já vím, mluvili jsme o tom. Stejně je to blbý pocit, když {team} o mě stál a nic z toho nebude.",
];
export const REJECTED_SMS_LOYAL: readonly string[] = [
  "Trenére, díky, že jste tu nabídku odmítl. Jsem tady doma a jinam nechci.",
  "Trenére, slyšel jsem o té nabídce. Dobře, že jste ji poslal k šípku. Já svůj dres nevyměním.",
  "Trenére, nabídka od {team}? Ani mě to nelákalo. Jsem rád, že jsem tady.",
  "Díky, trenére. Kdyby se mě někdo ptal, řekl bych to samý: zůstávám.",
  "Trenére, slyšel jsem o nabídce od {team}. Dobře jste udělal, tady mám kluky i hospodu.",
  "Jsem rád, že jste mě nepustil, trenére. Za tenhle klub budu kopat, dokud mi nohy slouží.",
  "Trenére, díky za důvěru. Jinde bych se doma necítil.",
  "To jste udělal dobře, trenére. Mě odsud nikdo nedostane.",
];
/** Trenér sám volal do klubu, že hráče pustí („Pustit ho“), a nabídku stejně odmítl. */
export const REJECTED_SMS_BROKEN_RELEASE: readonly string[] = [
  "Volal jste do {team}, že mě pustíte, a teď to zase zaříznete? S vámi jsem skončil, trenére.",
  "Trenére, sám jste do {team} volal, že mě pustíte. A teď nic? Tohle je podraz.",
  "Slíbil jste, že nabídku od {team} vezmete. Nevzal jste ji. Už vám nevěřím ani slovo.",
  "Tak vy zavoláte do {team}, že mě pustíte, a pak to necháte ležet? Fakt díky, trenére.",
  "Trenére, nabídka od {team} přišla, jak jste chtěl, a vy jste ji stejně zařízl. To se nedělá.",
  "Tohle jste slíbil vy, ne já. {team} poslal nabídku a vy nic. Se mnou už nepočítejte.",
  "Trenére, proč jste tam teda volal? Nabídka od {team} je pryč a já tu trčím dál.",
  "Já už fakt nevím, co vám věřit. Volal jste do {team} a pak ji odmítnete. Skončil jsem.",
];
/** Trenér slíbil hráče pustit při další dobré nabídce (dohoda) a další odmítl. */
export const REJECTED_SMS_BROKEN_TRANSFER: readonly string[] = [
  "Slíbil jste, že mě při další dobré nabídce pustíte! {team} přišel a vy nic. S vámi jsem skončil.",
  "Trenére, dal jste mi slovo, že mě pustíte. Nabídka od {team} je tady a vy ji odmítnete?",
  "Tak tolik k vašemu slibu, trenére. {team} o mě stál a vy jste to zase zařízl.",
  "Řekl jste, že mi při další nabídce nebudete bránit. Nabídka od {team} šla do koše. Podraz.",
  "Trenére, já vám věřil. Slíbil jste, že mě pustíte, a nabídku od {team} jste stejně odmítl.",
  "Vaše slovo nestojí za nic, trenére. Slib jste dal, {team} se ozval a stejně nic.",
  "Trenére, pamatujete si vůbec, co jste mi slíbil? {team} chtěl a vy jste řekl ne.",
  "Na slib, že mě pustíte, jsem čekal. Přišel {team} a vy to zahodíte. Tohle vám nezapomenu.",
];

/** Jak hráč odmítnutí bere: podle toho model píše a z toho se bere předem napsaná varianta. */
export type RejectionStance = "loyal" | "wants" | "hot" | "talked" | "broken_release" | "broken_transfer";

export const REJECTION_POOLS: Record<RejectionStance, readonly string[]> = {
  loyal: REJECTED_SMS_LOYAL,
  wants: REJECTED_SMS_WANTS,
  hot: REJECTED_SMS_WANTS_HOT,
  talked: REJECTED_SMS_WANTS_TALKED,
  broken_release: REJECTED_SMS_BROKEN_RELEASE,
  broken_transfer: REJECTED_SMS_BROKEN_TRANSFER,
};

/** Poděkování za odmítnutou nabídku: `metadata.scenario_id`, podle něj se pozná i později. */
export const LOYAL_SCENARIO_ID = "offer_rejected_loyal";
/** Druhé poděkování za odmítnutou nabídku dřív než po tolika dnech hráč nepíše. */
export const LOYAL_REPEAT_DAYS = 30;

export interface RejectionSmsFacts {
  teamName: string;
  amount: number;
  isLoan: boolean;
  trigger: "reject" | "expire";
  stance: RejectionStance;
  /** Trenér s hráčem od příchodu nabídky psal (`coachWroteAboutOffer`). */
  coachTalked: boolean;
  /** Proč chtěl odejít, slovy („lepšímu klubu“), nebo null. */
  reasons: string | null;
  /** Jakou soutěž klub hraje (`clubStepFor`), ať si ji model nevymýšlí. */
  leagueNote: string | null;
  /** Jak si stojí v kádru, slovy. */
  squadRole: string | null;
}

const STANCE_TEXT: Record<RejectionStance, string> = {
  // Ve 2. osobě k trenérovi: pokyn „že jsi rád, že tě nepustil“ model opsal jako „Fajn, že mě nepustil“ (E2E 22. 11.).
  loyal: "Odejít jsi nechtěl, tady jsi doma. Oslov ho přímo a napiš mu krátce, že jsi rád, že tě tady nechal: "
    + "„Díky, že jste mě nepustil“ nebo „Jsem rád, žes mě nepustil“, podle toho, jestli mu vykáš, nebo tykáš. "
    + "Ne „že mě nepustil“, to zní, jako bys mluvil o někom jiném. Bez patosu, po svém.",
  wants: "Rád bys tam šel a štve tě to. Dej mu najevo zklamání a řekni mu, proč jsi chtěl jít.",
  hot: "Hodně jsi tam chtěl a jsi vzteklý. Klidně ostře, podle povahy, a řekni mu, proč jsi chtěl jít.",
  talked: "Psali jste si o té nabídce, takže tě to nepřekvapilo, ale stejně tě to štve. Řekni mu, proč jsi chtěl jít.",
  broken_transfer: "Trenér ti dřív slíbil, že tě při další dobré nabídce pustí, a stejně ji odmítl. Cítíš se podvedený a jsi naštvaný.",
  broken_release: "Trenér do toho klubu sám volal, že tě pustí, a teď jejich nabídku zase zařízl. Jsi vzteklý a cítíš se podvedený.",
};

/** Co model ví, když píše SMS po odmítnuté nebo propadlé nabídce. Jen fakta, která hra eviduje. */
export function rejectionSmsInstruction(f: RejectionSmsFacts): string {
  const amount = f.amount.toLocaleString("cs-CZ");
  return [
    f.trigger === "expire"
      ? `Trenér nechal propadnout nabídku od klubu ${f.teamName}, ani na ni neodpověděl.`
      : `Trenér odmítl nabídku od klubu ${f.teamName}.`,
    f.isLoan
      ? `Chtěli tě na hostování a tvému klubu za to nabízeli ${amount} Kč.`
      : `Chtěli tě koupit a tvému klubu za tebe nabízeli ${amount} Kč odstupné.`,
    "Ty peníze by dostal klub, ne ty. Jaký plat bys tam měl, nevíš, tak si ho nevymýšlej.",
    f.leagueNote ?? "",
    f.squadRole ?? "",
    f.coachTalked
      ? "Trenér ti o té nabídce předtím psal (je to v historii), takže netvrď, že ti nic neřekl."
      : "Trenér ti o ní předem nic neřekl, dozvěděl ses to jinak.",
    STANCE_TEXT[f.stance],
    f.reasons && f.stance !== "loyal" ? `Chtěl jsi odejít hlavně kvůli ${f.reasons}.` : "",
    "Netvrď, že odejdeš bez souhlasu klubu nebo že jsi jinde podepsal. Žádné jiné částky ani kluby si nevymýšlej.",
  ].filter(Boolean).join(" ");
}

/** Jak si hráč stojí v kádru podle hodnocení (pořadí mezi aktivními hráči týmu). */
export function squadRoleText(rank: number, total: number): string | null {
  if (total < 5 || rank < 1) return null;
  if (rank <= 3) return "Patříš k nejlepším hráčům kádru.";
  if (rank <= 11) return "Patříš do základu.";
  if (rank <= 16) return "Jsi spíš náhradník, do základu se dostáváš málo.";
  return "Jsi na okraji kádru.";
}

// ── Fake injury katalog (vypadá jako běžné zranění, smsText je výmluva hráče) ──
const FAKE_INJURIES: { type: string; description: string; smsText: string }[] = [
  { type: "zada", description: "Bolesti zad", smsText: "Trenére, chytly mě záda. Doktor říká, že to bude na pár týdnů. Nemůžu se ani ohnout." },
  { type: "sval", description: "Natažený sval", smsText: "Trenére, cítím ten sval už od tréninku. Radši to nebudu pokoušet, nechci si to utrhnout." },
  { type: "koleno", description: "Bolest v koleni", smsText: "Trenére, to koleno prostě nejde. Píchá v něm při každém kroku, musím pauzírovat." },
];

/**
 * Nejnižší cena, za kterou AI klub hráče pouští: u přestupu rezervace podle významu v kádru
 * a aspoň tržní hodnota (se slibem prodeje jen tržní hodnota, jako v rozhodnutí o nabídce),
 * u hostování požadovaný poplatek. Null = klub ho nepouští vůbec (oporu na hostování).
 * Když kádr nejde načíst, platí tržní hodnota.
 */
export async function aiClubPriceFloor(
  db: D1Database,
  clubTeamId: string,
  player: { id: string; rating: number; age: number; position: string | null; promisedSale: boolean; isLoan: boolean; loanDays: number },
): Promise<number | null> {
  const value = marketValue(player.rating, player.age, player.position);
  try {
    const { ensureAiProfile } = await import("../ai-coach/profile");
    const { loadAiClubState } = await import("../ai-coach/transfer-club");
    const { reservationPrice } = await import("../ai-coach/valuation");
    const { requiredLoanFee } = await import("../ai-coach/transfer-decision");
    const now = new Date();
    const profile = await ensureAiProfile(db, clubTeamId);
    const club = await loadAiClubState(db, clubTeamId, profile, now);
    if (!club) return player.isLoan ? 0 : value;
    const importance = club.analysis.importanceOf(player.id);
    if (player.isLoan) return requiredLoanFee({ marketValue: value, age: player.age, importance, loanDays: player.loanDays });
    if (player.promisedSale) return value;
    return Math.max(value, reservationPrice({ marketValue: value, age: player.age, importance, profile, playerId: player.id, now }));
  } catch (e) {
    logger.warn({ module: "rejection-impact" }, `cena AI klubu ${clubTeamId} za hráče ${player.id}`, e);
    return player.isLoan ? 0 : value;
  }
}

interface OfferLike {
  id?: unknown;
  player_id?: unknown;
  from_team_id?: unknown;
  to_team_id?: unknown;
  offer_amount?: unknown;
  counter_amount?: unknown;
  offer_type?: unknown;
  virtual_team_data?: unknown;
  message?: unknown;
}

/**
 * Aplikuje dopad odmítnutí (reject) nebo vypršení (expire) nabídky na hráče.
 * Volat JEN když nabídku zamítl/nechal vypršet vlastník hráče.
 */
export async function applyOfferRejectionImpact(
  db: D1Database,
  offer: OfferLike,
  trigger: "reject" | "expire",
  env?: {
    GEMINI_API_KEY?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string; DB?: D1Database; CACHE_KV?: KVNamespace; AI?: Ai;
  },
): Promise<void> {
  // Po odmítnutí v aplikaci běží ve waitUntil: rozpočet na SMS hráče od začátku (lib/time-budget.ts).
  const deadline = deadlineIn();
  const playerId = offer.player_id as string;
  const sellerRosterTeamId = offer.to_team_id as string;
  const sellerClubTeamId = await db.prepare(
    "SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?",
  ).bind(sellerRosterTeamId).first<{ id: string }>()
    .then((row) => row?.id ?? sellerRosterTeamId)
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "resolve seller club", e); return sellerRosterTeamId; });
  const fromTeamId = offer.from_team_id as string;
  const amount = (offer.counter_amount != null ? offer.counter_amount : offer.offer_amount) as number;
  const isLoan = (offer.offer_type as string) === "loan";

  // Hráč musí pořád patřit prodávajícímu (mohl mezitím odejít)
  const player = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.team_id, p.loan_from_team_id,
            p.personality, p.life_context, p.coach_relationship
     FROM players p
     JOIN teams current_team ON current_team.id = p.team_id
     LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
     WHERE p.id = ?
       AND COALESCE(owner_team.parent_team_id, owner_team.id,
                    current_team.parent_team_id, current_team.id) = ?`
  ).bind(playerId, sellerClubTeamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "load player", e); return null; });
  if (!player) return;
  // AI klub: stejný dopad na hráče, ale žádná SMS, rozhovor ani oznámení.
  const silent = await isAiClub(db, sellerClubTeamId);


  // Jméno nabízejícího klubu
  let teamName = "Neznámý klub";
  let virtualCountry: string | null = null;
  if (fromTeamId === "virtual_ai") {
    try {
      const vd = offer.virtual_team_data ? JSON.parse(offer.virtual_team_data as string) : null;
      if (vd?.name) teamName = vd.name;
      if (vd?.country) virtualCountry = vd.country;
    } catch (e) { logger.warn({ module: "rejection-impact" }, "parse vtd", e); }
  } else {
    const t = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(fromTeamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "rejection-impact" }, "load buyer name", e); return null; });
    if (t?.name) teamName = t.name;
  }

  // Čerstvý přepočet zájmu — dopad odpovídá AKTUÁLNÍMU stavu hráče (stejný vstup jako připomínka lhůty)
  const interest = await computeInterestForOffer(db, playerId, interestOfferOf(offer));
  if (!interest) return;

  const pers = (() => { try { return JSON.parse(player.personality as string) ?? {}; } catch { return {}; } })();
  const lc = (() => { try { return JSON.parse(player.life_context as string) ?? {}; } catch { return {}; } })();
  const unrest: TransferUnrest = lc.transferUnrest ?? { level: 0 };
  const morale: number = typeof lc.morale === "number" ? lc.morale : 50;
  const nowIso = new Date().toISOString();
  const playerRef = {
    id: player.id as string,
    firstName: player.first_name as string,
    lastName: player.last_name as string,
    nickname: player.nickname as string | null,
    avatar: player.avatar as string | null,
  };

  // Trenér si nabídku sám vyžádal a slíbil hráče pustit („Pustit ho“), a teď ji odmítl
  // nebo nechal propadnout: porušený slib bez ohledu na to, jak moc hráč chce pryč.
  const brokenReleasePledge = unrest.pledge?.type === "release" && unrest.pledge.offerId === (offer.id as string);

  // AI klub: nabídka pod cenou, za kterou klub hráče pouští, hráče nerozhodí. Jinak šlo sérií
  // směšných nabídek hráče AI klubu naštvat, vynutit slib prodeje a koupit ho pod cenou.
  if (silent && !brokenReleasePledge) {
    const rated = await db.prepare("SELECT overall_rating, age, position FROM players WHERE id = ?").bind(playerId)
      .first<{ overall_rating: number | null; age: number | null; position: string | null }>()
      .catch((e) => { logger.warn({ module: "rejection-impact" }, "hodnocení hráče AI klubu", e); return null; });
    const floor = await aiClubPriceFloor(db, sellerClubTeamId, {
      id: playerId, rating: Number(rated?.overall_rating) || 0, age: Number(rated?.age) || 25, position: rated?.position ?? null,
      promisedSale: unrest.pledge?.type === "transfer" && new Date(unrest.pledge.deadline) > new Date(),
      isLoan, loanDays: Number((offer as { loan_duration?: unknown }).loan_duration) || 30,
    });
    if (floor === null || amount < floor) {
      logger.info({ module: "rejection-impact" }, `${trigger}: nabídka ${amount} na hráče AI klubu ${playerId} pod cenou klubu (${floor ?? "nepouští"}), bez dopadu`);
      return;
    }
  }

  // Co hráč trenérovi o nabídce sám napsal (messaging/player-memory.ts). Dřív dostal David Novák
  // hned po svém „nabídku odmítněte“ šablonu „smetl jste to ze stolu“ (prod 2026-10-24).
  // Postoj ale vzniká z odpovědi modelu na text manažera, takže zájem posune nejvýš o jeden
  // stupeň: kdo váhal nebo chtěl jít, se po přemluvení nezlobí; kdo velmi chtěl přestoupit,
  // se zlobí dál, jen míň. Jinak by šlo trest obejít tím, co manažer hráči napíše.
  const stance = stanceForOffer(lc.offerStance, offer.id as string);
  // Trenér hráči v SMS slíbil, že ho při další nabídce pustí (messaging/coach-commitments.ts),
  // a teď nabídku zamítl nebo nechal propadnout. Kdo sám řekl „zůstávám“, ten se nezlobí.
  // Hostování se nepočítá, slib byl o odchodu.
  if (!isLoan && stance !== "stay") {
    const { breakReleaseCommitment } = await import("../messaging/coach-commitments");
    await breakReleaseCommitment(db, playerId)
      .catch((e) => logger.warn({ module: "rejection-impact" }, "slib odchodu z SMS", e));
  }
  if (stance) {
    await db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.offerStance') WHERE id = ?")
      .bind(playerId).run().catch((e) => logger.warn({ module: "rejection-impact" }, "smazání postoje k nabídce", e));
  }
  const level = (stance === "stay" ? Math.max(0, interest.level - 1)
    : stance === "leave" ? Math.max(interest.level, 2) : interest.level) as typeof interest.level;
  if (stance) logger.info({ module: "rejection-impact" }, `${trigger}: ${playerRef.firstName} ${playerRef.lastName} v SMS řekl ${stance}, zájem ${interest.level} → ${level}`);

  // Hráč odejít nechtěl → žádný trest; věrný patriot má z odmítnutí radost
  if (level <= 1 && !brokenReleasePledge) {
    if (level === 0 && (pers.patriotism ?? 50) > 70) {
      const newMorale = clamp(morale + 2, 0, 100);
      await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?")
        .bind(newMorale, playerId).run().catch((e) => logger.warn({ module: "rejection-impact" }, "loyal morale boost", e));
      // Poděkování jednou za čas: conv f14c5721 dostala tutéž větu pětkrát (prod 9–11/2026).
      if (!silent && !(await loyalThanksSentRecently(db, sellerClubTeamId, playerId, teamName))) {
        await sendRejectionSms(db, env, {
          clubTeamId: sellerClubTeamId, rosterTeamId: player.team_id as string, playerRef, offerId: offer.id as string | undefined, deadline,
          facts: {
            teamName, amount, isLoan, trigger, stance: "loyal", reasons: null, leagueNote: null, squadRole: null,
            coachTalked: await coachWroteAboutOffer(db, sellerClubTeamId, playerId, offer.id as string | undefined),
          },
        });
      }
    }
    return;
  }

  // Slib prodeje porušen dalším odmítnutím → maximální vztek
  const brokenTransferPledge = brokenReleasePledge
    || (unrest.pledge?.type === "transfer" && new Date(unrest.pledge.deadline) > new Date());

  // Anti-stack: dopad max 1× za 7 dní v plné síle
  const recentImpact = unrest.lastImpactAt && (Date.now() - new Date(unrest.lastImpactAt).getTime()) < 7 * DAY_MS;
  const stackFactor = recentImpact ? 0.3 : 1;
  const loanFactor = isLoan ? 0.5 : 1;
  const temper: number = pers.temper ?? 40;
  const temperScale = 0.75 + temper / 200; // 0.75–1.25

  let moraleDelta = Math.round((level === 3 ? -10 : -6) * temperScale * loanFactor * stackFactor);
  let coachRelDelta = Math.round((level === 3 ? -6 : -3) * loanFactor * stackFactor);
  // Klubová kronika a vitrína — hráč, kterému klub něco znamená, odchází neradi.
  // U rodáků (vysoký patriotism) váží dvojnásob: ty fotky v klubovně jsou jejich.
  const trophyFx = await (async () => {
    const row = await db.prepare("SELECT trophy_case, trophy_case_condition FROM equipment WHERE team_id = ?")
      .bind(sellerClubTeamId).first<{ trophy_case: number; trophy_case_condition: number }>()
      .catch((e) => { logger.warn({ module: "rejection-impact" }, "load trophy case", e); return null; });
    if (!row?.trophy_case) return 0;
    return row.trophy_case * ((row.trophy_case_condition ?? 50) / 100) * 0.12;
  })();
  const patriotism: number = pers.patriotism ?? 50;
  const loyaltyMod = Math.min(0.6, trophyFx * (patriotism >= 70 ? 2 : 1));

  let unrestAdd = Math.round((level === 3 ? 55 : 35) * loanFactor * stackFactor * (1 - loyaltyMod));
  let newLevel = clamp(Math.round(unrest.level + unrestAdd), 0, 100);

  if (brokenTransferPledge) {
    moraleDelta = -12;
    coachRelDelta = -8;
    newLevel = 90;
    await resolvePromises(db, playerId, ["transfer", "release"], "broken");
  }

  const newMorale = clamp(morale + moraleDelta, 0, 100);
  const step = await clubStepFor(db, { fromTeamId, rosterTeamId: player.team_id as string, teamName, virtualCountry });
  const newUnrest: TransferUnrest = {
    ...unrest,
    level: newLevel,
    reason: brokenTransferPledge ? "broken_pledge" : "rejected_offer",
    offerId: (offer.id as string) ?? unrest.offerId,
    teamName,
    since: unrest.since ?? nowIso,
    lastImpactAt: nowIso,
    pledge: brokenTransferPledge ? null : (unrest.pledge ?? null),
    // Nové odmítnutí = nový truc: důvody podle téhle nabídky, dohody znovu k mání.
    reasons: brokenTransferPledge ? (unrest.reasons ?? []) : unrestReasonsFromFactors(interest.factors),
    offer: {
      amount, fromTeamId, at: nowIso,
      virtualTeamData: fromTeamId === "virtual_ai" ? ((offer.virtual_team_data as string | null) ?? null) : null,
    },
    deals: [],
    clubStep: step.step,
    leagueNote: step.note,
  };

  await db.prepare(
    "UPDATE players SET life_context = json_set(life_context, '$.morale', ?, '$.transferUnrest', json(?)) WHERE id = ?"
  ).bind(newMorale, JSON.stringify(newUnrest), playerId).run()
    .catch((e) => logger.warn({ module: "rejection-impact" }, "apply impact", e));
  await applyCoachRelationDelta(db, {
    playerId,
    delta: coachRelDelta,
    source: "transfer_rejected",
    description: brokenTransferPledge
      ? `Slíbil jsi, že ho pustíš, a nabídku z klubu ${teamName} jsi stejně odmítl`
      : `Nepustil jsi ho do klubu ${teamName}`,
    referenceId: offer.id ? `offer-reject-${offer.id as string}-${playerId}` : null,
  });

  // AI klubu se nepíše: truc, nálada i vztah k trenérovi platí, SMS, rozhovor a oznámení ne.
  if (silent) {
    logger.info({ module: "rejection-impact" },
      `${trigger} (AI klub, bez zpráv): ${playerRef.firstName} ${playerRef.lastName} interest=${level} morale ${morale}→${newMorale} unrest ${unrest.level}→${newLevel}`);
    return;
  }

  // SMS od hráče: naštvání podle tempera; při porušeném slibu vždy nejostřejší. Píše ji model
  // podle faktů, bez něj varianta, kterou hráč ještě neposlal.
  const coachTalked = await coachWroteAboutOffer(db, sellerClubTeamId, playerId, offer.id as string | undefined);
  const smsStance: RejectionStance = brokenReleasePledge ? "broken_release"
    : brokenTransferPledge ? "broken_transfer"
    : coachTalked ? "talked"
    : temper > 65 ? "hot" : "wants";
  const reasons = newUnrest.reasons ?? [];
  const convId = await sendRejectionSms(db, env, {
    clubTeamId: sellerClubTeamId, rosterTeamId: player.team_id as string, playerRef, offerId: offer.id as string | undefined, deadline,
    facts: {
      teamName, amount, isLoan, trigger, stance: smsStance, coachTalked, leagueNote: step.note,
      reasons: reasons.length > 0 ? reasonsText(reasons) : null, squadRole: null,
    },
    // Důvod odchodu se trenér dozví ze SMS (přání 2026-10-18), u předem napsané varianty větou navíc.
    suffix: !brokenTransferPledge && reasons.length > 0 ? reasonSmsVariants(reasons[0], step.step) : undefined,
  });

  // Otevřít živou konverzaci (AI thread): trenér může volně odpovědět, hráč reaguje,
  // po max 2 výměnách AI vyhodnotí dopad (viz applyResolutionAndClose — upravuje i truc).
  // Bez zapnutého generování thread neaktivujeme — zůstanou usmiřovací chips.
  // Rozhoduje přepínač `ai_provider`, ne samotný gemini klíč: odpovídá se
  // přes `generateText`, takže hráč promluví i přes Workers AI.
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (env && await isAiEnabled(env)) {
    await db.prepare(
      `UPDATE conversations
       SET ai_thread_active = 1, ai_thread_last_at = ?,
           ai_thread_state = ?
       WHERE id = ? AND ai_thread_active != 1`
    ).bind(
      nowIso,
      JSON.stringify({
        trigger: "rejected_offer",
        scenario_id: "rejected_offer",
        // Tři výměny: hráč řekne, co ho štve, trenér může nabídnout dohodu a hráč na ni zareaguje.
        max_replies: 3,
        current_replies: 0,
        awaiting: "coach",
        initiated_at: nowIso,
        player_id: playerId,
        resolution: null,
      }),
      convId,
    ).run().catch((e) => logger.warn({ module: "rejection-impact" }, "activate unrest thread", e));
  }

  // In-app notifikace (+push, pokud má env VAPID klíče)
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = env?.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
      ? { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db }
      : undefined;
    await createNotification(db, sellerClubTeamId, "transfer",
      `😠 ${playerRef.firstName} ${playerRef.lastName} je naštvaný`,
      `${trigger === "expire" ? "Nabídka od" : "Odmítl jsi nabídku od"} ${teamName}${trigger === "expire" ? " propadla" : ""}, přitom hráč o přestup stál (${INTEREST_LABELS[level]}).`,
      `/hrac/${playerId}`,
      pushEnv);
  } catch (e) { logger.warn({ module: "rejection-impact" }, "unrest notification", e); }

  logger.info({ module: "rejection-impact" },
    `${trigger}: ${playerRef.firstName} ${playerRef.lastName} interest=${level} morale ${morale}→${newMorale} unrest ${unrest.level}→${newLevel}`);
}

/**
 * Psal trenér hráči od příchodu nabídky (nejvýš za posledních 24 hodin)? Pak spolu nabídku
 * nejspíš probrali a odmítnutí nepřišlo „bez jediného slova“.
 */
export async function coachWroteAboutOffer(
  db: D1Database,
  clubTeamId: string,
  playerId: string,
  offerId: string | undefined,
): Promise<boolean> {
  if (!offerId) return false;
  const row = await db.prepare(
    `SELECT 1 AS hit FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN transfer_offers o ON o.id = ?
      WHERE c.team_id = ? AND c.participant_id = ? AND m.sender_type = 'user'
        AND julianday(m.sent_at) >= MAX(julianday(o.created_at), julianday('now') - 1)
      LIMIT 1`,
  ).bind(offerId, clubTeamId, playerId).first<{ hit: number }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "zprávy trenéra o nabídce", e); return null; });
  return !!row;
}

/**
 * Poslal hráč za posledních `LOYAL_REPEAT_DAYS` dní poděkování za odmítnutou nabídku?
 * Nové zprávy mají `scenario_id`, starší se poznají podle textu.
 */
export async function loyalThanksSentRecently(
  db: D1Database, clubTeamId: string, playerId: string, teamName: string, now: Date = new Date(),
): Promise<boolean> {
  const rows = await db.prepare(
    `SELECT m.body, json_extract(m.metadata, '$.scenario_id') AS scenario
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = ? AND m.sender_type = 'player'
        AND julianday(m.sent_at) >= julianday(?)`,
  ).bind(clubTeamId, playerId, new Date(now.getTime() - LOYAL_REPEAT_DAYS * DAY_MS).toISOString())
    .all<{ body: string | null; scenario: string | null }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "nedávné poděkování za odmítnutou nabídku", e); return null; });
  const loyal = REJECTED_SMS_LOYAL.map((t) => t.replaceAll("{team}", teamName));
  return (rows?.results ?? []).some((r) => r.scenario === LOYAL_SCENARIO_ID || repeatsAny(r.body ?? "", loyal));
}

/** Pořadí hráče v kádru podle hodnocení, slovy pro prompt. */
async function squadRoleOf(db: D1Database, rosterTeamId: string, playerId: string): Promise<string | null> {
  const r = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM players o WHERE o.team_id = ?1 AND (o.status IS NULL OR o.status = 'active')
               AND o.overall_rating > p.overall_rating) + 1 AS rank,
            (SELECT COUNT(*) FROM players o WHERE o.team_id = ?1 AND (o.status IS NULL OR o.status = 'active')) AS total
       FROM players p WHERE p.id = ?2`,
  ).bind(rosterTeamId, playerId).first<{ rank: number; total: number }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, `místo hráče v kádru ${playerId}`, e); return null; });
  return r ? squadRoleText(r.rank, r.total) : null;
}

/** SMS hráče po odmítnuté nabídce (model, jinak předem napsaná varianta). Vrací konverzaci. */
async function sendRejectionSms(
  db: D1Database,
  env: Parameters<typeof applyOfferRejectionImpact>[3],
  o: {
    clubTeamId: string; rosterTeamId: string; offerId: string | undefined;
    playerRef: { id: string; firstName: string; lastName: string; nickname: string | null; avatar: string | null };
    facts: RejectionSmsFacts; suffix?: string | readonly string[]; deadline: number;
  },
): Promise<string> {
  const facts = { ...o.facts, squadRole: o.facts.squadRole ?? await squadRoleOf(db, o.rosterTeamId, o.playerRef.id) };
  const { sendEventSms } = await import("../messaging/event-sms");
  const sent = await sendEventSms(db, env, {
    clubTeamId: o.clubTeamId,
    player: o.playerRef,
    instruction: rejectionSmsInstruction(facts),
    fallback: REJECTION_POOLS[facts.stance].map((t) => t.replaceAll("{team}", facts.teamName)),
    fallbackSuffix: o.suffix,
    seed: `rejection|${o.offerId ?? ""}|${o.playerRef.id}`,
    scenarioId: facts.stance === "loyal" ? LOYAL_SCENARIO_ID : "rejected_offer",
    metadata: { offerId: o.offerId ?? null, stance: facts.stance },
    deadline: o.deadline,
  });
  return sent.convId;
}

/**
 * Denní zpracování trucu (volané z transfer pressure ticku):
 * decay, fake injury, fyzio nápověda, zázračné uzdravení, kontrola slibů.
 * Jeden SELECT + malé množství cílených UPDATE (trucujících hráčů je jednotky).
 *
 * Platí i pro AI kluby (spec AI klubů 3.2): truc opadá, sliby se vyhodnocují a hráč může
 * předstírat zranění stejně jako u člověka, jen AI klub nedostane žádnou zprávu.
 */
export async function processTransferUnrest(db: D1Database): Promise<number> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.team_id, p.loan_from_team_id,
            COALESCE(owner_team.parent_team_id, owner_team.id, t.parent_team_id, t.id) AS club_team_id,
            (SELECT club.user_id FROM teams club
              WHERE club.id = COALESCE(owner_team.parent_team_id, owner_team.id, t.parent_team_id, t.id)) AS club_user_id,
            p.personality, p.life_context,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0) as active_injuries,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.is_fake = 1 AND i.days_remaining > 0) as active_fake
     FROM players p JOIN teams t ON p.team_id = t.id
     LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
     WHERE json_extract(p.life_context, '$.transferUnrest') IS NOT NULL`
  ).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "load unrest players", e); return { results: [] as Record<string, unknown>[] }; });

  let processed = 0;
  for (const row of rows.results) {
    try {
      await processUnrestPlayer(db, row);
      processed++;
    } catch (e) {
      logger.warn({ module: "rejection-impact" }, `unrest processing for ${row.id} failed`, e);
    }
  }
  return processed;
}

async function processUnrestPlayer(db: D1Database, row: Record<string, unknown>): Promise<void> {
  const playerId = row.id as string;
  const rosterTeamId = row.team_id as string;
  const clubTeamId = (row.club_team_id as string | null) ?? rosterTeamId;
  const lc = (() => { try { return JSON.parse(row.life_context as string) ?? {}; } catch { return {}; } })();
  const pers = (() => { try { return JSON.parse(row.personality as string) ?? {}; } catch { return {}; } })();
  const unrest: TransferUnrest = lc.transferUnrest;
  if (!unrest) return;
  const playerRef = {
    id: playerId,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    nickname: row.nickname as string | null,
    avatar: row.avatar as string | null,
  };
  const hasFakeInjury = ((row.active_fake as number) ?? 0) > 0;
  const nowIso = new Date().toISOString();
  // AI klub: stejná mechanika, žádné SMS (hráč ani fyzioterapeut AI trenérovi nepíšou).
  const silent = row.club_user_id === "ai";
  const sms = async (body: string) => { if (!silent) await sendPlayerSMS(db, clubTeamId, playerRef, body); };
  const smsVariant = async (pool: readonly string[], seed: string) => {
    if (!silent) await sendPlayerTemplateSMS(db, clubTeamId, playerRef, pool, { seed, metadata: { type: "promise" } });
  };

  // 1) Kontrola slibu minut (pledge 'minutes') — 2 ze 3 zápasů za klub od slibu v základu (45+ min)
  let pledgeBroken = false;
  if (unrest.pledge?.type === "minutes") {
    // Hostování slib sestavy ukončí: posoudí se zápasy za klub do odchodu, a když na
    // dodržení nestačí, slib jen vyprší. Trenér ho pustil hrát jinam, výčitka by byla křivda.
    const onLoanAway = row.loan_from_team_id != null;
    const verdict = await checkMinutesPledge(db, playerId, clubTeamId, rosterTeamId, unrest.pledge, onLoanAway);
    if (onLoanAway && verdict !== "kept") {
      unrest.pledge = null;
      await resolvePromises(db, playerId, ["minutes"], "expired");
    } else if (verdict === "kept") {
      unrest.pledge = null;
      await resolvePromises(db, playerId, ["minutes"], "kept");
      unrest.level = clamp(unrest.level - 10, 0, 100);
      await smsVariant(LINEUP_PROMISE_KEPT_SMS, `pledge-kept|${playerId}|${unrest.since ?? ""}`);
    } else if (verdict === "broken") {
      pledgeBroken = true;
      unrest.pledge = null;
      await resolvePromises(db, playerId, ["minutes"], "broken");
      unrest.level = clamp(unrest.level + BROKEN_PLEDGE_UNREST, 0, 100);
      const morale: number = typeof lc.morale === "number" ? lc.morale : 50;
      lc.morale = clamp(morale - BROKEN_PLEDGE_MORALE, 0, 100);
      await smsVariant(LINEUP_PROMISE_BROKEN_SMS, `pledge-broken|${playerId}|${unrest.since ?? ""}`);
    }
  } else if ((unrest.pledge?.type === "transfer" || unrest.pledge?.type === "release") && new Date(unrest.pledge.deadline) < new Date()) {
    // Slib prodeje vypršel bez další nabídky — smazat (porušení řeší applyOfferRejectionImpact)
    unrest.pledge = null;
    await resolvePromises(db, playerId, ["transfer", "release"], "expired");
  }

  // 2) Decay −3/den (když se nic nestalo)
  if (!pledgeBroken) {
    unrest.level = clamp(unrest.level - 3, 0, 100);
  }

  // 3) Konec trucu → uklidit (a zázračně uzdravit případnou fake injury). Běžící slib
  // (sestava, prodej, „pustit“) zůstává, dokud se nevyhodnotí nebo nevyprší: dřív zmizel
  // s trucem a hra přestala hlídat, jestli ho trenér dodržel.
  if (unrest.level <= 0 && !unrest.pledge) {
    await db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.transferUnrest') WHERE id = ?")
      .bind(playerId).run().catch((e) => logger.warn({ module: "rejection-impact" }, "remove unrest", e));
    if (hasFakeInjury) await healFakeInjury(db, clubTeamId, playerRef, silent);
    return;
  }

  // 4) Zázračné uzdravení — truc klesl pod 40, fake injury ztratila smysl
  if (hasFakeInjury && unrest.level < 40) {
    await healFakeInjury(db, clubTeamId, playerRef, silent);
  } else if (!silent && hasFakeInjury && !unrest.fakeInjuryHintSent && unrest.fakeInjuryAt
    && (Date.now() - new Date(unrest.fakeInjuryAt).getTime()) >= 3 * DAY_MS) {
    // 5) Fyzio nápověda 3. den — manažer dostane stopu, že zranění je podezřelé
    await sendSystemSMS(db, clubTeamId, "Fyzioterapeut",
      `Trenére, byl jsem se podívat na ${playerRef.firstName} ${playerRef.lastName}. Na tom zranění mi něco nesedí, na rovinu, podle mě mu nic není. Zkuste si s ním promluvit.`);
    unrest.fakeInjuryHintSent = true;
  }

  // 6) Nová fake injury — hodně naštvaný, zdravý, ještě to nezkusil
  if (!hasFakeInjury && unrest.level >= 60 && !unrest.fakeInjuryUsed && ((row.active_injuries as number) ?? 0) === 0) {
    const temper: number = pers.temper ?? 40;
    const chance = 0.10 + temper / 500; // 0.10–0.30
    if (Math.random() < chance) {
      const inj = FAKE_INJURIES[Math.floor(Math.random() * FAKE_INJURIES.length)];
      const days = 7 + Math.floor(Math.random() * 8); // 7–14
      await db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, is_fake) VALUES (?, ?, ?, ?, ?, 'stredni', ?, ?, 1)"
      ).bind(crypto.randomUUID(), playerId, rosterTeamId, inj.type, inj.description, days, days).run()
        .catch((e) => logger.warn({ module: "rejection-impact" }, "insert fake injury", e));
      await sms(inj.smsText);
      unrest.fakeInjuryUsed = true;
      unrest.fakeInjuryAt = nowIso;
      unrest.level = clamp(Math.min(unrest.level, 55), 0, 100);
      logger.info({ module: "rejection-impact" }, `fake injury: ${playerRef.firstName} ${playerRef.lastName} (${inj.type}, ${days}d)`);
    }
  }

  lc.transferUnrest = unrest;
  await db.prepare("UPDATE players SET life_context = json(?) WHERE id = ?")
    .bind(JSON.stringify(lc), playerId).run()
    .catch((e) => logger.warn({ module: "rejection-impact" }, "save unrest", e));
}

/** Smaže fake injury a pošle zprávu o zázračném uzdravení (AI klubu ne, `silent`). */
async function healFakeInjury(
  db: D1Database,
  teamId: string,
  playerRef: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
  silent: boolean,
): Promise<void> {
  await db.prepare("DELETE FROM injuries WHERE player_id = ? AND is_fake = 1").bind(playerRef.id).run()
    .catch((e) => logger.warn({ module: "rejection-impact" }, "heal fake injury", e));
  if (silent) return;
  await sendPlayerSMS(db, teamId, playerRef, "Trenére, dobrá zpráva, cítím se najednou mnohem líp. Můžu zase naskočit do tréninku.");
}

/** Porušený slib sestavy: o kolik vzroste nespokojenost a klesne nálada. */
const BROKEN_PLEDGE_UNREST = 35;
const BROKEN_PLEDGE_MORALE = 8;

/**
 * Oprava dat: vrátí trest za slib sestavy, který hra vyhodnotila jako porušený neprávem
 * (Kratochvíl na hostování, 2026-11-05). Slib přepíše na dodržený, náladu vrátí a nespokojenost
 * sníží o to, co jí porušení přidalo. Podruhé nic neudělá: slib už je dodržený.
 */
export async function revertBrokenMinutesPledge(db: D1Database, playerId: string): Promise<{ reverted: boolean; morale?: number; unrestLevel?: number | null }> {
  const promise = await db.prepare(
    "SELECT id, status FROM player_promises WHERE player_id = ? AND type = 'minutes' ORDER BY made_at DESC LIMIT 1",
  ).bind(playerId).first<{ id: string; status: string }>();
  const player = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string | null }>();
  if (!promise || promise.status === "kept" || promise.status === "active" || !player) return { reverted: false };

  const lc = (() => {
    try { return JSON.parse(player.life_context ?? "{}") ?? {}; } catch (e) {
      logger.warn({ module: "rejection-impact" }, `nečitelný life_context ${playerId}`, e);
      return null;
    }
  })();
  if (!lc) return { reverted: false };
  const morale = clamp((typeof lc.morale === "number" ? lc.morale : 50) + BROKEN_PLEDGE_MORALE, 0, 100);
  const unrest = lc.transferUnrest as TransferUnrest | undefined;
  const unrestLevel = unrest ? clamp(unrest.level - BROKEN_PLEDGE_UNREST, 0, 100) : null;
  const unrestStmt = !unrest
    ? null
    : unrestLevel === 0 && !unrest.pledge
      ? db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.transferUnrest') WHERE id = ?").bind(playerId)
      : db.prepare("UPDATE players SET life_context = json_set(life_context, '$.transferUnrest.level', ?) WHERE id = ?").bind(unrestLevel, playerId);
  await db.batch([
    db.prepare("UPDATE player_promises SET status = 'kept', resolved_at = ? WHERE id = ?").bind(new Date().toISOString(), promise.id),
    db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?").bind(morale, playerId),
    ...(unrestStmt ? [unrestStmt] : []),
  ]);
  logger.info({ module: "rejection-impact" }, `vrácen trest za slib sestavy ${playerId}: nálada ${morale}, nespokojenost ${unrestLevel ?? "žádná"}`);
  return { reverted: true, morale, unrestLevel };
}

/** Kolik minut musí hráč odehrát, aby se zápas počítal jako start ve slibu. */
const PLEDGE_START_MINUTES = 45;

/** Zápas klubu, který dal slib (áčko nebo U21), z pohledu slíbeného hráče. */
export interface PledgeMatch {
  /** Tým klubu, který v zápase hrál. */
  teamId: string;
  /** Hráč byl v nominaci (základ nebo lavička). */
  inSquad: boolean;
  /** Odehrané minuty, null = za tým nenastoupil. */
  minutes: number | null;
}

/**
 * Verdikt slibu minut: hráč měl být v základu (45+ min) ve 2 ze 3 příštích zápasů.
 * Počítají se zápasy hráče za klub, který slib dal: kde byl v nominaci nebo hrál, a zápasy
 * týmu, ve kterém je teď (tam ho trenér mohl postavit, a nepostavil). Dřív se braly zápasy
 * týmu, kde hráč zrovna byl: Kratochvílovi po odchodu na hostování (2026-11-05) hra vyčetla
 * dva zápasy Agrokomplexu, které se hrály před jeho příchodem, a jeho dva celé zápasy za
 * Spůli nezapočítala.
 *
 * `final`: slib se musí uzavřít hned (hráč odešel na hostování), i když zápasy ještě chybí.
 * "pending" = zápasů je zatím málo, "void" = při uzavření nebylo co posoudit.
 */
export function minutesPledgeVerdict(
  matches: PledgeMatch[],
  rosterTeamId: string,
  opts: { deadlinePassed: boolean; final: boolean },
): "kept" | "broken" | "pending" | "void" {
  const counted = matches.filter((m) => m.inSquad || m.minutes != null || m.teamId === rosterTeamId).slice(0, 3);
  if (counted.length < 3) {
    if (opts.final) {
      if (counted.length === 0) return "void";
    } else if (opts.deadlinePassed) {
      // Deadline vypršel dřív, než hráč odehrál 3 zápasy → posoudit co je (1-2 zápasy: stačí 1 start)
      if (counted.length === 0) return "kept"; // nebylo co plnit
    } else {
      return "pending";
    }
  }
  const starts = counted.filter((m) => (m.minutes ?? 0) >= PLEDGE_START_MINUTES).length;
  const needed = counted.length >= 3 ? 2 : 1;
  return starts >= needed ? "kept" : "broken";
}

/** Zápasy klubu (áčko i U21) od slibu, chronologicky, s účastí slíbeného hráče. */
async function loadPledgeMatches(db: D1Database, playerId: string, clubTeamId: string, madeAt: string): Promise<PledgeMatch[]> {
  const clubTeams = "(SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)";
  const rows = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_lineup_data, m.away_lineup_data, s.minutes_played AS minutes,
            m.home_team_id IN ${clubTeams} AS club_home
       FROM matches m
       LEFT JOIN match_player_stats s ON s.match_id = m.id AND s.player_id = ?
      WHERE m.status = 'simulated' AND m.simulated_at > ?
        AND (m.home_team_id IN ${clubTeams} OR m.away_team_id IN ${clubTeams})
      ORDER BY m.simulated_at ASC LIMIT 30`,
  ).bind(clubTeamId, clubTeamId, playerId, madeAt, clubTeamId, clubTeamId, clubTeamId, clubTeamId)
    .all<{ home_team_id: string; away_team_id: string; home_lineup_data: string | null; away_lineup_data: string | null; minutes: number | null; club_home: number }>()
    .catch((e) => {
      logger.warn({ module: "rejection-impact" }, "pledge matches", e);
      return { results: [] as Array<{ home_team_id: string; away_team_id: string; home_lineup_data: string | null; away_lineup_data: string | null; minutes: number | null; club_home: number }> };
    });

  return rows.results.map((r) => {
    const home = r.club_home === 1;
    const raw = home ? r.home_lineup_data : r.away_lineup_data;
    let inSquad = false;
    if (raw) {
      try {
        const lineup = JSON.parse(raw) as { starters?: Array<{ id?: string }>; subs?: Array<{ id?: string }> };
        inSquad = [...(lineup.starters ?? []), ...(lineup.subs ?? [])].some((p) => p.id === playerId);
      } catch (e) {
        logger.warn({ module: "rejection-impact" }, "nečitelná sestava zápasu ve slibu", e);
      }
    }
    return { teamId: home ? r.home_team_id : r.away_team_id, inSquad, minutes: r.minutes };
  });
}

async function checkMinutesPledge(
  db: D1Database,
  playerId: string,
  clubTeamId: string,
  rosterTeamId: string,
  pledge: { madeAt: string; deadline: string },
  final: boolean,
): Promise<"kept" | "broken" | "pending" | "void"> {
  const matches = await loadPledgeMatches(db, playerId, clubTeamId, pledge.madeAt);
  return minutesPledgeVerdict(matches, rosterTeamId, { deadlinePassed: new Date(pledge.deadline) < new Date(), final });
}
