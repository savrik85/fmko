/**
 * Druhý život legend v databázi (F5).
 *
 * 1. Háček za souboji „kdo zůstane“ (season-duels.ts `decideSeasonDuels`, jedno místo pro
 *    člověka i AI trenéra): před smazáním hráče `loadLegendSnapshot`, po úspěšném odchodu
 *    `recordLegendCandidate`. Zapíše jen kandidáta, žádný model, žádná SMS.
 * 2. Hodinový běh Telefonu (`tickLegends` z casual-messages.ts `runPhoneHourly`):
 *    - klub dostane za sezónu nejvýš jednu legendu (kdo tam byl nejdéle), roli vybere model
 *      z volných rolí podle věku a povahy, pravidlo je záloha; vznikne postava v okrese
 *      (sudí, vůdce kotle, hospodský, trenér žáků), článek `legend_farewell` a SMS od redakce,
 *    - za dva až čtyři dny první SMS legendy bývalému trenérovi (`ex-<id hráče>`),
 *    - sudí-legenda ohlásí, že bývalému klubu píská, a občas napíše jen tak.
 * 3. Trenér odpovídá v Telefonu (routes/messaging.ts), legenda odepíše přes model (`replyToLegendMessage`).
 *
 * Opakovaný běh nic nezdvojí: kandidát má UNIQUE hráče, přidělení se zabírá podmíněným UPDATE,
 * postavy mají deterministická id, článek pevné id a každá SMS se zabírá před odesláním.
 */
import { logger } from "../lib/logger";
import { aiContextFromEnv, generateText, type AiContext } from "../lib/ai-provider";
import { cleanDashes } from "../lib/dashes";
import { seedFromString } from "../lib/seed";
import { createRng } from "../generators/rng";
import { REFEREE_ARCHETYPES, type RefereeArchetype } from "../engine/referee";
import { FAN_LEADER_ARCHETYPES, type FanLeaderArchetype } from "../engine/fan-groups";
import { ensureReferees, normalizeDistrict } from "../referees/referee-generator";
import { ensureFanGroups } from "../fans/fan-group-generator";
import { activeSeasonNumber } from "../transfers/unrest";
import type { OptionalPushKeys } from "../community/phone-push";
import {
  buildFarewellPrompt, buildLegendReplyPrompt, buildLegendSmsPrompt, buildRolePrompt, checkFarewell, checkLegendSms,
  fallbackFarewell, fallbackLegendReply, fallbackLegendRole, fallbackLegendSms, firstSmsDelayHours, isLegend, isLegendRole,
  legendParticipantId, legendRank, parseRoleAnswer, parseTraits, POSITION_WORDS, seasonsInClub,
  type LegendFacts, type LegendRole, type LegendSmsContext, type LegendTopic, type LegendTraits,
} from "./legends";

const M = "legends";
export const LEGEND_NEWS_DESK = "Redakce Zpravodaje";
/** Postavy legend mají vlastní předpony id, podle nich se pozná, že místo už legenda drží. */
export const LEGEND_REFEREE_PREFIX = "ref-lg-";
export const LEGEND_FAN_LEADER_PREFIX = "fl-lg-";
export const LEGEND_STAFF_PREFIX = "st-lg-";

/** Telefon legend jen přes den (Praha). Občasné SMS ještě užší okno. */
const DAY_START = 7;
const DAY_END = 22;
const CHAT_START = 9;
const CHAT_END = 21;
/** Háček zapisuje kandidáty klubu v jednom požadavku; po pěti minutách jsou všichni. */
const CANDIDATE_SETTLE_MS = 5 * 60_000;
/** Přidělení, které nikdo nedokončil (pád workeru), se po čtvrthodině převezme. */
const CLAIM_TTL_MS = 15 * 60_000;
const MAX_CLUBS_PER_RUN = 5;
const MAX_FIRST_SMS_PER_RUN = 20;
/** Za sezónu v okrese nejvýš tolik nových sudích a hospodských z legend (kotel a žáci mají meze v klubu). */
const MAX_REFEREE_LEGENDS_PER_SEASON = 2;
const MAX_PUB_LEGENDS_PER_SEASON = 1;
const REFEREE_MAX_AGE = 50;
/** Občasná SMS nejdřív tolik dní po předchozí a jen trenérovi, který byl nedávno ve hře. */
export const LEGEND_SMS_GAP_DAYS = 10;
export const LEGEND_HOURLY_CHANCE = 0.04;
const ACTIVE_COACH_DAYS = 7;
const MODEL_TIMEOUT_MS = 20_000;

export type LegendEnv = {
  CACHE_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
  AI?: Ai;
  AI_GATEWAY_URL?: string;
} & OptionalPushKeys;

// ── Háček za souboji ────────────────────────────────────────────────────────

export interface LegendSnapshot {
  playerId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  avatar: string | null;
  age: number;
  position: string;
  overallRating: number;
  personality: string;
  occupation: string | null;
  teamId: string;
  coachUserId: string | null;
  parentTeamId: string | null;
  district: string | null;
  /** Sezóna, ve které začala aktivní smlouva s klubem (player_contracts → seasons.number). */
  joinedSeason: number | null;
}

/** Snímek hráče PŘED odchodem (removePlayer řádek smaže a smlouvu ukončí). */
export async function loadLegendSnapshot(db: D1Database, playerId: string, teamId: string): Promise<LegendSnapshot | null> {
  const r = await db.prepare(
    `SELECT p.first_name, p.last_name, p.nickname, p.avatar, p.age, p.position, p.overall_rating, p.personality,
            CASE WHEN json_valid(p.life_context) THEN json_extract(p.life_context, '$.occupation') END AS occupation,
            t.user_id, t.parent_team_id, v.district,
            (SELECT MIN(s.number) FROM player_contracts pc JOIN seasons s ON s.id = pc.season_id
              WHERE pc.player_id = p.id AND pc.team_id = p.team_id AND pc.is_active = 1) AS joined_season
       FROM players p JOIN teams t ON t.id = p.team_id LEFT JOIN villages v ON v.id = t.village_id
      WHERE p.id = ? AND p.team_id = ?`,
  ).bind(playerId, teamId).first<{
    first_name: string; last_name: string; nickname: string | null; avatar: string | null; age: number; position: string;
    overall_rating: number | null; personality: string | null; occupation: unknown; user_id: string | null;
    parent_team_id: string | null; district: string | null; joined_season: number | null;
  }>();
  if (!r) return null;
  return {
    playerId,
    firstName: r.first_name,
    lastName: r.last_name,
    nickname: r.nickname ?? null,
    avatar: r.avatar ?? null,
    age: r.age ?? 0,
    position: r.position,
    overallRating: r.overall_rating ?? 0,
    personality: r.personality ?? "{}",
    occupation: typeof r.occupation === "string" ? r.occupation : null,
    teamId,
    coachUserId: r.user_id ?? null,
    parentTeamId: r.parent_team_id ?? null,
    district: r.district ?? null,
    joinedSeason: r.joined_season ?? null,
  };
}

/**
 * Zapíše kandidáta na legendu po úspěšném odchodu. `finishedSeason` = sezóna, po které odešel.
 * Vrací true, když vznikl nový záznam (mladý hráč nebo opakovaný háček = false).
 * Dorost (U21, parent_team_id) legendy nemá.
 */
export async function recordLegendCandidate(db: D1Database, snap: LegendSnapshot, finishedSeason: number, now: Date = new Date()): Promise<boolean> {
  if (snap.parentTeamId || !snap.district) return false;
  const seasons = seasonsInClub(finishedSeason, snap.joinedSeason);
  if (!isLegend({ age: snap.age, seasonsInClub: seasons })) return false;
  const due = new Date(now.getTime() + firstSmsDelayHours(seedFromString(snap.playerId)) * 3600_000);
  const res = await db.prepare(
    `INSERT OR IGNORE INTO legends
       (id, departed_player_id, first_name, last_name, nickname, avatar, age, position, overall_rating, personality, occupation,
        seasons_in_club, former_team_id, coach_user_id, district, season_number, status, first_sms_due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    `lg-${snap.playerId}`, snap.playerId, snap.firstName, snap.lastName, snap.nickname, snap.avatar, snap.age, snap.position,
    snap.overallRating, snap.personality, snap.occupation, seasons, snap.teamId, snap.coachUserId,
    normalizeDistrict(snap.district), finishedSeason, due.toISOString(), now.toISOString(),
  ).run();
  return (res.meta?.changes ?? 0) === 1;
}

// ── Hodinový běh ────────────────────────────────────────────────────────────

interface LegendRow {
  id: string;
  departed_player_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  avatar: string | null;
  age: number;
  position: string | null;
  overall_rating: number | null;
  personality: string;
  occupation: string | null;
  seasons_in_club: number;
  former_team_id: string;
  coach_user_id: string | null;
  district: string;
  season_number: number;
  status: string;
  role: string | null;
  entity_id: string | null;
  decided_by: string | null;
  role_reason: string | null;
  news_id: string | null;
  first_sms_due_at: string | null;
  first_sms_at: string | null;
  last_sms_at: string | null;
  last_whistle_match_id: string | null;
}

/** Řádek legendy s klubem, kterému píše. */
interface LegendWithTeam extends LegendRow {
  team_name: string;
  team_user_id: string | null;
  team_game_date: string | null;
}

interface ClubInfo {
  id: string;
  name: string;
  league_id: string | null;
  user_id: string | null;
  game_date: string | null;
}

export interface LegendTickResult { assigned: number; skipped: number; firstSms: number; whistle: number; sms: number }

export interface LegendTickOpts {
  /** null = AI vypnutá (pravidlo a připravené texty); bez hodnoty se vezme z env. */
  ai?: AiContext | null;
  /** Kostka pro občasné SMS (testy). */
  rng?: () => number;
}

function pragueHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now);
  return Number(h) % 24;
}

async function askModel(ai: AiContext | null, prompt: string, maxTokens: number, temperature: number): Promise<string | null> {
  if (!ai || ai.provider === "off") return null;
  return generateText(ai, prompt, { json: true, maxTokens, temperature, module: M, timeoutMs: MODEL_TIMEOUT_MS })
    .catch((e) => { logger.warn({ module: M }, "volání modelu pro legendu", e); return null; });
}

function modelOn(ai: AiContext | null): boolean {
  return !!ai && ai.provider !== "off";
}

export async function tickLegends(db: D1Database, env: LegendEnv, now: Date = new Date(), opts: LegendTickOpts = {}): Promise<LegendTickResult> {
  const out: LegendTickResult = { assigned: 0, skipped: 0, firstSms: 0, whistle: 0, sms: 0 };
  const hour = pragueHour(now);
  if (hour < DAY_START || hour >= DAY_END) return out;
  const ai = opts.ai !== undefined
    ? opts.ai
    : await aiContextFromEnv(env).catch((e) => { logger.warn({ module: M }, "AI kontext pro legendy", e); return null; });
  const rng = opts.rng ?? Math.random;

  try {
    const r = await assignPendingLegends(db, ai, now);
    out.assigned = r.assigned;
    out.skipped = r.skipped;
  } catch (e) {
    logger.warn({ module: M }, "přidělení rolí legendám", e);
  }
  try {
    out.firstSms = await sendFirstSms(db, env, ai, now);
  } catch (e) {
    logger.warn({ module: M }, "první SMS legend", e);
  }
  try {
    out.whistle = await sendWhistleNotices(db, env, ai, now);
  } catch (e) {
    logger.warn({ module: M }, "sudí-legenda píská bývalému klubu", e);
  }
  if (hour >= CHAT_START && hour < CHAT_END) {
    try {
      out.sms = await sendOccasionalSms(db, env, ai, now, rng);
    } catch (e) {
      logger.warn({ module: M }, "občasné SMS legend", e);
    }
  }
  if (out.assigned || out.firstSms || out.whistle || out.sms) {
    logger.info({ module: M }, `legendy: ${out.assigned} nových, ${out.skipped} bez role, SMS ${out.firstSms} prvních / ${out.whistle} sudí / ${out.sms} občas`);
  }
  return out;
}

// ── Přidělení role ──────────────────────────────────────────────────────────

async function assignPendingLegends(db: D1Database, ai: AiContext | null, now: Date): Promise<{ assigned: number; skipped: number }> {
  const settle = new Date(now.getTime() - CANDIDATE_SETTLE_MS).toISOString();
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const groups = await db.prepare(
    `SELECT former_team_id, season_number FROM legends
      WHERE (status = 'pending' AND created_at <= ?1) OR (status = 'assigning' AND claimed_at < ?2)
      GROUP BY former_team_id, season_number ORDER BY MIN(created_at) LIMIT ?3`,
  ).bind(settle, stale, MAX_CLUBS_PER_RUN).all<{ former_team_id: string; season_number: number }>();
  let assigned = 0;
  let skipped = 0;
  for (const g of groups.results) {
    try {
      const r = await assignClubLegend(db, ai, g.former_team_id, g.season_number, now, settle, stale);
      assigned += r.assigned;
      skipped += r.skipped;
    } catch (e) {
      logger.warn({ module: M, teamId: g.former_team_id }, "legenda klubu", e);
    }
  }
  return { assigned, skipped };
}

async function skipRows(db: D1Database, ids: string[], reason: string): Promise<number> {
  if (ids.length === 0) return 0;
  await db.batch(ids.map((id) => db.prepare(
    "UPDATE legends SET status = 'skipped', role_reason = COALESCE(role_reason, ?) WHERE id = ? AND status IN ('pending', 'assigning')",
  ).bind(reason, id)));
  return ids.length;
}

/** Klub dostane za sezónu nejvýš jednu legendu: kdo tam byl nejdéle a dostane volnou roli. */
async function assignClubLegend(
  db: D1Database, ai: AiContext | null, teamId: string, season: number, now: Date, settle: string, stale: string,
): Promise<{ assigned: number; skipped: number }> {
  const has = await db.prepare("SELECT 1 FROM legends WHERE former_team_id = ? AND season_number = ? AND status = 'active' LIMIT 1")
    .bind(teamId, season).first();
  if (has) {
    const rest = await db.prepare("SELECT id FROM legends WHERE former_team_id = ? AND season_number = ? AND status IN ('pending', 'assigning')")
      .bind(teamId, season).all<{ id: string }>();
    return { assigned: 0, skipped: await skipRows(db, rest.results.map((r) => r.id), "klub už legendu má") };
  }

  const claimAt = now.toISOString();
  const claimed = await db.prepare(
    `UPDATE legends SET status = 'assigning', claimed_at = ?1
      WHERE former_team_id = ?2 AND season_number = ?3
        AND ((status = 'pending' AND created_at <= ?4) OR (status = 'assigning' AND claimed_at < ?5))`,
  ).bind(claimAt, teamId, season, settle, stale).run();
  if (!(claimed.meta?.changes ?? 0)) return { assigned: 0, skipped: 0 };

  const rows = (await db.prepare("SELECT * FROM legends WHERE former_team_id = ? AND season_number = ? AND status = 'assigning' AND claimed_at = ?")
    .bind(teamId, season, claimAt).all<LegendRow>()).results;
  // Rozjeté přidělení (role už vybraná) má přednost, ať se nevybírá znovu a nevznikne druhá postava.
  rows.sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0)
    || legendRank({ seasonsInClub: b.seasons_in_club, age: b.age, overallRating: b.overall_rating ?? 0 })
    - legendRank({ seasonsInClub: a.seasons_in_club, age: a.age, overallRating: a.overall_rating ?? 0 }));

  const team = await db.prepare("SELECT id, name, league_id, user_id, game_date FROM teams WHERE id = ?").bind(teamId).first<ClubInfo>();
  if (!team) return { assigned: 0, skipped: await skipRows(db, rows.map((r) => r.id), "klub už neexistuje") };

  let winner: string | null = null;
  let skipped = 0;
  for (const row of rows) {
    if (await assignOne(db, ai, row, team)) {
      winner = row.id;
      break;
    }
    skipped++;
  }
  const rest = rows.filter((r) => r.id !== winner).map((r) => r.id);
  await skipRows(db, rest, "klub už legendu má");
  return { assigned: winner ? 1 : 0, skipped: rest.length };
}

interface RoleOptions {
  roles: LegendRole[];
  pub: { id: number; name: string } | null;
}

async function countSeasonRole(db: D1Database, row: LegendRow, role: LegendRole): Promise<number> {
  const r = await db.prepare(
    `SELECT COUNT(*) AS n FROM legends
      WHERE district = ? AND season_number = ? AND role = ? AND status IN ('active', 'assigning') AND id != ?`,
  ).bind(row.district, row.season_number, role, row.id).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Které role jsou pro legendu volné. Pořadí jako LEGEND_ROLES. */
async function availableRoles(db: D1Database, row: LegendRow, team: ClubInfo): Promise<RoleOptions> {
  const roles: LegendRole[] = [];
  let pub: RoleOptions["pub"] = null;

  if (row.age <= REFEREE_MAX_AGE && await countSeasonRole(db, row, "referee") < MAX_REFEREE_LEGENDS_PER_SEASON) roles.push("referee");

  const groups = await ensureFanGroups(db, team.id);
  const kotel = groups.find((g) => g.kind === "kotel");
  if (kotel && !(kotel.leader_id ?? "").startsWith(LEGEND_FAN_LEADER_PREFIX)) roles.push("fan_leader");

  if (await countSeasonRole(db, row, "pub_owner") < MAX_PUB_LEGENDS_PER_SEASON) {
    // Nejdřív hospoda, jejíž majitel ještě nevznikl; jinak legenda hospodu převezme.
    pub = await db.prepare(
      `SELECT ds.id, ds.name FROM district_sponsors ds LEFT JOIN sponsor_owners so ON so.sponsor_id = ds.id
        WHERE ds.district = ? AND ds.type = 'pub'
          AND NOT EXISTS (SELECT 1 FROM legends l WHERE l.role = 'pub_owner' AND l.status IN ('active', 'assigning')
                            AND l.entity_id = CAST(ds.id AS TEXT) AND l.id != ?)
        ORDER BY (so.sponsor_id IS NOT NULL), ds.id LIMIT 1`,
    ).bind(row.district, row.id).first<{ id: number; name: string }>() ?? null;
    if (pub) roles.push("pub_owner");
  }

  const coach = await db.prepare("SELECT 1 FROM staff_members WHERE team_id = ? AND role = 'trener_mladeze' LIMIT 1").bind(team.id).first();
  if (!coach) roles.push("youth_coach");

  return { roles, pub };
}

function entityIdFor(role: LegendRole, playerId: string, pub: RoleOptions["pub"]): string | null {
  switch (role) {
    case "referee": return `${LEGEND_REFEREE_PREFIX}${playerId}`;
    case "fan_leader": return `${LEGEND_FAN_LEADER_PREFIX}${playerId}`;
    case "youth_coach": return `${LEGEND_STAFF_PREFIX}${playerId}`;
    case "pub_owner": return pub ? String(pub.id) : null;
  }
}

async function placeOf(db: D1Database, role: LegendRole | null, entityId: string | null, district: string, teamName: string): Promise<string> {
  if (role === "referee") return `okres ${district}`;
  if (role === "pub_owner" && entityId) {
    const pub = await db.prepare("SELECT name FROM district_sponsors WHERE id = ?").bind(Number(entityId)).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "název hospody legendy", e); return null; });
    return pub?.name ?? "v okrese";
  }
  return teamName;
}

function factsOf(row: LegendRow, teamName: string, role: LegendRole | null, place: string): LegendFacts {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    age: row.age,
    position: row.position ?? "",
    seasonsInClub: row.seasons_in_club,
    teamName,
    role,
    place,
    traits: parseTraits(row.personality),
  };
}

/** Vybere roli, založí postavu, vydá článek a pošle SMS od redakce. false = bez role (skipped). */
async function assignOne(db: D1Database, ai: AiContext | null, row: LegendRow, team: ClubInfo): Promise<boolean> {
  const traits = parseTraits(row.personality);
  let role: LegendRole | null = isLegendRole(row.role) ? row.role : null;
  let entityId = row.entity_id;

  if (!role) {
    const options = await availableRoles(db, row, team);
    if (options.roles.length === 0) {
      await skipRows(db, [row.id], "žádná volná role v okrese");
      return false;
    }
    const places: Partial<Record<LegendRole, string>> = { pub_owner: options.pub?.name, referee: `okres ${row.district}` };
    const facts = factsOf(row, team.name, null, "");
    const answer = parseRoleAnswer(await askModel(ai, buildRolePrompt(facts, options.roles, places), 200, 0.4), options.roles);
    let decidedBy = "model";
    let reason = answer?.reason ?? "";
    role = answer?.role ?? null;
    if (!role) {
      role = fallbackLegendRole(row.age, traits, options.roles);
      decidedBy = "rule";
      reason = "pravidlo podle věku a povahy";
      if (modelOn(ai)) logger.warn({ module: M, teamId: team.id }, `model nevybral platnou roli pro legendu ${row.id}, rozhodlo pravidlo: ${role}`);
    }
    if (!role) {
      await skipRows(db, [row.id], "žádná volná role v okrese");
      return false;
    }
    entityId = entityIdFor(role, row.departed_player_id, options.pub);
    // Role se zapíše před založením postavy: převzaté přidělení ji použije a nevybírá znovu.
    await db.prepare("UPDATE legends SET role = ?, entity_id = ?, decided_by = ?, role_reason = ? WHERE id = ? AND status = 'assigning'")
      .bind(role, entityId, decidedBy, reason, row.id).run();
  }

  const created = entityId ? await createRoleEntity(db, row, role, entityId, team, traits) : false;
  if (!created) {
    logger.warn({ module: M, teamId: team.id }, `postava legendy ${row.id} (${role}) nevznikla, místo je obsazené`);
    await skipRows(db, [row.id], "místo pro roli mezitím obsadil někdo jiný");
    return false;
  }

  const place = await placeOf(db, role, entityId, row.district, team.name);
  const facts = factsOf(row, team.name, role, place);
  let newsId: string | null = null;
  try {
    const article = await publishFarewell(db, ai, row, team, facts);
    if (article) {
      newsId = article.newsId;
      await notifyFarewell(db, team, article.newsId, article.headline);
    }
  } catch (e) {
    logger.warn({ module: M, teamId: team.id }, `rozloučení s legendou ${row.id}`, e);
  }
  await db.prepare("UPDATE legends SET status = 'active', news_id = COALESCE(?, news_id) WHERE id = ? AND status = 'assigning'")
    .bind(newsId, row.id).run();
  return true;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLocaleLowerCase("cs-CZ") + s.slice(1) : s;
}

/** Avatar hráče s jinými barvami oblečení (sudí nosí černou se žlutou). */
function recolorAvatar(raw: string | null, colors: string[]): string {
  try {
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    const face = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    return JSON.stringify({ ...face, teamColors: colors });
  } catch (e) {
    logger.warn({ module: M }, "nečitelný avatar legendy", e);
    return JSON.stringify({ teamColors: colors });
  }
}

/** Sudí z legendy: puntičkář, pohodář, nebo nováček. Extrémy (kohout, cvok, domácí kamarád) zůstávají v okrese po jednom. */
export function legendRefereeArchetype(t: LegendTraits): RefereeArchetype {
  if (t.discipline >= 70) return "puntickar";
  if (t.discipline < 40 || t.alcohol >= 65) return "pohodar";
  return "zelenac";
}

function ownerPersonality(t: LegendTraits): "patriot" | "cautious" | "fan" {
  if (t.patriotism >= 65) return "patriot";
  if (t.discipline >= 70) return "cautious";
  return "fan";
}

/**
 * Založí postavu v okrese. Idempotentní: deterministické id (INSERT OR IGNORE), hospoda upsertem.
 * Sudí se vkládá až po `ensureReferees`: základní listina okresu musí být celá dřív, jinak by
 * řádek legendy shodil počítadlo a listina by se nedoplnila. Jména ani id stávajících sudích se nemění.
 */
async function createRoleEntity(db: D1Database, row: LegendRow, role: LegendRole, entityId: string, team: ClubInfo, t: LegendTraits): Promise<boolean> {
  const rng = createRng(seedFromString(`legend|${role}|${row.departed_player_id}`));
  const position = POSITION_WORDS[row.position ?? ""] ?? "hráč";

  if (role === "referee") {
    await ensureReferees(db, row.district);
    const archetype = legendRefereeArchetype(t);
    const def = REFEREE_ARCHETYPES[archetype];
    const r = (range: readonly [number, number]) => rng.int(range[0], range[1]);
    await db.prepare(
      `INSERT OR IGNORE INTO referees
        (id, district, first_name, last_name, nickname, gender, age, occupation, archetype,
         strictness, card_happiness, experience, home_bias, advantage, fitness, avatar, bio, hlaska)
       VALUES (?, ?, ?, ?, ?, 'm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      entityId, row.district, row.first_name, row.last_name, row.nickname, row.age,
      row.occupation ? lowerFirst(row.occupation) : rng.pick(def.occupations), archetype,
      r(def.strictness), r(def.cardHappiness), r(def.experience), r(def.homeBias), r(def.advantage), r(def.fitness),
      recolorAvatar(row.avatar, ["#1A1A1A", "#F5C542", "#FFFFFF"]),
      `Dřív ${position} klubu ${team.name}, po konci kariéry vzal píšťalku. Tvrdí, že bývalému klubu nenadržuje.`,
      "Žádná protekce. Ani pro své.",
    ).run();
    return !!(await db.prepare("SELECT 1 FROM referees WHERE id = ?").bind(entityId).first());
  }

  if (role === "fan_leader") {
    const groups = await ensureFanGroups(db, team.id);
    const kotel = groups.find((g) => g.kind === "kotel");
    if (!kotel) return false;
    const archetype: FanLeaderArchetype = row.age < 28 ? "mlady_radikal" : "stary_kapo";
    const def = FAN_LEADER_ARCHETYPES[archetype];
    const stmts: D1PreparedStatement[] = [
      db.prepare(
        `INSERT OR IGNORE INTO fan_leaders
          (id, group_id, team_id, first_name, last_name, nickname, gender, age, occupation, archetype,
           charisma, radikalnost, vyjednavani, avatar, bio, hlaska, sentiment, duvod)
         VALUES (?, ?, ?, ?, ?, ?, 'm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        entityId, kotel.id, team.id, row.first_name, row.last_name, row.nickname, row.age,
        row.occupation ? lowerFirst(row.occupation) : rng.pick(def.occupations), archetype,
        clamp(45 + t.leadership * 0.45, def.charisma[0] - 15, 95),
        clamp(15 + t.temper * 0.35 + t.aggression * 0.25, 10, 90),
        clamp(30 + t.discipline * 0.4, 20, 85),
        row.avatar ?? "{}",
        `Dřív kopal za ${team.name}, teď stojí v kotli za brankou. Hráče zná z kabiny a nic jim neodpustí.`,
        "Já tady kopal, tak mi neříkejte, jak se fandí.",
        t.patriotism >= 60 ? 20 : 0,
        "Bývalý hráč klubu, kotel ho vzal za svého.",
      ),
    ];
    if (kotel.leader_id && kotel.leader_id !== entityId) {
      // Dosavadní vůdce předá kotel legendě (řádek zůstává kvůli historii zpráv).
      stmts.push(db.prepare(
        "UPDATE fan_leaders SET status = 'retired', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND team_id = ?",
      ).bind(kotel.leader_id, team.id));
    }
    stmts.push(db.prepare("UPDATE fan_groups SET leader_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(entityId, kotel.id));
    await db.batch(stmts);
    return !!(await db.prepare("SELECT 1 FROM fan_leaders WHERE id = ?").bind(entityId).first());
  }

  if (role === "pub_owner") {
    const sponsorId = Number(entityId);
    if (!Number.isInteger(sponsorId)) return false;
    await db.prepare(
      `INSERT INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sponsor_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
         age = excluded.age, face_config = excluded.face_config, personality = excluded.personality`,
    ).bind(sponsorId, row.first_name, row.last_name, row.age, row.avatar ?? "{}", ownerPersonality(t)).run();
    return true;
  }

  // Trenér žáků: jen do volného místa (unikátní slot na roli v klubu), zadarmo, z lásky ke klubu.
  await db.prepare(
    `INSERT OR IGNORE INTO staff_members
      (id, district, team_id, role, profession, first_name, last_name, gender, age,
       coaching, medicine, maintenance, judgement, communication, work_rate, charm,
       weekly_wage, signing_fee, avatar, description, hired_at)
     VALUES (?, ?, ?, 'trener_mladeze', 'trener_mladeze', ?, ?, 'm', ?, ?, 3, 4, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
  ).bind(
    entityId, row.district, team.id, row.first_name, row.last_name, row.age,
    clamp(5 + t.leadership / 16 + t.workRate / 25, 4, 12),
    clamp(4 + t.discipline / 14, 3, 11),
    clamp(6 + t.leadership / 14 + t.patriotism / 40, 5, 14),
    clamp(4 + t.workRate / 12, 3, 12),
    clamp(4 + t.leadership / 20, 3, 10),
    row.avatar ?? "{}",
    "bývalý hráč klubu, žáky trénuje zadarmo",
    (team.game_date ?? new Date().toISOString()).slice(0, 10),
  ).run();
  return !!(await db.prepare("SELECT 1 FROM staff_members WHERE id = ? AND team_id = ?").bind(entityId, team.id).first());
}

// ── Zpravodaj ───────────────────────────────────────────────────────────────

async function publishFarewell(db: D1Database, ai: AiContext | null, row: LegendRow, team: ClubInfo, facts: LegendFacts): Promise<{ newsId: string; headline: string } | null> {
  if (!team.league_id) return null;
  const newsId = `legend-${row.departed_player_id}`;
  const existing = await db.prepare("SELECT headline FROM news WHERE id = ?").bind(newsId).first<{ headline: string }>();
  if (existing) return { newsId, headline: existing.headline };

  const fromModel = checkFarewell(await askModel(ai, buildFarewellPrompt(facts), 700, 0.8), facts);
  if (!fromModel && modelOn(ai)) logger.warn({ module: M, teamId: team.id }, `článek o legendě ${row.id} od modelu neprošel, beru připravený`);
  const article = fromModel ?? fallbackFarewell(facts);
  const season = (await activeSeasonNumber(db)) ?? row.season_number;
  await db.prepare(
    `INSERT OR IGNORE INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
     VALUES (?, ?, ?, 'legend_farewell', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).bind(newsId, team.league_id, team.id, article.headline, article.body, season).run();
  return { newsId, headline: article.headline };
}

function isHuman(userId: string | null): boolean {
  return !!userId && userId !== "ai";
}

/** SMS od redakce bývalému klubu s tlačítkem na článek. Klub, který ji k článku má, se přeskočí. */
async function notifyFarewell(db: D1Database, team: ClubInfo, newsId: string, headline: string): Promise<void> {
  if (!isHuman(team.user_id)) return;
  const already = await db.prepare(
    `SELECT 1 FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.team_id = ? AND c.type = 'system' AND c.title = ? AND json_extract(m.metadata, '$.newsId') = ? LIMIT 1`,
  ).bind(team.id, LEGEND_NEWS_DESK, newsId).first();
  if (already) return;
  const { sendSystemSMS } = await import("../messaging/system-sms");
  await sendSystemSMS(db, team.id, LEGEND_NEWS_DESK, cleanDashes(`📰 Ve Zpravodaji vyšlo rozloučení s legendou: „${headline}“`), {
    type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId,
  });
}

// ── Telefon ─────────────────────────────────────────────────────────────────

/** Legenda píše jen trenérovi, který ji nechal odejít, a jen lidskému. */
function writesToCoach(row: LegendWithTeam): boolean {
  return isHuman(row.team_user_id) && (!row.coach_user_id || row.coach_user_id === row.team_user_id);
}

async function legendConversation(db: D1Database, teamId: string, row: LegendRow): Promise<string> {
  const participantId = legendParticipantId(row.departed_player_id);
  const existing = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
    .bind(teamId, participantId).first<{ id: string }>();
  if (existing) return existing.id;
  const convId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO conversations
      (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count, last_message_text, last_message_at, created_at)
     VALUES (?, ?, 'system', ?, ?, ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).bind(convId, teamId, `${row.first_name} ${row.last_name}`, participantId, row.avatar).run();
  return convId;
}

async function postLegendMessage(db: D1Database, env: LegendEnv, teamId: string, row: LegendRow, body: string): Promise<string> {
  const convId = await legendConversation(db, teamId, row);
  const name = `${row.first_name} ${row.last_name}`;
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, legendParticipantId(row.departed_player_id), name, body, JSON.stringify({ type: "legend", legendId: row.id })),
    db.prepare(
      `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
         last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    ).bind(body.slice(0, 100), convId),
  ]);
  const { pushPhoneMessage } = await import("../community/phone-push");
  await pushPhoneMessage(db, env, { teamId, convId, sender: name, text: body });
  return convId;
}

async function loadHistory(db: D1Database, teamId: string, row: LegendRow, limit: number): Promise<NonNullable<LegendSmsContext["history"]>> {
  const res = await db.prepare(
    `SELECT m.sender_type, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.participant_id = ?
      ORDER BY m.sent_at DESC, m.rowid DESC LIMIT ?`,
  ).bind(teamId, legendParticipantId(row.departed_player_id), limit).all<{ sender_type: string; body: string }>();
  return res.results.reverse().map((m) => ({ from: m.sender_type === "user" ? "coach" as const : "legend" as const, body: m.body }));
}

async function writeLegendSms(
  db: D1Database, ai: AiContext | null, row: LegendWithTeam, topic: LegendTopic, ctx: LegendSmsContext, seed: number,
): Promise<string> {
  const role = isLegendRole(row.role) ? row.role : null;
  const facts = factsOf(row, row.team_name, role, await placeOf(db, role, row.entity_id, row.district, row.team_name));
  const fromModel = checkLegendSms(await askModel(ai, buildLegendSmsPrompt(facts, topic, ctx, seed), 256, 0.85));
  if (!fromModel && modelOn(ai)) logger.warn({ module: M, teamId: row.former_team_id }, `SMS legendy ${row.id} od modelu neprošla, beru připravenou`);
  return fromModel ?? fallbackLegendSms(facts, topic, seed, ctx);
}

const LEGEND_TEAM_SELECT = `SELECT l.*, t.name AS team_name, t.user_id AS team_user_id, t.game_date AS team_game_date
  FROM legends l JOIN teams t ON t.id = l.former_team_id`;

/** První SMS pár dní po odchodu. Zabírá se před odesláním, takže druhý běh ji nepošle znovu. */
async function sendFirstSms(db: D1Database, env: LegendEnv, ai: AiContext | null, now: Date): Promise<number> {
  const iso = now.toISOString();
  const rows = await db.prepare(
    `${LEGEND_TEAM_SELECT} WHERE l.status = 'active' AND l.first_sms_at IS NULL AND l.first_sms_due_at <= ? ORDER BY l.first_sms_due_at LIMIT ?`,
  ).bind(iso, MAX_FIRST_SMS_PER_RUN).all<LegendWithTeam>();
  let sent = 0;
  for (const row of rows.results) {
    const claim = await db.prepare("UPDATE legends SET first_sms_at = ?1, last_sms_at = ?1 WHERE id = ?2 AND first_sms_at IS NULL")
      .bind(iso, row.id).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    // AI klub nebo klub s jiným trenérem: legenda nemá komu psát, jen se odbaví.
    if (!writesToCoach(row)) continue;
    try {
      const history = await loadHistory(db, row.former_team_id, row, 6);
      const body = await writeLegendSms(db, ai, row, "first", { history }, seedFromString(row.id));
      await postLegendMessage(db, env, row.former_team_id, row, body);
      await db.prepare("UPDATE legends SET sms_count = sms_count + 1 WHERE id = ?").bind(row.id).run();
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: row.former_team_id }, `první SMS legendy ${row.id}`, e);
    }
  }
  return sent;
}

const WEEKDAY_PHRASES = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];

function pragueWeekdayPhrase(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "v sobotu";
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", weekday: "short" }).format(d);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  return WEEKDAY_PHRASES[idx >= 0 ? idx : 6];
}

/** Sudí-legenda delegovaný na zápas bývalého klubu to trenérovi napíše, jednou za zápas. */
async function sendWhistleNotices(db: D1Database, env: LegendEnv, ai: AiContext | null, now: Date): Promise<number> {
  const season = await activeSeasonNumber(db);
  if (season == null) return 0;
  const rows = await db.prepare(
    `SELECT l.*, t.name AS team_name, t.user_id AS team_user_id, t.game_date AS team_game_date,
            m.id AS match_id, sc.scheduled_at,
            CASE WHEN m.home_team_id = l.former_team_id THEN aw.name ELSE hm.name END AS opponent
       FROM legends l
       JOIN teams t ON t.id = l.former_team_id
       JOIN matches m ON m.referee_id = l.entity_id
       JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN teams hm ON hm.id = m.home_team_id
       JOIN teams aw ON aw.id = m.away_team_id
      WHERE l.status = 'active' AND l.role = 'referee' AND l.first_sms_at IS NOT NULL
        AND (m.home_team_id = l.former_team_id OR m.away_team_id = l.former_team_id)
        AND m.status != 'simulated' AND sc.season_number = ?
        AND sc.scheduled_at >= substr(t.game_date, 1, 10)
        AND sc.scheduled_at <= strftime('%Y-%m-%dT%H:%M:%SZ', t.game_date, '+7 days')
        AND COALESCE(l.last_whistle_match_id, '') != m.id
      LIMIT 20`,
  ).bind(season).all<LegendWithTeam & { match_id: string; scheduled_at: string; opponent: string }>();
  let sent = 0;
  for (const row of rows.results) {
    const claim = await db.prepare(
      "UPDATE legends SET last_whistle_match_id = ?1, last_sms_at = ?2 WHERE id = ?3 AND COALESCE(last_whistle_match_id, '') != ?1",
    ).bind(row.match_id, now.toISOString(), row.id).run();
    if (!(claim.meta?.changes ?? 0) || !writesToCoach(row)) continue;
    try {
      const ctx: LegendSmsContext = {
        whistle: { opponent: row.opponent, day: pragueWeekdayPhrase(row.scheduled_at) },
        history: await loadHistory(db, row.former_team_id, row, 6),
      };
      const body = await writeLegendSms(db, ai, row, "whistle", ctx, seedFromString(`${row.id}|${row.match_id}`));
      await postLegendMessage(db, env, row.former_team_id, row, body);
      await db.prepare("UPDATE legends SET sms_count = sms_count + 1 WHERE id = ?").bind(row.id).run();
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: row.former_team_id }, `SMS sudí-legendy ${row.id} o zápase ${row.match_id}`, e);
    }
  }
  return sent;
}

async function nextOpponent(db: D1Database, row: LegendWithTeam): Promise<string | undefined> {
  if (!row.team_game_date) return undefined;
  const season = await activeSeasonNumber(db);
  if (season == null) return undefined;
  const r = await db.prepare(
    `SELECT CASE WHEN m.home_team_id = ?1 THEN aw.name ELSE hm.name END AS opponent
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN teams hm ON hm.id = m.home_team_id JOIN teams aw ON aw.id = m.away_team_id
      WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND m.status != 'simulated'
        AND sc.season_number = ?2 AND sc.scheduled_at >= ?3
      ORDER BY sc.scheduled_at LIMIT 1`,
  ).bind(row.former_team_id, season, row.team_game_date.slice(0, 10)).first<{ opponent: string }>()
    .catch((e) => { logger.warn({ module: M }, "příští soupeř bývalého klubu", e); return null; });
  return r?.opponent ?? undefined;
}

/** Občas jen tak: nejdřív po LEGEND_SMS_GAP_DAYS, trenérovi, který je ve hře, jedna SMS na klub za běh. */
async function sendOccasionalSms(db: D1Database, env: LegendEnv, ai: AiContext | null, now: Date, rng: () => number): Promise<number> {
  const iso = now.toISOString();
  const gap = new Date(now.getTime() - LEGEND_SMS_GAP_DAYS * 86400_000).toISOString();
  const rows = await db.prepare(
    `${LEGEND_TEAM_SELECT} JOIN users u ON u.id = t.user_id
      WHERE l.status = 'active' AND l.first_sms_at IS NOT NULL AND t.user_id != 'ai'
        AND (l.coach_user_id IS NULL OR l.coach_user_id = t.user_id)
        AND COALESCE(l.last_sms_at, l.first_sms_at) < ?1
        AND julianday(u.last_activity_at) > julianday(?2) - ?3
      ORDER BY l.last_sms_at LIMIT 50`,
  ).bind(gap, iso, ACTIVE_COACH_DAYS).all<LegendWithTeam>();
  const teamsDone = new Set<string>();
  let sent = 0;
  for (const row of rows.results) {
    if (teamsDone.has(row.former_team_id) || rng() >= LEGEND_HOURLY_CHANCE) continue;
    const claim = await db.prepare(
      "UPDATE legends SET last_sms_at = ?1, sms_count = sms_count + 1 WHERE id = ?2 AND COALESCE(last_sms_at, first_sms_at) < ?3",
    ).bind(iso, row.id, gap).run();
    if (!(claim.meta?.changes ?? 0)) continue;
    teamsDone.add(row.former_team_id);
    try {
      const ctx: LegendSmsContext = { history: await loadHistory(db, row.former_team_id, row, 6), nextOpponent: await nextOpponent(db, row) };
      const body = await writeLegendSms(db, ai, row, "chat", ctx, seedFromString(`${row.id}|${iso}`));
      await postLegendMessage(db, env, row.former_team_id, row, body);
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: row.former_team_id }, `občasná SMS legendy ${row.id}`, e);
    }
  }
  return sent;
}

/**
 * Trenér napsal legendě (routes/messaging.ts, předpona `ex-`): odpověď přes model, bez modelu
 * připravená věta. `pace` dočká zbytek prodlevy „píše…“. false = legenda neexistuje nebo
 * nepatří tomuhle klubu (volající vrátí kredit).
 */
export async function replyToLegendMessage(
  db: D1Database,
  env: LegendEnv,
  msg: { teamId: string; convId: string; departedPlayerId: string; text: string },
  pace: () => Promise<void>,
  aiOverride?: AiContext | null,
): Promise<boolean> {
  const row = await db.prepare(`${LEGEND_TEAM_SELECT} WHERE l.departed_player_id = ? AND l.status = 'active'`)
    .bind(msg.departedPlayerId).first<LegendWithTeam>();
  if (!row || row.former_team_id !== msg.teamId) return false;
  const ai = aiOverride !== undefined
    ? aiOverride
    : await aiContextFromEnv(env).catch((e) => { logger.warn({ module: M }, "AI kontext pro odpověď legendy", e); return null; });

  const history = await loadHistory(db, msg.teamId, row, 12);
  // Zprávu trenéra už routa uložila; do promptu jde zvlášť jako poslední zpráva.
  const last = history[history.length - 1];
  if (last && last.from === "coach" && last.body === msg.text) history.pop();
  const role = isLegendRole(row.role) ? row.role : null;
  const facts = factsOf(row, row.team_name, role, await placeOf(db, role, row.entity_id, row.district, row.team_name));
  const fromModel = checkLegendSms(await askModel(ai, buildLegendReplyPrompt(facts, history, msg.text), 256, 0.85));
  if (!fromModel && modelOn(ai)) logger.warn({ module: M, teamId: msg.teamId }, `odpověď legendy ${row.id} od modelu neprošla, beru připravenou`);
  const body = fromModel ?? fallbackLegendReply(seedFromString(`${msg.convId}|${msg.text}|${history.length}`));
  await pace();
  await postLegendMessage(db, env, msg.teamId, row, body);
  await db.prepare("UPDATE legends SET last_sms_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
  return true;
}
