/**
 * Odměny a sázky mimo zápas (2026-11-22): „1000 Kč, když zhubneš“, „když neshodíš 5 kilo za 2
 * týdny, platíš pivo všem“, „koupím ti valkýru rumu“ (za informaci o zloději). Detekce dřív
 * výslovně zahazovala všechno, co není sázka o zápas, a domluva o váze (season/weight-talk.ts)
 * se nikdy nekontrolovala podle skutečné váhy.
 *
 *  - `weight_target`: hráč na dohodu kývne (accepts_request), nebo ji odmítne. Kývl-li, platí
 *    pro něj slib omezit hospodu (`life_context.dietPledgeUntil`, body-drift.ts) až do termínu.
 *    V termínu rozhoduje skutečná váha: splnil → odměnu vyplatí trenér tlačítkem (nebo se
 *    vykroutí a vztah to odnese), nesplnil → hráč se ozve, a když prohrál sázku, platí kabině pivo.
 *  - `reward`: odměna za službu (flaška, pivo, peníze). Za pátrání po pachateli (úkol „poptej
 *    se“) až když hráč opravdu přinese jméno, jinak hned. Vyplácí se tlačítkem jako prémie.
 *
 * Peníze se nikdy nepohnou samy (fulfilMoneyCommitment). Všechno jen pro vlastní kádr.
 */

import { logger } from "../lib/logger";
import type { ChatEnv } from "./ai-player-chat";
import { datePhrase, lifeOf } from "./attendance-pledge";

const M = "coach-rewards";
const DAY_MS = 86_400_000;

export type RewardKind = "weight_target" | "reward";
export const REWARD_KINDS: readonly RewardKind[] = ["weight_target", "reward"];
/** Čím trenér platí: peníze, runda pro kluky, basa, flaška. U hubnutí i nic (jen sázka hráče). */
export type RewardType = "money" | "round" | "keg" | "bottle" | "none";
export const REWARD_TYPES: readonly RewardType[] = ["money", "round", "keg", "bottle", "none"];

export interface RewardDetails {
  /** Kolik kg dolů; u „na normální váhu“ dopočítané z váhy bez postihu. */
  kg?: number;
  startWeight?: number;
  targetWeight?: number;
  reward?: RewardType;
  amount?: number;
  /** Prohraje-li hráč, platí kabině pivo („když neshodíš, platíš pivo všem“). */
  forfeit?: boolean;
  /** Odměna za úkol „poptej se“: platí, až hráč přinese jméno. */
  incidentId?: string;
  /** Hráč na dohodu kývl / odmítl (accepts_request). */
  accepted?: boolean;
  /** Odměna je splatná (hubnutí splněno, jméno přineseno, nebo bez podmínky). */
  won?: boolean;
  /** Skutečně shozená kila v termínu. */
  lost?: number;
}

/** Cena odměny, kterou platí trenér z kasy. Runda a basa jako u sázky (BET_PRICE), flaška rumu 300 Kč. */
export const REWARD_PRICE: Record<Exclude<RewardType, "money" | "none">, number> = { round: 600, keg: 500, bottle: 300 };
/** Termín hubnutí: výchozí dva týdny jako slib omezit hospodu (weight-talk.ts), nejvýš měsíc. */
export const WEIGHT_DEFAULT_DAYS = 14;
export const WEIGHT_MAX_DAYS = 30;
/**
 * Kolik se ve hře dá reálně shodit za den: nejvíc za 14 dní bylo na produ 2,08 kg (týdenní
 * záznamy weight_log, 5 858 dvojic, jen 48 hráčů shodilo přes kilo, 22. 11.). Trenér to vidí
 * u dohody, ať ví, do čeho hráče žene.
 */
export const REALISTIC_KG_PER_DAY = 0.15;
/** Kolik dní má trenér na vyplacení splněné odměny. */
export const REWARD_PAY_DAYS = 5;
/** Prohraná sázka hráče: kabině pivo (+1 nálada), jemu −2. */
export const FORFEIT_SQUAD_MORALE = 1;
export const FORFEIT_PLAYER_MORALE = -2;

/** Podrobnosti z DB: druh odměny leží v `rewardType` (`reward` patří sázce o zápas). */
export function rewardDetailsOf(raw: unknown): RewardDetails {
  const d = lifeOf(raw) as RewardDetails & { rewardType?: RewardType };
  return { ...d, reward: d.reward ?? d.rewardType };
}

export function rewardPrice(d: Pick<RewardDetails, "reward" | "amount">): number {
  if (d.reward === "money") return d.amount ?? 0;
  if (!d.reward || d.reward === "none") return 0;
  return REWARD_PRICE[d.reward];
}

const REWARD_WORDS: Record<Exclude<RewardType, "none">, string> = { money: "peníze", round: "rundu", keg: "basu piva", bottle: "flašku" };

export function rewardWhat(d: Pick<RewardDetails, "reward" | "amount">): string {
  if (d.reward === "money") return `${(d.amount ?? 0).toLocaleString("cs-CZ")} Kč`;
  return d.reward && d.reward !== "none" ? REWARD_WORDS[d.reward] : "nic";
}

/** Odměna v 1. pádě („Odměna: flaška“), peníze částkou. */
const REWARD_LABELS: Record<Exclude<RewardType, "none">, string> = { money: "peníze", round: "runda", keg: "basa piva", bottle: "flaška" };

export function rewardLabel(d: Pick<RewardDetails, "reward" | "amount">): string {
  if (d.reward === "money") return `${(d.amount ?? 0).toLocaleString("cs-CZ")} Kč`;
  return d.reward && d.reward !== "none" ? REWARD_LABELS[d.reward] : "nic";
}

/**
 * Odměna s cenou pro trenéra: „flaška (300 Kč)“, peníze jen částkou. Dřív „Odměna: flašku
 * (300 Kč)“ (4. pád) a „Odměna: 1 000 Kč (1 000 Kč)“ (E2E 22. 11.).
 */
export function rewardSummary(d: Pick<RewardDetails, "reward" | "amount">): string {
  return d.reward === "money" ? rewardLabel(d) : `${rewardLabel(d)} (${rewardPrice(d).toLocaleString("cs-CZ")} Kč)`;
}

function kgText(kg: number): string {
  return `${kg.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} kg`;
}

/** Text slibu (commitmentText): „Když shodí 5 kg, dostane 1 000 Kč“. */
export function rewardText(kind: RewardKind, d: RewardDetails): string {
  if (kind === "reward") return d.incidentId ? `Odměnu (${rewardWhat(d)}), když zjistí, kdo za incidentem stojí` : `Odměnu: ${rewardWhat(d)}`;
  const kg = kgText(d.kg ?? 0);
  const prize = d.reward && d.reward !== "none" ? `, trenér mu dá ${rewardWhat(d)}` : "";
  return `Když shodí ${kg}${prize}${d.forfeit ? ", jinak platí kabině pivo" : ""}`;
}

/** Je splněno? Na desetinu kila (váha se ukládá na setiny). */
export function weightGoalMet(d: Pick<RewardDetails, "startWeight" | "kg">, currentWeight: number): { met: boolean; lost: number } {
  const lost = Math.round(((d.startWeight ?? currentWeight) - currentWeight) * 10) / 10;
  return { met: lost + 0.05 >= (d.kg ?? 0), lost };
}

/** Dohoda o hubnutí z odpovědi modelu: kg (nebo „na normální váhu“ = null), dny, odměna, sázka hráče. */
export function parseWeightTarget(raw: { kg?: unknown; days?: unknown; reward?: unknown; amount?: unknown; forfeit?: unknown }): RewardDetails & { days: number } | null {
  const kgNum = raw.kg == null ? null : Math.round(Number(raw.kg) * 10) / 10;
  if (kgNum !== null && (!Number.isFinite(kgNum) || kgNum <= 0 || kgNum > 30)) return null;
  const days = raw.days == null ? WEIGHT_DEFAULT_DAYS : Math.round(Number(raw.days));
  const reward = (REWARD_TYPES as readonly unknown[]).includes(raw.reward) ? raw.reward as RewardType : "none";
  const forfeit = raw.forfeit === true;
  if (reward === "none" && !forfeit) return null;
  const out: RewardDetails & { days: number } = {
    days: Number.isFinite(days) ? Math.max(7, Math.min(WEIGHT_MAX_DAYS, days)) : WEIGHT_DEFAULT_DAYS,
    reward, ...(kgNum !== null ? { kg: kgNum } : {}), ...(forfeit ? { forfeit: true } : {}),
  };
  if (reward === "money") {
    const amount = Math.round(Number(raw.amount));
    if (!Number.isFinite(amount) || amount < 100 || amount > 20_000) return null;
    out.amount = amount;
  }
  return out;
}

/** Odměna za službu z odpovědi modelu. */
export function parseReward(raw: { reward?: unknown; amount?: unknown }): RewardDetails | null {
  const reward = (REWARD_TYPES as readonly unknown[]).includes(raw.reward) && raw.reward !== "none" ? raw.reward as RewardType : null;
  if (!reward) return null;
  if (reward !== "money") return { reward };
  const amount = Math.round(Number(raw.amount));
  if (!Number.isFinite(amount) || amount < 100 || amount > 20_000) return null;
  return { reward, amount };
}

/** Kolik se do termínu dá reálně shodit (pro poznámku trenérovi). */
export function realisticKg(days: number): number {
  return Math.round(days * REALISTIC_KG_PER_DAY * 2) / 2;
}

/** Řádek do promptu hráče. */
export function rewardPromptLine(kind: RewardKind, status: string, d: RewardDetails, dueAt: string, currentWeight?: number): string {
  if (kind === "reward") {
    if (status === "active" && d.won) return `- Trenér ti slíbil odměnu (${rewardWhat(d)}) a ty sis ji zasloužil. Čekáš, až ji dá, klidně mu to připomeň.`;
    if (status === "active") return `- Trenér ti slíbil odměnu (${rewardWhat(d)}), když zjistíš, kdo za incidentem stojí. Snažíš se.`;
    if (status === "kept") return `- Trenér ti dal slíbenou odměnu (${rewardWhat(d)}). Vážíš si toho.`;
    if (status === "broken") return `- Trenér ti slíbil odměnu (${rewardWhat(d)}) a nedal ti ji. Mrzí tě to.`;
    return "";
  }
  const kg = kgText(d.kg ?? 0);
  const deal = `když do ${datePhrase(dueAt)} shodíš ${kg}${d.reward && d.reward !== "none" ? `, dá ti ${rewardWhat(d)}` : ""}${d.forfeit ? ", a když ne, platíš kabině pivo" : ""}`;
  if (status === "active" && d.won) return `- Dohodu o hubnutí jsi splnil (shodil jsi ${kgText(d.lost ?? 0)}) a trenér ti dluží ${rewardWhat(d)}. Klidně mu to připomeň.`;
  if (status === "active" && d.accepted === undefined) return `- Trenér ti nabídl dohodu: ${deal}. Rozhodni se podle povahy a nálady, jestli do toho jdeš, a řekni mu to.`;
  if (status === "active" && d.accepted) {
    const now = currentWeight !== undefined && d.startWeight !== undefined
      ? ` Začínal jsi na ${kgText(d.startWeight)}, teď vážíš ${kgText(currentWeight)}.` : "";
    return `- Máte s trenérem dohodu: ${deal}.${now} Omezuješ hospodu a makáš na tom.`;
  }
  if (status === "kept") return `- Splnil jsi dohodu o hubnutí a trenér ti dal, co slíbil (${rewardWhat(d)}).`;
  if (status === "broken") return `- Splnil jsi dohodu o hubnutí, ale trenér ti slíbenou odměnu (${rewardWhat(d)}) nedal. Štve tě to.`;
  return "";
}

// ─── Texty ──────────────────────────────────────────────────────────────────

/** Splnil hubnutí, připomene odměnu. {kg} = kolik shodil. */
export const WEIGHT_WON_SMS: readonly string[] = [
  "Trenére, shodil jsem {kg}! Dohoda platí, ne? 💪",
  "Tak a je to, trenére: {kg} dole. Kdy dorazí odměna? 😏",
  "Trenére, váha nelže, {kg} je pryč. Teď jste na tahu vy.",
  "{kg} dole, trenére. Pamatujete, co jste slíbil?",
  "Trenére, makal jsem a shodil {kg}. Sázka je sázka.",
  "Dohoda splněná, trenére, {kg} míň. Těším se na odměnu. 🍺",
  "Trenére, kalhoty padaj, {kg} je venku. Platíte?",
  "Shodil jsem {kg}, trenére. Teď ať je vidět, že vaše slovo platí.",
];
/** Nesplnil. {kg} = kolik skutečně shodil. */
export const WEIGHT_FAILED_SMS: readonly string[] = [
  "Trenére, nevyšlo to. Shodil jsem jen {kg}. Ale makal jsem.",
  "Sorry, trenére, {kg} je málo, já vím. Dohodu jsem nesplnil.",
  "Trenére, váha ukázala jen {kg} dolů. Příště to dám.",
  "Tak to nedopadlo, trenére. {kg} a dost. Mrzí mě to.",
  "Trenére, snažil jsem se, ale je to jen {kg}. Prohrál jsem.",
  "Nevyšlo to, trenére. {kg} je pryč, víc ne.",
  "Trenére, přiznávám, {kg} je málo. Hospoda byla silnější.",
  "Jen {kg}, trenére. Nedal jsem to, no.",
];
/** Splnil sázku, ve které jen on mohl prohrát: pivo platit nebude. */
export const WEIGHT_SAVED_SMS: readonly string[] = [
  "Trenére, {kg} dole. Pivo za kabinu platit nebudu. 😏",
  "Tak co, trenére? {kg} pryč a sázku jsem vyhrál.",
  "Trenére, shodil jsem {kg}. Kluci dneska pivo ode mě nedostanou. 😄",
  "{kg} dole, trenére. Sázka je moje.",
  "Trenére, makal jsem a mám dole {kg}. Pivo si zaplatí kluci sami.",
  "Trenére, váha říká {kg} míň. Prohrát jsem fakt neměl v plánu.",
  "Dohoda splněná, trenére, {kg} dole. A peněženka zůstane zavřená.",
  "Trenére, {kg} je venku. Kabina bude zklamaná, že neplatím. 😂",
];
/** Prohrál sázku, platí kabině pivo. */
export const WEIGHT_FORFEIT_KABINA: readonly string[] = [
  "Kluci, prohrál jsem sázku s trenérem. Pivo je dneska na mně. 🍻",
  "Tak jo, nezhubl jsem. Dneska platím rundu, chlapi.",
  "Sázka je sázka. Kluci, pivo platím já. 🍺",
  "Prohrál jsem to s váhou i s trenérem. Kluci, jedna runda na mě.",
  "Chlapi, kila zůstala, tak aspoň pivo. Platím.",
  "Nedal jsem to, kluci. Dneska piju vodu a vy pivo na můj účet. 😅",
  "Trenér vyhrál, já platím. Na zdraví, kluci.",
  "Kluci, sázku jsem prohrál. Runda je moje, ať vám chutná.",
];
export const REWARD_KEPT_SMS: readonly string[] = [
  "Díky, trenére! Slovo platí, to se cení. 🍻",
  "Trenére, odměna dorazila. Díky moc!",
  "Díky, trenére. Nečekal jsem, že na to nezapomenete.",
  "To potěší, trenére. Díky, že jste dodržel slovo.",
  "Trenére, díky! Tohle si budu pamatovat.",
  "Odměna je doma, trenére. Vážím si toho.",
  "Díky, trenére. Takhle se dělaj dohody. 💪",
  "Trenére, díky za odměnu. Stálo to za to.",
];
export const REWARD_BROKEN_SMS: readonly string[] = [
  "Trenére, ta slíbená odměna nikde. Tak tolik k vašemu slovu.",
  "Pořád čekám na tu odměnu, trenére. Asi jste to myslel jinak.",
  "Trenére, sliboval jste odměnu. Nic. Příště už vám to nebaštím.",
  "Takže z odměny nic, trenére? No nic, budu si to pamatovat.",
  "Trenére, splnil jsem, co jste chtěl, a odměna nikde. To mě mrzí.",
  "Na tu odměnu asi můžu zapomenout, co, trenére?",
  "Trenére, slovo je slovo. Odměnu jste neposlal.",
  "Tak tolik k odměně, trenére. Dohodu jsem splnil jen já.",
];
export const REWARD_REMINDER_SMS: readonly string[] = [
  "Trenére, platí ta odměna, co jste slíbil?",
  "Jen připomínám, trenére: odměna. 😏",
  "Trenére, kdy dorazí ta slíbená odměna?",
  "Trenére, nezapomněl jste na něco? Odměna. 🍺",
  "Pořád se těším na tu odměnu, trenére.",
  "Trenére, slíbená odměna ještě nedorazila. Jen aby se neztratila.",
  "Trenére, dohoda platí, ne? Čekám na odměnu.",
  "Připomínka, trenére: odměna, kterou jste slíbil.",
];

// ─── Zápis a vyhodnocení ────────────────────────────────────────────────────

/** Váha hráče a váha bez postihu z `players.physical`. */
export async function loadWeight(db: D1Database, playerId: string): Promise<{ weight: number | null; fit: number | null }> {
  const row = await db.prepare("SELECT physical FROM players WHERE id = ?").bind(playerId).first<{ physical: string | null }>();
  const physical = lifeOf(row?.physical);
  const { fitWeight } = await import("../generators/physicals");
  return { weight: typeof physical.weight === "number" ? physical.weight : null, fit: fitWeight(physical) };
}

/**
 * Podrobnosti dohody o hubnutí při zápisu: počáteční váha a cíl. „Na normální váhu“ (kg null)
 * = shodit na váhu bez postihu. Null, když hráč váhu nemá nebo už je pod cílem.
 */
export function weightDealDetails(base: RewardDetails, weight: number | null, fit: number | null): RewardDetails | null {
  if (weight === null) return null;
  const kg = base.kg ?? (fit !== null ? Math.round((weight - fit) * 10) / 10 : null);
  if (kg === null || kg <= 0) return null;
  return { ...base, kg, startWeight: weight, targetWeight: Math.round((weight - kg) * 10) / 10 };
}

/** Poznámka pod zprávu trenéra: co hra zapsala a kolik se dá reálně shodit. */
export function weightDealNote(firstName: string, d: RewardDetails, dueAt: string, days: number): string {
  // Jen první písmeno: celé malými bylo „1 000 kč“ (E2E 22. 11.).
  const text = rewardText("weight_target", d);
  return `📝 ${firstName}: ${text.charAt(0).toLowerCase()}${text.slice(1)} (do ${datePhrase(dueAt)}, teď ${kgText(d.startWeight ?? 0)}). `
    + `Za ${days} dní se dá reálně shodit kolem ${kgText(realisticKg(days))}. Platí, až hráč kývne.`;
}

/** Hráč kývl na dohodu o hubnutí: do termínu platí slib omezit hospodu (body-drift.ts). */
export function dietPledgeStmt(db: D1Database, playerId: string, untilDay: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.dietPledgeUntil',
       CASE WHEN COALESCE(json_extract(life_context, '$.dietPledgeUntil'), '') > ?1 THEN json_extract(life_context, '$.dietPledgeUntil') ELSE ?1 END)
      WHERE id = ?2`,
  ).bind(untilDay.slice(0, 10), playerId);
}

export interface RewardRow {
  id: string; team_id: string; player_id: string; kind: RewardKind; made_at: string; due_at: string;
  details: string | null; conversation_id: string | null; club_user_id: string | null; game_date: string | null;
  first_name: string; last_name: string; nickname: string | null; avatar: string | null; last_reminder_key: string | null; roster_team_id: string | null;
}

export type RewardSettle = "pending" | "expired" | "broken" | "earned";

/** Kdy hráč připomene splatnou odměnu: v polovině lhůty na vyplacení. */
const REMINDER_AFTER_MS = 2 * DAY_MS;

/**
 * Denně: dohoda o hubnutí v termínu podle skutečné váhy, odměna za pátrání podle toho, jestli
 * hráč jméno přinesl. Splatná a nezaplacená odměna je po lhůtě porušená (vztah, výčitka).
 * Vrací, co se se slibem stalo; „earned“ znamená, že se teď objevilo tlačítko.
 */
export async function settleReward(db: D1Database, env: ChatEnv | undefined, r: RewardRow, now: Date): Promise<RewardSettle> {
  const d = rewardDetailsOf(r.details);
  const duePassed = new Date(r.due_at).getTime() < now.getTime();
  const human = !!r.club_user_id && r.club_user_id !== "ai";
  const player = { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar };
  if (d.won) {
    if (duePassed) return "broken";
    // Od zásluhy uběhly dva dny (lhůta na vyplacení je pět): hráč se jednou připomene.
    const earnedAt = new Date(r.due_at).getTime() - REWARD_PAY_DAYS * DAY_MS;
    if (human && r.last_reminder_key !== "reward" && now.getTime() - earnedAt > REMINDER_AFTER_MS) {
      const { sendPlayerTemplateSMS } = await import("./system-sms");
      await sendPlayerTemplateSMS(db, r.team_id, player, REWARD_REMINDER_SMS, { seed: `reward|${r.id}`, metadata: { type: "commitment_reminder", kind: r.kind } })
        .catch((e) => logger.warn({ module: M }, `připomínka odměny ${r.id}`, e));
      await db.prepare("UPDATE coach_commitments SET last_reminder_key = 'reward' WHERE id = ?").bind(r.id).run();
    }
    return "pending";
  }
  if (r.kind === "reward") {
    // Odměna za pátrání: rozhodne úkol „poptej se“ (deliverInquiry zapíše, jestli přinesl jméno).
    const task = await db.prepare(
      `SELECT status, json_extract(details, '$.lead') AS lead FROM coach_commitments
        WHERE player_id = ? AND kind = 'task_inquiry' AND json_extract(details, '$.incidentId') = ? ORDER BY made_at DESC LIMIT 1`,
    ).bind(r.player_id, d.incidentId ?? "").first<{ status: string; lead: number | null }>();
    if (task?.status === "active") return duePassed ? "expired" : "pending";
    if (task?.lead === 1) return "earned";
    return "expired";
  }
  // Hubnutí: hráč nekývl, dohoda neplatí.
  if (d.accepted !== true) return duePassed || d.accepted === false ? "expired" : "pending";
  if (!duePassed) return "pending";
  const { weight } = await loadWeight(db, r.player_id);
  if (weight === null) return "expired";
  const { met, lost } = weightGoalMet(d, weight);
  await db.prepare("UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.lost', ?) WHERE id = ?").bind(lost, r.id).run();
  const lostText = kgText(Math.max(0, lost));
  const hasPrize = d.reward !== undefined && d.reward !== "none";
  if (met && hasPrize) {
    if (human) await weightSms(db, env, r, `Do termínu jsi shodil ${lostText} a dohodu s trenérem jsi splnil. Připomeň mu, že ti slíbil ${rewardWhat(d)}.`, WEIGHT_WON_SMS, lostText, "weight_won");
    return "earned";
  }
  if (met) {
    if (human) await weightSms(db, env, r, `Do termínu jsi shodil ${lostText} a sázku s trenérem jsi vyhrál: pivo za kabinu platit nebudeš. Napiš mu to.`, WEIGHT_SAVED_SMS, lostText, "weight_saved");
    return "expired";
  }
  if (human) await weightSms(db, env, r, `Do termínu jsi shodil jen ${lostText} a dohodu s trenérem (${kgText(d.kg ?? 0)}) jsi nesplnil. Napiš mu to podle povahy.`, WEIGHT_FAILED_SMS, lostText, "weight_failed");
  if (d.forfeit) await payForfeit(db, r, now, human);
  return "expired";
}

async function weightSms(
  db: D1Database, env: ChatEnv | undefined, r: RewardRow, instruction: string, pool: readonly string[], kg: string, scenarioId: string,
): Promise<void> {
  const { sendEventSms } = await import("./event-sms");
  await sendEventSms(db, env, {
    clubTeamId: r.team_id, player: { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
    instruction, fallback: pool.map((t) => t.replace("{kg}", kg)), seed: `weight|${r.id}`, scenarioId, metadata: { type: "coach_reward" },
  }).catch((e) => logger.warn({ module: M }, `SMS k hubnutí ${r.id}`, e));
}

/** Prohraná sázka: hráč platí kabině rundu (nálada kabiny +1, jeho −2) a napíše to do Kabiny. */
async function payForfeit(db: D1Database, r: RewardRow, now: Date, human: boolean): Promise<void> {
  const MORALE = `life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END, '$.morale',
    MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))`;
  const teamId = r.roster_team_id ?? r.team_id;
  await db.batch([
    db.prepare(`UPDATE players SET ${MORALE} WHERE team_id = ? AND id != ? AND (status IS NULL OR status = 'active')`).bind(FORFEIT_SQUAD_MORALE, teamId, r.player_id),
    db.prepare(`UPDATE players SET ${MORALE} WHERE id = ?`).bind(FORFEIT_PLAYER_MORALE, r.player_id),
  ]).catch((e) => logger.warn({ module: M }, `prohraná sázka ${r.id}`, e));
  if (!human) return;
  const { kabinaConversationId } = await import("./coach-rules");
  const convId = await kabinaConversationId(db, r.team_id);
  const { loadOwnRecentLines, pickFreshVariant } = await import("./repetition");
  const previous = await loadOwnRecentLines(db, { playerId: r.player_id, convId, limit: 40 })
    .catch((e) => { logger.warn({ module: M }, "věty hráče v kabině", e); return [] as string[]; });
  const body = pickFreshVariant(WEIGHT_FORFEIT_KABINA, previous, `forfeit|${r.id}`).text;
  const name = `${r.first_name} ${r.last_name}`;
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
    ).bind(crypto.randomUUID(), convId, r.player_id, name, body, JSON.stringify({ kabina: true, type: "coach_reward", forfeit: true }), now.toISOString()),
    db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = ? WHERE id = ?")
      .bind(`${name}: ${body}`.slice(0, 100), now.toISOString(), convId),
  ]);
}

/**
 * Odměna je splatná: pod zprávou hráče se objeví tlačítko „Vyplatit“ a trenér má `REWARD_PAY_DAYS`
 * dní. Vrací id zprávy s tlačítkem.
 */
export async function markRewardEarned(db: D1Database, r: Pick<RewardRow, "id" | "team_id" | "player_id" | "kind" | "conversation_id" | "first_name" | "last_name" | "nickname" | "avatar" | "details">, now: Date): Promise<string | null> {
  const buttonMessageId = crypto.randomUUID();
  const upd = await db.prepare(
    `UPDATE coach_commitments SET details = json_set(COALESCE(details, '{}'), '$.won', json('true'), '$.buttonMessageId', ?), due_at = ?
      WHERE id = ? AND status = 'active'`,
  ).bind(buttonMessageId, new Date(now.getTime() + REWARD_PAY_DAYS * DAY_MS).toISOString(), r.id).run();
  if ((upd.meta?.changes ?? 0) === 0) return null;
  // Podrobnosti čerstvě z DB: `$.lost` zapsal settleReward až po načtení řádku volajícím.
  // Se starým řádkem tlačítko psalo cíl (7,2 kg) místo skutečně shozených 7,3 kg (E2E 22. 11.).
  const fresh = await db.prepare("SELECT details FROM coach_commitments WHERE id = ?").bind(r.id).first<{ details: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `podrobnosti odměny ${r.id}`, e); return null; });
  const d = rewardDetailsOf(fresh?.details ?? r.details);
  const { getOrCreatePlayerConversation } = await import("./ai-player-spawn");
  const convId = r.conversation_id ?? await getOrCreatePlayerConversation(db, r.team_id,
    { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar });
  const what = r.kind === "weight_target" ? `${r.first_name} splnil dohodu o hubnutí (${kgText(d.lost ?? d.kg ?? 0)} dole)`
    : d.incidentId ? `${r.first_name} zjistil, co jsi chtěl, a odměnu si zasloužil` : `${r.first_name}: slíbil jsi mu odměnu`;
  // Pod zprávou hráče: jeho „shodil jsem…“ píše model a uloží se až po začátku běhu (E2E 22. 11.).
  const last = await db.prepare("SELECT MAX(julianday(sent_at)) AS j FROM messages WHERE conversation_id = ?").bind(convId)
    .first<{ j: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední zpráva před tlačítkem odměny ${r.id}`, e); return null; });
  const lastMs = last?.j != null ? Math.round((last.j - 2440587.5) * DAY_MS) : 0;
  await db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read)
     VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)`,
  ).bind(buttonMessageId, convId,
    `🎁 ${what}. Odměna: ${rewardSummary(d)}, vyplatit ji musíš sám.`,
    JSON.stringify({ type: "coach_commitment", commitmentId: r.id, kind: r.kind, done: false }),
    new Date(Math.max(now.getTime(), lastMs) + 1000).toISOString()).run();
  return buttonMessageId;
}
