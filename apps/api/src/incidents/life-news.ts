/**
 * Hráč dá vědět, jak životní situace dopadla.
 *
 * Na začátku porodu hráč píše „Jedeme do porodnice. Dám vědět, jak to dopadlo.“, u nemocného
 * rodiče „Ozvu se, až to půjde.“ Po skončení situace (`ukonciSituace`, situace-db.ts) dřív
 * nepřišlo nic. Teď se ozve: z porodnice jsou doma, narodil se kluk nebo holka (jméno, váha)
 * a zve trenéra zapít malého (pozvání `baby`, casual-messages.ts: přijetí má dopad na vztah
 * a náladu a hráč pak poděkuje); u rodiče, že je doma a je to lepší, díky za pochopení.
 *
 * Doručuje hodinový běh Telefonu (`runPhoneHourly`), přes den a když hráč nespí. Text píše
 * model podle faktů, když nejede, poslouží předem napsané varianty (hráč nedostane tutéž
 * dvakrát). Fakta se uloží do `club_incidents.resolution_data`, chat o nich ví ještě týdny
 * potom (`loadRecentLifeEvent`).
 */

import { pushPhoneMessage } from "../community/phone-push";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import type { AiScenario } from "../messaging/ai-player-scenarios";
import { CASUAL_TOPICS } from "../messaging/casual-topics";
import { brokenCzech } from "../messaging/foreign-speech";
import { pickUnusedIndex } from "../messaging/repetition";
import { clubReceivesMessages } from "./club-messages";

const M = "life-news";

export type LifeNewsKind = "narozeni_ditete" | "nemocny_rodic";
export const LIFE_NEWS_KINDS: readonly LifeNewsKind[] = ["narozeni_ditete", "nemocny_rodic"];

/** Zpráva přijde nejpozději tolik herních dní po konci situace, starší se už neposílá. */
const NEWS_WINDOW_DAYS = 3;
/** Jak dlouho o tom chat ví: miminko měsíc, uzdravený rodič deset dní. */
const REMEMBER_DAYS: Record<LifeNewsKind, number> = { narozeni_ditete: 30, nemocny_rodic: 10 };
/** Kdy smí zpráva přijít (hodina v Praze). */
const FIRST_HOUR = 9;
const LAST_HOUR = 21;

export interface BabyFacts { sex: "boy" | "girl"; name: string; weightG: number }
export type ParentWho = "father" | "mother";
export interface LifeNewsData {
  baby?: BabyFacts;
  parent?: ParentWho;
  newsSentAt?: string;
  /** Kterou předem napsanou variantu hráč dostal (když model nejel). */
  newsVariant?: number;
  newsSkipped?: string;
}

const BOY_NAMES = ["Matyáš", "Jakub", "Jan", "Tomáš", "Vojtěch", "Adam", "Filip", "Ondřej", "Šimon", "Lukáš", "Antonín", "Kryštof", "Josef", "Václav"];
const GIRL_NAMES = ["Eliška", "Anna", "Tereza", "Natálie", "Adéla", "Karolína", "Ema", "Sofie", "Viktorie", "Rozálie", "Julie", "Marie", "Barbora", "Kristýna"];

/** Kdo se narodil: pohlaví, jméno, váha. Pořád stejně pro tentýž incident. */
export function babyFacts(incidentId: string): BabyFacts {
  const rng = createRng(seedFromString(`baby|${incidentId}`));
  const sex = rng.random() < 0.5 ? "boy" : "girl";
  return { sex, name: rng.pick(sex === "boy" ? BOY_NAMES : GIRL_NAMES), weightG: rng.int(285, 410) * 10 };
}

/** „3,45 kila“: váha, jak ji řekne táta. */
export function formatWeight(weightG: number): string {
  return `${String(Number((weightG / 1000).toFixed(2))).replace(".", ",")} kila`;
}

/** Který rodič je v nemocnici, podle hráčovy SMS na začátku situace. `null` = nepoznal. */
export function parentFromTexts(texts: readonly string[]): ParentWho | null {
  const t = texts.join(" ").toLowerCase();
  if (/(?<![\p{L}])(tát[auyoě]|tatínk|otc|otec)/u.test(t)) return "father";
  if (/(?<![\p{L}])(mám(a|y|ě|u|ou|o)(?![\p{L}])|mamink|matk)/u.test(t)) return "mother";
  return null;
}

/** Rodič, když ho SMS nejmenuje („rodič mi skončil v nemocnici“): los podle incidentu. */
export function seededParent(incidentId: string): ParentWho {
  return seedFromString(`parent|${incidentId}`) % 2 === 0 ? "father" : "mother";
}

const BABY_WORDS = {
  boy: { child: "kluka", sonDaughter: "syna", weighed: "vážil", healthy: "zdravej", little: "malej", littleAcc: "malýho", born: "narodil se ti syn" },
  girl: { child: "holku", sonDaughter: "dceru", weighed: "vážila", healthy: "zdravá", little: "malá", littleAcc: "malou", born: "narodila se ti dcera" },
} as const;
const PARENT_WORDS = {
  father: { parent: "táta", parentGen: "táty", parentAcc: "tátu", ended: "skončil", your: "tvůj táta" },
  mother: { parent: "máma", parentGen: "mámy", parentAcc: "mámu", ended: "skončila", your: "tvoje máma" },
} as const;

/** Předem napsané zprávy, když model nejede. Proměnné ve složených závorkách. */
export const BIRTH_NEWS_TEMPLATES = [
  "Trenére, jsme doma z porodnice! Máme {child}, jmenuje se {name}, {weight}. Máma i {little} jsou v pořádku. Stavte se to s námi zapít.",
  "Tak je to tady, trenére. Mám {sonDaughter}, jmenuje se {name} a {weighed} {weight}. Musíte se stavit zapít {littleAcc}, pivo je vychlazený.",
  "Trenére, slíbil jsem, že dám vědět: {name}, {weight}, {healthy} jako řípa. Už jsme doma. Přijďte k nám na panáka zapít {littleAcc}.",
  "Trenére, ještě se mi klepou ruce. Máme {child}, jmenuje se {name}, {weight}. Doma je teď veselo. Zastavte se zapít, rád vás uvidím.",
  "Jsme zpátky doma, trenére! {name} {weighed} {weight} a řve jak na tribuně. Stavte se zapít {littleAcc}, jinak se urazím.",
  "Trenére, máme {child}! {name}, {weight}. Pár nocí se nevyspím, ale stojí to za to. Zapijem to? Klidně se u nás stavte.",
] as const;
export const PARENT_NEWS_TEMPLATES = [
  "Trenére, {parent} je z nemocnice doma a je to lepší. Díky, že jste to chápal. Na trénink už zase chodím.",
  "Tak už je to dobrý, trenére. {parent} je doma a pomalu se z toho dostává. Dík za pochopení, zase jedu naplno.",
  "Trenére, ozývám se, jak jsem slíbil. {parent} už je mimo nemocnici a doktoři říkaj, že to bude dobrý. Díky, že jste mě nechal být u {parentGen}.",
  "Trenére, doma je zase klid, {parent} je na tom líp. Děkuju za pochopení, na trénink zase chodím normálně.",
  "Díky za trpělivost, trenére. {parent} je doma a zlepšuje se to. Teď už se zase můžu soustředit na fotbal.",
  "Trenére, {parentAcc} pustili domů, je to lepší. Díky, že jste mi dal klid. Zase se na mě můžete spolehnout.",
] as const;

function fill(template: string, values: Record<string, string>): string {
  const out = template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function templateValues(kind: LifeNewsKind, data: LifeNewsData): Record<string, string> {
  if (kind === "narozeni_ditete" && data.baby) {
    return { ...BABY_WORDS[data.baby.sex], name: data.baby.name, weight: formatWeight(data.baby.weightG) };
  }
  return { ...PARENT_WORDS[data.parent ?? "mother"] };
}

/**
 * Předem napsaná zpráva: varianta, kterou hráč ještě nedostal (`used`), vybraná podle `seed`.
 * Když dostal všechny, začne se znovu od celé nabídky.
 */
export function fallbackNews(
  kind: LifeNewsKind, data: LifeNewsData, used: readonly number[], seed: string,
): { body: string; variant: number } {
  const templates = kind === "narozeni_ditete" ? BIRTH_NEWS_TEMPLATES : PARENT_NEWS_TEMPLATES;
  const variant = pickUnusedIndex(templates.length, new Set(used), `life-news|${seed}`);
  return { body: fill(templates[variant], templateValues(kind, data)), variant };
}

/**
 * Pokyn modelu k první zprávě: co se stalo a co má napsat. Fakta přesně, nic dalšího si
 * nevymýšlet. Id, pozvání a počet replik jsou z tématu v casual-topics.ts (`life_news_*`),
 * podle kterého pak odpovídá ve vlákně.
 */
export function newsScenario(kind: LifeNewsKind, data: LifeNewsData): AiScenario {
  if (kind === "narozeni_ditete" && data.baby) {
    const w = BABY_WORDS[data.baby.sex];
    return {
      ...topicOf("life_news_baby"),
      description: "Před pár dny jsi trenérovi napsal, že jedete do porodnice, a slíbil jsi, že dáš vědět. Teď jste s miminkem doma. "
        + `Narodil${data.baby.sex === "girl" ? "a" : ""} se ti ${data.baby.sex === "girl" ? "dcera" : "syn"}, jmenuje se ${data.baby.name} `
        + `a ${w.weighed} ${formatWeight(data.baby.weightG)}. Máma i ${w.little} jsou v pořádku. Napiš mu to s radostí a pozvi ho, `
        + `ať se k vám staví zapít ${w.littleAcc}. Jméno a váhu napiš přesně takhle, nic dalšího o dítěti ani o porodu si nevymýšlej.`,
    };
  }
  const p = PARENT_WORDS[data.parent ?? "mother"];
  return {
    ...topicOf("life_news_parent"),
    description: `Před pár dny jsi trenérovi napsal, že ti ${p.parent} ${p.ended} v nemocnici a že pár dní vynecháš. `
      + `Teď je ${p.parent} doma a je to lepší. Napiš trenérovi, že je to dobré, poděkuj mu za pochopení a napiš, `
      + "že zase normálně chodíš na trénink. Žádnou diagnózu ani podrobnosti si nevymýšlej.",
  };
}

function topicOf(id: "life_news_baby" | "life_news_parent"): AiScenario {
  const topic = CASUAL_TOPICS.find((t) => t.id === id);
  if (!topic) throw new Error(`chybí téma ${id} v casual-topics.ts`);
  return topic;
}

function whenWords(days: number): string {
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  return `před ${days} dny`;
}

/** Věta do promptu chatu: co se hráči nedávno stalo. */
export function lifeEventFact(kind: LifeNewsKind, data: LifeNewsData, daysAgo: number): string {
  if (kind === "narozeni_ditete" && data.baby) {
    const w = BABY_WORDS[data.baby.sex];
    const when = whenWords(daysAgo);
    return `${when.charAt(0).toUpperCase()}${when.slice(1)} jste se vrátili z porodnice, ${w.born} ${data.baby.name} (${formatWeight(data.baby.weightG)}). `
      + "Jsi čerstvý táta, doma máte miminko.";
  }
  const p = PARENT_WORDS[data.parent ?? "mother"];
  return `${p.your.charAt(0).toUpperCase()}${p.your.slice(1)} byl${data.parent === "mother" ? "a" : ""} v nemocnici, `
    + `${whenWords(daysAgo)} ${data.parent === "mother" ? "ji" : "ho"} pustili domů a je to lepší.`;
}

function parseData(raw: string | null): LifeNewsData {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? v as LifeNewsData : {};
  } catch (e) {
    logger.warn({ module: M }, "resolution_data životní situace není JSON", e);
    return {};
  }
}

function daysBetweenIso(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000));
}

/** Hráčovy SMS k incidentu (metadata `incidentId`), z nich se pozná, který rodič je v nemocnici. */
async function parentFromStartSms(db: D1Database, teamId: string, playerId: string, incidentId: string): Promise<ParentWho | null> {
  const rows = await db.prepare(
    `SELECT m.body FROM messages m
      WHERE m.conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ?)
        AND m.sender_type = 'player' AND json_extract(m.metadata, '$.incidentId') = ?`,
  ).bind(teamId, playerId, incidentId).all<{ body: string }>()
    .catch((e) => { logger.warn({ module: M }, `SMS k nemocnému rodiči ${incidentId}`, e); return null; });
  return parentFromTexts((rows?.results ?? []).map((r) => r.body));
}

/** Fakta situace: uložená, nebo dopočítaná stejně, jak se uloží (chat i zpráva tak vždycky sedí). */
async function factsOf(
  db: D1Database, row: { id: string; team_id: string; kind: LifeNewsKind; subject_player_id: string; resolution_data: string | null },
): Promise<LifeNewsData> {
  const data = parseData(row.resolution_data);
  if (row.kind === "narozeni_ditete") return { ...data, baby: data.baby ?? babyFacts(row.id) };
  return { ...data, parent: data.parent ?? (await parentFromStartSms(db, row.team_id, row.subject_player_id, row.id)) ?? seededParent(row.id) };
}

/**
 * Co se hráči nedávno stalo a skončilo (porod, rodič z nemocnice), pro prompt chatu. Bez toho
 * by po „máme kluka Matyáše“ prompt dál říkal „nevymýšlej si narození dítěte“ a hráč by to zapřel.
 */
export async function loadRecentLifeEvent(
  db: D1Database, teamId: string, playerId: string,
): Promise<{ kind: LifeNewsKind; fact: string } | undefined> {
  const row = await db.prepare(
    `SELECT i.id, i.team_id, i.kind, i.subject_player_id, i.resolution_data, i.resolved_on, t.game_date
       FROM club_incidents i JOIN teams t ON t.id = i.team_id
      WHERE i.team_id = ? AND i.status = 'uzavreny' AND i.subject_player_id = ? AND i.category = 'zivotni'
        AND i.kind IN ('narozeni_ditete', 'nemocny_rodic') AND i.resolution = 'skoncila'
      ORDER BY i.resolved_on DESC LIMIT 1`,
  ).bind(teamId, playerId).first<{
    id: string; team_id: string; kind: LifeNewsKind; subject_player_id: string; resolution_data: string | null;
    resolved_on: string | null; game_date: string | null;
  }>()
    .catch((e) => { logger.warn({ module: M }, `nedávná životní událost ${playerId}`, e); return null; });
  if (!row?.resolved_on || !row.game_date) return undefined;
  const daysAgo = daysBetweenIso(row.resolved_on, row.game_date);
  if (daysAgo > REMEMBER_DAYS[row.kind]) return undefined;
  return { kind: row.kind, fact: lifeEventFact(row.kind, await factsOf(db, row), daysAgo) };
}

function pragueHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now)) % 24;
}

interface PendingNews {
  id: string; team_id: string; kind: LifeNewsKind; subject_player_id: string; resolution_data: string | null;
}

/** Zapíše do `resolution_data` (jen když zpráva ještě neodešla, ať ji dva běhy nepošlou dvakrát). */
async function claimNews(db: D1Database, id: string, patch: LifeNewsData): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE club_incidents SET resolution_data = json_patch(COALESCE(resolution_data, '{}'), ?)
      WHERE id = ? AND json_extract(resolution_data, '$.newsSentAt') IS NULL`,
  ).bind(JSON.stringify(patch), id).run()
    .catch((e) => { logger.error({ module: M }, `zápis zprávy o situaci ${id}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

/** Varianty předem napsaných zpráv, které hráč už dostal u dřívějších situací stejného druhu. */
async function usedVariants(db: D1Database, playerId: string, kind: LifeNewsKind): Promise<number[]> {
  const rows = await db.prepare(
    `SELECT json_extract(resolution_data, '$.newsVariant') AS v FROM club_incidents
      WHERE subject_player_id = ? AND kind = ? AND json_extract(resolution_data, '$.newsVariant') IS NOT NULL`,
  ).bind(playerId, kind).all<{ v: number }>()
    .catch((e) => { logger.warn({ module: M }, `použité varianty zprávy ${playerId}`, e); return null; });
  return (rows?.results ?? []).map((r) => Number(r.v));
}

export interface LifeNewsEnv {
  GEMINI_API_KEY?: string;
  CACHE_KV?: KVNamespace;
  AI?: Ai;
  SEED_DATA?: R2Bucket;
}

/** Zprávy o skončených situacích. Volá hodinový běh Telefonu. */
export async function deliverLifeNews(
  db: D1Database, env: LifeNewsEnv & Parameters<typeof pushPhoneMessage>[1], now: Date = new Date(),
): Promise<{ sent: number; waiting: number; skipped: number }> {
  const out = { sent: 0, waiting: 0, skipped: 0 };
  const hour = pragueHour(now);
  if (hour < FIRST_HOUR || hour > LAST_HOUR) return out;
  const rows = await db.prepare(
    `SELECT i.id, i.team_id, i.kind, i.subject_player_id, i.resolution_data
       FROM club_incidents i JOIN teams t ON t.id = i.team_id
      WHERE i.category = 'zivotni' AND i.kind IN ('narozeni_ditete', 'nemocny_rodic') AND i.status = 'uzavreny'
        AND i.resolution = 'skoncila' AND i.subject_player_id IS NOT NULL
        AND json_extract(i.resolution_data, '$.newsSentAt') IS NULL
        AND substr(i.resolved_on, 1, 10) >= date(substr(t.game_date, 1, 10), ?)
      LIMIT 20`,
  ).bind(`-${NEWS_WINDOW_DAYS} days`).all<PendingNews>()
    .catch((e) => { logger.warn({ module: M }, "skončené situace ke zprávě", e); return null; });
  for (const row of rows?.results ?? []) {
    try {
      const r = await deliverOne(db, env, row, now);
      out[r]++;
    } catch (e) {
      logger.warn({ module: M, teamId: row.team_id }, `zpráva o situaci ${row.id}`, e);
    }
  }
  return out;
}

async function deliverOne(
  db: D1Database, env: LifeNewsEnv & Parameters<typeof pushPhoneMessage>[1], row: PendingNews, now: Date,
): Promise<"sent" | "waiting" | "skipped"> {
  const sentAt = now.toISOString();
  const { playerInClub } = await import("../messaging/player-reach");
  if (!(await clubReceivesMessages(db, row.team_id))) {
    await claimNews(db, row.id, { newsSentAt: sentAt, newsSkipped: "ai_club" });
    return "skipped";
  }
  if (!(await playerInClub(db, row.subject_player_id, row.team_id))) {
    await claimNews(db, row.id, { newsSentAt: sentAt, newsSkipped: "player_left" });
    return "skipped";
  }

  const spawn = await import("../messaging/ai-player-spawn");
  const { GeminiUnavailableError, generateInitialMessage, playerTimeContext } = await import("../messaging/ai-player-chat");
  const playerRow = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.nationality, p.age, p.position, p.team_id, p.loan_from_team_id,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity, ${spawn.INJURY_COLUMN}
       FROM players p WHERE p.id = ?`,
  ).bind(row.subject_player_id).first<Record<string, unknown>>();
  if (!playerRow) return "skipped";
  const playerTeamId = (playerRow.team_id as string | null) ?? row.team_id;
  const player = spawn.loadPlayerSnapshot(playerRow, await spawn.loadLastMatchContext(db, playerTeamId));
  // Kdo spí, ozve se, až se vzbudí (další hodinový běh).
  if (playerTimeContext(player, now).situace === "spi") return "waiting";

  const data = await factsOf(db, row);
  const facts: LifeNewsData = row.kind === "narozeni_ditete" ? { baby: data.baby } : { parent: data.parent };
  if (!(await claimNews(db, row.id, { ...facts, newsSentAt: sentAt }))) return "skipped";

  const convId = await spawn.getOrCreatePlayerConversation(db, row.team_id, {
    id: player.id, firstName: player.firstName, lastName: player.lastName,
    nickname: playerRow.nickname as string | null, avatar: playerRow.avatar as string | null,
  });
  const scenario = newsScenario(row.kind, facts);
  const team = await spawn.loadTeamContext(db, row.team_id, playerTeamId);
  const { loadOwnRecentLines } = await import("../messaging/repetition");
  player.ownRecentLines = await loadOwnRecentLines(db, { playerId: player.id, convId });
  player.recentLifeEvent = { kind: row.kind, fact: lifeEventFact(row.kind, facts, 0) };

  let body: string | null = null;
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (await isAiEnabled(env)) {
    try {
      body = await generateInitialMessage(env, player, scenario, team, now);
      // Jméno dítěte musí sedět s tím, co si hra pamatuje: jinak raději předem napsaná zpráva.
      if (facts.baby && !body.includes(facts.baby.name)) {
        logger.warn({ module: M, teamId: row.team_id }, `model ve zprávě o porodu vynechal jméno ${facts.baby.name}: ${body}`);
        body = null;
      }
    } catch (e) {
      // Slib „dám vědět“ platí i bez modelu: pošle se předem napsaná zpráva.
      logger.warn({ module: M, teamId: row.team_id }, `${e instanceof GeminiUnavailableError ? "model nedostupný" : "chyba modelu"} pro zprávu o situaci ${row.id}`, e);
    }
  }
  if (!body) {
    const fallback = fallbackNews(row.kind, facts, await usedVariants(db, player.id, row.kind), row.id);
    body = brokenCzech(fallback.body, player.nationality ?? null, `${player.id}|${fallback.body}`);
    await db.prepare("UPDATE club_incidents SET resolution_data = json_set(resolution_data, '$.newsVariant', ?) WHERE id = ?")
      .bind(fallback.variant, row.id).run()
      .catch((e) => logger.warn({ module: M }, `varianta zprávy o situaci ${row.id}`, e));
  }

  const { postPlayerMessageStmts } = await import("../messaging/follow-ups");
  const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?")
    .bind(convId).first<{ ai_thread_active: number; ai_thread_state: string | null }>();
  const stmts = postPlayerMessageStmts(db, {
    convId, player, body, now: sentAt,
    metadata: { ai_generated: true, scenario_id: scenario.id, turn: 0, type: "incident", incidentId: row.id, life_news: true },
    preview: body.slice(0, 100),
  });
  // Rozjetý rozhovor zpráva nepřepíše; trenér na ni odpoví v něm a pozvání platí i tak.
  if (conv?.ai_thread_active !== 1) {
    const { carryWeightTalk } = await import("../season/weight-talk");
    stmts.push(db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ?, ai_thread_last_at = ? WHERE id = ? AND ai_thread_active != 1")
      .bind(JSON.stringify({
        trigger: scenario.id, scenario_id: scenario.id, max_replies: scenario.expectedTurns, current_replies: 0,
        awaiting: "coach", initiated_at: sentAt, player_id: player.id, casual: true, resolution: null,
        ...carryWeightTalk(conv?.ai_thread_state ?? null),
      }), sentAt, convId));
  }
  const written = await db.batch(stmts).then(() => true)
    .catch((e) => { logger.error({ module: M, teamId: row.team_id }, `zápis zprávy o situaci ${row.id}`, e); return false; });
  if (!written) {
    // Zpráva neodešla: příští hodinový běh to zkusí znovu.
    await db.prepare("UPDATE club_incidents SET resolution_data = json_remove(resolution_data, '$.newsSentAt') WHERE id = ?").bind(row.id).run()
      .catch((e) => logger.error({ module: M }, `vrácení zprávy o situaci ${row.id} k odeslání`, e));
    return "waiting";
  }
  if (scenario.invite) {
    const { openInvite } = await import("../messaging/casual-messages");
    await openInvite(env.CACHE_KV, convId, { kind: scenario.invite, topicId: scenario.id, teamId: row.team_id, playerId: player.id, playerFirstName: player.firstName });
  }
  await pushPhoneMessage(db, env, { teamId: row.team_id, convId, sender: `${player.firstName} ${player.lastName}`, text: body });
  logger.info({ module: M, teamId: row.team_id }, `zpráva o situaci ${row.kind}: ${player.firstName} ${player.lastName}`);
  return "sent";
}
