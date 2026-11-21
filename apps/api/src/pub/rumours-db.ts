/**
 * Drby o přestupech (F10) v databázi: signály, zápis drbu, SMS hospodského, odpověď trenéra
 * (tlačítko nebo volný text), dopady a lhůta. Pravidla a texty jsou v `rumours.ts`.
 *
 * Volá se z hospody (`season/pub.ts`): večer bez trenéra i návštěva s trenérem. Jeden drb na
 * klub a den (`pub_rumours`, unikátní team_id + game_date), takže opakovaný běh hospody ani
 * návštěva s trenérem druhý drb ani druhou SMS nepřidá. Model se nepoužívá: texty jsou šablony,
 * odpověď rozpozná `classifyRumourReply`, takže vypnutá AI nic nezastaví.
 *
 * Konverzace je hospodského (titul „Hospodský“, stejná jako u ostatních jeho SMS). Dostane
 * `participant_id = pk-<teamId>`, podle kterého routes/messaging.ts pozná odpověď na drb.
 */

import { createRng } from "../generators/rng";
import { SMS_ROLE_HOSPODSKY } from "../incidents/nastaveni";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import type { PubIncident } from "../season/pub";
import {
  addDays, calmPlayerSms, classifyRumourReply, isRumourChoice, pickRumour, RUMOUR_ANSWER_DAYS, RUMOUR_CALM_DAYS, RUMOUR_HYPE_DAYS,
  RUMOUR_HYPE_PCT, RUMOUR_MORALE_CALM, RUMOUR_MORALE_PUBLISH, RUMOUR_OPTIONS, RUMOUR_REPEAT_DAYS, RUMOUR_REPLIES, rumourArticle,
  rumourHypeMultiplier, rumourSms, type Rumour, type RumourChoice, type RumourPlayer, type RumourRng, type RumourSignal,
  type RumourSignalKind, type RumourWorld,
} from "./rumours";

const M = "pub-rumours";
export const PUB_KEEPER_TITLE = SMS_ROLE_HOSPODSKY;
export const PUB_KEEPER_PREFIX = "pk-";
const NEWS_DESK = "Redakce Zpravodaje";
/** Cizí skaut, který skončil před týdnem, se v hospodě ještě probírá. */
const SCOUT_MEMORY_DAYS = 7;
/** Pondělní kurz AI klubu platí nejvýš tolik dní (jako v ai-coach/transfer-market.ts). */
const PLAN_MAX_AGE_DAYS = 8;
/** Běh trhu AI klubu, ze kterého se ví o nedoručené nabídce. */
const MARKET_MEMORY_DAYS = 7;
/** Cizí hráč s takovou nespokojeností si v hospodě stěžuje. */
const UNHAPPY_LEVEL = 40;
const IN_CHUNK = 90;

/** Platný JSON z `life_context`, rozbitý se nahradí prázdným objektem (jinak by json_set spadl). */
const LC = "CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END";

export interface RumourPubContext {
  teamId: string;
  /** Herní den hospody (`pub_sessions.game_date`). */
  gameDate: string;
  /** Trenér sedí u stolu: drby slyší dvakrát častěji. */
  coach: boolean;
  /** Hráči klubu u stolu (bez hostů). Bez nich a bez trenéra drb nikdo neuslyší. */
  localAttendees: number;
}

interface TeamRow {
  id: string;
  name: string;
  user_id: string | null;
  parent_team_id: string | null;
  league_id: string | null;
  season: number | null;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  team_id: string;
  overall_rating: number | null;
}

interface RumourRow {
  id: string;
  team_id: string;
  game_date: string;
  season_number: number | null;
  subject: "own" | "foreign";
  signal: RumourSignalKind;
  player_id: string;
  club_team_id: string;
  is_true: number;
  text: string;
  status: "pending" | "published" | "calmed" | "expired" | "tip";
  conv_id: string | null;
  news_id: string | null;
  expires_on: string | null;
}

function toPlayer(r: PlayerRow): RumourPlayer {
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name, position: r.position ?? "MID", teamId: r.team_id,
    rating: Number(r.overall_rating) || 0,
  };
}

function parseJson<T>(raw: string | null | undefined, what: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${what})`, e);
    return null;
  }
}

interface WeeklyPlan {
  stance?: unknown;
  focus?: unknown;
  sellIds?: unknown;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Co se kolem klubu děje a manažer to nevidí, a s kým se dá drb poskládat. Jedna dávka dotazů,
 * pak jeden dotaz na hráče, které chtějí AI kluby pustit. Null = klub drby nedostává.
 */
export async function loadRumourWorld(db: D1Database, teamId: string, day: string): Promise<{ world: RumourWorld; team: TeamRow } | null> {
  const league = "(SELECT league_id FROM teams WHERE id = ?)";
  const res = await db.batch([
    db.prepare(
      `SELECT t.id, t.name, t.user_id, t.parent_team_id, t.league_id,
              (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1) AS season
         FROM teams t WHERE t.id = ?`,
    ).bind(teamId),
    db.prepare(
      `SELECT id, first_name, last_name, position, team_id, overall_rating FROM players
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(teamId),
    db.prepare(
      `SELECT id, name FROM teams WHERE league_id = ${league} AND id != ? AND parent_team_id IS NULL`,
    ).bind(teamId, teamId),
    // Cizí skaut na mého hráče (úkol skauta na jednoho hráče). Vlastní U21 se nepočítá.
    db.prepare(
      `SELECT sa.target_player_id AS player_id, sa.team_id AS club_id, t.name AS club_name
         FROM scout_assignments sa
         JOIN players p ON p.id = sa.target_player_id
         JOIN teams t ON t.id = sa.team_id
        WHERE p.team_id = ? AND COALESCE(t.parent_team_id, t.id) != ? AND sa.assignment_type = 'player'
          AND (sa.status = 'active' OR COALESCE(sa.closed_at, '') >= ?)`,
    ).bind(teamId, teamId, addDays(day, -SCOUT_MEMORY_DAYS)),
    // Pondělní přestupní kurz AI klubů soutěže: koho shánějí a koho chtějí pustit.
    db.prepare(
      `SELECT d.team_id,
              CASE WHEN json_valid(d.actions) THEN json_extract(d.actions, '$.transferPlan') END AS plan,
              CASE WHEN json_valid(d.actions) THEN json_extract(d.actions, '$.at') END AS at
         FROM ai_coach_decisions d JOIN teams t ON t.id = d.team_id
        WHERE t.league_id = ${league} AND t.user_id = 'ai' AND d.kind = 'weekly' AND d.mode != 'shadow' AND d.created_at >= ?
        ORDER BY d.created_at DESC`,
    ).bind(teamId, addDays(day, -PLAN_MAX_AGE_DAYS)),
    // Běh trhu AI klubů: nabídka na mého hráče, která ke mně nedorazila (nanečisto, nepovedla se).
    db.prepare(
      `SELECT d.team_id, d.actions, d.executed
         FROM ai_coach_decisions d JOIN teams t ON t.id = d.team_id
        WHERE t.league_id = ${league} AND t.user_id = 'ai' AND d.kind = 'transfer_market' AND d.created_at >= ?`,
    ).bind(teamId, addDays(day, -MARKET_MEMORY_DAYS)),
    // Nespokojení hráči jiných klubů soutěže.
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.position, p.team_id, p.overall_rating
         FROM players p JOIN teams t ON t.id = p.team_id
        WHERE t.league_id = ${league} AND t.id != ? AND t.parent_team_id IS NULL AND (p.status IS NULL OR p.status = 'active')
          AND (CASE WHEN json_valid(p.life_context) THEN json_extract(p.life_context, '$.transferUnrest.level') END) >= ?
        LIMIT 20`,
    ).bind(teamId, teamId, UNHAPPY_LEVEL),
    // S kým se dá cizí drb splést: nejlepší hráči jiných klubů soutěže.
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.position, p.team_id, p.overall_rating
         FROM players p JOIN teams t ON t.id = p.team_id
        WHERE t.league_id = ${league} AND t.id != ? AND t.parent_team_id IS NULL AND (p.status IS NULL OR p.status = 'active')
        ORDER BY p.overall_rating DESC, p.id LIMIT 60`,
    ).bind(teamId, teamId),
    db.prepare(
      "SELECT player_id, status FROM pub_rumours WHERE team_id = ? AND (game_date >= ? OR status = 'pending')",
    ).bind(teamId, addDays(day, -RUMOUR_REPEAT_DAYS)),
  ]);
  const [teamRes, ownRes, clubsRes, scoutRes, planRes, marketRes, unhappyRes, poolRes, recentRes] = res;
  const team = teamRes.results[0] as TeamRow | undefined;
  // Jen lidské áčko v soutěži: AI klub SMS nečte, U21 má trenéra áčka, článek potřebuje soutěž.
  if (!team || !team.user_id || team.user_id === "ai" || team.parent_team_id || !team.league_id) return null;

  const ownPlayers = (ownRes.results as unknown as PlayerRow[]).map(toPlayer);
  const ownIds = new Set(ownPlayers.map((p) => p.id));
  const clubs = new Map((clubsRes.results as Array<{ id: string; name: string }>).map((c) => [c.id, { id: c.id, name: c.name }] as const));
  const foreign = new Map<string, RumourPlayer>();
  for (const r of poolRes.results as unknown as PlayerRow[]) foreign.set(r.id, toPlayer(r));
  for (const r of unhappyRes.results as unknown as PlayerRow[]) foreign.set(r.id, toPlayer(r));
  const signals: RumourSignal[] = [];

  for (const r of scoutRes.results as Array<{ player_id: string; club_id: string; club_name: string }>) {
    if (!clubs.has(r.club_id)) clubs.set(r.club_id, { id: r.club_id, name: r.club_name });
    signals.push({ kind: "scout", playerId: r.player_id, clubId: r.club_id });
  }

  // Nejnovější platný kurz každého AI klubu.
  const plans = new Map<string, WeeklyPlan>();
  const since = addDays(day, -PLAN_MAX_AGE_DAYS);
  for (const r of planRes.results as Array<{ team_id: string; plan: string | null; at: string | null }>) {
    if (plans.has(r.team_id) || !r.plan || !r.at || r.at.slice(0, 10) < since) continue;
    const plan = parseJson<WeeklyPlan>(r.plan, `kurz AI klubu ${r.team_id}`);
    if (plan) plans.set(r.team_id, plan);
  }
  const bestAt = new Map<string, RumourPlayer>();
  for (const p of ownPlayers) {
    const cur = bestAt.get(p.position);
    if (!cur || (p.rating ?? 0) > (cur.rating ?? 0)) bestAt.set(p.position, p);
  }
  const sellWanted = new Map<string, string>();
  for (const [clubId, plan] of plans) {
    if (plan.stance === "buy") {
      for (const pos of strings(plan.focus)) {
        const best = bestAt.get(pos);
        if (best) signals.push({ kind: "ai_interest", playerId: best.id, clubId });
      }
    }
    for (const id of strings(plan.sellIds)) sellWanted.set(id, clubId);
  }

  for (const r of marketRes.results as Array<{ team_id: string; actions: string | null; executed: string | null }>) {
    const actions = parseJson<Array<{ kind?: string; playerId?: string }>>(r.actions, `trh AI klubu ${r.team_id}`) ?? [];
    const executed = parseJson<Array<{ result?: string }>>(r.executed, `výsledky trhu AI klubu ${r.team_id}`) ?? [];
    actions.forEach((a, i) => {
      if (!a || !a.playerId || !ownIds.has(a.playerId)) return;
      if (a.kind !== "offer" && a.kind !== "bid" && a.kind !== "loan_request") return;
      // Doručená nabídka leží manažerovi v Přestupech, to už žádný drb není.
      if (Array.isArray(executed) && executed[i]?.result === "sent") return;
      signals.push({ kind: "ai_interest", playerId: a.playerId, clubId: r.team_id });
    });
  }

  // Hráči, které chtějí AI kluby pustit: jen ti, kdo v tom klubu pořád hrají.
  const sellIds = [...sellWanted.keys()];
  for (let i = 0; i < sellIds.length; i += IN_CHUNK) {
    const chunk = sellIds.slice(i, i + IN_CHUNK);
    const rows = await db.prepare(
      `SELECT id, first_name, last_name, position, team_id, overall_rating FROM players
        WHERE id IN (${chunk.map(() => "?").join(",")}) AND (status IS NULL OR status = 'active')`,
    ).bind(...chunk).all<PlayerRow>();
    for (const r of rows.results) {
      if (sellWanted.get(r.id) !== r.team_id) continue;
      foreign.set(r.id, toPlayer(r));
      signals.push({ kind: "ai_sell", playerId: r.id, clubId: r.team_id });
    }
  }
  for (const r of unhappyRes.results as unknown as PlayerRow[]) {
    signals.push({ kind: "unhappy", playerId: r.id, clubId: r.team_id });
  }

  const recent = recentRes.results as Array<{ player_id: string; status: string }>;
  return {
    team,
    world: {
      teamId,
      ownPlayers,
      foreignPlayers: [...foreign.values()],
      clubs: [...clubs.values()],
      signals,
      recentPlayers: new Set(recent.map((r) => r.player_id)),
      ownPending: recent.some((r) => r.status === "pending"),
    },
  };
}

function incidentOf(r: Pick<RumourRow, "subject" | "player_id" | "text">): PubIncident {
  return {
    type: "transfer_rumour",
    playerIds: r.subject === "own" ? [r.player_id] : [],
    text: `Hospodský zaslechl drb o přestupu. ${r.text}`,
    effects: [],
  };
}

async function postKeeper(db: D1Database, convId: string, body: string, opts: { unread?: boolean; metadata?: Record<string, unknown> } = {}): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, PUB_KEEPER_TITLE, body, opts.metadata ? JSON.stringify(opts.metadata) : null),
    db.prepare(
      `UPDATE conversations SET last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
         unread_count = unread_count + ? WHERE id = ?`,
    ).bind(body.slice(0, 100), opts.unread === false ? 0 : 1, convId),
  ]);
}

/**
 * Konverzace hospodského. Hledá se stejně jako v `sendSystemSMS` (podle titulu), ať jeho SMS
 * zůstanou v jednom vlákně; dostane `participant_id`, podle kterého se pozná odpověď na drb.
 */
export async function pubKeeperConversation(db: D1Database, teamId: string): Promise<string> {
  const participantId = `${PUB_KEEPER_PREFIX}${teamId}`;
  const row = await db.prepare(
    "SELECT id, participant_id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?",
  ).bind(teamId, PUB_KEEPER_TITLE).first<{ id: string; participant_id: string | null }>();
  if (row) {
    if (!row.participant_id) {
      await db.prepare("UPDATE conversations SET participant_id = ? WHERE id = ? AND participant_id IS NULL").bind(participantId, row.id).run();
    }
    return row.id;
  }
  const convId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO conversations (id, team_id, type, title, participant_id, pinned, unread_count, last_message_text, last_message_at, created_at)
     VALUES (?, ?, 'system', ?, ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).bind(convId, teamId, PUB_KEEPER_TITLE, participantId).run();
  return convId;
}

/** Zavře čekání na odpověď, jen když vlákno čeká právě na drb. */
async function closeRumourThread(db: D1Database, convId: string): Promise<void> {
  await db.prepare(
    `UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL
      WHERE id = ? AND ai_thread_active = 1
        AND (CASE WHEN json_valid(ai_thread_state) THEN json_extract(ai_thread_state, '$.kind') END) = 'pub_rumour'`,
  ).bind(convId).run();
}

/** SMS hospodského o novém drbu. Drb o vlastním hráči otevře vlákno s tlačítky. */
async function announceRumour(db: D1Database, id: string, teamId: string, r: Rumour): Promise<void> {
  const body = rumourSms(r);
  if (r.subject === "foreign") {
    await sendSystemSMS(db, teamId, PUB_KEEPER_TITLE, body, { type: "guide", href: `/hrac/${r.playerId}`, label: "Otevřít hráče" });
    return;
  }
  const convId = await pubKeeperConversation(db, teamId);
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, PUB_KEEPER_TITLE, body, JSON.stringify({ type: "pub_rumour", rumourId: id, options: RUMOUR_OPTIONS })),
    db.prepare(
      `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
         last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), ai_thread_active = 1, ai_thread_state = ?
       WHERE id = ?`,
    ).bind(body.slice(0, 100), JSON.stringify({ kind: "pub_rumour", rumourId: id, awaiting: "coach" }), convId),
    db.prepare("UPDATE pub_rumours SET conv_id = ? WHERE id = ?").bind(convId, id),
  ]);
}

/** Čekající drb vyšumí (jednou) a vlákno přestane čekat. Vrací, jestli to byl tento běh. */
async function expireOne(db: D1Database, rumourId: string, convId: string | null): Promise<boolean> {
  const claimed = await db.prepare(
    "UPDATE pub_rumours SET status = 'expired', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND status = 'pending'",
  ).bind(rumourId).run();
  if (!claimed.meta.changes) return false;
  if (convId) await closeRumourThread(db, convId);
  return true;
}

/** Drby, na které trenér do lhůty neodpověděl, vyšumí: nic se nestane, vlákno se zavře. */
export async function expireRumours(db: D1Database, teamId: string, day: string): Promise<number> {
  const rows = await db.prepare(
    "SELECT id, conv_id FROM pub_rumours WHERE team_id = ? AND status = 'pending' AND expires_on < ?",
  ).bind(teamId, day.slice(0, 10)).all<{ id: string; conv_id: string | null }>();
  let expired = 0;
  for (const r of rows.results) {
    if (!(await expireOne(db, r.id, r.conv_id))) continue;
    expired++;
    if (r.conv_id) await postKeeper(db, r.conv_id, RUMOUR_REPLIES.expired, { unread: false });
  }
  return expired;
}

/**
 * Drb pro dnešní večer v hospodě. Vrací příhodu do deníku hospody, nebo null. Dnešní drb,
 * který už existuje, vrátí znovu (návštěva s trenérem session přepisuje), ale SMS nepošle.
 * Nikdy nehází: hospoda nesmí spadnout kvůli drbům.
 */
export async function transferRumourForPub(db: D1Database, ctx: RumourPubContext, opts: { rng?: RumourRng } = {}): Promise<PubIncident | null> {
  const day = ctx.gameDate.slice(0, 10);
  try {
    await expireRumours(db, ctx.teamId, day);

    const existing = await db.prepare("SELECT subject, player_id, text FROM pub_rumours WHERE team_id = ? AND game_date = ?")
      .bind(ctx.teamId, day).first<Pick<RumourRow, "subject" | "player_id" | "text">>();
    if (existing) return incidentOf(existing);
    if (!ctx.coach && ctx.localAttendees <= 0) return null;

    const loaded = await loadRumourWorld(db, ctx.teamId, day);
    if (!loaded) return null;
    const rng = opts.rng ?? createRng(seedFromString(`rumour|${ctx.teamId}|${day}|${ctx.coach ? "coach" : "pub"}`));
    const r = pickRumour(loaded.world, rng, { coach: ctx.coach });
    if (!r) return null;

    const id = `rumour-${ctx.teamId}-${day}`;
    const inserted = await db.prepare(
      `INSERT OR IGNORE INTO pub_rumours
         (id, team_id, game_date, season_number, subject, signal, player_id, club_team_id, is_true, text, status, expires_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, ctx.teamId, day, loaded.team.season, r.subject, r.kind, r.playerId, r.clubId, r.isTrue ? 1 : 0, r.text,
      r.subject === "own" ? "pending" : "tip", r.subject === "own" ? addDays(day, RUMOUR_ANSWER_DAYS) : null,
    ).run();
    // Souběžný běh (fronta, dvojí cron) drb mezitím zapsal: SMS poslal ten.
    if (!inserted.meta.changes) {
      const row = await db.prepare("SELECT subject, player_id, text FROM pub_rumours WHERE team_id = ? AND game_date = ?")
        .bind(ctx.teamId, day).first<Pick<RumourRow, "subject" | "player_id" | "text">>();
      return row ? incidentOf(row) : null;
    }
    logger.info({ module: M, teamId: ctx.teamId }, `drb ${r.kind} (${r.subject}, ${r.isTrue ? "pravdivý" : "spletený"}) o hráči ${r.playerId}`);
    await announceRumour(db, id, ctx.teamId, r)
      .catch((e) => logger.warn({ module: M, teamId: ctx.teamId }, `SMS hospodského o drbu ${id}`, e));
    return incidentOf({ subject: r.subject, player_id: r.playerId, text: r.text });
  } catch (e) {
    logger.warn({ module: M, teamId: ctx.teamId }, "drb o přestupu v hospodě", e);
    return null;
  }
}

/** Nálada hráče posunutá o `delta` (0–100) a k tomu jeden klíč do `life_context`. */
function moodStmt(db: D1Database, playerId: string, teamId: string, delta: number, key: "$.rumourHype" | "$.rumourCalm", value: unknown): D1PreparedStatement {
  return db.prepare(
    `UPDATE players SET life_context = json_set(${LC},
        '$.morale', MAX(0, MIN(100, COALESCE(json_extract(${LC}, '$.morale'), 50) + ?)),
        '${key}', json(?))
      WHERE id = ? AND team_id = ?`,
  ).bind(delta, JSON.stringify(value), playerId, teamId);
}

interface ReplyTarget extends RumourRow {
  today: string | null;
  team_name: string;
  league_id: string | null;
}

async function publishRumour(db: D1Database, row: ReplyTarget, player: { first_name: string; last_name: string }, clubName: string, today: string): Promise<void> {
  const rng = createRng(seedFromString(`rumour-article|${row.id}`));
  const article = rumourArticle({ kind: row.signal, playerName: `${player.first_name} ${player.last_name}`, clubName, teamName: row.team_name }, rng);
  const newsId = row.id;
  const hype = { until: addDays(today, row.is_true ? RUMOUR_HYPE_DAYS.true : RUMOUR_HYPE_DAYS.false), pct: RUMOUR_HYPE_PCT };
  const stmts: D1PreparedStatement[] = [moodStmt(db, row.player_id, row.team_id, RUMOUR_MORALE_PUBLISH, "$.rumourHype", hype)];
  if (row.league_id) {
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
         VALUES (?, ?, ?, 'transfer_rumour', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(newsId, row.league_id, row.team_id, article.headline, article.body, row.season_number),
      db.prepare("UPDATE pub_rumours SET news_id = ? WHERE id = ?").bind(newsId, row.id),
    );
  }
  await db.batch(stmts);
  await postKeeper(db, row.conv_id ?? "", RUMOUR_REPLIES.publish);
  if (row.league_id) {
    await sendSystemSMS(db, row.team_id, NEWS_DESK, `📰 Ve Zpravodaji vyšla zpráva od výčepu: „${article.headline}“`, {
      type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId,
    });
  }
}

async function calmRumour(
  db: D1Database, row: ReplyTarget, player: { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null }, today: string,
): Promise<void> {
  await db.batch([
    moodStmt(db, row.player_id, row.team_id, RUMOUR_MORALE_CALM, "$.rumourCalm", { until: addDays(today, RUMOUR_CALM_DAYS), teamId: row.team_id }),
  ]);
  await postKeeper(db, row.conv_id ?? "", RUMOUR_REPLIES.calm);
  const rng = createRng(seedFromString(`rumour-calm|${row.id}`));
  await sendPlayerSMS(db, row.team_id, {
    id: player.id, firstName: player.first_name, lastName: player.last_name, nickname: player.nickname, avatar: player.avatar,
  }, calmPlayerSms(rng));
}

/**
 * Odpověď trenéra hospodskému (tlačítko nebo volný text). Rozhodne se jednou: druhé kliknutí
 * nebo souběžný požadavek dopad ani SMS od redakce nezopakuje.
 */
export async function handleRumourReply(db: D1Database, convId: string, teamId: string, text: string, optionId: string | null): Promise<void> {
  const row = await db.prepare(
    `SELECT r.*, t.game_date AS today, t.name AS team_name, t.league_id
       FROM pub_rumours r JOIN teams t ON t.id = r.team_id
      WHERE r.team_id = ? AND r.conv_id = ? ORDER BY r.game_date DESC LIMIT 1`,
  ).bind(teamId, convId).first<ReplyTarget>();
  if (!row || row.status === "expired") {
    await closeRumourThread(db, convId);
    await postKeeper(db, convId, RUMOUR_REPLIES.stale);
    return;
  }
  if (row.status !== "pending") {
    await closeRumourThread(db, convId);
    await postKeeper(db, convId, RUMOUR_REPLIES.decided);
    return;
  }
  const today = (row.today ?? new Date().toISOString()).slice(0, 10);
  if (row.expires_on && row.expires_on < today) {
    await expireOne(db, row.id, convId);
    await postKeeper(db, convId, RUMOUR_REPLIES.stale);
    return;
  }
  const choice: RumourChoice | null = isRumourChoice(optionId) ? optionId : classifyRumourReply(text);
  if (!choice) {
    await postKeeper(db, convId, RUMOUR_REPLIES.unclear);
    return;
  }

  // Hráč mezitím odešel, nebo klub ze hry zmizel: drb je pasé, nic se nezapíše.
  const [playerRes, clubRes] = await db.batch([
    db.prepare(
      `SELECT id, first_name, last_name, nickname, avatar FROM players
        WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(row.player_id, teamId),
    db.prepare("SELECT name FROM teams WHERE id = ?").bind(row.club_team_id),
  ]);
  const player = playerRes.results[0] as { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null } | undefined;
  const club = clubRes.results[0] as { name: string } | undefined;
  if (!player || !club) {
    await expireOne(db, row.id, convId);
    await postKeeper(db, convId, RUMOUR_REPLIES.gone);
    return;
  }

  const claimed = await db.prepare(
    `UPDATE pub_rumours SET status = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND status = 'pending'`,
  ).bind(choice === "publish" ? "published" : "calmed", row.id).run();
  if (!claimed.meta.changes) {
    await postKeeper(db, convId, RUMOUR_REPLIES.decided);
    return;
  }
  await closeRumourThread(db, convId);
  try {
    if (choice === "publish") await publishRumour(db, { ...row, conv_id: convId }, player, club.name, today);
    else await calmRumour(db, { ...row, conv_id: convId }, player, today);
  } catch (e) {
    logger.error({ module: M, teamId }, `dopad drbu ${row.id} (${choice})`, e);
  }
}

/**
 * Násobek ceny hráčů po drbu v novinách (`life_context.rumourHype`) pro AI kupce.
 * Hráči bez drbu v mapě nejsou. Chyba dotazu = žádné zdražení.
 */
export async function loadRumourHype(db: D1Database, playerIds: string[], day: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < playerIds.length; i += IN_CHUNK) {
    const chunk = playerIds.slice(i, i + IN_CHUNK);
    const rows = await db.prepare(
      `SELECT id, CASE WHEN json_valid(life_context) THEN json_extract(life_context, '$.rumourHype') END AS hype
         FROM players WHERE id IN (${chunk.map(() => "?").join(",")})`,
    ).bind(...chunk).all<{ id: string; hype: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "zdražení hráčů po drbu", e); return { results: [] as Array<{ id: string; hype: string | null }> }; });
    for (const r of rows.results) {
      if (!r.hype) continue;
      const mult = rumourHypeMultiplier(parseJson<{ until?: unknown; pct?: unknown }>(r.hype, `zdražení hráče ${r.id}`), day);
      if (mult > 1) out.set(r.id, mult);
    }
  }
  return out;
}
