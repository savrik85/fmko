/**
 * Spawn + lifecycle management AI player threadů.
 * Volá se z daily-tick.
 *
 *   applyAiPlayerThreads() — pro každý lidský tým (s pravděpodobností & throttle)
 *                            vybere hráče + scénář, vygeneruje úvodní zprávu,
 *                            založí/použije 1:1 player conversation.
 *   expireStaleAiThreads() — projde aktivní thready kde čeká odpověď trenéra
 *                            > 3 dny → hráč se urazí (penalty + uzavření).
 *   handleAiPlayerReply()  — voláno z messaging POST handleru přes ctx.waitUntil
 *                            po odpovědi trenéra (generuje další reply nebo resolution).
 */

import { logger } from "../lib/logger";
import {
  generateInitialMessage,
  generateReply,
  evaluateResolution,
  GeminiUnavailableError,
  type ThreadMessage,
  type TeamContext,
} from "./ai-player-chat";
import {
  pickScenarioForPlayer,
  getScenarioById,
  type PlayerSnapshot,
} from "./ai-player-scenarios";

const SPAWN_PROBABILITY = 0.12;       // ~1× za 8 dní per tým
const COOLDOWN_DAYS = 7;              // throttle na 7 dní (po posledním AI threadu)
const STALE_DAYS_FOR_OFFEND = 3;      // 3 herní dny bez odpovědi trenéra
const SAFETY_NET_DAYS = 14;           // safety net pro úplně zaseknuté thready

interface ConvRow {
  id: string;
  team_id: string;
  type: string;
  participant_id: string | null;
  ai_thread_state: string | null;
  ai_thread_active: number;
  last_message_at: string | null;
}

interface AiThreadStateData {
  trigger: string;
  scenario_id: string;
  max_replies: number;
  current_replies: number;
  awaiting: "coach" | "player" | "done";
  initiated_at: string;
  player_id: string;
  resolution?: {
    morale_delta: number;
    condition_delta: number;
    relationship_delta: number;
    absence_days?: number;
    absence_reason?: string;
    summary: string;
    tone: "positive" | "negative" | "neutral";
    offended?: boolean;
  } | null;
}

function parseState(raw: string | null): AiThreadStateData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiThreadStateData;
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, "parseState failed", e);
    return null;
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

function loadPlayerSnapshot(row: Record<string, unknown>): PlayerSnapshot {
  const personality = (() => {
    try { return JSON.parse((row.personality as string) ?? "{}"); } catch { return {}; }
  })();
  const lifeContext = (() => {
    try { return JSON.parse((row.life_context as string) ?? "{}"); } catch { return {}; }
  })();
  return {
    id: row.id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    age: (row.age as number) ?? 25,
    position: (row.position as PlayerSnapshot["position"]) ?? "MID",
    morale: lifeContext.morale ?? row.morale ?? 50,
    condition: lifeContext.condition ?? row.condition ?? 100,
    coachRelationship: (row.coach_relationship as number) ?? 50,
    discipline: personality.discipline ?? 50,
    patriotism: personality.patriotism ?? 50,
    alcohol: personality.alcohol ?? 30,
    temper: personality.temper ?? 40,
    leadership: personality.leadership ?? 30,
    workRate: personality.workRate ?? 50,
    aggression: personality.aggression ?? 40,
    recentMinutes: (row.recent_minutes as number) ?? 0,
    recentRatingAvg: (row.recent_rating_avg as number) ?? 6.5,
    isCelebrity: !!(row.is_celebrity as number),
    occupation: lifeContext.occupation,
    injuredUntil: row.injured_until as string | null,
  };
}

async function loadTeamContext(db: D1Database, teamId: string): Promise<TeamContext> {
  const row = await db.prepare(
    `SELECT t.name, v.name as village_name, m.name as manager_name
     FROM teams t
     LEFT JOIN villages v ON t.village_id = v.id
     LEFT JOIN managers m ON m.team_id = t.id
     WHERE t.id = ?`,
  ).bind(teamId).first<{ name: string; village_name: string | null; manager_name: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext", e); return null; });
  return {
    teamName: row?.name ?? "tým",
    villageName: row?.village_name ?? undefined,
    managerName: row?.manager_name ?? undefined,
  };
}

async function getOrCreatePlayerConversation(
  db: D1Database,
  teamId: string,
  player: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
): Promise<string> {
  const existing = await db.prepare(
    "SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? LIMIT 1",
  ).bind(teamId, player.id).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "find player conv", e); return null; });
  if (existing?.id) return existing.id;

  const convId = uuid();
  const now = new Date().toISOString();
  const title = player.nickname ? `${player.firstName} "${player.nickname}" ${player.lastName}` : `${player.firstName} ${player.lastName}`;
  await db.prepare(
    "INSERT INTO conversations (id, team_id, type, title, participant_id, participant_avatar, last_message_at, created_at) VALUES (?, ?, 'player', ?, ?, ?, ?, ?)",
  ).bind(convId, teamId, title, player.id, player.avatar ?? "{}", now, now).run();
  return convId;
}

/**
 * Spustí AI player chat spawn pro všechny lidské týmy.
 * Volá se z daily-tick.
 */
export async function applyAiPlayerThreads(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
): Promise<{ spawned: number; skipped: number }> {
  if (!env.GEMINI_API_KEY) {
    logger.warn({ module: "ai-player-spawn" }, "skipping spawn — GEMINI_API_KEY missing");
    return { spawned: 0, skipped: 0 };
  }

  // Najdi lidské týmy s active=0 conversation a buď žádný předchozí thread, nebo cooldown vypršel
  const candidateTeams = await db.prepare(
    `SELECT t.id
     FROM teams t
     WHERE t.user_id != 'ai'
       AND (t.last_ai_player_thread_at IS NULL OR t.last_ai_player_thread_at < datetime('now', ?))
       AND NOT EXISTS (
         SELECT 1 FROM conversations c WHERE c.team_id = t.id AND c.ai_thread_active = 1
       )`,
  ).bind(`-${COOLDOWN_DAYS} days`).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "candidate teams query", e); return { results: [] }; });

  let spawned = 0;
  let skipped = 0;

  for (const team of candidateTeams.results) {
    if (Math.random() >= SPAWN_PROBABILITY) {
      skipped++;
      continue;
    }
    try {
      const ok = await spawnForTeam(db, env, team.id);
      if (ok) spawned++; else skipped++;
    } catch (e) {
      logger.warn({ module: "ai-player-spawn" }, `spawn for team ${team.id} failed`, e);
      skipped++;
    }
  }

  logger.info({ module: "ai-player-spawn" }, `spawn done: ${spawned} new threads, ${skipped} skipped, ${candidateTeams.results.length} candidates`);
  return { spawned, skipped };
}

async function spawnForTeam(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
  teamId: string,
): Promise<boolean> {
  // 1. Načti aktivní hráče s recent stats (last 30 dní)
  const playersRow = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.age, p.position,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity,
            COALESCE(stats.recent_minutes, 0) as recent_minutes,
            COALESCE(stats.recent_rating_avg, 6.5) as recent_rating_avg
     FROM players p
     LEFT JOIN (
       SELECT mps.player_id, SUM(mps.minutes_played) as recent_minutes, AVG(mps.rating) as recent_rating_avg
       FROM match_player_stats mps
       JOIN matches m ON mps.match_id = m.id
       WHERE mps.team_id = ? AND m.status = 'simulated' AND m.simulated_at >= datetime('now', '-30 days')
       GROUP BY mps.player_id
     ) stats ON stats.player_id = p.id
     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(teamId, teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load players for spawn", e); return { results: [] }; });

  if (playersRow.results.length === 0) return false;

  // 2. Vážený výběr hráče: 60 % "potřeba" (nízká morale, málo minut, vysoký temper), 40 % random
  const snapshots = playersRow.results.map(loadPlayerSnapshot);
  const player = pickPlayerWeighted(snapshots, Math.random);
  if (!player) return false;

  // 3. Vyber scénář vážený osobností/stavem hráče
  const scenario = pickScenarioForPlayer(player, Math.random);
  if (!scenario) {
    logger.info({ module: "ai-player-spawn" }, `no scenario fits player ${player.firstName} ${player.lastName}`);
    return false;
  }

  // 4. Načti team context
  const teamCtx = await loadTeamContext(db, teamId);

  // 5. Gemini call
  let initialBody: string;
  try {
    initialBody = await generateInitialMessage(env, player, scenario, teamCtx);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: "ai-player-spawn" }, `Gemini unavailable for ${player.firstName}: ${e.message}`);
      return false;
    }
    throw e;
  }

  // 6. Najdi/vytvoř player conversation, vlož zprávu, nastav state
  const playerRow = playersRow.results.find((r) => r.id === player.id)!;
  const convId = await getOrCreatePlayerConversation(db, teamId, {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    nickname: playerRow.nickname as string | null,
    avatar: playerRow.avatar as string | null,
  });

  const state: AiThreadStateData = {
    trigger: scenario.id,
    scenario_id: scenario.id,
    max_replies: scenario.expectedTurns,
    current_replies: 0,
    awaiting: "coach",
    initiated_at: new Date().toISOString(),
    player_id: player.id,
    resolution: null,
  };
  const now = new Date().toISOString();
  const senderName = `${player.firstName} ${player.lastName}`;

  await db.batch([
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
    ).bind(uuid(), convId, player.id, senderName, initialBody, JSON.stringify({ ai_generated: true, scenario_id: scenario.id, turn: 0 }), now),
    db.prepare(
      `UPDATE conversations
       SET ai_thread_state = ?, ai_thread_active = 1, ai_thread_last_at = ?,
           last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1
       WHERE id = ?`,
    ).bind(JSON.stringify(state), now, initialBody.slice(0, 100), now, convId),
    db.prepare(
      "UPDATE teams SET last_ai_player_thread_at = ? WHERE id = ?",
    ).bind(now, teamId),
  ]);

  logger.info({ module: "ai-player-spawn", teamId }, `spawned AI thread: ${player.firstName} ${player.lastName} → ${scenario.id}`);
  return true;
}

function pickPlayerWeighted(
  players: PlayerSnapshot[],
  rng: () => number,
): PlayerSnapshot | null {
  if (players.length === 0) return null;
  // 40 % čistě random
  if (rng() < 0.4) {
    return players[Math.floor(rng() * players.length)];
  }
  // 60 % vážený výběr — vyšší váha pro nízkou morale, málo minut, vysoký temper
  const weights = players.map((p) => {
    let w = 1;
    if (p.morale < 40) w += 3;
    else if (p.morale < 55) w += 1;
    if (p.recentMinutes < 90) w += 2;
    if (p.temper > 65) w += 1;
    if (p.workRate > 65) w += 1;
    if (p.coachRelationship > 70 || p.coachRelationship < 30) w += 1; // extrémy chtějí komunikovat víc
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rng() * total;
  for (let i = 0; i < players.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return players[i];
  }
  return players[players.length - 1];
}

/**
 * Po odpovědi trenéra: vygeneruj další reply hráče (nebo resolution pokud je to poslední tah).
 * Voláno z messaging POST handleru přes ctx.waitUntil.
 */
export async function handleAiPlayerReply(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
  convId: string,
): Promise<void> {
  try {
    await handleAiPlayerReplyInner(db, env, convId);
  } catch (e) {
    logger.error({ module: "ai-player-spawn" }, `handleAiPlayerReply CRASHED for conv ${convId}`, e);
    // Reset awaiting na coach aby trenér mohl zkusit znovu odpovědět
    await db.prepare(
      `UPDATE conversations SET ai_thread_state = json_set(ai_thread_state, '$.awaiting', 'coach') WHERE id = ?`,
    ).bind(convId).run()
      .catch((err) => logger.warn({ module: "ai-player-spawn" }, "rollback awaiting after crash", err));
  }
}

async function handleAiPlayerReplyInner(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
  convId: string,
): Promise<void> {
  logger.info({ module: "ai-player-spawn" }, `handleAiPlayerReply START for conv ${convId}`);
  const conv = await db.prepare(
    "SELECT id, team_id, type, participant_id, ai_thread_state, ai_thread_active FROM conversations WHERE id = ?",
  ).bind(convId).first<ConvRow>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load conv for reply", e); return null; });

  if (!conv || conv.ai_thread_active !== 1) {
    logger.info({ module: "ai-player-spawn" }, `handleAiPlayerReply: conv ${convId} not active, skip`);
    return;
  }

  const state = parseState(conv.ai_thread_state);
  if (!state || state.awaiting !== "player") {
    logger.info({ module: "ai-player-spawn" }, `handleAiPlayerReply: state mismatch (awaiting=${state?.awaiting}), skip`);
    return;
  }

  const scenario = getScenarioById(state.scenario_id);
  if (!scenario) {
    logger.warn({ module: "ai-player-spawn" }, `unknown scenario ${state.scenario_id}, force-closing thread`);
    await closeThread(db, convId, state, null);
    return;
  }

  // Načti hráče (recent stats nejsou pro reply potřeba)
  const playerRow = await db.prepare(
    "SELECT id, first_name, last_name, age, position, team_id, personality, life_context, coach_relationship, is_celebrity FROM players WHERE id = ?",
  ).bind(state.player_id).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load player for reply", e); return null; });

  if (!playerRow || playerRow.team_id !== conv.team_id) {
    logger.info({ module: "ai-player-spawn" }, `player ${state.player_id} no longer in team — closing thread`);
    await db.batch([
      db.prepare(
        "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Systém', ?, ?)",
      ).bind(uuid(), convId, "📵 Hráč už není v týmu — konverzace ukončena.", new Date().toISOString()),
      db.prepare(
        `UPDATE conversations SET ai_thread_active = 0, ai_thread_state = ? WHERE id = ?`,
      ).bind(JSON.stringify({ ...state, awaiting: "done" }), convId),
    ]);
    return;
  }

  const player = loadPlayerSnapshot(playerRow);
  const teamCtx = await loadTeamContext(db, conv.team_id);

  // Načti historii (posledních 6 zpráv chronologicky)
  const histRows = await db.prepare(
    "SELECT sender_type, body FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 6",
  ).bind(convId).all<{ sender_type: string; body: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load history", e); return { results: [] }; });

  const history: ThreadMessage[] = histRows.results
    .reverse()
    .filter((m) => m.sender_type === "player" || m.sender_type === "user")
    .map((m) => ({ sender: m.sender_type === "player" ? "player" : "coach", body: m.body }));

  const newRepliesCount = state.current_replies + 1;
  // max_replies funguje jako tvrdý strop. AI ale může konverzaci uzavřít kdykoli dřív přes conversation_complete.
  const isHardCap = newRepliesCount >= state.max_replies;

  logger.info({ module: "ai-player-spawn" }, `calling generateReply for conv ${convId} (turn ${newRepliesCount}/${state.max_replies}, isHardCap=${isHardCap})`);
  let reply: { body: string; conversationComplete: boolean };
  try {
    reply = await generateReply(env, player, history, scenario, teamCtx, isHardCap);
    logger.info({ module: "ai-player-spawn" }, `generateReply OK: complete=${reply.conversationComplete}, body=${reply.body.slice(0, 60)}`);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: "ai-player-spawn" }, `Gemini reply failed for conv ${convId}: ${e.message}`);
      await db.prepare(
        "UPDATE conversations SET ai_thread_state = ? WHERE id = ?",
      ).bind(JSON.stringify({ ...state, awaiting: "coach" }), convId).run()
        .catch((err) => logger.warn({ module: "ai-player-spawn" }, "rollback awaiting", err));
      return;
    }
    throw e;
  }

  const now = new Date().toISOString();
  const senderName = `${player.firstName} ${player.lastName}`;
  const shouldClose = reply.conversationComplete || isHardCap;

  if (!shouldClose) {
    // Branch A: pokračuje v rozhovoru
    const newState: AiThreadStateData = {
      ...state,
      current_replies: newRepliesCount,
      awaiting: "coach",
    };
    await db.batch([
      db.prepare(
        "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
      ).bind(uuid(), convId, player.id, senderName, reply.body, JSON.stringify({ ai_generated: true, scenario_id: scenario.id, turn: newRepliesCount }), now),
      db.prepare(
        "UPDATE conversations SET ai_thread_state = ?, last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?",
      ).bind(JSON.stringify(newState), reply.body.slice(0, 100), now, convId),
    ]);
    return;
  }

  // Branch B: AI usoudila že je hotovo (nebo dosažen strop) → vyhodnocení + uzavření
  let resolution: AiThreadStateData["resolution"];
  try {
    const fullHistory: ThreadMessage[] = [...history, { sender: "player", body: reply.body }];
    const evald = await evaluateResolution(env, player, fullHistory, scenario);
    resolution = { ...evald };
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, "evaluateResolution failed, using neutral", e);
    resolution = {
      morale_delta: 0,
      condition_delta: 0,
      relationship_delta: 0,
      absence_days: 0,
      absence_reason: "",
      summary: "Konverzace skončila bez výrazného závěru.",
      tone: "neutral",
    };
  }

  await applyResolutionAndClose(db, convId, conv.team_id, player.id, reply.body, senderName, scenario.id, state, resolution);
}

async function applyResolutionAndClose(
  db: D1Database,
  convId: string,
  teamId: string,
  playerId: string,
  finalReplyBody: string,
  senderName: string,
  scenarioId: string,
  state: AiThreadStateData,
  resolution: NonNullable<AiThreadStateData["resolution"]>,
): Promise<void> {
  const now = new Date().toISOString();
  const newState: AiThreadStateData = {
    ...state,
    current_replies: state.max_replies,
    awaiting: "done",
    resolution,
  };

  const absenceDays = resolution.absence_days ?? 0;
  const absenceLine = absenceDays > 0 ? ` Hráč nebude k dispozici ${absenceDays} ${absenceDays === 1 ? "den" : absenceDays < 5 ? "dny" : "dní"}.` : "";
  const systemMsg = `💬 Konverzace ukončena — ${resolution.summary}${absenceLine}`;

  const stmts: D1PreparedStatement[] = [
    // Závěrečná zpráva hráče
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
    ).bind(uuid(), convId, playerId, senderName, finalReplyBody, JSON.stringify({ ai_generated: true, scenario_id: scenarioId, turn: state.max_replies, final: true }), now),

    // System message s shrnutím
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)",
    ).bind(uuid(), convId, systemMsg, JSON.stringify({ resolution, scenario_id: scenarioId }), now),

    // Aplikace dopadu na hráče (morale + condition v life_context, coach_relationship přímo)
    db.prepare(
      `UPDATE players SET
         life_context = json_set(
           life_context,
           '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)),
           '$.condition', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.condition'), 100) + ?))
         ),
         coach_relationship = MAX(0, MIN(100, coach_relationship + ?))
       WHERE id = ?`,
    ).bind(resolution.morale_delta, resolution.condition_delta, resolution.relationship_delta, playerId),

    // Uzavření konverzace
    db.prepare(
      "UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0, last_message_text = ?, last_message_at = ?, unread_count = unread_count + 2 WHERE id = ?",
    ).bind(JSON.stringify(newState), systemMsg.slice(0, 100), now, convId),
  ];

  // Pokud trenér hráči schválil volno → vložíme do injuries (využíváme stávající absence systém,
  // type='obecne' je jediný povolený "neanatomický" typ v CHECK constraint)
  if (absenceDays > 0) {
    stmts.push(
      db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, created_at) VALUES (?, ?, ?, 'obecne', ?, 'minor', ?, ?, ?)",
      ).bind(uuid(), playerId, teamId, resolution.absence_reason || "Schválené osobní volno", absenceDays, absenceDays, now),
    );
  }

  await db.batch(stmts);

  const fmt = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
  logger.info({ module: "ai-player-spawn", teamId }, `closed AI thread ${convId}: morale ${fmt(resolution.morale_delta)}, relationship ${fmt(resolution.relationship_delta)}, tone=${resolution.tone}`);
}

async function closeThread(
  db: D1Database,
  convId: string,
  state: AiThreadStateData,
  resolution: AiThreadStateData["resolution"],
): Promise<void> {
  const now = new Date().toISOString();
  const newState: AiThreadStateData = { ...state, awaiting: "done", resolution };
  await db.prepare(
    "UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0, last_message_at = ? WHERE id = ?",
  ).bind(JSON.stringify(newState), now, convId).run();
}

/**
 * Najde aktivní AI thready, kde čeká odpověď trenéra > STALE_DAYS_FOR_OFFEND dní → hráč se urazí.
 * Plus safety net: cokoli starší 14 dní = force close.
 * Volá se z daily-tick.
 */
export async function expireStaleAiThreads(db: D1Database): Promise<{ offended: number; safetyClosed: number }> {
  let offended = 0;
  let safetyClosed = 0;

  // 1. Stale "awaiting coach" threads → urazit hráče
  const stale = await db.prepare(
    `SELECT id, team_id, ai_thread_state, last_message_at
     FROM conversations
     WHERE ai_thread_active = 1
       AND last_message_at < datetime('now', ?)`,
  ).bind(`-${STALE_DAYS_FOR_OFFEND} days`).all<ConvRow>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load stale threads", e); return { results: [] }; });

  for (const conv of stale.results) {
    const state = parseState(conv.ai_thread_state);
    if (!state) continue;

    if (state.awaiting === "coach") {
      // Hráč se urazí
      await offendPlayer(db, conv, state);
      offended++;
    } else if (conv.last_message_at && new Date(conv.last_message_at) < new Date(Date.now() - SAFETY_NET_DAYS * 24 * 3600 * 1000)) {
      // Safety net: zaseknutý thread → force close bez penalty
      await closeThread(db, conv.id, state, { morale_delta: 0, condition_delta: 0, relationship_delta: 0, summary: "Konverzace přerušena (timeout).", tone: "neutral" });
      safetyClosed++;
    }
  }

  if (offended > 0 || safetyClosed > 0) {
    logger.info({ module: "ai-player-spawn" }, `stale check: ${offended} offended players, ${safetyClosed} safety-closed`);
  }
  return { offended, safetyClosed };
}

async function offendPlayer(
  db: D1Database,
  conv: ConvRow,
  state: AiThreadStateData,
): Promise<void> {
  // Penalty se škáluje podle temperu (vyšší = víc se uráží)
  const playerRow = await db.prepare(
    "SELECT id, first_name, last_name, personality FROM players WHERE id = ?",
  ).bind(state.player_id).first<{ id: string; first_name: string; last_name: string; personality: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load player for offend", e); return null; });

  if (!playerRow) {
    // Hráč zmizel — prostě zavři
    await closeThread(db, conv.id, state, { morale_delta: 0, condition_delta: 0, relationship_delta: 0, summary: "Hráč už není dostupný.", tone: "neutral" });
    return;
  }

  const personality = (() => { try { return JSON.parse(playerRow.personality); } catch { return {}; } })();
  const temper = personality.temper ?? 40;
  const alcohol = personality.alcohol ?? 30;
  const moraleDelta = temper > 70 ? -12 : alcohol > 70 ? -5 : -8;
  const relationshipDelta = -10;

  const now = new Date().toISOString();

  const systemMsg = "📵 Hráč se po několika dnech mlčení urazil. Vztah s trenérem se zhoršil.";

  await db.batch([
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 0)",
    ).bind(uuid(), conv.id, systemMsg, JSON.stringify({ offended: true, scenario_id: state.scenario_id }), now),

    db.prepare(
      `UPDATE players SET
         life_context = json_set(life_context, '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?))),
         coach_relationship = MAX(0, MIN(100, coach_relationship + ?))
       WHERE id = ?`,
    ).bind(moraleDelta, relationshipDelta, playerRow.id),

    db.prepare(
      "UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0, last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?",
    ).bind(
      JSON.stringify({ ...state, awaiting: "done", resolution: { morale_delta: moraleDelta, condition_delta: 0, relationship_delta: relationshipDelta, summary: "Hráč se urazil — trenér nereagoval.", tone: "negative", offended: true } }),
      systemMsg.slice(0, 100), now, conv.id,
    ),
  ]);

  logger.info({ module: "ai-player-spawn", teamId: conv.team_id }, `offended player ${playerRow.first_name} ${playerRow.last_name} (morale ${moraleDelta}, relationship ${relationshipDelta})`);
}
