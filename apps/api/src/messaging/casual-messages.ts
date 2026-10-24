/**
 * Zprávy „jen tak" od hráčů (témata v casual-topics.ts) a pozvání, která mají dopad.
 *
 * Hodinový běh Telefonu (cron 30 * * * *, `runPhoneHourly`) každou hodinu mezi 7. a 22.
 * hodinou v Praze hodí kostkou za každý aktivní klub. Vyjde zhruba jedna až dvě
 * zprávy týdně na klub, nejvýš jedna za dva dny. Píše jen kdo nespí a koho
 * k tomu vztah s trenérem pustí; téma vybírá podle toho, co hráč právě dělá.
 *
 * Pozvání: když hráč zve (hospoda, zabijačka, ryby…), uloží se do KV na šest hodin.
 * Každou zprávu trenéra v té době posoudí `coachAcceptsInvite`, a když trenér slíbí,
 * že přijde, stane se to: z hospody se zapíše návštěva s trenérem (pub.ts) a runda
 * z pokladny, po akci hráč poděkuje s fotkou a vztah se zlepší (follow-ups.ts).
 */

import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { carryWeightTalk } from "../season/weight-talk";
import { nazevSituace } from "../incidents/situace";
import {
  CASUAL_MIN_RELATION, CASUAL_TOPICS, INVITES, topicAllowed, topicFits,
  type CasualContext, type CasualTopic, type InviteKind,
} from "./casual-topics";
import { coachAcceptsInvite, generateInitialMessage, GeminiUnavailableError, playerTimeContext } from "./ai-player-chat";
import { PHOTO_SCENES, generatePlayerPhoto, workPhotoScene } from "./player-photo";
import { pickAmbience, recordVoiceMessage, voicePreviewText } from "./voice-message";
import { deliverDueFollowUps, nextFreeMoment, postPlayerMessageStmts, scheduleFollowUp, type FollowUpEnv } from "./follow-ups";
import type { PlayerSnapshot } from "./ai-player-scenarios";

const M = "casual-messages";

/** Šance klubu na zprávu „jen tak" v jedné hodině mezi 7 a 22. Vychází 1–2 zprávy týdně. */
export const CASUAL_HOURLY_CHANCE = 0.022;
/** Nejméně tolik hodin mezi dvěma zprávami „jen tak" v jednom klubu. */
const TEAM_COOLDOWN_HOURS = 48;
/** Stejný hráč se jen tak ozve nejvýš jednou za tolik dní. */
const PLAYER_COOLDOWN_DAYS = 10;
/** Stejné téma se v klubu nezopakuje dřív. */
const TOPIC_REPEAT_DAYS = 14;
/** Píše se jen klubům, kde byl manažer ve hře nedávno. Opuštěnému telefonu by to bylo k ničemu. */
const ACTIVE_MANAGER_DAYS = 3;
/** Jak dlouho platí pozvání: na „jdu" za dva dny už se nečeká. */
const INVITE_TTL_SECONDS = 6 * 3600;

const inviteKey = (convId: string) => `open_invite:${convId}`;
const recentTopicsKey = (teamId: string) => `casual_topics:${teamId}`;

export interface OpenInvite {
  kind: InviteKind;
  topicId: string;
  teamId: string;
  playerId: string;
  playerFirstName: string;
}

export type PhoneEnv = FollowUpEnv;

/** Hodinový běh: nejdřív odložené zprávy, pak nové zprávy „jen tak". */
export async function runPhoneHourly(
  db: D1Database,
  env: PhoneEnv,
  now = new Date(),
): Promise<{ casual: number; followUps: { delivered: number; cancelled: number; retried: number } }> {
  const followUps = await deliverDueFollowUps(db, env, now);
  const casual = await spawnCasualMessages(db, env, now);
  return { casual: casual.sent, followUps };
}

/** Pražská hodina, den v týdnu a měsíc. */
function pragueClock(now: Date): { hour: number; weekday: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", hour: "2-digit", hour12: false, month: "numeric", weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { hour: Number(get("hour")) % 24, weekday: Math.max(0, weekdays.indexOf(get("weekday"))), month: Number(get("month")) };
}

/**
 * Zprávy „jen tak" pro všechny aktivní kluby. `manual` (admin) pustí jeden klub bez
 * kostky a odstupů, volitelně s pevným tématem nebo jen nanečisto (nic nezapíše).
 */
export async function spawnCasualMessages(
  db: D1Database,
  env: PhoneEnv,
  now = new Date(),
  manual?: { teamId: string; topicId?: string; dryRun?: boolean },
): Promise<{ sent: number; drafts: CasualDraft[] }> {
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return { sent: 0, drafts: [] };
  const clock = pragueClock(now);
  if (!manual && (clock.hour < 7 || clock.hour >= 22)) return { sent: 0, drafts: [] };

  const teams = manual ? { results: [{ id: manual.teamId }] } : await db.prepare(
    `SELECT t.id FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.user_id != 'ai' AND t.parent_team_id IS NULL
        AND julianday(u.last_activity_at) > julianday(?1) - ?2
        AND (t.last_casual_message_at IS NULL OR julianday(t.last_casual_message_at) < julianday(?1) - ?3)`,
  ).bind(now.toISOString(), ACTIVE_MANAGER_DAYS, TEAM_COOLDOWN_HOURS / 24).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "kluby pro zprávy jen tak", e); return { results: [] as Array<{ id: string }> }; });

  let sent = 0;
  const drafts: CasualDraft[] = [];
  for (const team of teams.results) {
    if (!manual && Math.random() >= CASUAL_HOURLY_CHANCE) continue;
    try {
      const r = await spawnCasualForTeam(db, env, team.id, now, clock, manual);
      if (r?.sent) sent++;
      if (r?.draft) drafts.push(r.draft);
    } catch (e) {
      logger.warn({ module: M, teamId: team.id }, "zpráva jen tak selhala", e);
    }
  }
  if (sent > 0) logger.info({ module: M }, `zprávy jen tak: ${sent} odesláno, ${teams.results.length} klubů v losu`);
  return { sent, drafts };
}

export interface CasualDraft {
  playerName: string;
  coachRelationship: number;
  topicId: string;
  text: string;
  photo: { key: string; alt: string } | null;
}

async function spawnCasualForTeam(
  db: D1Database,
  env: PhoneEnv,
  teamId: string,
  now: Date,
  clock: { hour: number; weekday: number; month: number },
  manual?: { topicId?: string; dryRun?: boolean },
): Promise<{ sent: boolean; draft?: CasualDraft } | null> {
  const { INJURY_COLUMN, loadPlayerSnapshot, loadTeamContext, nactiSituaceTymu, getOrCreatePlayerConversation } = await import("./ai-player-spawn");

  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nationality, p.nickname, p.avatar, p.age, p.position,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity, ${INJURY_COLUMN}
       FROM players p
      WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') AND COALESCE(p.coach_relationship, 50) >= ?
        AND p.id NOT IN (SELECT participant_id FROM conversations WHERE team_id = ? AND ai_thread_active = 1 AND participant_id IS NOT NULL)`,
  ).bind(teamId, CASUAL_MIN_RELATION, teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M, teamId }, "hráči pro zprávu jen tak", e); return { results: [] as Array<Record<string, unknown>> }; });
  if (rows.results.length === 0) return null;

  const lastOutcome = await loadLastOutcome(db, teamId);
  const situations = await nactiSituaceTymu(db, teamId);
  const recentTopics = manual ? [] : await readRecentTopics(env.CACHE_KV, teamId);
  const team = await loadTeamContext(db, teamId);
  const forced = manual?.topicId ? CASUAL_TOPICS.find((t) => t.id === manual.topicId) ?? null : null;

  // Kandidáti: hráč × téma, které mu teď sedí. Kamarád trenéra píše častěji než ten, kdo ho jen bere.
  const candidates: Array<{ player: PlayerSnapshot; row: Record<string, unknown>; topic: CasualTopic; ctx: CasualContext; weight: number }> = [];
  for (const row of rows.results) {
    const player = loadPlayerSnapshot(row);
    // Zraněný nejde na ryby ani na houby; ozve se s tím, co řeší, jinými cestami.
    if (player.injury && !player.injury.volno) continue;
    if (!manual && wroteCasualRecently(row.life_context, now)) continue;
    const kind = situations.get(player.id);
    player.zivotniSituace = kind ? { kind, label: nazevSituace(kind) } : undefined;
    const time = playerTimeContext(player, now);
    if (time.situace === "spi") continue;
    const ambience = pickAmbience({
      drunk: false, situation: time.situace, drinksAt: time.kdePije, occupation: player.occupation,
      urban: team.urban ?? false, seed: player.id,
    });
    const ctx: CasualContext = {
      month: clock.month, weekday: clock.weekday, hour: clock.hour, situation: time.situace, drinksAt: time.kdePije,
      workplacePhoto: time.situace === "prace" && workPhotoScene(ambience) !== null, lastOutcome,
    };
    const relationFactor = 1 + Math.max(0, player.coachRelationship - 50) / 20;
    for (const topic of forced ? [forced] : CASUAL_TOPICS) {
      if (!forced && recentTopics.includes(topic.id)) continue;
      // Vynucené téma z adminu přeskočí čas a roční dobu, ale ne vztah ani životní situaci:
      // svatbu by jinak „měl" kdokoli.
      const allowed = topicAllowed(topic, player) && (topic.photo !== "work" || ctx.workplacePhoto);
      const fit = forced ? (allowed ? Math.max(1, topicFits(topic, player, ctx)) : 0) : topicFits(topic, player, ctx);
      if (fit > 0) candidates.push({ player, row, topic, ctx, weight: fit * relationFactor });
    }
  }
  const pick = weightedPick(candidates, Math.random);
  if (!pick) return null;
  const { player, row, topic, ctx } = pick;

  // Fotka dřív než text, ať na ni text naváže.
  let photo: { key: string; alt: string } | null = null;
  const scene = topic.photo === "work"
    ? workPhotoScene(pickAmbience({ drunk: false, situation: ctx.situation, drinksAt: ctx.drinksAt, occupation: player.occupation, urban: team.urban ?? false, seed: player.id }))
    : topic.photo ? PHOTO_SCENES[topic.photo] ?? null : null;
  if (scene && env.AI && env.SEED_DATA) {
    const key = await generatePlayerPhoto(env.AI, env.SEED_DATA, scene, crypto.randomUUID(), seedFromString(`${player.id}|${now.toISOString()}`));
    if (key) photo = { key, alt: scene.alt };
    else logger.warn({ module: M, teamId }, `fotka ${scene.id} se nepovedla`);
  }
  if (topic.photo && !photo) return null;
  if (topic.atPub) player.atPub = true;
  // Tabulku a výsledek dostane jen „jak se máš" po prohře. Jinak je model cpal do každé zprávy
  // („ať to první místo spláchnem", náhled 2026-10-24) a zprávy jen tak zněly všechny stejně.
  const topicTeam = { ...team, leaguePosition: undefined, lastMatchResult: topic.id === "casual_how_are_you" ? team.lastMatchResult : undefined };

  let text: string;
  try {
    text = await generateInitialMessage(env, player, topic, topicTeam, now, photo ? { alt: photo.alt } : undefined);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: M, teamId }, `model nedostupný pro zprávu jen tak: ${e.message}`);
      return null;
    }
    throw e;
  }
  const draft: CasualDraft = {
    playerName: `${player.firstName} ${player.lastName}`, coachRelationship: player.coachRelationship,
    topicId: topic.id, text, photo,
  };
  if (manual?.dryRun) return { sent: false, draft };

  const convId = await getOrCreatePlayerConversation(db, teamId, {
    id: player.id, firstName: player.firstName, lastName: player.lastName,
    nickname: row.nickname as string | null, avatar: row.avatar as string | null,
  });
  // Fotka a text trvají vteřiny: když trenér mezitím s hráčem rozjel rozhovor, zpráva jen tak
  // by mu ho přepsala. Domluvu o váze z dneška si nový stav nese dál (weight-talk.ts).
  const current = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?")
    .bind(convId).first<{ ai_thread_active: number; ai_thread_state: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "stav konverzace před zprávou jen tak", e); return null; });
  if (!current || current.ai_thread_active === 1) return null;
  const messageId = crypto.randomUUID();
  // Bez fotky může zpráva přijít jako hlasovka (strop 2 týdně hlídá voice-message.ts).
  const recorded = photo ? null : await recordVoiceMessage(db, env, {
    teamId, messageId, scene: topic.description, body: text, drunk: false,
    ambience: pickAmbience({ drunk: false, situation: ctx.situation, drinksAt: ctx.drinksAt, occupation: player.occupation, urban: team.urban ?? false, seed: messageId }),
    player: {
      id: player.id, firstName: player.firstName, age: player.age,
      nationality: player.nationality ?? null, lifeContext: (row.life_context as string | null) ?? null,
    },
  });
  const voice = recorded?.meta ?? null;
  const body = recorded?.transcript ?? text;
  const at = now.toISOString();
  const state = {
    trigger: topic.id, scenario_id: topic.id, max_replies: topic.expectedTurns, current_replies: 0,
    awaiting: "coach", initiated_at: at, player_id: player.id, casual: true, resolution: null,
    ...carryWeightTalk(current.ai_thread_state),
  };
  await db.batch([
    ...postPlayerMessageStmts(db, {
      convId, player, body, now: at, messageId,
      metadata: {
        ai_generated: true, scenario_id: topic.id, turn: 0, casual: true,
        ...(photo ? { type: "photo", photoKey: photo.key, photoAlt: photo.alt } : voice ?? {}),
      },
      preview: photo ? `📷 ${text.slice(0, 90)}` : voice ? voicePreviewText(voice.durationSec) : text.slice(0, 100),
    }),
    db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ?, ai_thread_last_at = ? WHERE id = ? AND ai_thread_active != 1")
      .bind(JSON.stringify(state), at, convId),
    db.prepare("UPDATE teams SET last_casual_message_at = ? WHERE id = ?").bind(at, teamId),
    db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.lastCasualAt', ?) WHERE id = ?")
      .bind(at, player.id),
  ]);
  if (topic.invite) await openInvite(env.CACHE_KV, convId, { kind: topic.invite, topicId: topic.id, teamId, playerId: player.id, playerFirstName: player.firstName });
  await rememberTopic(env.CACHE_KV, teamId, topic.id);
  logger.info({ module: M, teamId }, `zpráva jen tak: ${player.firstName} ${player.lastName} → ${topic.id}${photo ? " (fotka)" : voice ? " (hlasovka)" : ""}`);
  return { sent: true, draft };
}

function weightedPick<T extends { weight: number }>(items: T[], rng: () => number): T | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i;
  }
  return items[items.length - 1] ?? null;
}

function wroteCasualRecently(lifeContext: unknown, now: Date): boolean {
  try {
    const at = (JSON.parse((lifeContext as string) ?? "{}") as { lastCasualAt?: string }).lastCasualAt;
    return !!at && now.getTime() - Date.parse(at) < PLAYER_COOLDOWN_DAYS * 86400_000;
  } catch (e) {
    logger.warn({ module: M }, "life_context hráče pro zprávu jen tak", e);
    return false;
  }
}

async function loadLastOutcome(db: D1Database, teamId: string): Promise<"win" | "loss" | "draw" | null> {
  const m = await db.prepare(
    `SELECT home_team_id, home_score, away_score FROM matches
      WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
      ORDER BY simulated_at DESC LIMIT 1`,
  ).bind(teamId, teamId).first<{ home_team_id: string; home_score: number | null; away_score: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "poslední zápas pro zprávu jen tak", e); return null; });
  if (!m || m.home_score == null || m.away_score == null) return null;
  const my = m.home_team_id === teamId ? m.home_score : m.away_score;
  const opp = m.home_team_id === teamId ? m.away_score : m.home_score;
  return my > opp ? "win" : my < opp ? "loss" : "draw";
}

async function readRecentTopics(kv: KVNamespace | undefined, teamId: string): Promise<string[]> {
  if (!kv) return [];
  const raw = await kv.get(recentTopicsKey(teamId))
    .catch((e) => { logger.warn({ module: M, teamId }, "nedávná témata", e); return null; });
  try {
    const list = raw ? JSON.parse(raw) as Array<{ id: string; at: number }> : [];
    const cutoff = Date.now() - TOPIC_REPEAT_DAYS * 86400_000;
    return list.filter((t) => t.at > cutoff).map((t) => t.id);
  } catch (e) {
    logger.warn({ module: M, teamId }, "nedávná témata nejsou JSON", e);
    return [];
  }
}

async function rememberTopic(kv: KVNamespace | undefined, teamId: string, topicId: string): Promise<void> {
  if (!kv) return;
  const raw = await kv.get(recentTopicsKey(teamId))
    .catch((e) => { logger.warn({ module: M, teamId }, "nedávná témata", e); return null; });
  let list: Array<{ id: string; at: number }> = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch (e) {
    logger.warn({ module: M, teamId }, "nedávná témata nejsou JSON", e);
  }
  const cutoff = Date.now() - TOPIC_REPEAT_DAYS * 86400_000;
  list = [...list.filter((t) => t.at > cutoff && t.id !== topicId), { id: topicId, at: Date.now() }];
  await kv.put(recentTopicsKey(teamId), JSON.stringify(list), { expirationTtl: TOPIC_REPEAT_DAYS * 86400 })
    .catch((e) => logger.warn({ module: M, teamId }, "uložení nedávných témat", e));
}

/** Pozvání čeká na odpověď trenéra. Volá i ruční rozeslání pozvánky z hospody (ai-player-spawn.ts). */
export async function openInvite(kv: KVNamespace | undefined, convId: string, invite: OpenInvite): Promise<void> {
  await kv?.put(inviteKey(convId), JSON.stringify(invite), { expirationTtl: INVITE_TTL_SECONDS })
    .catch((e) => logger.warn({ module: M, teamId: invite.teamId }, "uložení pozvání", e));
}

/**
 * Trenér napsal do konverzace s hráčem. Když na něj čeká pozvání a trenér v téhle
 * zprávě slíbil, že přijde, pozvání se splní. Volá routes/messaging.ts na pozadí.
 */
export async function handleCoachMessageForInvite(
  db: D1Database,
  env: PhoneEnv,
  convId: string,
  coachMessage: string,
): Promise<boolean> {
  const raw = await env.CACHE_KV?.get(inviteKey(convId))
    .catch((e) => { logger.warn({ module: M }, "čtení pozvání", e); return null; });
  if (!raw) return false;
  let invite: OpenInvite;
  try {
    invite = JSON.parse(raw) as OpenInvite;
  } catch (e) {
    logger.warn({ module: M }, "pozvání není JSON", e);
    return false;
  }
  const info = INVITES[invite.kind];
  if (!info) return false;
  const accepted = await coachAcceptsInvite(env, { label: info.label, playerFirstName: invite.playerFirstName }, coachMessage)
    .catch((e) => { logger.warn({ module: M, teamId: invite.teamId }, "posouzení odpovědi na pozvání", e); return false; });
  if (!accepted) return false;
  await env.CACHE_KV?.delete(inviteKey(convId))
    .catch((e) => logger.warn({ module: M, teamId: invite.teamId }, "smazání pozvání", e));
  return applyAcceptedInvite(db, env, { ...invite, convId });
}

/**
 * Trenér slíbil, že přijde. Poděkování po akci se naplánuje jako první: unikátní index
 * na čekající odložené zprávy je zámek, takže dvě rychlé zprávy „jdu" (každá s vlastním
 * voláním modelu, KV se mazat atomicky nedá) nezaplatí dvě rundy. Vrací, jestli pozvání
 * splnil tenhle běh.
 */
export async function applyAcceptedInvite(
  db: D1Database,
  env: PhoneEnv,
  invite: OpenInvite & { convId: string },
  now = new Date(),
): Promise<boolean> {
  const info = INVITES[invite.kind];
  const { getTeamGameDate } = await import("../community/manager-relations");
  const gameDate = (await getTeamGameDate(db, invite.teamId)).slice(0, 10);

  const playerRow = await db.prepare("SELECT id, personality, life_context, age FROM players WHERE id = ?")
    .bind(invite.playerId).first<{ id: string; age: number | null; personality: string | null; life_context: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: invite.teamId }, "hráč pro poděkování", e); return null; });
  const personality = parseObject(playerRow?.personality) as { alcohol?: number };
  const lifeContext = parseObject(playerRow?.life_context) as { occupation?: string };
  const dueAt = nextFreeMoment(
    { id: invite.playerId, occupation: lifeContext.occupation, alcohol: personality.alcohol ?? 30, age: playerRow?.age ?? 25 },
    new Date(now.getTime() + info.afterHours * 3600_000),
    { allowWork: info.fromWork, earliestHour: 8 },
  );
  const followUpId = await scheduleFollowUp(db, {
    teamId: invite.teamId, playerId: invite.playerId, convId: invite.convId, kind: "after_invite", dueAt,
    payload: { invite: invite.kind, topicId: invite.topicId },
  });
  if (!followUpId) {
    logger.info({ module: M, teamId: invite.teamId }, `pozvání ${invite.kind} už přijal jiný běh`);
    return false;
  }

  if (invite.kind === "pub") {
    // Když už dnes trenér s klukama v hospodě byl, druhá návštěva by přepsala tu první.
    // Poděkování ale platí: trenér za nimi stejně přišel.
    const today = await db.prepare("SELECT incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?")
      .bind(invite.teamId, gameDate).first<{ incidents: string }>()
      .catch((e) => { logger.warn({ module: M, teamId: invite.teamId }, "dnešní hospoda", e); return null; });
    if (!/"type":"coach_(led_visit|led_one|invited)"/.test(today?.incidents ?? "")) {
      const { createCoachLedSession } = await import("../season/pub");
      const r = await createCoachLedSession(db, invite.teamId, gameDate, "invited", { inviterId: invite.playerId });
      if (!r.ok) {
        // Kdo zval, nakonec v hospodě není (zraněný, stopka): žádná runda ani poděkování za ni.
        logger.warn({ module: M, teamId: invite.teamId }, `návštěva hospody na pozvání se nezapsala: ${r.reason}`);
        const { cancelFollowUp } = await import("./follow-ups");
        await cancelFollowUp(db, followUpId);
        return false;
      }
      const { recordTransaction } = await import("../season/finance-processor");
      await recordTransaction(db, invite.teamId, "event", -PUB_ROUND_COST, "Runda pro kluky v hospodě", gameDate)
        .catch((e) => logger.warn({ module: M, teamId: invite.teamId }, "runda v hospodě", e));
      // Stejný odstup jako „Pojedeme na jedno" (routes/game.ts /pub-visit): hned potom celý tým
      // do hospody nevezme a návštěvu na pozvání nepřepíše.
      const { activeSeasonNumber } = await import("../scouting/outside-clubs");
      const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(invite.teamId).first<{ game_date: string | null }>()
        .catch((e) => { logger.warn({ module: M, teamId: invite.teamId }, "herní den pro odstup hospody", e); return null; });
      await db.prepare(
        `INSERT INTO seasonal_events (id, team_id, league_id, type, title, description, effects, season, game_week, status, created_at)
         VALUES (?, ?, (SELECT league_id FROM teams WHERE id = ?), 'hospoda_action', 'Posezení v hospodě', 'Trenér přišel na pozvání za partou', '[]', ?, 0, 'resolved', ?)`,
      ).bind(crypto.randomUUID(), invite.teamId, invite.teamId, String(await activeSeasonNumber(db)), team?.game_date ?? gameDate).run()
        .catch((e) => logger.warn({ module: M, teamId: invite.teamId }, "odstup hospody po pozvání", e));
    }
  }
  logger.info({ module: M, teamId: invite.teamId }, `pozvání přijato: ${invite.kind}, poděkování ${dueAt.toISOString()}`);
  return true;
}

/** Kolik stojí runda, když trenér přijde do hospody za partou. Celý tým stojí 1 500 Kč (routes/game.ts). */
const PUB_ROUND_COST = 600;

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, "JSON hráče pro pozvání", e);
    return {};
  }
}
