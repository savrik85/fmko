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

import { transferTalkFrom } from "../transfers/unrest-reasons";
import { nactiZnalostiHrace } from "../incidents/znalosti-db";
import { nazevSituace } from "../incidents/situace";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { pickAmbience, recordVoiceMessage, voicePreviewText } from "./voice-message";
import { PHOTO_CHANCE, PHOTO_SCENES, generatePlayerPhoto, historyBody, pickPhotoScene } from "./player-photo";
import { coachRelationStmts } from "../lib/coach-relation";
import { weightTalkFromState } from "../season/weight-talk";
import { coachStreak, leftOnReadChance, markCoachMessagesRead, readDelayMs } from "./left-on-read";
import {
  generateInitialMessage,
  generateReply,
  evaluateResolution,
  GeminiUnavailableError,
  playerTimeContext,
  type ChatEnv,
  type ThreadMessage,
  type TeamContext,
} from "./ai-player-chat";
import {
  pickScenarioForPlayer,
  getScenarioById,
  type AiScenario,
  type PlayerSnapshot,
} from "./ai-player-scenarios";

/** Koncept ruční zprávy z režimu nanečisto. Ostré odeslání pak pošle přesně tohle. */
export interface MessageDraft {
  playerId: string;
  playerName: string;
  coachRelationship: number;
  scenarioId: string;
  text: string;
  /** Fotka ke konceptu (R2 klíč a popis), ostré odeslání pošle tutéž. */
  photo?: { key: string; alt: string } | null;
}
const DRAFT_TTL_SECONDS = 86400;
const draftKey = (teamId: string) => `message_draft:${teamId}`;

// Šance týmu na zprávu od hráče v odpoledním ticku. Při 0,30 psal hráč sám zhruba jednou
// za 1–2 týdny (prod 10/2026), uživatel chtěl hlasovky blíž ke dvěma týdně (2026-10-24).
const SPAWN_PROBABILITY = 0.50;
const COOLDOWN_DAYS = 3;              // min 3 dny mezi thready aby se neobjevily 2 v řadě
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
  /** Spoluhráč, o kterém konverzace je (konflikt / pochvala) — podle výsledku se upraví jejich vztah. */
  subject_player_id?: string;
  subject_player_name?: string;
  /** Incident, na který se trenér ptá (spec 7a). Platí jen v herní den `incidentDen`. */
  incidentId?: string;
  incidentDen?: string;
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

/** Běžící životní situace hráčů týmu (spec 4c), klíčované id hráče. Jeden dotaz na tým. */
export async function nactiSituaceTymu(db: D1Database, teamId: string): Promise<Map<string, string>> {
  const situaceRows = await db.prepare(
    `SELECT subject_player_id AS id, kind FROM club_incidents
      WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL`,
  ).bind(teamId).all<{ id: string; kind: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "životní situace hráčů", e); return { results: [] as Array<{ id: string; kind: string }> }; });
  return new Map(situaceRows.results.map((r) => [r.id, r.kind]));
}

/**
 * Sloupec `injury` pro `loadPlayerSnapshot`: nejdelší běžící zranění nebo volno
 * hráče jako JSON, NULL = fit. Dotaz musí mít tabulku hráčů pod aliasem `p`.
 */
export const INJURY_COLUMN = `(SELECT json_object('d', i.description, 'n', i.days_remaining, 'v', i.osobni_volno, 'f', i.is_fake)
    FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0
    ORDER BY i.days_remaining DESC LIMIT 1) AS injury`;

function parseInjury(raw: unknown): PlayerSnapshot["injury"] {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  try {
    const j = JSON.parse(raw as string) as { d?: string; n?: number; v?: number; f?: number };
    return { description: String(j.d ?? ""), daysLeft: Number(j.n ?? 0), volno: j.v === 1, fake: j.f === 1 };
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, "nečitelné zranění hráče", e);
    return undefined;
  }
}

export function loadPlayerSnapshot(
  row: Record<string, unknown>,
  matchCtx?: { lastOutcome: "win" | "loss" | "draw" | null; teamStreak: number },
): PlayerSnapshot {
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
    transferUnrest: lifeContext.transferUnrest?.level ?? 0,
    occupation: lifeContext.occupation,
    nationality: (row.nationality as string | null | undefined) ?? null,
    romani: lifeContext.romani === true,
    transferTalk: transferTalkFrom(lifeContext.transferUnrest),
    injury: parseInjury(row.injury),
    // Kontext posledního zápasu — hráč, který nenastoupil, má last_minutes NULL.
    lastMatchOutcome: matchCtx?.lastOutcome ?? null,
    playedLastMatch: row.last_minutes != null && (row.last_minutes as number) > 0,
    lastMatchGoals: (row.last_goals as number) ?? 0,
    lastMatchAssists: (row.last_assists as number) ?? 0,
    lastMatchRedCard: ((row.last_red as number) ?? 0) > 0,
    lastMatchYellow: ((row.last_yellow as number) ?? 0) > 0,
    lastMatchRating: (row.last_rating as number) ?? undefined,
    teamStreak: matchCtx?.teamStreak ?? 0,
  };
}

/**
 * Vybere spoluhráče, o kterém bude konverzace.
 *  - konflikt: přednostně někdo, s kým už hráč rivalitu má (spor se přiostřuje),
 *    jinak náhodný spoluhráč
 *  - pochvala za asistenci: střelec z posledního zápasu (komu asistoval)
 */
async function pickSubjectTeammate(
  db: D1Database,
  teamId: string,
  playerId: string,
  scenarioId: string,
  lastMatchId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (scenarioId === "assist_teamwork" && lastMatchId) {
    const scorer = await db.prepare(
      `SELECT p.id, p.first_name, p.last_name
         FROM match_player_stats s JOIN players p ON p.id = s.player_id
        WHERE s.match_id = ? AND s.team_id = ? AND s.goals > 0 AND p.id != ?
        ORDER BY s.goals DESC LIMIT 1`,
    ).bind(lastMatchId, teamId, playerId).first<{ id: string; first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "pick scorer", e); return null; });
    if (scorer) return { id: scorer.id, name: `${scorer.first_name} ${scorer.last_name}` };
  }

  if (scenarioId === "team_chemistry") {
    const rival = await db.prepare(
      `SELECT p.id, p.first_name, p.last_name
         FROM relationships r
         JOIN players p ON p.id = CASE WHEN r.player_a_id = ? THEN r.player_b_id ELSE r.player_a_id END
        WHERE (r.player_a_id = ? OR r.player_b_id = ?) AND r.type = 'rivals' AND p.team_id = ?
        ORDER BY r.strength DESC LIMIT 1`,
    ).bind(playerId, playerId, playerId, teamId).first<{ id: string; first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "pick rival", e); return null; });
    if (rival) return { id: rival.id, name: `${rival.first_name} ${rival.last_name}` };
  }

  const any = await db.prepare(
    `SELECT id, first_name, last_name FROM players
      WHERE team_id = ? AND id != ? AND (status IS NULL OR status = 'active')
      ORDER BY RANDOM() LIMIT 1`,
  ).bind(teamId, playerId).first<{ id: string; first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "pick teammate", e); return null; });
  return any ? { id: any.id, name: `${any.first_name} ${any.last_name}` } : null;
}

export async function loadTeamContext(db: D1Database, teamId: string): Promise<TeamContext> {
  const row = await db.prepare(
    `SELECT t.name, v.name as village_name, v.size as village_size, v.district, m.name as manager_name, t.league_id
     FROM teams t
     LEFT JOIN villages v ON t.village_id = v.id
     LEFT JOIN managers m ON m.team_id = t.id
     WHERE t.id = ?`,
  ).bind(teamId).first<{
    name: string; village_name: string | null; village_size: string | null; district: string | null;
    manager_name: string | null; league_id: string | null;
  }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext", e); return null; });

  // Poslední odehraný zápas — bez něj si model výsledek vymyslí a gratuluje k prohře,
  // kterou tým vyhrál. Formát stejný jako v rozhovorech pro Zpravodaj.
  const lm = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score,
            ht.name AS home_name, at.name AS away_name
       FROM matches m
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
      ORDER BY m.simulated_at DESC LIMIT 1`,
  ).bind(teamId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext last match", e); return null; });

  let lastMatchResult: string | undefined;
  if (lm && lm.home_score != null && lm.away_score != null) {
    const isHome = lm.home_team_id === teamId;
    const my = (isHome ? lm.home_score : lm.away_score) as number;
    const opp = (isHome ? lm.away_score : lm.home_score) as number;
    const oppName = (isHome ? lm.away_name : lm.home_name) as string;
    const verdict = my > opp ? "výhra" : my < opp ? "prohra" : "remíza";
    lastMatchResult = `${verdict} ${my}:${opp} ${isHome ? "doma s" : "venku s"} ${oppName}`;
  }

  // Pozice v tabulce
  let leaguePosition: number | undefined;
  if (row?.league_id) {
    const { calculateStandings } = await import("../stats/standings");
    const standings = await calculateStandings(db, row.league_id)
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext standings", e); return []; });
    leaguePosition = standings.find((st) => st.teamId === teamId)?.pos;
  }

  // Soupiska — whitelist jmen, o kterých smí model mluvit
  const squad = await db.prepare(
    `SELECT first_name, last_name FROM players
      WHERE team_id = ? AND (status IS NULL OR status = 'active')
      ORDER BY overall_rating DESC LIMIT 24`,
  ).bind(teamId).all<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext squad", e); return { results: [] as Array<{ first_name: string; last_name: string }> }; });

  return {
    teamName: row?.name ?? "tým",
    villageName: row?.village_name ?? undefined,
    // Pražské čtvrti mají ve hře velikost vesnice, ulice je tam slyšet stejně.
    urban: row?.district === "Praha" || ["town", "small_city", "city"].includes(row?.village_size ?? ""),
    managerName: row?.manager_name ?? undefined,
    lastMatchResult,
    leaguePosition,
    squadNames: squad.results.map((r) => `${r.first_name} ${r.last_name}`),
  };
}

/** Nejstarší konverzace týmu s hráčem. Zdvojené z doby před opravou se tak nestřídají. */
const FIND_PLAYER_CONVERSATION =
  "SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? ORDER BY created_at, rowid LIMIT 1";

/**
 * Najde, nebo založí konverzaci týmu s hráčem.
 *
 * Unikátní index na (team_id, type, participant_id) v databázi není, takže dva souběžné
 * požadavky (rychlé klikání na 💬 SMS) dřív oba nic nenašly a založily dvě konverzace.
 * Zápis proto vkládá jen tehdy, když žádná není: jeden příkaz, D1 ho provede celý
 * najednou. Pak se vrací ta konverzace, která v databázi opravdu je.
 */
export async function getOrCreatePlayerConversation(
  db: D1Database,
  teamId: string,
  player: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
): Promise<string> {
  const find = () => db.prepare(FIND_PLAYER_CONVERSATION).bind(teamId, player.id).first<{ id: string }>();
  const existing = await find()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "find player conv", e); return null; });
  if (existing?.id) return existing.id;

  const convId = uuid();
  const now = new Date().toISOString();
  const title = player.nickname ? `${player.firstName} "${player.nickname}" ${player.lastName}` : `${player.firstName} ${player.lastName}`;
  await db.prepare(
    `INSERT INTO conversations (id, team_id, type, title, participant_id, participant_avatar, last_message_at, created_at)
     SELECT ?, ?, 'player', ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ?)`,
  ).bind(convId, teamId, title, player.id, player.avatar ?? "{}", now, now, teamId, player.id).run();
  // Souběžný požadavek mohl konverzaci založit mezi hledáním a zápisem, pak se náš zápis neprovedl.
  return (await find())?.id ?? convId;
}

/**
 * Spustí AI player chat spawn pro všechny lidské týmy.
 * Volá se z daily-tick.
 */
export async function applyAiPlayerThreads(
  db: D1Database,
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace; AI?: Ai; SEED_DATA?: R2Bucket },
  /** Ruční spuštění z adminu: jen jeden tým, bez losu a cooldownu, volitelně rovnou hlasovka a pevné téma. */
  manual?: { teamId: string; forceVoice?: boolean; scenarioId?: string; dryRun?: boolean },
): Promise<{ spawned: number; skipped: number; draft?: MessageDraft }> {
  // Ptáme se přepínače, ne klíče. Dokud tu stála holá podmínka na
  // `GEMINI_API_KEY`, nezaložilo se jediné vlákno nikde, kde se jede přes
  // Workers AI bez gemini klíče — přepínač `ai_provider` tudy neměl jak
  // promluvit. `applyAiProvider` řeší jen stav „off", u „workers-ai" nechává
  // env beze změny, takže tahle podmínka blokovala i funkční llamu.
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) {
    logger.warn({ module: "ai-player-spawn" }, "spawn přeskočen, generování textu je vypnuté");
    return { spawned: 0, skipped: 0 };
  }

  // Najdi lidské týmy s active=0 conversation a buď žádný předchozí thread, nebo cooldown vypršel
  const candidateTeams = manual ? { results: [{ id: manual.teamId }] } : await db.prepare(
    `SELECT t.id
     FROM teams t
     WHERE t.user_id != 'ai'
       AND (t.last_ai_player_thread_at IS NULL OR t.last_ai_player_thread_at < datetime('now', ?))
       AND NOT EXISTS (
         SELECT 1 FROM conversations c WHERE c.team_id = t.id AND c.ai_thread_active = 1
           AND COALESCE(c.participant_id, '') NOT LIKE 'so-%'
       )`,
  ).bind(`-${COOLDOWN_DAYS} days`).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "candidate teams query", e); return { results: [] }; });

  let spawned = 0;
  let skipped = 0;
  let draft: MessageDraft | undefined;

  for (const team of candidateTeams.results) {
    if (!manual && Math.random() >= SPAWN_PROBABILITY) {
      skipped++;
      continue;
    }
    try {
      const forcedScenario = manual?.scenarioId ? getScenarioById(manual.scenarioId) : null;
      const result = await spawnForTeam(db, env, team.id, {
        forceVoice: manual?.forceVoice ?? false, forcedScenario, dryRun: manual?.dryRun ?? false,
      });
      if (result?.sent) spawned++; else skipped++;
      if (result && manual?.dryRun) draft = result.draft;
    } catch (e) {
      logger.warn({ module: "ai-player-spawn" }, `spawn for team ${team.id} failed`, e);
      skipped++;
    }
  }

  logger.info({ module: "ai-player-spawn" }, `spawn done: ${spawned} new threads, ${skipped} skipped, ${candidateTeams.results.length} candidates`);
  return { spawned, skipped, draft };
}

/**
 * Založí vlákno, ve kterém se hráč ozve sám. Vrací null, když se nic nezaložilo.
 *
 * `dryRun` jen vybere hráče a nechá napsat text, uloží ho jako koncept do KV
 * a nic nepošle. Ostré ruční odeslání se stejným tématem pak koncept použije,
 * takže odejde přesně to, co bylo vidět nanečisto.
 */
async function spawnForTeam(
  db: D1Database,
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace; SEED_DATA?: R2Bucket; AI?: Ai },
  teamId: string,
  opts: { forceVoice?: boolean; forcedScenario?: AiScenario | null; dryRun?: boolean } = {},
): Promise<{ sent: boolean; draft: MessageDraft } | null> {
  const forcedScenario = opts.forcedScenario ?? null;
  // 0. Poslední odehraný zápas + série výsledků — kontext pro scénáře (výhra/prohra,
  //    góly, karty). Dřív scénáře o výhře padaly i po prohře, protože o zápase nevěděly.
  const lastMatch = await db.prepare(
    `SELECT m.id, m.home_team_id, m.home_score, m.away_score
       FROM matches m
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
      ORDER BY m.simulated_at DESC LIMIT 1`,
  ).bind(teamId, teamId).first<{ id: string; home_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load last match", e); return null; });

  const outcomeOf = (row: { home_team_id: string; home_score: number; away_score: number }): "win" | "loss" | "draw" => {
    const isHome = row.home_team_id === teamId;
    const my = isHome ? row.home_score : row.away_score;
    const opp = isHome ? row.away_score : row.home_score;
    return my > opp ? "win" : my < opp ? "loss" : "draw";
  };
  const lastOutcome = lastMatch && lastMatch.home_score != null ? outcomeOf(lastMatch) : null;

  // Série: kolik zápasů po sobě tým vyhrál (+) nebo prohrál (−)
  const recentMatches = await db.prepare(
    `SELECT m.home_team_id, m.home_score, m.away_score
       FROM matches m
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
      ORDER BY m.simulated_at DESC LIMIT 5`,
  ).bind(teamId, teamId).all<{ home_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load recent matches", e); return { results: [] as never[] }; });

  let teamStreak = 0;
  for (const r of recentMatches.results) {
    const o = outcomeOf(r);
    if (o === "draw") break;
    if (teamStreak === 0) teamStreak = o === "win" ? 1 : -1;
    else if ((teamStreak > 0) === (o === "win")) teamStreak += o === "win" ? 1 : -1;
    else break;
  }

  // 1. Načti aktivní hráče s recent stats (last 30 dní)
  const playersRow = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nationality, p.nickname, p.avatar, p.age, p.position,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity,
            COALESCE(stats.recent_minutes, 0) as recent_minutes,
            COALESCE(stats.recent_rating_avg, 6.5) as recent_rating_avg,
            last.minutes_played AS last_minutes, last.goals AS last_goals,
            last.assists AS last_assists, last.yellow_cards AS last_yellow,
            last.red_cards AS last_red, last.rating AS last_rating,
            ${INJURY_COLUMN}
     FROM players p
     LEFT JOIN (
       SELECT mps.player_id, SUM(mps.minutes_played) as recent_minutes, AVG(mps.rating) as recent_rating_avg
       FROM match_player_stats mps
       JOIN matches m ON mps.match_id = m.id
       WHERE mps.team_id = ? AND m.status = 'simulated' AND m.simulated_at >= datetime('now', '-30 days')
       GROUP BY mps.player_id
     ) stats ON stats.player_id = p.id
     -- Statistiky z POSLEDNÍHO odehraného zápasu — z nich se poznají góly, karty i to,
     -- jestli hráč vůbec nastoupil. Bez toho scénáře reagovaly naslepo.
     LEFT JOIN match_player_stats last
            ON last.player_id = p.id AND last.match_id = ?
     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(teamId, lastMatch?.id ?? "", teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load players for spawn", e); return { results: [] }; });

  if (playersRow.results.length === 0) return null;

  // 2. Vážený výběr hráče: 60 % "potřeba" (nízká morale, málo minut, vysoký temper), 40 % random
  const situace = await nactiSituaceTymu(db, teamId);
  const snapshots = playersRow.results.map((r) => {
    const snap = loadPlayerSnapshot(r, { lastOutcome, teamStreak });
    const kind = situace.get(snap.id);
    snap.zivotniSituace = kind ? { kind, label: nazevSituace(kind) } : undefined;
    return snap;
  });
  // Ruční téma jde i týmům s rozjetou konverzací: hráč, se kterým se zrovna píše, se vynechá,
  // jinak by nové vlákno přepsalo stav toho běžícího.
  const busy = new Set<string | null>();
  if (forcedScenario) {
    const rows = await db.prepare("SELECT participant_id FROM conversations WHERE team_id = ? AND ai_thread_active = 1")
      .bind(teamId).all<{ participant_id: string | null }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "hráči s rozjetou konverzací", e); return { results: [] }; });
    for (const r of rows.results) busy.add(r.participant_id);
  }
  const saved = forcedScenario && !opts.dryRun ? await readDraft(env.CACHE_KV, teamId) : null;
  const draftPlayer = saved?.scenarioId === forcedScenario?.id
    ? snapshots.find((snap) => snap.id === saved?.playerId) ?? null
    : null;
  if (saved && !draftPlayer) logger.warn({ module: "ai-player-spawn", teamId }, "koncept nesedí (hráč nebo téma), píše se nový text");
  const player = draftPlayer ?? pickPlayerWeighted(snapshots.filter((snap) => !busy.has(snap.id)), Math.random);
  if (!player) return null;

  // 3. Vyber scénář vážený osobností/stavem hráče
  const scenario = forcedScenario ?? pickScenarioForPlayer(player, Math.random);
  if (!scenario) {
    logger.info({ module: "ai-player-spawn" }, `no scenario fits player ${player.firstName} ${player.lastName}`);
    return null;
  }

  // Hráč začíná sám, nejde o výslech: jen veřejné znalosti (spec 10b).
  player.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId, playerId: player.id });

  // 3b. U scénářů o spoluhráči vybrat KONKRÉTNÍHO hráče předem — ať se model netrefuje
  //     naslepo a ať víme, čí vztah po rozhovoru upravit.
  let subject: { id: string; name: string } | null = null;
  if (scenario.id === "team_chemistry" || scenario.id === "assist_teamwork") {
    subject = await pickSubjectTeammate(db, teamId, player.id, scenario.id, lastMatch?.id ?? null);
  }

  // 4. Načti team context
  const teamCtx = await loadTeamContext(db, teamId);
  if (subject) teamCtx.subjectPlayerName = subject.name;
  // Ruční rozeslání na začátku sezóny: odehrané zápasy a tabulka jsou z minulé sezóny, mluvit se o nich nemá.
  if (forcedScenario) {
    player.lastMatchOutcome = undefined;
    player.playedLastMatch = undefined;
    teamCtx.lastMatchResult = undefined;
    teamCtx.leaguePosition = undefined;
  }

  // 5. Gemini call
  // Ruční rozeslání se píše jako běžná zpráva od hráče v odpoledním ticku (14:00 UTC),
  // ne podle skutečného času: ve tři ráno by všichni psali, že je trenér vzbudil.
  // Téma z hospody má vlastní večerní hodinu (`writtenAtUtcHour`).
  const startedAt = new Date();
  const writtenAt = forcedScenario
    ? new Date(Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate(), forcedScenario.writtenAtUtcHour ?? 14))
    : startedAt;
  if (scenario.atPub) player.atPub = true;

  const messageId = uuid();
  // Z hospody: kdo se přiznává k pivu, nebo kdo rád pije a zrovna slaví.
  const drunk = scenario.id === "alcohol_struggle"
    || (player.alcohol > 70 && (scenario.category === "positive" || scenario.id === "personal_milestone"));
  // Kde hráč podle textu zprávy je (v práci, doma, v hospodě): podle toho zvuk pod hlasovkou i fotka z práce.
  const timeContext = playerTimeContext(player, writtenAt);
  const ambience = pickAmbience({
    drunk, situation: timeContext.situace, drinksAt: timeContext.kdePije, occupation: player.occupation,
    urban: teamCtx.urban ?? false, seed: messageId,
  });

  // 5a. Fotka k SMS (player-photo.ts) dřív než text, ať na ni text naváže. Téma z hospody ji má
  //     vždycky, běžná zpráva občas, když k situaci sedí. Koncept si nese fotku, se kterou vznikl.
  let photo: { key: string; alt: string } | null = draftPlayer && saved ? (saved.photo ?? null) : null;
  if (!(draftPlayer && saved) && env.AI && env.SEED_DATA && !opts.forceVoice) {
    const scene = scenario.atPub
      ? PHOTO_SCENES.pub_round
      : Math.random() < PHOTO_CHANCE
        ? pickPhotoScene({ scenarioId: scenario.id, scenarioCategory: scenario.category, workplace: timeContext.situace === "prace" ? ambience : null })
        : null;
    if (scene) {
      const key = await generatePlayerPhoto(env.AI, env.SEED_DATA, scene, uuid(), seedFromString(messageId));
      if (key) photo = { key, alt: scene.alt };
      // Kdo posílá fotku z hospody, píše opile (přání uživatele 2026-10-24).
      if (key && scene.id.startsWith("pub_")) player.atPub = true;
      else logger.warn({ module: "ai-player-spawn", teamId }, `fotka ${scene.id} se nepovedla, zpráva jde bez ní`);
    }
  }

  let initialBody: string;
  try {
    initialBody = draftPlayer && saved
      ? saved.text
      : await generateInitialMessage(env, player, scenario, teamCtx, writtenAt, photo ? { alt: photo.alt } : undefined);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: "ai-player-spawn" }, `Gemini unavailable for ${player.firstName}: ${e.message}`);
      return null;
    }
    throw e;
  }

  const draft: MessageDraft = {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    coachRelationship: player.coachRelationship,
    scenarioId: scenario.id,
    text: initialBody,
    photo,
  };
  if (opts.dryRun) {
    await env.CACHE_KV?.put(draftKey(teamId), JSON.stringify(draft), { expirationTtl: DRAFT_TTL_SECONDS })
      .catch((e) => logger.warn({ module: "ai-player-spawn", teamId }, "uložení konceptu", e));
    return { sent: false, draft };
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
    subject_player_id: subject?.id,
    subject_player_name: subject?.name,
    resolution: null,
  };
  const senderName = `${player.firstName} ${player.lastName}`;

  // 7. Místo SMS hlasovka (voice-message.ts): nanejvýš 2 týdně na tým a jen přes Gemini.
  //    Text zůstává v těle zprávy jako přepis, z něj AI bere kontext pro další odpovědi.
  //    Zpráva s fotkou je SMS s popiskem, hlasovka k ní nejde.
  const recorded = photo ? null : await recordVoiceMessage(db, env, {
    teamId,
    messageId,
    scene: scenario.description,
    body: initialBody,
    drunk,
    ambience,
    force: opts.forceVoice ?? false,
    player: {
      id: player.id,
      firstName: player.firstName,
      age: Number(playerRow.age ?? 25),
      nationality: (playerRow.nationality as string | null) ?? null,
      lifeContext: (playerRow.life_context as string | null) ?? null,
    },
  });
  const voice = recorded?.meta ?? null;
  // U hlasovky je tělem zprávy přepis toho, co zaznělo (u opilé se liší od SMS).
  const body = recorded?.transcript ?? initialBody;
  const now = new Date().toISOString();

  await db.batch([
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
    ).bind(messageId, convId, player.id, senderName, body, JSON.stringify({
      ai_generated: true, scenario_id: scenario.id, turn: 0,
      ...(photo ? { type: "photo", photoKey: photo.key, photoAlt: photo.alt } : voice),
    }), now),
    db.prepare(
      `UPDATE conversations
       SET ai_thread_state = ?, ai_thread_active = 1, ai_thread_last_at = ?,
           last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1
       WHERE id = ?`,
    ).bind(
      JSON.stringify(state), now,
      photo ? `📷 ${initialBody.slice(0, 90)}` : voice ? voicePreviewText(voice.durationSec) : initialBody.slice(0, 100),
      now, convId,
    ),
    db.prepare(
      "UPDATE teams SET last_ai_player_thread_at = ? WHERE id = ?",
    ).bind(now, teamId),
  ]);

  if (draftPlayer) {
    await env.CACHE_KV?.delete(draftKey(teamId))
      .catch((e) => logger.warn({ module: "ai-player-spawn", teamId }, "smazání použitého konceptu", e));
  }

  logger.info({ module: "ai-player-spawn", teamId }, `spawned AI thread: ${player.firstName} ${player.lastName} → ${scenario.id}${voice ? ` (hlasovka ${voice.durationSec} s, ${voice.voice})` : ""}${photo ? " (fotka)" : ""}`);
  return { sent: true, draft };
}

async function readDraft(kv: KVNamespace | undefined, teamId: string): Promise<MessageDraft | null> {
  if (!kv) return null;
  const raw = await kv.get(draftKey(teamId))
    .catch((e) => { logger.warn({ module: "ai-player-spawn", teamId }, "čtení konceptu", e); return null; });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MessageDraft;
  } catch (e) {
    logger.warn({ module: "ai-player-spawn", teamId }, "koncept není JSON", e);
    return null;
  }
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
    if (p.zivotniSituace) w += 2; // kdo něco řeší, spíš se ozve (spec 17d)
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
  // Od téhle chvíle se počítá, jak dlouho hráči odpověď trvala. Generování
  // modelu se do pauzy započítá, ať čekání nesčítáme dvakrát.
  const zacatek = Date.now();
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
    `SELECT p.id, p.first_name, p.last_name, p.nationality, p.age, p.position, p.team_id, p.loan_from_team_id, p.personality, p.life_context, p.coach_relationship, p.is_celebrity,
            ${INJURY_COLUMN}
       FROM players p WHERE p.id = ?`,
  ).bind(state.player_id).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load player for reply", e); return null; });

  const playerClubTeamId = playerRow
    ? await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?")
      .bind(playerRow.team_id).first<{ id: string }>()
      .then((row) => row?.id ?? playerRow.team_id)
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "resolve player club for reply", e); return playerRow.team_id; })
    : null;
  const conversationClubTeamId = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?")
    .bind(conv.team_id).first<{ id: string }>()
    .then((row) => row?.id ?? conv.team_id)
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "resolve conversation club for reply", e); return conv.team_id; });
  const playerLoanOwnerClubTeamId = playerRow?.loan_from_team_id
    ? await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?")
      .bind(playerRow.loan_from_team_id).first<{ id: string }>()
      .then((row) => row?.id ?? playerRow.loan_from_team_id)
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "resolve loan owner club for reply", e); return playerRow.loan_from_team_id; })
    : null;

  if (!playerRow || (playerClubTeamId !== conversationClubTeamId && playerLoanOwnerClubTeamId !== conversationClubTeamId)) {
    logger.info({ module: "ai-player-spawn" }, `player ${state.player_id} no longer in team, closing thread`);
    await db.batch([
      db.prepare(
        "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Systém', ?, ?)",
      ).bind(uuid(), convId, "📵 Hráč už není v týmu, konverzace ukončena.", new Date().toISOString()),
      db.prepare(
        `UPDATE conversations SET ai_thread_active = 0, ai_thread_state = ? WHERE id = ?`,
      ).bind(JSON.stringify({ ...state, awaiting: "done" }), convId),
    ]);
    return;
  }

  const player = loadPlayerSnapshot(playerRow);
  // Pozvánka z hospody: v celé konverzaci sedí v hospodě a píše opile, i když už je pozdě.
  if (scenario.atPub) player.atPub = true;
  player.znalostiIncidentu = await nactiZnalostiHrace(db, {
    teamId: conv.team_id, playerId: player.id,
    tema: state.incidentId && state.incidentDen ? { incidentId: state.incidentId, den: state.incidentDen } : null,
  });
  const situaceKind = (await nactiSituaceTymu(db, conv.team_id)).get(player.id);
  player.zivotniSituace = situaceKind ? { kind: situaceKind, label: nazevSituace(situaceKind) } : undefined;
  // Domluva o váze (postava, část 3): výsledek rozhodla hra, model odpoví podle něj.
  const teamGameDate = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(conv.team_id)
    .first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "herní den pro domluvu o váze", e); return null; });
  if (teamGameDate?.game_date) player.weightTalk = weightTalkFromState(conv.ai_thread_state, teamGameDate.game_date);
  player.lastOwnMessageAt = await loadLastOwnMessageAt(db, convId, player.id);
  const teamCtx = await loadTeamContext(db, conv.team_id);

  // Načti historii (posledních 6 zpráv chronologicky)
  const histRows = await db.prepare(
    "SELECT sender_type, body, sent_at, json_extract(metadata, '$.photoAlt') AS photo_alt FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 6",
  ).bind(convId).all<{ sender_type: string; body: string; sent_at: string; photo_alt: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load history", e); return { results: [] }; });

  const history: ThreadMessage[] = histRows.results
    .reverse()
    .filter((m) => m.sender_type === "player" || m.sender_type === "user")
    .map((m) => ({
      sender: m.sender_type === "player" ? "player" : "coach",
      body: historyBody(m.body, m.photo_alt),
      // Zprávy z dřívějších rozhovorů: model je smí znát, ale vyhodnocení tohohle rozhovoru
      // je počítat nesmí (příslib místa v základu z 13. 10. se propsal do hospody 24. 10.).
      earlier: m.sent_at < (state.initiated_at ?? ""),
    }));

  const newRepliesCount = state.current_replies + 1;
  // max_replies funguje jako tvrdý strop. AI ale může konverzaci uzavřít kdykoli dřív přes conversation_complete.
  const isHardCap = newRepliesCount >= state.max_replies;

  // „Přečteno“ (left-on-read.ts): hráč si zprávu přečte a neodpoví, rozhovor tím končí.
  // Rozhoduje se před generováním odpovědi, ať se mezitím neukazuje „píše…“.
  const readInput = {
    relationship: player.coachRelationship,
    coachStreak: await coachStreak(db, convId),
    atWork: playerTimeContext(player, new Date()).situace === "prace",
  };
  // Dotaz na incident, domluva o váze a přemlouvání trucujícího hráče čekají odpověď.
  const mayLeaveOnRead = !state.incidentId && !player.weightTalk && state.trigger !== "left_out";
  if (mayLeaveOnRead && Math.random() < leftOnReadChance({ ...readInput, closing: isHardCap })) {
    await new Promise((resolve) => setTimeout(resolve, readDelayMs(Math.random())));
    await leaveOnReadAndClose(db, env, conv, state, player, scenario, history);
    return;
  }

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

  // Na konci rozhovoru už často není co dodat: hráč závěrečnou repliku nepošle, jen si
  // trenérovu zprávu přečte.
  if (mayLeaveOnRead && (reply.conversationComplete || isHardCap) && Math.random() < leftOnReadChance({ ...readInput, closing: true })) {
    await leaveOnReadAndClose(db, env, conv, state, player, scenario, history);
    return;
  }

  await pockejNezDopise(zacatek, reply.body, player);

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

/**
 * „Přečteno“: trenérovy zprávy dostanou modré fajfky, hráč nic nenapíše a rozhovor se
 * vyhodnotí a zavře. Kdyby zůstal čekat na trenéra, `expireStaleAiThreads` by po pár dnech
 * hráče „urazila“, že mu trenér neodepsal, ačkoli naposled psal trenér.
 */
async function leaveOnReadAndClose(
  db: D1Database,
  env: ChatEnv,
  conv: ConvRow,
  state: AiThreadStateData,
  player: PlayerSnapshot,
  scenario: AiScenario,
  history: ThreadMessage[],
): Promise<void> {
  await markCoachMessagesRead(db, conv.id, new Date().toISOString());
  let resolution: NonNullable<AiThreadStateData["resolution"]>;
  try {
    resolution = { ...(await evaluateResolution(env, player, history, scenario)) };
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, "vyhodnocení rozhovoru nechaného na přečteno, beru neutrální", e);
    resolution = {
      morale_delta: 0, condition_delta: 0, relationship_delta: 0, absence_days: 0, absence_reason: "",
      summary: "Konverzace skončila bez výrazného závěru.", tone: "neutral",
    };
  }
  // Když šlo o vážnou věc (stížnost, přestup), nechat trenéra na přečteno vztah trochu sníží.
  if (scenario.category === "complaint" || scenario.category === "transfer") {
    resolution = {
      ...resolution,
      relationship_delta: resolution.relationship_delta - 2,
      summary: `${resolution.summary} Nakonec tě nechal na přečteno.`,
    };
  }
  logger.info({ module: "ai-player-spawn" }, `conv ${conv.id}: hráč nechal trenéra na přečteno`);
  await applyResolutionAndClose(db, conv.id, conv.team_id, player.id, null, `${player.firstName} ${player.lastName}`, scenario.id, state, resolution);
}

async function applyResolutionAndClose(
  db: D1Database,
  convId: string,
  teamId: string,
  playerId: string,
  /** Závěrečná replika hráče; null = „přečteno“, hráč už nic nenapsal. */
  finalReplyBody: string | null,
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
  const systemMsg = `📅 Schválené volno: hráč nebude k dispozici ${absenceDays} ${absenceDays === 1 ? "den" : absenceDays < 5 ? "dny" : "dní"}.`;

  // „Konverzace ukončena" se shrnutím do chatu už nepíšeme (uživatel 2026-10-24): jestli
  // hráče naštval, vidí trenér ve vztahu v profilu. Hlášku dostane jen schválené volno,
  // o tom se trenér dozvědět musí.
  const jeOdTrenera = scenarioId === "coach_initiated";
  const hlasitUkonceni = absenceDays > 0;

  const stmts: D1PreparedStatement[] = [
    // Závěrečná zpráva hráče
    ...(finalReplyBody === null ? [] : [db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
    ).bind(uuid(), convId, playerId, senderName, finalReplyBody, JSON.stringify({ ai_generated: true, scenario_id: scenarioId, turn: state.max_replies, final: true }), now)]),

    // Aplikace dopadu na hráče (morale + condition v life_context)
    db.prepare(
      `UPDATE players SET
         life_context = json_set(
           life_context,
           '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)),
           '$.condition', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.condition'), 100) + ?))
         )
       WHERE id = ?`,
    ).bind(resolution.morale_delta, resolution.condition_delta, playerId),

    // Vztah k trenérovi i s důvodem pro Kabinu. Rozhovor od trenéra má menší rozsah
    // a strop jednou za herní den (viz `dopadRozhovoru`), vlákno od hráče jede jako dřív.
    ...(jeOdTrenera ? [] : coachRelationStmts(db, {
      playerId,
      delta: resolution.relationship_delta,
      source: "sms_thread",
      description: `Rozhovor v telefonu: ${resolution.summary}`,
    })),

    // Uzavření konverzace. Bez systémové hlášky zůstává v přehledu poslední
    // replika hráče, což je i tak to, co si trenér přečte. Při „přečteno“ bez hlášky
    // zůstává v přehledu trenérova zpráva a nic nepřibývá k nepřečteným.
    finalReplyBody === null && !hlasitUkonceni
      ? db.prepare("UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0 WHERE id = ?")
        .bind(JSON.stringify(newState), convId)
      : db.prepare(
        "UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0, last_message_text = ?, last_message_at = ?, unread_count = unread_count + ? WHERE id = ?",
      ).bind(
        JSON.stringify(newState),
        (hlasitUkonceni ? systemMsg : finalReplyBody ?? "").slice(0, 100),
        now, (hlasitUkonceni ? 1 : 0) + (finalReplyBody === null ? 0 : 1), convId,
      ),
  ];

  if (jeOdTrenera) {
    const { dopadRozhovoru } = await import("./coach-initiated");
    const { COACH_CHAT_MAX_RELATION } = await import("../lib/coach-relation");
    const lim = COACH_CHAT_MAX_RELATION;
    stmts.push(...await dopadRozhovoru(db, teamId, playerId, {
      relationshipDelta: Math.max(-lim, Math.min(lim, Math.round(resolution.relationship_delta))) || 0,
      // Morálka vlákna jde výš (UPDATE nahoře), sem jen vztah, ať se nepočítá dvakrát.
      moraleDelta: 0,
      summary: resolution.summary,
    }));
  }

  if (hlasitUkonceni) {
    stmts.splice(1, 0, db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'system', 'Systém', ?, ?, ?, 1)",
    ).bind(uuid(), convId, systemMsg, JSON.stringify({ resolution, scenario_id: scenarioId }), now));
  }

  // Pokud trenér hráči schválil volno → vložíme do injuries (využíváme stávající absence systém,
  // type='obecne' je jediný povolený "neanatomický" typ, severity 'lehke' pro krátké absence)
  if (absenceDays > 0) {
    stmts.push(
      db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, created_at, osobni_volno) VALUES (?, ?, ?, 'obecne', ?, 'lehke', ?, ?, ?, 1)",
      ).bind(uuid(), playerId, teamId, resolution.absence_reason || "Schválené osobní volno", absenceDays, absenceDays, now),
    );
  }

  // ── Dopad do kabiny ────────────────────────────────────────────────────────
  // Konflikt a pochvala se propíšou do vztahu mezi oběma hráči, takže se hovor
  // s trenérem promítne do chemie sestavy (rivalita ji táhne dolů, přátelské
  // vazby nahoru). Bez tohohle zůstal spor jen v textu SMS.
  if (state.subject_player_id && (scenarioId === "team_chemistry" || scenarioId === "assist_teamwork")) {
    const subjectId = state.subject_player_id;
    const [aId, bId] = playerId < subjectId ? [playerId, subjectId] : [subjectId, playerId];
    // Dvojice se ukládá v libovolném pořadí (generátor, přestupy, AI týmy řadí jinak),
    // proto se hledá v obou. Dřív se hledalo jen seřazené pořadí a na testu tak kód
    // minul 374 ze 687 vztahů: smír neoslabil rivalitu a hádka založila druhý vztah.
    // Má-li dvojice víc vztahů, přednost má rivalita, o tu tu jde.
    const existing = await db.prepare(
      `SELECT id, type, strength FROM relationships
        WHERE (player_a_id = ? AND player_b_id = ?) OR (player_a_id = ? AND player_b_id = ?)
        ORDER BY CASE type WHEN 'rivals' THEN 0 ELSE 1 END
        LIMIT 1`,
    ).bind(aId, bId, bId, aId).first<{ id: string; type: string; strength: number }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load pair relation", e); return null; });

    if (scenarioId === "team_chemistry") {
      // Trenér spor urovnal → rivalita slábne (a při vyhasnutí mizí).
      // Odbyl ho → rivalita vzniká nebo sílí.
      if (resolution.tone === "positive") {
        if (existing?.type === "rivals") {
          const next = existing.strength - 25;
          stmts.push(next <= 10
            ? db.prepare("DELETE FROM relationships WHERE id = ?").bind(existing.id)
            : db.prepare("UPDATE relationships SET strength = ? WHERE id = ?").bind(next, existing.id));
          logger.info({ module: "ai-player-spawn", teamId }, `smír: rivalita ${playerId}×${subjectId} → ${next <= 10 ? "zrušena" : next}`);
        }
      } else if (resolution.tone === "negative") {
        if (existing?.type === "rivals") {
          stmts.push(db.prepare("UPDATE relationships SET strength = MIN(100, strength + 20) WHERE id = ?").bind(existing.id));
        } else if (!existing) {
          stmts.push(db.prepare(
            "INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, 'rivals', 45)",
          ).bind(uuid(), aId, bId));
          logger.info({ module: "ai-player-spawn", teamId }, `nová rivalita ${playerId}×${subjectId}`);
        }
      }
    } else if (scenarioId === "assist_teamwork" && resolution.tone !== "negative") {
      // Vydařená spolupráce dvojici sbližuje — rivalita polevuje, jinak vzniká parta.
      if (existing?.type === "rivals") {
        stmts.push(db.prepare("UPDATE relationships SET strength = MAX(0, strength - 15) WHERE id = ?").bind(existing.id));
      } else if (existing) {
        stmts.push(db.prepare("UPDATE relationships SET strength = MIN(100, strength + 10) WHERE id = ?").bind(existing.id));
      } else {
        stmts.push(db.prepare(
          "INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, 'drinking_buddies', 40)",
        ).bind(uuid(), aId, bId));
      }
    }
  }

  // Konverzace po zatrhnutém přestupu hýbe i trucem (transferUnrest):
  // uklidnil ho → −30, neutrál → −10, naštval ho ještě víc → +15.
  if (scenarioId === "rejected_offer") {
    const unrestDelta = resolution.tone === "positive" ? -30 : resolution.tone === "negative" ? 15 : -10;
    stmts.push(
      db.prepare(
        `UPDATE players SET life_context = json_set(
           life_context,
           '$.transferUnrest.level',
           MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.transferUnrest.level'), 0) + ?))
         )
         WHERE id = ? AND json_extract(life_context, '$.transferUnrest') IS NOT NULL`,
      ).bind(unrestDelta, playerId),
    );
  }

  // Truc po nenominaci (multiplayer/left-out.ts): přemluvený hráč přestane vynechávat
  // tréninky. Rozhovor o herních minutách (bench_complaint) se počítá taky, jde o totéž.
  // Neutrál truc nechá, jak je; naštvaný hráč trucuje o tři dny déle.
  if (scenarioId === "left_out" || scenarioId === "bench_complaint") {
    if (resolution.tone === "positive") {
      stmts.push(db.prepare(
        "UPDATE players SET life_context = json_remove(life_context, '$.leftOutSulk') WHERE id = ?",
      ).bind(playerId));
    } else if (resolution.tone === "negative") {
      stmts.push(db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.leftOutSulk.until',
           date(json_extract(life_context, '$.leftOutSulk.until'), '+3 days'))
         WHERE id = ? AND json_extract(life_context, '$.leftOutSulk.until') IS NOT NULL`,
      ).bind(playerId));
    }
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
export async function expireStaleAiThreads(
  db: D1Database,
  env?: ChatEnv,
): Promise<{ offended: number; safetyClosed: number; coachClosed: number }> {
  let offended = 0;
  let safetyClosed = 0;
  let coachClosed = 0;

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
    // Vlákno majitele firmy si hlídá vlastní lhůtu v herním čase (sponsors/owner-sms.ts).
    if ((state as { kind?: string }).kind === "sponsor_owner") continue;

    if (state.awaiting === "coach" && state.scenario_id === "coach_initiated") {
      // Rozhovor začal trenér a pak přestal psát: to není ignorování hráče, jen konec
      // hovoru. Žádná urážka, vyhodnotí se, co v rozhovoru padlo.
      await closeCoachThreadQuietly(db, env, conv, state);
      coachClosed++;
    } else if (state.awaiting === "coach") {
      // Hráč se urazí
      await offendPlayer(db, conv, state);
      offended++;
    } else if (conv.last_message_at && new Date(conv.last_message_at) < new Date(Date.now() - SAFETY_NET_DAYS * 24 * 3600 * 1000)) {
      // Safety net: zaseknutý thread → force close bez penalty
      await closeThread(db, conv.id, state, { morale_delta: 0, condition_delta: 0, relationship_delta: 0, summary: "Konverzace přerušena (timeout).", tone: "neutral" });
      safetyClosed++;
    }
  }

  if (offended > 0 || safetyClosed > 0 || coachClosed > 0) {
    logger.info({ module: "ai-player-spawn" }, `stale check: ${offended} offended players, ${safetyClosed} safety-closed, ${coachClosed} coach chats closed`);
  }
  return { offended, safetyClosed, coachClosed };
}

/**
 * Zavře rozhovor, který začal trenér a na který už nenapsal. Dopad se vyhodnotí jen ze
 * zpráv tohohle rozhovoru a projde stejnými mezemi i denní pojistkou jako rozhovor,
 * který skončil sám (`dopadRozhovoru`). Bez AI se zavře neutrálně.
 */
async function closeCoachThreadQuietly(
  db: D1Database,
  env: ChatEnv | undefined,
  conv: ConvRow,
  state: AiThreadStateData,
): Promise<void> {
  const neutral: NonNullable<AiThreadStateData["resolution"]> = {
    morale_delta: 0, condition_delta: 0, relationship_delta: 0,
    summary: "Rozhovor utichl.", tone: "neutral",
  };
  let resolution = neutral;
  let playerId: string | null = null;
  try {
    const playerRow = await db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.nationality, p.age, p.position, p.team_id, p.loan_from_team_id, p.personality, p.life_context, p.coach_relationship, p.is_celebrity,
            ${INJURY_COLUMN}
       FROM players p WHERE p.id = ?`,
    ).bind(state.player_id).first<Record<string, unknown>>();
    const scenario = getScenarioById("coach_initiated");
    if (playerRow && scenario && env) {
      playerId = playerRow.id as string;
      // Jen zprávy tohohle rozhovoru: starší už se vyhodnotily jinde.
      const rows = await db.prepare(
        `SELECT sender_type, body, json_extract(metadata, '$.photoAlt') AS photo_alt FROM messages
          WHERE conversation_id = ? AND sender_type IN ('player','user') AND sent_at >= ?
          ORDER BY sent_at ASC LIMIT 12`,
      ).bind(conv.id, state.initiated_at ?? "1970-01-01").all<{ sender_type: string; body: string; photo_alt: string | null }>();
      const history: ThreadMessage[] = rows.results.map((m) => ({
        sender: m.sender_type === "player" ? "player" : "coach", body: historyBody(m.body, m.photo_alt),
      }));
      if (history.length > 0) {
        resolution = { ...(await evaluateResolution(env, loadPlayerSnapshot(playerRow), history, scenario)) };
      }
    }
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, `vyhodnocení utichlého rozhovoru ${conv.id}, zavírám neutrálně`, e);
    resolution = neutral;
  }

  const { dopadRozhovoru } = await import("./coach-initiated");
  const { COACH_CHAT_MAX_RELATION, COACH_CHAT_MAX_MORALE } = await import("../lib/coach-relation");
  const clampTo = (v: number, lim: number) => Math.max(-lim, Math.min(lim, Math.round(v))) || 0;
  const dopad = playerId
    ? await dopadRozhovoru(db, conv.team_id, playerId, {
      relationshipDelta: clampTo(resolution.relationship_delta, COACH_CHAT_MAX_RELATION),
      moraleDelta: clampTo(resolution.morale_delta, COACH_CHAT_MAX_MORALE),
      summary: resolution.summary,
    })
    : [];

  await db.batch([
    db.prepare("UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0 WHERE id = ?")
      .bind(JSON.stringify({ ...state, awaiting: "done", resolution }), conv.id),
    ...dopad,
  ]).catch((e) => logger.error({ module: "ai-player-spawn" }, `zavření utichlého rozhovoru ${conv.id}`, e));
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

  const personality = (() => {
    try { return JSON.parse(playerRow.personality); } catch (e) {
      logger.warn({ module: "ai-player-spawn" }, `parse personality of ${playerRow.id}`, e);
      return {};
    }
  })();
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
         life_context = json_set(life_context, '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
       WHERE id = ?`,
    ).bind(moraleDelta, playerRow.id),

    ...coachRelationStmts(db, {
      playerId: playerRow.id,
      delta: relationshipDelta,
      source: "sms_ignored",
      description: "Urazil se, že jsi mu několik dní neodpověděl",
    }),

    db.prepare(
      "UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0, last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1 WHERE id = ?",
    ).bind(
      JSON.stringify({ ...state, awaiting: "done", resolution: { morale_delta: moraleDelta, condition_delta: 0, relationship_delta: relationshipDelta, summary: "Hráč se urazil, trenér nereagoval.", tone: "negative", offended: true } }),
      systemMsg.slice(0, 100), now, conv.id,
    ),
  ]);

  logger.info({ module: "ai-player-spawn", teamId: conv.team_id }, `offended player ${playerRow.first_name} ${playerRow.last_name} (morale ${moraleDelta}, relationship ${relationshipDelta})`);
}

/**
 * Kdy hráč v konverzaci naposledy sám psal (ISO), `undefined` když nikdy.
 *
 * Šablonové SMS (díky za odmítnutou nabídku, výmluva na zranění) chodí
 * i v deset večer. Kdo ji před minutou poslal, nemůže trenérovi vyčítat,
 * že ho vzbudil. V kabině píše víc hráčů, proto filtr na `sender_id`.
 *
 * Přes `julianday`, protože část zpráv má `sent_at` z `datetime('now')`
 * s mezerou místo `T` a jako řetězec by se se zbytkem neporovnala správně.
 */
export async function loadLastOwnMessageAt(
  db: D1Database, convId: string, playerId: string,
): Promise<string | undefined> {
  const row = await db.prepare(
    `SELECT strftime('%Y-%m-%dT%H:%M:%SZ', MAX(julianday(sent_at))) AS at FROM messages
     WHERE conversation_id = ? AND sender_type = 'player' AND sender_id = ?`,
  ).bind(convId, playerId).first<{ at: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "poslední zpráva hráče", e); return null; });
  return row?.at ?? undefined;
}

/**
 * Nechá odpověď dojít až za chvíli.
 *
 * Model odpoví do vteřiny a zpráva do té doby padala do telefonu rychleji,
 * než ji stihl trenér přečíst odeslanou. Pauza se skládá z toho, jak dlouho
 * si hráč zprávy všimne a jak dlouho tu svoji píše, takže delší odpověď
 * přijde později a ten, koho SMS vzbudila, se ozve nejpozději.
 *
 * Čas strávený generováním se odečítá: když model přemýšlel pět vteřin,
 * čeká se jen zbytek.
 */
export async function pockejNezDopise(
  zacatek: number,
  text: string,
  player: {
    occupation?: string; id: string; discipline: number; temper: number;
    age: number; alcohol: number; lastOwnMessageAt?: string;
  },
): Promise<void> {
  const { kontextCasu, zpozdeniOdpovedi } = await import("./chat-kontext");
  const { smenaProPovolani } = await import("../generators/occupations");

  const cas = kontextCasu(
    new Date(), smenaProPovolani(player.occupation), seedFromString(player.id),
    player.alcohol, player.age, player.lastOwnMessageAt,
  );
  const cil = zpozdeniOdpovedi({
    znaku: text.length, situace: cas.situace,
    discipline: player.discipline, temper: player.temper,
    podnapilost: cas.podnapilost,
  });
  const zbyva = cil - (Date.now() - zacatek);
  if (zbyva <= 0) return;
  await new Promise((r) => setTimeout(r, zbyva));
}
