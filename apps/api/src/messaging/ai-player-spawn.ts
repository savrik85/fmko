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

import { pushPhoneMessage, type OptionalPushKeys } from "../community/phone-push";
import { transferTalkFrom } from "../transfers/unrest-reasons";
import { nactiZnalostiHrace } from "../incidents/znalosti-db";
import { promisesInquiry } from "../incidents/interrogation-tactics";
import { nazevSituace } from "../incidents/situace";
import { loadRecentLifeEvent } from "../incidents/life-news";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { WRAP_UP_MS, remainingMs } from "../lib/time-budget";
import { pickAmbience, recordVoiceMessage, voicePreviewText, type RecordedVoiceMessage } from "./voice-message";
import { PHOTO_CHANCE, PHOTO_SCENES, generatePlayerPhoto, historyBody, pickPhotoScene } from "./player-photo";
import { COACH_CHAT_MAX_MORALE, coachRelationStmts } from "../lib/coach-relation";
import { weightTalkFromState } from "../season/weight-talk";
import { coachStreak, leftOnReadChance, markCoachMessagesRead, readDelayMs } from "./left-on-read";
import { describeNextFriendly, describeNextMatch, playedDayLabel, pragueDay } from "./next-match";
import { refundCoachSms } from "./phone-credit";
import {
  generateInitialMessage,
  generateReply,
  evaluateResolution,
  GeminiUnavailableError,
  playerTimeContext,
  promisesLater,
  type ChatEnv,
  type ReplyResult,
  type ThreadMessage,
  type TeamContext,
} from "./ai-player-chat";
import { loadChatMemory, offerStanceStmt } from "./player-memory";
import { loadOwnRecentLines } from "./repetition";
import { loadCoachAddress } from "./address-form";
import { pledgesFromLife, loadTrainingDays, trainingScheduleText } from "./attendance-pledge";
import { clubRuleLines, loadClubRules } from "./coach-rules";
import {
  cupOutcome, describeLastCupMatch, describeNextCupMatch, isLater, loadLastCupMatch, loadNextCupMatch, withinPreviousWindow,
} from "./cup-facts";
import {
  pickScenarioForPlayer,
  getScenarioById,
  leftOutScenario,
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
  /**
   * Hlasovka namluvená nanečisto (`voice/<messageId>.wav` v R2). Ostré odeslání ji
   * pošle beze změny, ať trenér dostane přesně tu nahrávku, kterou šlo předem slyšet.
   */
  messageId?: string;
  voice?: RecordedVoiceMessage | null;
}
const DRAFT_TTL_SECONDS = 86400;
const draftKey = (teamId: string) => `message_draft:${teamId}`;

// Šance týmu na zprávu od hráče v odpoledním ticku. Při 0,30 psal hráč sám zhruba jednou
// za 1–2 týdny (prod 10/2026), uživatel chtěl hlasovky blíž ke dvěma týdně (2026-10-24).
const SPAWN_PROBABILITY = 0.50;
const COOLDOWN_DAYS = 3;              // min 3 dny mezi thready aby se neobjevily 2 v řadě
/** Šance, že se hráč ráno po opilé hlasovce sám ozve (follow-ups.ts). */
const HANGOVER_CHANCE = 0.6;
const STALE_DAYS_FOR_OFFEND = 3;      // 3 herní dny bez odpovědi trenéra
const SAFETY_NET_DAYS = 14;           // safety net pro úplně zaseknuté thready
/**
 * Starší neodpovězené vlákno se zavře bez urážky. Denní úklid běží každý den, takže vlákno
 * normálně zachytí mezi 3. a 4. dnem. Starší znamená výpadek úklidu (od září 2026 padal
 * na vláknu předáka fanoušků) a trestat trenéra za týdny staré zprávy by bylo nefér.
 */
const OFFEND_MAX_DAYS = 4;

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
  /**
   * Od kdy se čeká na odpověď hráče (ISO). Hodinový úklid (stuck-replies.ts) podle toho
   * pozná odpověď, kterou worker nedokončil, a vrátí vlákno trenérovi.
   */
  awaiting_since?: string;
  initiated_at: string;
  player_id: string;
  /** Spoluhráč, o kterém konverzace je (konflikt / pochvala) — podle výsledku se upraví jejich vztah. */
  subject_player_id?: string;
  subject_player_name?: string;
  /** Zpráva „jen tak" (casual-messages.ts): neodpovězená nikoho neurazí. */
  casual?: boolean;
  /** Vlákno „slyšel jsem…“ (hearsay/messages.ts): o čem hráč slyšel. */
  hearsay_id?: string;
  /** Incident, na který se trenér ptá (spec 7a). Platí jen v herní den `incidentDen`. */
  incidentId?: string;
  incidentDen?: string;
  /** Truc po nenominaci: proč hráč ví, že nejede (on_market, on_loan, told_out). */
  left_out_reason?: string;
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

/** Jak dlouho po vyléčení hráč o zranění mluví jako o nedávném. */
const RECENT_INJURY_DAYS = 14;

/** `life_context.lastInjury` (denní tick při vyléčení), jen pokud je čerstvé. */
export function recentInjuryFrom(raw: unknown, now = Date.now()): PlayerSnapshot["recentInjury"] {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { description?: unknown; healedAt?: unknown; volno?: unknown; fake?: unknown };
  const at = typeof r.healedAt === "string" ? Date.parse(r.healedAt) : NaN;
  if (!Number.isFinite(at) || now - at > RECENT_INJURY_DAYS * 86400_000) return undefined;
  return { description: typeof r.description === "string" ? r.description : "", volno: r.volno === true, fake: r.fake === true };
}

/** Poslední odehraný zápas týmu: výsledek, série, nominace a statistiky hráčů. */
export interface LastMatchContext {
  matchId: string | null;
  lastOutcome: "win" | "loss" | "draw" | null;
  teamStreak: number;
  /** Kdo byl v nominaci podle sestavy uložené u zápasu. null = sestava uložená není. */
  squad: { starters: Set<string>; subs: Set<string> } | null;
  /** Statistiky z toho zápasu podle id hráče, sloupce last_* jako čte `loadPlayerSnapshot`. */
  stats: Map<string, Record<string, unknown>>;
  /**
   * Kdo v zápase chyběl a proč (`matches.absences`: omluvenky, zranění, stopky, volno).
   * Zápasový chat s omluvenkami se po zápase maže, tohle je jediná stopa, že hráč
   * nejel kvůli sobě, a ne proto, že ho trenér nevzal.
   */
  absences?: Map<string, { reason: string; text: string }>;
  /**
   * Omluvenky na dnešní nebo zítřejší zápas, jak je hráč napsal do skupiny zápasu „⚽ vs …“.
   * Osobní chat je dřív neznal a hráč pak trenérovi tvrdil, že je doma a fit
   * (Linhart, Chlumany 2026-11-08).
   */
  upcomingAbsences?: Map<string, UpcomingAbsence>;
  /** Kdo nesmí hrát: stopka za karty a vyřazení za trest (`loadTeamBans`). */
  bans?: Map<string, { cards: number; coach: number }>;
  /** Mistrovský, nebo pohárový (cup_matches). Pohár dřív v kontextu chyběl úplně. */
  kind?: "league" | "cup";
  /** Zápas druhého druhu pár dní před posledním (pohár ve středu, liga v sobotu): kdo v něm hrál. */
  previous?: { kind: "league" | "cup"; stats: Map<string, Record<string, unknown>> };
}

type UpcomingAbsence = NonNullable<PlayerSnapshot["upcomingAbsence"]>;

/**
 * Skutečné důvody omluvenek k zápasu z losu (`getAbsentPlayersMap`, týž výpočet jako
 * sestava): hráč → „Kocovina“, „Práce“… Omluvenka, kterou los nezná („Omluvenka“), důvod
 * nemá. Selhání nic neblokuje, hráč pak zná jen svou výmluvu.
 */
async function excuseReasons(db: D1Database, teamId: string, matchKey: string): Promise<Map<string, string>> {
  try {
    const { getAbsentPlayersMap, resolveMatchContext } = await import("../events/match-absences");
    const ctx = await resolveMatchContext(db, teamId, matchKey);
    if (!ctx) return new Map();
    const drawn = await getAbsentPlayersMap(db, teamId, ctx);
    return new Map([...drawn].flatMap(([id, a]) => (a.reason && a.reason !== "Omluvenka" ? [[id, a.reason] as [string, string]] : [])));
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, `skutečné důvody omluvenek ${matchKey}`, e);
    return new Map();
  }
}

/**
 * Omluvenky na dnešní přátelák. Do kabiny se nepíšou, trenér je vidí v sestavě hned
 * (`visibleAbsencePhases`: přátelák má obě fáze losu najednou). Sestava je otevřená jen
 * v den zápasu (`lineups_open`), stejně jako `findUpcomingMatchContext`.
 */
async function friendlyAbsences(db: D1Database, teamId: string, gameDate: string): Promise<Map<string, UpcomingAbsence>> {
  const out = new Map<string, UpcomingAbsence>();
  const gameDay = gameDate.slice(0, 10);
  const fr = await db.prepare(
    `SELECT m.id, m.created_at, m.home_team_id, ht.name AS home_name, at.name AS away_name
       FROM matches m LEFT JOIN teams ht ON ht.id = m.home_team_id LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.calendar_id IS NULL AND m.league_id IS NULL
        AND m.status = 'lineups_open' AND substr(m.created_at, 1, 10) = ?
      ORDER BY m.created_at LIMIT 1`,
  ).bind(teamId, teamId, gameDay).first<{ id: string; created_at: string; home_team_id: string; home_name: string | null; away_name: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "dnešní přátelák pro omluvenky", e); return null; });
  if (!fr) return out;
  try {
    const { getAbsentPlayersMap } = await import("../events/match-absences");
    const drawn = await getAbsentPlayersMap(db, teamId, { matchKey: fr.id, isFriendly: true, scheduledAt: fr.created_at, gameDate });
    const opponent = (fr.home_team_id === teamId ? fr.away_name : fr.home_name) ?? null;
    for (const [id, a] of drawn) {
      out.set(id, { reason: a.reason === "Omluvenka" ? "" : a.reason, text: a.smsText, when: "dnes", opponent, friendly: true });
    }
  } catch (e) {
    logger.warn({ module: "ai-player-spawn" }, `omluvenky na přátelák ${fr.id}`, e);
  }
  return out;
}

/**
 * Omluvenky z kabiny: „ne“ do skupiny zápasu za poslední dva dny k zápasu, který se ještě
 * nehrál. Bere se text, který trenér viděl, ne nový výpočet: soutěže se starým neodehraným
 * kolem v kalendáři (ČB, U21) by výpočet poslaly k jinému zápasu. Staré skupiny se po
 * zápase nemažou vždycky, proto ta dvoudenní mez.
 *
 * K výmluvě se dohledá skutečný důvod z losu (`excuseReasons`): Nárovec (Budvar Spůle,
 * 29. 10.) psal „Strejda slavil padesát“, v losu měl „Kocovina“, a znal jen výmluvu.
 * K tomu omluvenky na dnešní přátelák, které do kabiny nechodí (`friendlyAbsences`).
 */
export async function loadUpcomingAbsences(db: D1Database, teamId: string, now: Date = new Date()): Promise<LastMatchContext["upcomingAbsences"]> {
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "herní den pro omluvenky", e); return null; });
  const gameDate = team?.game_date ?? now.toISOString();
  const out = await squadChatAbsences(db, teamId, now, gameDate.slice(0, 10));
  for (const [id, a] of await friendlyAbsences(db, teamId, gameDate)) {
    if (!out.has(id)) out.set(id, a);
  }
  return out.size > 0 ? out : undefined;
}

async function squadChatAbsences(db: D1Database, teamId: string, now: Date, gameDay: string): Promise<Map<string, UpcomingAbsence>> {
  const since = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const rows = await db.prepare(
    `SELECT m.sender_id, m.body, json_extract(m.metadata, '$.calendarId') AS cal, json_extract(m.metadata, '$.response') AS response, c.title
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'squad_group' AND m.sender_type = 'player'
        AND (json_extract(m.metadata, '$.response') = 'no' OR json_extract(m.metadata, '$.persuaded') = 1
             OR json_extract(m.metadata, '$.timing') = 'pledge')
        AND substr(m.sent_at, 1, 10) >= ?
      ORDER BY julianday(m.sent_at) DESC LIMIT 60`,
  ).bind(teamId, since).all<{ sender_id: string; body: string; cal: string | null; response: string | null; title: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "omluvenky z kabiny", e); return { results: [] as never[] }; });
  if (rows.results.length === 0) return new Map();

  const cals = [...new Set(rows.results.flatMap((r) => (r.cal ? [r.cal] : [])))];
  if (cals.length === 0) return new Map();
  const ph = cals.map(() => "?").join(",");
  const open = await db.prepare(
    `SELECT id, scheduled_at FROM season_calendar WHERE id IN (${ph}) AND status = 'scheduled'
     UNION ALL SELECT id, created_at FROM matches WHERE id IN (${ph}) AND calendar_id IS NULL AND status != 'simulated'`,
  ).bind(...cals, ...cals).all<{ id: string; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "zápasy omluvenek z kabiny", e); return { results: [] as never[] }; });
  const whenOf = new Map<string, "dnes" | "zítra">();
  for (const o of open.results) {
    const days = Math.round((Date.parse(o.scheduled_at.slice(0, 10)) - Date.parse(gameDay)) / 86400000);
    // Den předem píše hráč na zítřek; zápas ve starém kole kalendáře kabina bere jako dnešní.
    if (days <= 1) whenOf.set(o.id, days === 1 ? "zítra" : "dnes");
  }

  const out = new Map<string, UpcomingAbsence>();
  const calOf = new Map<string, string>();
  // Nejnovější odpověď hráče k danému zápasu rozhoduje: trenér ho v kabině přemluvil
  // (squad-talk.ts) nebo v SMS (slib „přijdu“, timing pledge) = na ten zápas přijde.
  // Omluvenka na jiný zápas platí dál.
  const decided = new Set<string>();
  for (const r of rows.results) {
    const key = `${r.sender_id}|${r.cal ?? ""}`;
    if (decided.has(key)) continue;
    decided.add(key);
    if (r.response !== "no") continue;
    const when = r.cal ? whenOf.get(r.cal) : undefined;
    if (!when || out.has(r.sender_id)) continue;
    const opponent = r.title?.replace(/^⚽\s*vs\s*/u, "").trim() || null;
    out.set(r.sender_id, { reason: "", text: r.body, when, opponent });
    if (r.cal) calOf.set(r.sender_id, r.cal);
  }
  const reasonsByCal = new Map<string, Map<string, string>>();
  for (const [id, cal] of calOf) {
    if (!reasonsByCal.has(cal)) reasonsByCal.set(cal, await excuseReasons(db, teamId, cal));
    const reason = reasonsByCal.get(cal)?.get(id);
    const a = out.get(id);
    if (reason && a) a.reason = reason;
  }
  return out;
}

/**
 * Jeden zdroj pro všechny cesty, kde hráč píše. Dřív ho načítalo jen zakládání vlákna,
 * odpovědi znaly jen výsledek týmu a hráč pak tvrdil, že hrál, i když nebyl ani v nominaci.
 */
export async function loadLastMatchContext(db: D1Database, teamId: string): Promise<LastMatchContext> {
  const recent = await db.prepare(
    `SELECT m.id, m.home_team_id, m.home_score, m.away_score, m.home_lineup_data, m.away_lineup_data, m.absences, m.simulated_at
       FROM matches m
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
      ORDER BY m.simulated_at DESC LIMIT 5`,
  ).bind(teamId, teamId).all<{
    id: string; home_team_id: string; home_score: number | null; away_score: number | null;
    home_lineup_data: string | null; away_lineup_data: string | null; absences: string | null; simulated_at: string | null;
  }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load recent matches", e); return { results: [] as never[] }; });

  const outcomeOf = (row: { home_team_id: string; home_score: number | null; away_score: number | null }): "win" | "loss" | "draw" => {
    const isHome = row.home_team_id === teamId;
    const my = (isHome ? row.home_score : row.away_score) ?? 0;
    const opp = (isHome ? row.away_score : row.home_score) ?? 0;
    return my > opp ? "win" : my < opp ? "loss" : "draw";
  };

  // Série: kolik zápasů po sobě tým vyhrál (+) nebo prohrál (−)
  let teamStreak = 0;
  for (const r of recent.results) {
    const o = outcomeOf(r);
    if (o === "draw") break;
    if (teamStreak === 0) teamStreak = o === "win" ? 1 : -1;
    else if ((teamStreak > 0) === (o === "win")) teamStreak += o === "win" ? 1 : -1;
    else break;
  }

  const upcomingAbsences = await loadUpcomingAbsences(db, teamId);
  const bans = await loadTeamBans(db, teamId);
  const last = recent.results[0];
  // Pohár leží v jiné tabulce (cup-facts.ts). Poslední zápas je ten novější z obou, ten
  // druhý se hráči připomene jako „předtím“, když byl jen pár dní před ním.
  const cup = await loadLastCupMatch(db, teamId);
  const cupFirst = cup != null && isLater(cup.simulatedAt, last?.simulated_at);
  const previousOf = async (kind: "cup" | "league"): Promise<LastMatchContext["previous"]> => {
    if (kind === "cup") {
      if (!cup || !last || !withinPreviousWindow(cup.simulatedAt, last.simulated_at)) return undefined;
      return { kind, stats: (await matchDetails(db, cup.id, cup.lineupData, null, [])).stats };
    }
    if (!last || !cup || !withinPreviousWindow(last.simulated_at, cup.simulatedAt)) return undefined;
    return { kind, stats: (await matchDetails(db, last.id, null, null, [])).stats };
  };

  if (cup && cupFirst) {
    const details = await matchDetails(db, cup.id, cup.lineupData, cup.absences, [cup.cupTeamId, teamId]);
    return {
      matchId: cup.id, kind: "cup", lastOutcome: cupOutcome(cup), teamStreak, ...details, upcomingAbsences, bans,
      previous: await previousOf("league"),
    };
  }
  if (!last) return { matchId: null, lastOutcome: null, teamStreak, squad: null, stats: new Map(), upcomingAbsences, bans };
  const lastOutcome = last.home_score != null ? outcomeOf(last) : null;
  const rawLineup = last.home_team_id === teamId ? last.home_lineup_data : last.away_lineup_data;
  const details = await matchDetails(db, last.id, rawLineup, last.absences, [teamId]);
  return { matchId: last.id, kind: "league", lastOutcome, teamStreak, ...details, upcomingAbsences, bans, previous: await previousOf("cup") };
}

/**
 * Kdo z týmu nesmí hrát: stopka za karty (`players.suspended_matches`, ubývá s každým
 * zápasem týmu) a vyřazení za trest (`club_incident_absences` druhu `vyrazen`). Selhání
 * nic neblokuje, prompt pak o stopce mlčí jako dřív.
 */
export async function loadTeamBans(db: D1Database, teamId: string): Promise<LastMatchContext["bans"]> {
  const [cards, coach] = await Promise.all([
    db.prepare("SELECT id, suspended_matches AS n FROM players WHERE team_id = ? AND suspended_matches > 0")
      .bind(teamId).all<{ id: string; n: number }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, `stopky hráčů ${teamId}`, e); return { results: [] as Array<{ id: string; n: number }> }; }),
    db.prepare(
      `SELECT player_id AS id, MAX(zapasu_zbyva) AS n FROM club_incident_absences
        WHERE team_id = ? AND kind = 'vyrazen' AND zapasu_zbyva > 0 GROUP BY player_id`,
    ).bind(teamId).all<{ id: string; n: number }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, `vyřazení hráčů ${teamId}`, e); return { results: [] as Array<{ id: string; n: number }> }; }),
  ]);
  const out = new Map<string, { cards: number; coach: number }>();
  for (const r of cards.results) out.set(r.id, { cards: r.n, coach: 0 });
  for (const r of coach.results) out.set(r.id, { cards: out.get(r.id)?.cards ?? 0, coach: r.n });
  return out.size > 0 ? out : undefined;
}

/**
 * Sestava, absence a statistiky jednoho zápasu (ligového i pohárového). `absenceTeamIds`:
 * pod kterým id týmu jsou absence zapsané (u poháru je to `cup_teams.id`).
 */
async function matchDetails(
  db: D1Database,
  matchId: string,
  rawLineup: string | null,
  rawAbsences: string | null,
  absenceTeamIds: string[],
): Promise<Pick<LastMatchContext, "squad" | "stats" | "absences">> {
  let squad: LastMatchContext["squad"] = null;
  if (rawLineup) {
    try {
      const lineup = JSON.parse(rawLineup) as { starters?: Array<{ id?: string }>; subs?: Array<{ id?: string }> };
      squad = {
        starters: new Set((lineup.starters ?? []).map((p) => p.id ?? "").filter(Boolean)),
        subs: new Set((lineup.subs ?? []).map((p) => p.id ?? "").filter(Boolean)),
      };
    } catch (e) {
      logger.warn({ module: "ai-player-spawn" }, `nečitelná sestava zápasu ${matchId}`, e);
    }
  }

  const absences = new Map<string, { reason: string; text: string }>();
  let list: Array<{ playerId?: string; teamId?: string; name?: string; reason?: string; smsText?: string }> = [];
  if (rawAbsences) {
    try {
      const parsed = JSON.parse(rawAbsences) as typeof list;
      list = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      logger.warn({ module: "ai-player-spawn" }, `nečitelné absence zápasu ${matchId}`, e);
    }
  }
  const mine = list.filter((a) => a.teamId && absenceTeamIds.includes(a.teamId));
  // Absence zapsané před 1. 11. 2026 (commit 4efa0340) nemají playerId, jen jméno. Bez něj
  // omluvený hráč dostal „trenér tě do nominace nedal“. Jméno se dohledá v kádru týmu.
  const byName = mine.some((a) => !a.playerId && a.name) ? await rosterIdsByName(db, absenceTeamIds) : new Map<string, string>();
  for (const a of mine) {
    const id = a.playerId ?? (a.name ? byName.get(a.name) : undefined);
    if (id) absences.set(id, { reason: a.reason ?? "", text: a.smsText ?? "" });
  }

  const statRows = await db.prepare(
    `SELECT player_id, minutes_played AS last_minutes, goals AS last_goals, assists AS last_assists,
            yellow_cards AS last_yellow, red_cards AS last_red, rating AS last_rating
       FROM match_player_stats WHERE match_id = ?`,
  ).bind(matchId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "statistiky posledního zápasu", e); return { results: [] as Array<Record<string, unknown>> }; });
  const stats = new Map(statRows.results.map((r) => [r.player_id as string, r]));
  return { squad, stats, absences };
}

/**
 * Hráči týmů podle celého jména („Daniel Nárovec“ → id). Dvě stejná jména v kádru se
 * nehádají: takové jméno v mapě není.
 */
async function rosterIdsByName(db: D1Database, teamIds: readonly string[]): Promise<Map<string, string>> {
  if (teamIds.length === 0) return new Map();
  const rows = await db.prepare(
    `SELECT id, first_name || ' ' || last_name AS name FROM players WHERE team_id IN (${teamIds.map(() => "?").join(",")})`,
  ).bind(...teamIds).all<{ id: string; name: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "kádr pro absence podle jména", e); return { results: [] as Array<{ id: string; name: string }> }; });
  const out = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const r of rows.results) {
    if (out.has(r.name)) ambiguous.add(r.name);
    out.set(r.name, r.id);
  }
  for (const name of ambiguous) out.delete(name);
  return out;
}

/** Účast hráče v zápase druhého druhu těsně před posledním (pohár a liga v jednom týdnu). */
function previousMatchOf(matchCtx: LastMatchContext | undefined, playerId: string): PlayerSnapshot["previousMatch"] {
  const prev = matchCtx?.previous;
  if (!prev) return undefined;
  const st = prev.stats.get(playerId) ?? {};
  const minutes = (st.last_minutes as number | null | undefined) ?? 0;
  return { kind: prev.kind, played: minutes > 0, minutes, goals: (st.last_goals as number | null | undefined) ?? 0 };
}

export function loadPlayerSnapshot(
  row: Record<string, unknown>,
  matchCtx?: LastMatchContext,
): PlayerSnapshot {
  const lastStats = matchCtx?.stats.get(row.id as string) ?? {};
  const playedLastMatch = lastStats.last_minutes != null && (lastStats.last_minutes as number) > 0;
  const absence = playedLastMatch ? undefined : matchCtx?.absences?.get(row.id as string);
  const lastMatchSquad: PlayerSnapshot["lastMatchSquad"] = !matchCtx?.lastOutcome ? undefined
    : playedLastMatch ? "played"
    : absence ? "absent"
    : !matchCtx.squad ? undefined
    : matchCtx.squad.subs.has(row.id as string) || matchCtx.squad.starters.has(row.id as string) ? "bench"
    : "out";
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
    sponsorJobFirm: typeof lifeContext.sponsorJob?.firm === "string" ? lifeContext.sponsorJob.firm : undefined,
    nationality: (row.nationality as string | null | undefined) ?? null,
    romani: lifeContext.romani === true,
    transferTalk: transferTalkFrom(lifeContext.transferUnrest),
    injury: parseInjury(row.injury),
    recentInjury: recentInjuryFrom(lifeContext.lastInjury),
    // Kontext posledního zápasu — hráč, který nenastoupil, nemá v match_player_stats minuty.
    lastMatchOutcome: matchCtx?.lastOutcome ?? null,
    playedLastMatch,
    lastMatchSquad,
    lastMatchAbsence: lastMatchSquad === "absent" ? absence : undefined,
    upcomingAbsence: matchCtx?.upcomingAbsences?.get(row.id as string),
    suspension: matchCtx?.bans?.get(row.id as string),
    lastMatchGoals: (lastStats.last_goals as number) ?? 0,
    lastMatchAssists: (lastStats.last_assists as number) ?? 0,
    lastMatchRedCard: ((lastStats.last_red as number) ?? 0) > 0,
    lastMatchYellow: ((lastStats.last_yellow as number) ?? 0) > 0,
    lastMatchRating: (lastStats.last_rating as number) ?? undefined,
    teamStreak: matchCtx?.teamStreak ?? 0,
    previousMatch: previousMatchOf(matchCtx, row.id as string),
    ...pledgesFromLife(lifeContext),
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

/**
 * Kontext klubu pro prompt hráče. `teamId` je klub, kterému patří konverzace (jeho
 * trenérovi hráč píše). `playerTeamId` je tým, za který hráč právě hraje
 * (`players.team_id`): u kluka z U21 nebo hráče na hostování se liší a poslední zápas,
 * příští zápas, tabulka i spoluhráči se pak berou z něj. Dřív dostal výsledky áčka.
 */
export async function loadTeamContext(db: D1Database, teamId: string, playerTeamId?: string | null): Promise<TeamContext> {
  const clubTeamId = teamId;
  const club = await db.prepare(
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

  // Tým, za který hráč hraje. Když je to jiný než klub konverzace, zápasy a tabulka jdou z něj.
  let row = club;
  let playingFor: TeamContext["playingFor"];
  if (playerTeamId && playerTeamId !== clubTeamId) {
    const playing = await db.prepare(
      "SELECT name, league_id, team_type, parent_team_id FROM teams WHERE id = ?",
    ).bind(playerTeamId).first<{ name: string; league_id: string | null; team_type: string | null; parent_team_id: string | null }>()
      .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext tým hráče", e); return null; });
    if (playing) {
      teamId = playerTeamId;
      row = club ? { ...club, league_id: playing.league_id } : null;
      playingFor = {
        kind: playing.team_type === "u21" && playing.parent_team_id === clubTeamId ? "u21" : "loan",
        teamName: playing.name,
      };
    }
  }

  // Poslední odehraný zápas — bez něj si model výsledek vymyslí a gratuluje k prohře,
  // kterou tým vyhrál. Formát stejný jako v rozhovorech pro Zpravodaj.
  const lm = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.simulated_at,
            ht.name AS home_name, at.name AS away_name
       FROM matches m
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
      ORDER BY m.simulated_at DESC LIMIT 1`,
  ).bind(teamId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext last match", e); return null; });

  let leagueResult: string | undefined;
  if (lm && lm.home_score != null && lm.away_score != null) {
    const isHome = lm.home_team_id === teamId;
    const my = (isHome ? lm.home_score : lm.away_score) as number;
    const opp = (isHome ? lm.away_score : lm.home_score) as number;
    const oppName = (isHome ? lm.away_name : lm.home_name) as string;
    const verdict = my > opp ? "výhra" : my < opp ? "prohra" : "remíza";
    leagueResult = `${verdict} ${my}:${opp} ${isHome ? "doma s" : "venku s"} ${oppName}`;
  }

  // Pohár (cup-facts.ts) stejným pravidlem jako `loadLastMatchContext`: poslední je novější
  // z obou, starší se připomene jako „předtím“, když byl jen pár dní před ním.
  const cupLast = await loadLastCupMatch(db, teamId);
  const leagueAt = (lm?.simulated_at as string | null | undefined) ?? null;
  const cupResult = cupLast ? describeLastCupMatch(cupLast) : undefined;
  let lastMatchResult = leagueResult;
  let lastMatchAt = leagueResult ? leagueAt : null;
  let previousMatchResult: string | undefined;
  if (cupLast && isLater(cupLast.simulatedAt, leagueAt)) {
    lastMatchResult = cupResult;
    lastMatchAt = cupLast.simulatedAt;
    if (leagueResult && withinPreviousWindow(leagueAt, cupLast.simulatedAt)) previousMatchResult = `mistrovský zápas: ${leagueResult}`;
  } else if (cupLast && cupResult && withinPreviousWindow(cupLast.simulatedAt, leagueAt)) {
    previousMatchResult = cupResult;
  }
  const nextCup = await loadNextCupMatch(db, teamId);
  const nextCupMatch = nextCup ? describeNextCupMatch(nextCup) : undefined;

  // Příští mistrovský zápas. Staré neodehrané zápasy z minulých sezón v DB zůstaly
  // jako 'scheduled', proto jen termíny od teď dál.
  const nm = await db.prepare(
    `SELECT m.home_team_id, c.scheduled_at, ht.name AS home_name, at.name AS away_name
       FROM matches m
       JOIN season_calendar c ON c.id = m.calendar_id
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status IN ('scheduled', 'lineups_open')
        AND c.scheduled_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
      ORDER BY c.scheduled_at LIMIT 1`,
  ).bind(teamId, teamId).first<{ home_team_id: string; scheduled_at: string; home_name: string; away_name: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext next match", e); return null; });
  const nextMatch = nm
    ? describeNextMatch(new Date(nm.scheduled_at), nm.home_team_id === teamId, nm.home_team_id === teamId ? nm.away_name : nm.home_name)
    : undefined;
  const nextFriendly = await loadNextFriendly(db, teamId);

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
    teamName: club?.name ?? "tým",
    playingFor,
    villageName: row?.village_name ?? undefined,
    // Pražské čtvrti mají ve hře velikost vesnice, ulice je tam slyšet stejně.
    urban: row?.district === "Praha" || ["town", "small_city", "city"].includes(row?.village_size ?? ""),
    managerName: row?.manager_name ?? undefined,
    lastMatchResult,
    // Den zápasu, ať model neříká „včera“ o dnešním kole (lokální E2E 22. 11.).
    lastMatchWhen: lastMatchResult && lastMatchAt ? playedDayLabel(new Date(lastMatchAt)) : undefined,
    previousMatchResult,
    nextMatch,
    nextCupMatch,
    nextFriendly,
    leaguePosition,
    squadNames: squad.results.map((r) => `${r.first_name} ${r.last_name}`),
    // Rozpis tréninků týmu, za který hraje: na co může slíbit, že přijde (attendance-pledge.ts).
    trainingSchedule: trainingScheduleText(await loadTrainingDays(db, teamId)),
    // Pravidla, která trenér vyhlásil kabině („kdo nechodí, nehraje“): zná je každý hráč klubu.
    clubRules: clubRuleLines(await loadClubRules(db, clubTeamId)),
  };
}

/** Vyhodnocení rozhovoru po hotové odpovědi smí běžet ještě chvíli po rozpočtu (`WRAP_UP_MS`). */
function wrapUpDeadline(deadline: number | undefined): number | undefined {
  return deadline === undefined ? undefined : deadline + WRAP_UP_MS;
}

/**
 * Domluvený přátelák (multiplayer/friendly-actions.ts): `matches` bez kola i soutěže, den
 * v `created_at`, hraje se s kolem v 18:00 v Praze. Prompt znal jen ligu přes kalendář a hráč
 * v den přáteláku tvrdil, že se nic nehraje (stejně jako „ve čtvrtek se nikdy nehrálo“).
 */
async function loadNextFriendly(db: D1Database, teamId: string, now: Date = new Date()): Promise<string | undefined> {
  const fr = await db.prepare(
    `SELECT m.home_team_id, m.created_at, ht.name AS home_name, at.name AS away_name, v.name AS neutral_village
       FROM matches m
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       LEFT JOIN challenges ch ON ch.match_id = m.id
       LEFT JOIN villages v ON v.id = ch.neutral_village_id AND ch.venue = 'neutral'
      WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.calendar_id IS NULL AND m.league_id IS NULL
        AND m.status IN ('scheduled', 'lineups_open') AND substr(m.created_at, 1, 10) >= ?
      ORDER BY m.created_at LIMIT 1`,
  ).bind(teamId, teamId, pragueDay(now)).first<{
    home_team_id: string; created_at: string; home_name: string; away_name: string; neutral_village: string | null;
  }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "loadTeamContext přátelák", e); return null; });
  if (!fr) return undefined;
  const [{ pragueKickoffIso }, { FRIENDLY_MATCH_HOUR }] = await Promise.all([
    import("../lib/match-tick-schedule"), import("../multiplayer/friendlies"),
  ]);
  const isHome = fr.home_team_id === teamId;
  return describeNextFriendly(new Date(pragueKickoffIso(fr.created_at.slice(0, 10), FRIENDLY_MATCH_HOUR)), {
    isHome, opponentName: isHome ? fr.away_name : fr.home_name, neutralVillage: fr.neutral_village,
  }, now);
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
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace; AI?: Ai; SEED_DATA?: R2Bucket } & OptionalPushKeys,
  /** Ruční spuštění z adminu: jen jeden tým, bez losu a cooldownu, volitelně rovnou hlasovka a pevné téma. */
  manual?: { teamId: string; forceVoice?: boolean; scenarioId?: string; dryRun?: boolean; drunk?: boolean },
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
           -- Rozepsaná zpráva „jen tak" stížnost nebrzdí, jen se vynechá ten hráč (busy níž).
           AND json_extract(c.ai_thread_state, '$.casual') IS NULL
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
        drunk: manual?.drunk ?? false,
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
 * takže odejde přesně to, co bylo vidět nanečisto. S `forceVoice` se nanečisto
 * namluví i hlasovka, ať jde předem poslechnout.
 *
 * `drunk` je jen pro ruční rozeslání: hráč volá opilý z hospody bez ohledu na téma.
 */
async function spawnForTeam(
  db: D1Database,
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace; SEED_DATA?: R2Bucket; AI?: Ai } & OptionalPushKeys,
  teamId: string,
  opts: { forceVoice?: boolean; forcedScenario?: AiScenario | null; dryRun?: boolean; drunk?: boolean } = {},
): Promise<{ sent: boolean; draft: MessageDraft } | null> {
  const forcedScenario = opts.forcedScenario ?? null;
  // 0. Poslední odehraný zápas + série výsledků — kontext pro scénáře (výhra/prohra,
  //    góly, karty). Dřív scénáře o výhře padaly i po prohře, protože o zápase nevěděly.
  //    Statistiky z něj ukážou góly, karty i to, jestli hráč vůbec nastoupil.
  const matchCtx = await loadLastMatchContext(db, teamId);

  // 1. Načti aktivní hráče s recent stats (last 30 dní)
  const playersRow = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nationality, p.nickname, p.avatar, p.age, p.position,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity,
            COALESCE(stats.recent_minutes, 0) as recent_minutes,
            COALESCE(stats.recent_rating_avg, 6.5) as recent_rating_avg,
            ${INJURY_COLUMN}
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

  if (playersRow.results.length === 0) return null;

  // 2. Vážený výběr hráče: 60 % "potřeba" (nízká morale, málo minut, vysoký temper), 40 % random
  const situace = await nactiSituaceTymu(db, teamId);
  const snapshots = playersRow.results.map((r) => {
    const snap = loadPlayerSnapshot(r, matchCtx);
    const kind = situace.get(snap.id);
    snap.zivotniSituace = kind ? { kind, label: nazevSituace(kind) } : undefined;
    return snap;
  });
  // Hráč, se kterým se zrovna píše, se vynechá, jinak by nové vlákno přepsalo stav toho běžícího.
  // Platí pro ruční téma i pro zprávu „jen tak", která stížnost nebrzdí.
  const busy = new Set<string | null>();
  {
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
  player.recentLifeEvent = await loadRecentLifeEvent(db, teamId, player.id);

  // 3b. U scénářů o spoluhráči vybrat KONKRÉTNÍHO hráče předem — ať se model netrefuje
  //     naslepo a ať víme, čí vztah po rozhovoru upravit.
  let subject: { id: string; name: string } | null = null;
  if (scenario.id === "team_chemistry" || scenario.id === "assist_teamwork") {
    subject = await pickSubjectTeammate(db, teamId, player.id, scenario.id, matchCtx.matchId);
  }

  // 4. Načti team context
  const teamCtx = await loadTeamContext(db, teamId);
  if (subject) teamCtx.subjectPlayerName = subject.name;
  // Ruční rozeslání na začátku sezóny: odehrané zápasy a tabulka jsou z minulé sezóny, mluvit se o nich nemá.
  if (forcedScenario) {
    player.lastMatchOutcome = undefined;
    player.playedLastMatch = undefined;
    player.lastMatchSquad = undefined;
    player.lastMatchAbsence = undefined;
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

  const messageId = (draftPlayer && saved?.messageId) || uuid();
  // Z hospody: kdo se přiznává k pivu, nebo kdo rád pije a zrovna slaví.
  const drunk = opts.drunk === true
    || scenario.id === "alcohol_struggle"
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
      else logger.warn({ module: "ai-player-spawn", teamId }, `fotka ${scene.id} se nepovedla, zpráva jde bez ní`);
      // Kdo posílá fotku z hospody, píše opile (přání uživatele 2026-10-24).
      if (key && scene.id.startsWith("pub_")) player.atPub = true;
    }
  }

  if (!(draftPlayer && saved)) player.ownRecentLines = await loadOwnRecentLines(db, { playerId: player.id, teamId });
  player.coachAddress = await loadCoachAddress(db, { playerId: player.id, teamId });
  let initialBody: string;
  try {
    initialBody = draftPlayer && saved
      ? saved.text
      : await generateInitialMessage(env, player, scenario, teamCtx, writtenAt, photo ? { alt: photo.alt } : undefined, opts.forceVoice === true && !photo);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: "ai-player-spawn" }, `Gemini unavailable for ${player.firstName}: ${e.message}`);
      return null;
    }
    throw e;
  }

  // 6. Místo SMS hlasovka (voice-message.ts): nanejvýš 2 týdně na tým a jen přes Gemini.
  //    Text zůstává v těle zprávy jako přepis, z něj AI bere kontext pro další odpovědi.
  //    Zpráva s fotkou je SMS s popiskem, hlasovka k ní nejde. Koncept nese svou nahrávku.
  const playerRow = playersRow.results.find((r) => r.id === player.id)!;
  const recorded = draftPlayer && saved?.voice
    ? saved.voice
    : photo || (opts.dryRun && !opts.forceVoice) ? null : await recordVoiceMessage(db, env, {
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

  const draft: MessageDraft = {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    coachRelationship: player.coachRelationship,
    scenarioId: scenario.id,
    text: initialBody,
    photo,
    messageId,
    voice: recorded,
  };
  if (opts.dryRun) {
    await env.CACHE_KV?.put(draftKey(teamId), JSON.stringify(draft), { expirationTtl: DRAFT_TTL_SECONDS })
      .catch((e) => logger.warn({ module: "ai-player-spawn", teamId }, "uložení konceptu", e));
    return { sent: false, draft };
  }

  // 7. Najdi/vytvoř player conversation, vlož zprávu, nastav state
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

  // Pozvánka (z hospody): na trenérovo „jdu" se čeká šest hodin (casual-messages.ts).
  if (scenario.invite) {
    const { openInvite } = await import("./casual-messages");
    await openInvite(env.CACHE_KV, convId, { kind: scenario.invite, topicId: scenario.id, teamId, playerId: player.id, playerFirstName: player.firstName });
  }
  // Ráno po opilé hlasovce se hráč, který trenéra aspoň bere, omluví nebo to zlehčí.
  if (voice?.drunk && player.coachRelationship >= 40 && Math.random() < HANGOVER_CHANCE) {
    const { nextFreeMoment, scheduleFollowUp } = await import("./follow-ups");
    await scheduleFollowUp(db, {
      teamId, playerId: player.id, convId, kind: "hangover",
      dueAt: nextFreeMoment(player, new Date(Date.now() + 10 * 3600_000), { allowWork: true, earliestHour: 7 }),
      payload: { anchorAt: now },
    });
  }

  logger.info({ module: "ai-player-spawn", teamId }, `spawned AI thread: ${player.firstName} ${player.lastName} → ${scenario.id}${voice ? ` (hlasovka ${voice.durationSec} s, ${voice.voice})` : ""}${photo ? " (fotka)" : ""}`);
  await pushPhoneMessage(db, env, {
    teamId, convId, sender: senderName,
    text: photo ? `📷 ${initialBody}` : voice ? "🎤 Hlasová zpráva" : initialBody,
  });
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
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace } & OptionalPushKeys,
  convId: string,
  /**
   * `lateReply`: odpověď přichází se zpožděním (follow-ups.ts), hráč řekne, že neměl telefon
   * u sebe. `deadline`: rozpočet práce na pozadí (lib/time-budget.ts), když běží ve waitUntil.
   * `fromRetry`: opakovaný pokus z `retry_reply`; při výpadku modelu nový neplánuje, o další
   * pokus (a o vrácení kreditu po vyčerpání) se stará follow-ups.ts.
   */
  opts: { lateReply?: "offline"; deadline?: number; fromRetry?: boolean } = {},
): Promise<void> {
  try {
    await handleAiPlayerReplyInner(db, env, convId, opts);
  } catch (e) {
    logger.error({ module: "ai-player-spawn" }, `handleAiPlayerReply CRASHED for conv ${convId}`, e);
    // Reset awaiting na coach aby trenér mohl zkusit znovu odpovědět
    await db.prepare(
      `UPDATE conversations SET ai_thread_state = json_set(ai_thread_state, '$.awaiting', 'coach') WHERE id = ?`,
    ).bind(convId).run()
      .catch((err) => logger.warn({ module: "ai-player-spawn" }, "rollback awaiting after crash", err));
    // Odpověď na tuhle SMS už nepřijde (další pokus se neplánuje), kredit se vrací.
    const owner = await db.prepare("SELECT team_id FROM conversations WHERE id = ?").bind(convId).first<{ team_id: string }>()
      .catch((err) => { logger.warn({ module: "ai-player-spawn" }, "klub konverzace pro vrácení kreditu", err); return null; });
    if (owner) await refundCoachSms(db, owner.team_id, convId, "odpověď hráče spadla");
  }
}

async function handleAiPlayerReplyInner(
  db: D1Database,
  env: { GEMINI_API_KEY?: string; CACHE_KV?: KVNamespace } & OptionalPushKeys,
  convId: string,
  opts: { lateReply?: "offline"; deadline?: number; fromRetry?: boolean },
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

  // Truc po nenominaci podle důvodu: hráč na listině se neptá, proč nejede.
  let scenario = state.scenario_id === "left_out" ? leftOutScenario(state.left_out_reason) : getScenarioById(state.scenario_id);
  if (!scenario) {
    logger.warn({ module: "ai-player-spawn" }, `unknown scenario ${state.scenario_id}, force-closing thread`);
    await closeThread(db, convId, state, null);
    return;
  }
  // Pozvání od hráče (porod, zabijačka…): když ho trenér přijal nebo už byl, hráč nezve znovu.
  if (scenario.invite) {
    const { inviteStatus, scenarioAfterInvite } = await import("./casual-messages");
    const status = await inviteStatus(db, env.CACHE_KV, convId, state.initiated_at);
    if (status !== "open") scenario = scenarioAfterInvite(scenario, status);
  }

  // Načti hráče (recent stats nejsou pro reply potřeba, poslední zápas ano)
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
    await refundCoachSms(db, conv.team_id, convId, "hráč už v klubu není");
    return;
  }

  // Účast v posledním zápase podle týmu, za který hráč hraje (`players.team_id`). Hostující
  // nebo hráč z U21 hrál jinou soutěž; výsledek áčka se mu připsat nesmí.
  // Kluk z U21 nebo hráč na hostování dostane účast v zápase svého týmu, ne áčka.
  const replyMatchCtx = await loadLastMatchContext(db, (playerRow.team_id as string | null) ?? conv.team_id);
  const player = loadPlayerSnapshot(playerRow, replyMatchCtx);
  // Pozvánka nebo hlasovka z hospody: v hospodě sedí a píše opile jen ten večer a noc, pak je
  // střízlivý a mluví o tom jako o včerejšku (pub-night.ts; prod 22. 11. psal opile i v poledne).
  if (scenario.atPub) {
    const { pubThreadScenario } = await import("./pub-night");
    const pub = pubThreadScenario(scenario, state.initiated_at, new Date());
    scenario = pub.scenario;
    player.atPub = pub.atPub;
    player.pubMorningAfter = !pub.atPub;
  }
  player.znalostiIncidentu = await nactiZnalostiHrace(db, {
    teamId: conv.team_id, playerId: player.id,
    tema: state.incidentId && state.incidentDen ? { incidentId: state.incidentId, den: state.incidentDen } : null,
  });
  const situaceKind = (await nactiSituaceTymu(db, conv.team_id)).get(player.id);
  player.zivotniSituace = situaceKind ? { kind: situaceKind, label: nazevSituace(situaceKind) } : undefined;
  player.recentLifeEvent = await loadRecentLifeEvent(db, conv.team_id, player.id);
  // Domluva o váze (postava, část 3): výsledek rozhodla hra, model odpoví podle něj.
  const teamGameDate = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(conv.team_id)
    .first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "herní den pro domluvu o váze", e); return null; });
  if (teamGameDate?.game_date) player.weightTalk = weightTalkFromState(conv.ai_thread_state, teamGameDate.game_date);
  player.lastOwnMessageAt = await loadLastOwnMessageAt(db, convId, player.id);
  // Stížnost, truc, odmítnutý přestup, hovor o incidentu: na vážnou věc hráč odpoví hned, ne „ozvu se pak“.
  // Samotná znalost incidentu vážná není, jen role v něm (mustAnswerNow).
  player.seriousTopic = scenario.category === "complaint" || scenario.category === "transfer" || state.trigger === "left_out"
    || !!state.incidentId;
  player.recentlyPostponed = await loadRecentlyPostponed(db, convId);
  player.lateReply = opts.lateReply;
  player.ownRecentLines = await loadOwnRecentLines(db, { playerId: player.id, convId });
  player.coachAddress = await loadCoachAddress(db, { playerId: player.id, convId });
  const memory = await loadChatMemory(db, player, { teamId: conv.team_id, convId });
  const teamCtx = await loadTeamContext(db, conv.team_id, playerRow.team_id as string | null);
  // Rozhovor „jen tak" bez tabulky, jinak ji model cpe do každé odpovědi (casual-messages.ts).
  if (scenario.category === "casual" && scenario.id !== "casual_how_are_you") teamCtx.leaguePosition = undefined;

  // Načti historii (posledních 6 zpráv chronologicky)
  const histRows = await db.prepare(
    "SELECT sender_type, body, sent_at, json_extract(metadata, '$.photoAlt') AS photo_alt, json_extract(metadata, '$.drunk') AS drunk FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 6",
  ).bind(convId).all<{ sender_type: string; body: string; sent_at: string; photo_alt: string | null; drunk: number | null }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load history", e); return { results: [] }; });

  const history: ThreadMessage[] = histRows.results
    .reverse()
    .filter((m) => m.sender_type === "player" || m.sender_type === "user")
    .map((m) => ({
      sender: m.sender_type === "player" ? "player" : "coach",
      body: historyBody(m.body, m.photo_alt, m.drunk === 1),
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
    await leaveOnReadAndClose(db, env, conv, state, player, scenario, history, opts.deadline);
    return;
  }

  logger.info({ module: "ai-player-spawn" }, `calling generateReply for conv ${convId} (turn ${newRepliesCount}/${state.max_replies}, isHardCap=${isHardCap})`);
  let reply: ReplyResult;
  try {
    reply = await generateReply(env, player, history, scenario, teamCtx, isHardCap, { deadline: opts.deadline });
    logger.info({ module: "ai-player-spawn" }, `generateReply OK: complete=${reply.conversationComplete}, body=${reply.body.slice(0, 60)}`);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: "ai-player-spawn" }, `Gemini reply failed for conv ${convId}: ${e.message}`);
      await db.prepare(
        "UPDATE conversations SET ai_thread_state = ? WHERE id = ?",
      ).bind(JSON.stringify({ ...state, awaiting: "coach" }), convId).run()
        .catch((err) => logger.warn({ module: "ai-player-spawn" }, "rollback awaiting", err));
      // Trenér za SMS zaplatil: hráč odpoví, až model zase půjde (23. 10. neodepsal ~12 hodin nikdo).
      // Při opakovaném pokusu ne: nový řádek s čerstvým časem by počítal 36 h stále znovu (E2E 22. 11.).
      if (!opts.fromRetry) await scheduleRetryReply(db, { teamId: conv.team_id, playerId: player.id, convId });
      return;
    }
    throw e;
  }

  // Na konci rozhovoru už často není co dodat: hráč závěrečnou repliku nepošle, jen si
  // trenérovu zprávu přečte.
  if (mayLeaveOnRead && (reply.conversationComplete || isHardCap) && Math.random() < leftOnReadChance({ ...readInput, closing: true })) {
    await leaveOnReadAndClose(db, env, conv, state, player, scenario, history, opts.deadline);
    return;
  }

  await pockejNezDopise(zacatek, reply.body, player, opts.deadline);

  const now = new Date().toISOString();
  const senderName = `${player.firstName} ${player.lastName}`;
  const shouldClose = reply.conversationComplete || isHardCap;
  await afterPlayerReply(db, {
    teamId: conv.team_id, convId, player, reply, at: now, offerIds: memory.offerIds,
    incidentId: state.incidentId && state.incidentDen === teamGameDate?.game_date?.slice(0, 10) ? state.incidentId : null,
  });

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
    await pushPlayerReply(db, env, { teamId: conv.team_id, convId, sender: senderName, text: reply.body });
    return;
  }

  // Branch B: AI usoudila že je hotovo (nebo dosažen strop) → vyhodnocení + uzavření
  let resolution: AiThreadStateData["resolution"];
  try {
    const fullHistory: ThreadMessage[] = [...history, { sender: "player", body: reply.body }];
    const evald = await evaluateResolution(env, player, fullHistory, scenario, { deadline: wrapUpDeadline(opts.deadline) });
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

  if (scenario.category === "casual" && resolution) {
    // Psal jen tak: žádné volno a jen malá změna nálady, stejné meze jako rozhovor od trenéra.
    const { COACH_CHAT_MAX_MORALE } = await import("../lib/coach-relation");
    resolution.morale_delta = Math.max(-COACH_CHAT_MAX_MORALE, Math.min(COACH_CHAT_MAX_MORALE, resolution.morale_delta));
    resolution.condition_delta = 0;
    resolution.absence_days = 0;
  }
  // Odpověď má čas, kdy ji hráč napsal (před vyhodnocením): poznámka 📝 ze slibu je o vteřinu za ní.
  await applyResolutionAndClose(db, convId, conv.team_id, player.id, reply.body, senderName, scenario.id, state, resolution, now);
  await pushPlayerReply(db, env, { teamId: conv.team_id, convId, sender: senderName, text: reply.body });
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
  deadline?: number,
): Promise<void> {
  await markCoachMessagesRead(db, conv.id, new Date().toISOString());
  let resolution: NonNullable<AiThreadStateData["resolution"]>;
  try {
    resolution = { ...(await evaluateResolution(env, player, history, scenario, { deadline: wrapUpDeadline(deadline) })) };
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

/**
 * Uzavírá se vlákno jako rozhovor od trenéra (malý dopad, strop zlepšení jednou za den)?
 * Rozhovor, který začal trenér, zpráva „jen tak“ a vlákno „slyšel jsem…“ (hearsay): to si
 * trenér umí vyrobit sám tím, že o hráči napíše jinému, takže omluva za něj nesmí dát
 * velký kladný výsledek (závěrečná kontrola Kabina má uši, 2026-11-21).
 */
/** Nálada z výsledku vlákna: u vlákna „slyšel jsem…“ kladná nejvýš jako rozhovor od trenéra. */
export function resolutionMoraleDelta(state: { hearsay_id?: string }, delta: number): number {
  return state.hearsay_id ? Math.min(delta, COACH_CHAT_MAX_MORALE) : delta;
}

export function closesLikeCoachChat(scenarioId: string, state: { hearsay_id?: string }): boolean {
  return scenarioId === "coach_initiated" || getScenarioById(scenarioId)?.category === "casual" || !!state.hearsay_id;
}

export async function applyResolutionAndClose(
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
  /**
   * Kdy hráč závěrečnou repliku napsal. Vyhodnocení modelem trvá i desítky vteřin a poznámka
   * ze slibu (afterPlayerReply) má čas odpovědi + 1 s: bez toho byla nad odpovědí (E2E 22. 11.).
   */
  finalReplyAt?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const replyAt = finalReplyAt ?? now;
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
  // Zpráva „jen tak" se počítá jako rozhovor od trenéra: malý dopad se stropem jednou denně.
  const jeOdTrenera = closesLikeCoachChat(scenarioId, state);
  const hlasitUkonceni = absenceDays > 0;

  const stmts: D1PreparedStatement[] = [
    // Závěrečná zpráva hráče
    ...(finalReplyBody === null ? [] : [db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read) VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)",
    ).bind(uuid(), convId, playerId, senderName, finalReplyBody, JSON.stringify({ ai_generated: true, scenario_id: scenarioId, turn: state.max_replies, final: true }), replyAt)]),

    // Aplikace dopadu na hráče (morale + condition v life_context)
    db.prepare(
      `UPDATE players SET
         life_context = json_set(
           life_context,
           '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)),
           '$.condition', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.condition'), 100) + ?))
         )
       WHERE id = ?`,
    ).bind(resolutionMoraleDelta(state, resolution.morale_delta), resolution.condition_delta, playerId),

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
): Promise<{ offended: number; safetyClosed: number; coachClosed: number; quietClosed: number; failed: number }> {
  let offended = 0;
  let safetyClosed = 0;
  let coachClosed = 0;
  let quietClosed = 0;
  let failed = 0;

  // 1. Stale "awaiting coach" threads → urazit hráče
  const stale = await db.prepare(
    `SELECT id, team_id, ai_thread_state, last_message_at
     FROM conversations
     WHERE ai_thread_active = 1
       -- julianday, ne porovnání textu: last_message_at je ISO s „T“ a datetime() vrací mezeru,
       -- takže ve stejný den textové porovnání vlákno nevybralo a úklid ho odložil o den.
       AND julianday(last_message_at) < julianday('now', ?)`,
  ).bind(`-${STALE_DAYS_FOR_OFFEND} days`).all<ConvRow>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "load stale threads", e); return { results: [] }; });

  for (const conv of stale.results) {
    // Jedno vadné vlákno nesmí zastavit úklid ostatních (dřív celý běh spadl na prvním z nich).
    try {
      const result = await expireStaleThread(db, env, conv);
      if (result === "offended") offended++;
      else if (result === "coach_closed") coachClosed++;
      else if (result === "quiet_closed") quietClosed++;
      else if (result === "safety_closed") safetyClosed++;
    } catch (e) {
      failed++;
      logger.warn({ module: "ai-player-spawn" }, `úklid vlákna ${conv.id}`, e);
    }
  }

  if (offended > 0 || safetyClosed > 0 || coachClosed > 0 || quietClosed > 0 || failed > 0) {
    logger.info({ module: "ai-player-spawn" }, `stale check: ${offended} offended players, ${safetyClosed} safety-closed, ${coachClosed} coach chats closed, ${quietClosed} closed quietly, ${failed} failed`);
  }
  return { offended, safetyClosed, coachClosed, quietClosed, failed };
}

async function expireStaleThread(
  db: D1Database,
  env: ChatEnv | undefined,
  conv: ConvRow,
): Promise<"offended" | "coach_closed" | "quiet_closed" | "safety_closed" | "skipped"> {
  const state = parseState(conv.ai_thread_state);
  if (!state) return "skipped";
  // Vlákna s `kind` patří jiným modulům a nemají hráče: majitel firmy si hlídá lhůtu sám
  // (sponsors/owner-sms.ts), předák fanoušků čeká na odpověď trenéra (fans/fan-leader-reply.ts),
  // zaseklé psaní majitele uvolní hodinová pojistka (stuck-replies.ts).
  if ((state as { kind?: string }).kind || !state.player_id) return "skipped";

  if (state.awaiting === "coach" && state.scenario_id === "coach_initiated") {
    // Rozhovor začal trenér a pak přestal psát: to není ignorování hráče, jen konec
    // hovoru. Žádná urážka, vyhodnotí se, co v rozhovoru padlo.
    await closeCoachThreadQuietly(db, env, conv, state);
    return "coach_closed";
  }
  if (state.awaiting === "coach" && state.casual) {
    // Zpráva „jen tak": neodpověděl, nic se neděje. Jinak by víc zpráv znamenalo víc povinností.
    await closeWithoutPenalty(db, conv.id, state, "Trenér neodpověděl.");
    return "coach_closed";
  }
  if (state.awaiting === "coach") {
    const tooOld = !!conv.last_message_at
      && new Date(conv.last_message_at) < new Date(Date.now() - OFFEND_MAX_DAYS * 24 * 3600 * 1000);
    // Poslední slovo měl trenér (hráčova odpověď se nedokončila, pojistka vlákno vrátila):
    // trenér nikoho neignoroval, není se proč urážet.
    if (tooOld || (await lastSenderType(db, conv.id)) === "user") {
      await closeWithoutPenalty(db, conv.id, state, "Rozhovor skončil bez odpovědi.");
      return "quiet_closed";
    }
    await offendPlayer(db, conv, state);
    return "offended";
  }
  if (conv.last_message_at && new Date(conv.last_message_at) < new Date(Date.now() - SAFETY_NET_DAYS * 24 * 3600 * 1000)) {
    // Safety net: zaseknutý thread → force close bez penalty
    await closeThread(db, conv.id, state, { morale_delta: 0, condition_delta: 0, relationship_delta: 0, summary: "Konverzace přerušena (timeout).", tone: "neutral" });
    return "safety_closed";
  }
  return "skipped";
}

/** Kdo v konverzaci psal naposledy (`user` = trenér, `player`, `system`). */
async function lastSenderType(db: D1Database, convId: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT sender_type FROM messages WHERE conversation_id = ? ORDER BY julianday(sent_at) DESC LIMIT 1",
  ).bind(convId).first<{ sender_type: string }>();
  return row?.sender_type ?? null;
}

/** Zavře vlákno bez dopadu. Bez posunu last_message_at, ať se konverzace v seznamu nevyhoupne nahoru. */
async function closeWithoutPenalty(db: D1Database, convId: string, state: AiThreadStateData, summary: string): Promise<void> {
  await db.prepare("UPDATE conversations SET ai_thread_state = ?, ai_thread_active = 0 WHERE id = ?")
    .bind(JSON.stringify({ ...state, awaiting: "done", resolution: { morale_delta: 0, condition_delta: 0, relationship_delta: 0, summary, tone: "neutral" } }), convId).run();
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
 * Co hra potřebuje zařídit po každé odpovědi hráče, ať ji napsalo vlákno od hráče,
 * nebo od trenéra: slíbil, že se ozve později (follow-ups.ts ho pak opravdu nechá
 * napsat), a co řekl o čekající nabídce (offer-rejection-impact.ts se podle toho zařídí).
 */
export async function afterPlayerReply(
  db: D1Database,
  r: {
    teamId: string; convId: string; player: PlayerSnapshot; reply: Pick<ReplyResult, "body" | "writeLater" | "transferStance" | "acceptsInvite" | "attendancePledge" | "acceptsRequest">;
    at: string; offerIds: string[];
    /** Incident, o kterém se dnes v hovoru mluví (téma vlákna), jinak nic. */
    incidentId?: string | null;
  },
): Promise<void> {
  // Hráč řekl, že přijde, nebo nepřijde na trénink či zápas (attendance-pledge.ts).
  if (r.reply.attendancePledge) {
    const { recordAttendancePledge } = await import("./attendance-pledge");
    await recordAttendancePledge(db, {
      clubTeamId: r.teamId, convId: r.convId, playerId: r.player.id, playerFirstName: r.player.firstName, pledge: r.reply.attendancePledge,
      now: new Date(r.at), replyBody: r.reply.body,
    });
  }
  // Pokyn trenéra (kolečka, omluva kabině): hráč odepsal, jestli ho splní (coach-rules.ts).
  if (r.reply.acceptsRequest !== undefined && r.player.pendingRequest) {
    const { respondToCoachRequest } = await import("./coach-rules");
    await respondToCoachRequest(db, { commitmentId: r.player.pendingRequest.commitmentId, playerId: r.player.id, accepted: r.reply.acceptsRequest });
  } else if (!r.player.pendingRequest) {
    // Pokyn ze stejné zprávy trenéra se zapsal, zatímco hráč psal (pomalé rozpoznání slibu):
    // model o něm nevěděl, kývnutí se vezme z textu odpovědi.
    const [{ answerRequestFromReply, requestFromSameMessage }, { REQUEST_KINDS }] = await Promise.all([import("./coach-rules"), import("./player-memory")]);
    const late = await requestFromSameMessage(db, { playerId: r.player.id, convId: r.convId, at: r.at, kinds: REQUEST_KINDS });
    if (late) await answerRequestFromReply(db, { commitmentId: late, playerId: r.player.id, replyBody: r.reply.body });
  }
  // Pozvání od trenéra (coach-commitments.ts): hráč v odpovědi kývl nebo odmítl.
  if (r.reply.acceptsInvite !== undefined && r.player.pendingInvite) {
    const { respondToCoachInvite } = await import("./coach-commitments");
    await respondToCoachInvite(db, {
      teamId: r.teamId, convId: r.convId, playerId: r.player.id, playerFirstName: r.player.firstName,
      commitmentId: r.player.pendingInvite.commitmentId, kind: r.player.pendingInvite.kind, accepted: r.reply.acceptsInvite,
    }).catch((e) => logger.warn({ module: "ai-player-spawn", teamId: r.teamId }, "odpověď na pozvání od trenéra", e));
  }
  if (r.reply.transferStance) {
    await offerStanceStmt(db, r.player.id, r.reply.transferStance, r.offerIds).run()
      .catch((e) => logger.warn({ module: "ai-player-spawn", teamId: r.teamId }, "zápis postoje k nabídce", e));
  }
  // Hráč v hovoru o incidentu sám slíbil, že se poptá („poptám se v šatně“): ať má slib dopad,
  // založí se úkol pátrání jako po trenérově „poptej se“ (jednou na incident, coach-commitments.ts).
  if (r.incidentId && promisesInquiry(r.reply.body) && await incidentStillOpen(db, r.incidentId)) {
    const { recordInquiryTask } = await import("./coach-commitments");
    await recordInquiryTask(db, { teamId: r.teamId, convId: r.convId, playerId: r.player.id, incidentId: r.incidentId, coachMessage: r.reply.body, now: new Date(r.at) })
      .catch((e) => logger.warn({ module: "ai-player-spawn", teamId: r.teamId }, `úkol pátrání ze slibu hráče ${r.incidentId}`, e));
  }
  // Pachatel sám slíbil, že to vrátí nebo opraví („Jo, vrátím je“): slib se zapíše jako úkol
  // s lhůtou, ať má dopad, i když podle povahy nesplní (incidents/restitution.ts).
  const { promisesAmends, recordPromisedAmends } = await import("../incidents/restitution");
  if (promisesAmends(r.reply.body)) {
    await recordPromisedAmends(db, { teamId: r.teamId, playerId: r.player.id, reply: r.reply.body, now: new Date(r.at) })
      .catch((e) => logger.warn({ module: "ai-player-spawn", teamId: r.teamId }, "slib nápravy z odpovědi hráče", e));
  }
  // „Poptám se a zítra dám vědět“: odpověď druhý den pošle úkol pátrání (deliverInquiry),
  // druhá odložená zpráva za pár hodin by jen opakovala, že nic neví.
  if (r.reply.writeLater && !(await inquiryJustRequested(db, r.convId, r.at))) {
    const { nextFreeMoment, scheduleFollowUp } = await import("./follow-ups");
    // `replace`: kdo „ozvu se pak" napsal podruhé, se ozve po té druhé (kotva se posune).
    await scheduleFollowUp(db, {
      teamId: r.teamId, playerId: r.player.id, convId: r.convId, kind: "reply_later",
      dueAt: nextFreeMoment(r.player, new Date(Date.parse(r.at) + 3600_000)),
      payload: { anchorAt: r.at }, replace: true,
    });
  }
}

/** Incident jde ještě vyšetřovat (otevřený nebo u policie, pachatel neodhalený)? */
async function incidentStillOpen(db: D1Database, incidentId: string): Promise<boolean> {
  const row = await db.prepare(
    "SELECT 1 AS x FROM club_incidents WHERE id = ? AND status IN ('otevreny', 'policie') AND culprit_revealed = 0",
  ).bind(incidentId).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, `stav incidentu ${incidentId}`, e); return null; });
  return !!row;
}

/** Trenér hráče v poslední hodině požádal, ať se poptá (coach-commitments.ts `recordInquiryTask`)? */
async function inquiryJustRequested(db: D1Database, convId: string, at: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x FROM coach_commitments WHERE conversation_id = ? AND kind = 'task_inquiry' AND status = 'active'
        AND julianday(made_at) > julianday(?) - 1.0 / 24 LIMIT 1`,
  ).bind(convId, at).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, `úkol pátrání v konverzaci ${convId}`, e); return null; });
  return !!row;
}

/**
 * Push, že hráč odepsal na SMS trenéra (hned, nebo opožděně po výpadku modelu). Volá se
 * až po zápisu zprávy, ať ji trenér po klepnutí na push v konverzaci najde. Dřív chodil
 * push jen na zprávy, které hráč začal sám; odpověď po pár minutách trenér neviděl.
 * Přepínač „Události a ostatní“ hlídá `pushPhoneMessage`, selhání se jen zaloguje.
 */
export async function pushPlayerReply(
  db: D1Database,
  env: OptionalPushKeys,
  m: { teamId: string; convId: string; sender: string; text: string },
): Promise<void> {
  await pushPhoneMessage(db, env, m);
}

/** Model nešel, když trenér psal: odpověď se zkusí za necelou hodinu znovu (follow-ups.ts). */
export async function scheduleRetryReply(
  db: D1Database,
  r: { teamId: string; playerId: string; convId: string },
): Promise<void> {
  const { scheduleFollowUp } = await import("./follow-ups");
  await scheduleFollowUp(db, { ...r, kind: "retry_reply", dueAt: new Date(Date.now() + 50 * 60_000) });
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
/**
 * Napsal hráč v téhle konverzaci za posledních 24 h „ozvu se pak“? Podruhé to neodkládá
 * (ai-player-chat.ts mustAnswerNow).
 */
export async function loadRecentlyPostponed(db: D1Database, convId: string): Promise<boolean> {
  const rows = await db.prepare(
    `SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player'
      AND julianday(sent_at) > julianday('now', '-1 day') ORDER BY julianday(sent_at) DESC LIMIT 6`,
  ).bind(convId).all<{ body: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "odložené odpovědi hráče", e); return { results: [] as Array<{ body: string }> }; });
  return rows.results.some((r) => promisesLater(r.body));
}

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
 * čeká se jen zbytek. S rozpočtem práce na pozadí (`deadline`) se čeká nejvýš do něj,
 * ať se hotová odpověď stihne uložit.
 */
export async function pockejNezDopise(
  zacatek: number,
  text: string,
  player: {
    occupation?: string; id: string; discipline: number; temper: number;
    age: number; alcohol: number; lastOwnMessageAt?: string;
  },
  deadline?: number,
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
  const zbyva = Math.min(cil - (Date.now() - zacatek), remainingMs(deadline));
  if (zbyva <= 0) return;
  await new Promise((r) => setTimeout(r, zbyva));
}
