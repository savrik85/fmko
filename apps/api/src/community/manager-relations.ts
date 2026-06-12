/**
 * Vztahy mezi manažery — respekt (−100..100) a heat/napětí (0..100) na dvojici týmů.
 *
 * Pasivní zdroje: výsledky vzájemných zápasů (match-runner hook), blízkost vesnic.
 * Aktivní interakce: pozápasové gesto, pivo, sázka o bečku, anonymní inzerát, dárek.
 * AI manažeři reagují pravidlově podle archetypu (deterministicky z team id).
 */

import { logger } from "../lib/logger";
import {
  betWonNews, betDrawNews, derbyNews, humbleBackfireNews, counterQuoteText,
  stammtischNews, stammtischQuarrelText, stammtischSceneText, pickStammtischEvents,
  pubRoundMessage,
} from "./relation-texts";

export interface RelationMoment {
  date: string; // ISO timestamp
  icon: string;
  text: string;
  rd: number; // respect delta
  hd: number; // heat delta
}

export interface ManagerRelation {
  teamAId: string;
  teamBId: string;
  respect: number;
  heat: number;
  history: RelationMoment[];
}

export type AiArchetype = "provokater" | "urazeny" | "ferovka" | "pohodar";

export const AI_ARCHETYPE_LABELS: Record<AiArchetype, string> = {
  provokater: "Provokatér",
  urazeny: "Věčně uražený",
  ferovka: "Férový chlap",
  pohodar: "Pohodář",
};

const HISTORY_LIMIT = 20;
const NEIGHBOR_KM = 8;
const NEIGHBOR_BASE_HEAT = 20;
const SAME_VILLAGE_BASE_HEAT = 30;

export const DERBY_HEAT_THRESHOLD = 60;
export const ALLY_RESPECT_THRESHOLD = 60;
export const ENEMY_RESPECT_THRESHOLD = -40;

export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function relationStatus(respect: number, heat: number): { key: string; label: string } | null {
  if (heat >= DERBY_HEAT_THRESHOLD) return { key: "rival", label: "Rival — derby" };
  if (respect >= ALLY_RESPECT_THRESHOLD) return { key: "ally", label: "Spojenec" };
  if (respect <= ENEMY_RESPECT_THRESHOLD) return { key: "enemy", label: "Nepřítel" };
  return null;
}

/**
 * Slovní popis vztahu — vesnická škála pro každou kombinaci respektu a napětí.
 * Na rozdíl od relationStatus (jen extrémy) vrací text vždy.
 */
export function relationLabel(respect: number, heat: number): string {
  if (heat >= DERBY_HEAT_THRESHOLD) return respect >= 40 ? "Vážený rival" : "Úhlavní rival";
  if (respect >= ALLY_RESPECT_THRESHOLD) return "Spojenec";
  if (respect <= ENEMY_RESPECT_THRESHOLD) return "Nepřítel";
  if (heat >= 40) return respect >= 20 ? "Vážený sok" : "Vře to mezi vámi";
  if (heat >= 20) return respect >= 30 ? "Přátelská rivalita" : "Sousedské špičkování";
  if (respect >= 30) return "Kamarádi od piva";
  if (respect >= 10) return "Dobří známí";
  if (respect <= -10) return "Křivé pohledy přes náves";
  return "Sotva se zdravíte";
}

/** Deterministický archetyp AI manažera z team id (FNV-1a hash). */
export function aiArchetype(teamId: string): AiArchetype {
  let h = 0x811c9dc5;
  for (let i = 0; i < teamId.length; i++) {
    h ^= teamId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const types: AiArchetype[] = ["provokater", "urazeny", "ferovka", "pohodar"];
  return types[h % types.length];
}

function clampRespect(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)));
}

function clampHeat(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function parseHistory(raw: unknown): RelationMoment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.warn({ module: "manager-relations" }, "parse relation history", e);
    return [];
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Read-only kontext vztahu pro prompty zpravodaje (rozhovory, preview, reporty).
 * Nezakládá řádek; vrací null, když vztah neexistuje nebo je nulový (není o čem psát).
 */
export interface RelationPromptContext {
  respect: number;
  heat: number;
  label: string;
  moments: string[]; // poslední ~3 události mezi kluby, lidsky čitelné
}

export async function getRelationPromptContext(
  db: D1Database,
  teamA: string,
  teamB: string,
): Promise<RelationPromptContext | null> {
  const [a, b] = orderPair(teamA, teamB);
  const row = await db.prepare(
    "SELECT respect, heat, history FROM manager_relations WHERE team_a_id = ? AND team_b_id = ?"
  ).bind(a, b).first<{ respect: number; heat: number; history: string }>()
    .catch((e) => {
      logger.warn({ module: "manager-relations" }, "load relation prompt ctx", e);
      return null;
    });
  if (!row || (row.respect === 0 && row.heat === 0)) return null;
  return {
    respect: row.respect,
    heat: row.heat,
    label: relationLabel(row.respect, row.heat),
    moments: parseHistory(row.history).slice(0, 3).map((m) => m.text),
  };
}

/**
 * Načte vztah dvojice týmů; pokud neexistuje, založí ho.
 * Sousední vesnice (< 8 km) startují s heat 20 („odvěcí sousedi").
 */
export async function getRelation(db: D1Database, teamA: string, teamB: string): Promise<ManagerRelation> {
  const [a, b] = orderPair(teamA, teamB);

  const row = await db.prepare(
    "SELECT respect, heat, history FROM manager_relations WHERE team_a_id = ? AND team_b_id = ?"
  ).bind(a, b).first<{ respect: number; heat: number; history: string }>();

  if (row) {
    return { teamAId: a, teamBId: b, respect: row.respect, heat: row.heat, history: parseHistory(row.history) };
  }

  // Lazy init — stejná vesnice = místní rivalita, blízké vesnice = odvěcí sousedi
  let heat = 0;
  const history: RelationMoment[] = [];
  try {
    const villages = await db.prepare(
      `SELECT t.id as team_id, t.village_id, v.lat as lat, v.lng as lng
       FROM teams t JOIN villages v ON t.village_id = v.id
       WHERE t.id IN (?, ?)`
    ).bind(a, b).all<{ team_id: string; village_id: string; lat: number | null; lng: number | null }>();
    const [va, vb] = [
      villages.results.find((r) => r.team_id === a),
      villages.results.find((r) => r.team_id === b),
    ];
    if (va && vb && va.village_id === vb.village_id) {
      heat = SAME_VILLAGE_BASE_HEAT;
      history.push({
        date: new Date().toISOString(),
        icon: "🏘️",
        text: "Místní rivalita — jeden plácek, dvě hospody",
        rd: 0,
        hd: SAME_VILLAGE_BASE_HEAT,
      });
    } else if (va?.lat != null && va?.lng != null && vb?.lat != null && vb?.lng != null) {
      const km = haversineKm(va.lat, va.lng, vb.lat, vb.lng);
      if (km < NEIGHBOR_KM) {
        heat = NEIGHBOR_BASE_HEAT;
        history.push({
          date: new Date().toISOString(),
          icon: "🏘️",
          text: `Odvěcí sousedi — vesnice jen ${km.toFixed(1)} km od sebe`,
          rd: 0,
          hd: NEIGHBOR_BASE_HEAT,
        });
      }
    }
  } catch (e) {
    logger.warn({ module: "manager-relations" }, "neighbor init distance", e);
  }

  await db.prepare(
    "INSERT OR IGNORE INTO manager_relations (team_a_id, team_b_id, respect, heat, history) VALUES (?, ?, 0, ?, ?)"
  ).bind(a, b, heat, JSON.stringify(history)).run();

  return { teamAId: a, teamBId: b, respect: 0, heat, history };
}

/**
 * Aplikuje změnu vztahu + zapíše moment do historie. Vrací nový stav.
 */
export async function applyRelationEvent(
  db: D1Database,
  teamA: string,
  teamB: string,
  delta: { respect?: number; heat?: number; icon: string; text: string },
): Promise<ManagerRelation> {
  const rel = await getRelation(db, teamA, teamB);
  const respect = clampRespect(rel.respect + (delta.respect ?? 0));
  const heat = clampHeat(rel.heat + (delta.heat ?? 0));

  const moment: RelationMoment = {
    date: new Date().toISOString(),
    icon: delta.icon,
    text: delta.text,
    rd: delta.respect ?? 0,
    hd: delta.heat ?? 0,
  };
  const history = [moment, ...rel.history].slice(0, HISTORY_LIMIT);

  await db.prepare(
    `UPDATE manager_relations SET respect = ?, heat = ?, history = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE team_a_id = ? AND team_b_id = ?`
  ).bind(respect, heat, JSON.stringify(history), rel.teamAId, rel.teamBId).run();

  return { ...rel, respect, heat, history };
}

/** Posun morálky celé kabiny (clamp 0–100). */
export async function shiftSquadMorale(db: D1Database, teamId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  await db.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.morale',
       MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
     WHERE team_id = ? AND status != 'released'`
  ).bind(delta, teamId).run();
}

/** Krátká zpráva do ligových novin (typ manager_feud — rivalita a vztahy manažerů). */
export async function insertRelationNews(
  db: D1Database,
  leagueId: string | null,
  headline: string,
  body: string,
  teamId?: string,
): Promise<void> {
  if (!leagueId) return;
  await db.prepare(
    `INSERT INTO news (id, league_id, team_id, type, headline, body, created_at)
     VALUES (?, ?, ?, 'manager_feud', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
  ).bind(crypto.randomUUID(), leagueId, teamId ?? null, headline, body).run();
}

export async function getManagerName(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT name FROM managers WHERE team_id = ? LIMIT 1")
    .bind(teamId).first<{ name: string }>().catch((e) => {
      logger.warn({ module: "manager-relations" }, "load manager name", e);
      return null;
    });
  return row?.name ?? "Trenér";
}

export async function getTeamName(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string }>().catch((e) => {
      logger.warn({ module: "manager-relations" }, "load team name", e);
      return null;
    });
  return row?.name ?? "soupeř";
}

/** Je tým řízený AI? (managers.user_id = 'ai' nebo žádný manager) */
export async function isAiTeam(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare("SELECT user_id FROM managers WHERE team_id = ? LIMIT 1")
    .bind(teamId).first<{ user_id: string }>().catch((e) => {
      logger.warn({ module: "manager-relations" }, "load manager user", e);
      return null;
    });
  return !row || row.user_id === "ai";
}

// ────────────────────────────────────────────────────────────────────────────
// Pasivní efekty po zápase + vyhodnocení sázek (volá match-runner)
// ────────────────────────────────────────────────────────────────────────────

export interface PostMatchInfo {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  leagueId: string | null;
  /** heat dvojice PŘED zápasem — rozhoduje o derby efektech */
  preMatchHeat: number;
}

export async function applyPostMatchRelations(db: D1Database, info: PostMatchInfo): Promise<void> {
  const { matchId, homeTeamId, awayTeamId, homeScore, awayScore, leagueId } = info;
  const diff = Math.abs(homeScore - awayScore);
  const winnerId = homeScore > awayScore ? homeTeamId : awayScore > homeScore ? awayTeamId : null;
  const loserId = winnerId === homeTeamId ? awayTeamId : winnerId === awayTeamId ? homeTeamId : null;

  const [homeName, awayName] = await Promise.all([
    getTeamName(db, homeTeamId),
    getTeamName(db, awayTeamId),
  ]);
  const score = `${homeScore}:${awayScore}`;

  // Pasivní změny vztahu podle průběhu
  if (winnerId && diff >= 4) {
    await applyRelationEvent(db, homeTeamId, awayTeamId, {
      heat: 10,
      respect: -5,
      icon: "💥",
      text: `Debakl ${score} (${homeName} – ${awayName}) — tohle se nezapomíná`,
    });
  } else if (!winnerId && homeScore + awayScore > 0) {
    await applyRelationEvent(db, homeTeamId, awayTeamId, {
      heat: 2,
      icon: "🤝",
      text: `Remíza ${score} (${homeName} – ${awayName})`,
    });
  } else if (winnerId && diff <= 1) {
    await applyRelationEvent(db, homeTeamId, awayTeamId, {
      heat: 5,
      icon: "⚔️",
      text: `Těsná bitva ${score} (${homeName} – ${awayName})`,
    });
  }

  // Derby morálkový swing — podle heat PŘED zápasem
  if (info.preMatchHeat >= DERBY_HEAT_THRESHOLD && winnerId && loserId) {
    await shiftSquadMorale(db, winnerId, 8);
    await shiftSquadMorale(db, loserId, -8);
    const winnerName = winnerId === homeTeamId ? homeName : awayName;
    const article = derbyNews(homeName, awayName, winnerName, score);
    await insertRelationNews(db, leagueId, article.headline, article.body);
  }

  // Vyhodnocení sázek o bečku vázaných na tento zápas
  await resolveBets(db, info, { homeName, awayName });

  // Falešná skromnost: kdo před zápasem hrál chudáčka a pak vyhrál o 3+, toho si soupeř zapamatuje
  await resolveHumbleStatements(db, info, { homeName, awayName });
}

async function resolveHumbleStatements(
  db: D1Database,
  info: PostMatchInfo,
  names: { homeName: string; awayName: string },
): Promise<void> {
  const statements = await db.prepare(
    `SELECT id, actor_team_id, target_team_id FROM manager_interactions
     WHERE match_id = ? AND type = 'statement' AND json_extract(payload, '$.tone') = 'humble' AND status = 'pending'`
  ).bind(info.matchId).all<{ id: string; actor_team_id: string; target_team_id: string }>();

  for (const st of statements.results) {
    const actorIsHome = st.actor_team_id === info.homeTeamId;
    const actorScore = actorIsHome ? info.homeScore : info.awayScore;
    const targetScore = actorIsHome ? info.awayScore : info.homeScore;
    let outcome = "no_effect";

    if (actorScore - targetScore >= 3) {
      outcome = "backfired_on_target";
      const actorName = actorIsHome ? names.homeName : names.awayName;
      const targetName = actorIsHome ? names.awayName : names.homeName;
      const actorManager = await getManagerName(db, st.actor_team_id);
      await applyRelationEvent(db, st.actor_team_id, st.target_team_id, {
        heat: 15,
        icon: "🎭",
        text: `„Jedeme jen zachránit kanára“ — a pak výhra o ${actorScore - targetScore} gólů. Tohle ${targetName} nezapomene`,
      });
      const article = humbleBackfireNews(actorName, actorManager, targetName, `${info.homeScore}:${info.awayScore}`);
      await insertRelationNews(db, info.leagueId, article.headline, article.body, st.actor_team_id);
    }

    await db.prepare(
      "UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.outcome', ?) WHERE id = ?"
    ).bind(outcome, st.id).run();
  }
}

const BET_AMOUNT = 500;

async function resolveBets(
  db: D1Database,
  info: PostMatchInfo,
  names: { homeName: string; awayName: string },
): Promise<void> {
  const bets = await db.prepare(
    "SELECT id, actor_team_id, target_team_id FROM manager_interactions WHERE match_id = ? AND type = 'bet' AND status = 'pending'"
  ).bind(info.matchId).all<{ id: string; actor_team_id: string; target_team_id: string }>();

  if (!bets.results.length) return;

  const winnerId = info.homeScore > info.awayScore ? info.homeTeamId
    : info.awayScore > info.homeScore ? info.awayTeamId : null;
  const { recordTransaction } = await import("../season/finance-processor");

  for (const bet of bets.results) {
    let outcome: string;
    if (!winnerId) {
      outcome = "draw";
      const drawArticle = betDrawNews(names.homeName, names.awayName, `${info.homeScore}:${info.awayScore}`);
      await insertRelationNews(db, info.leagueId, drawArticle.headline, drawArticle.body);
    } else {
      const betLoserId = winnerId === bet.actor_team_id ? bet.target_team_id : bet.actor_team_id;
      const gameDate = await getTeamGameDate(db, betLoserId);
      await recordTransaction(db, betLoserId, "manager_bet_loss", -BET_AMOUNT,
        "Prohraná sázka o bečku", gameDate, bet.id);
      const winGameDate = await getTeamGameDate(db, winnerId);
      await recordTransaction(db, winnerId, "manager_bet_win", BET_AMOUNT,
        "Vyhraná sázka o bečku", winGameDate, bet.id);
      await shiftSquadMorale(db, winnerId, 3);
      outcome = winnerId === bet.actor_team_id ? "actor_won" : "target_won";

      const winnerName = winnerId === info.homeTeamId ? names.homeName : names.awayName;
      const loserName = winnerId === info.homeTeamId ? names.awayName : names.homeName;
      await applyRelationEvent(db, bet.actor_team_id, bet.target_team_id, {
        heat: 5,
        icon: "🍺",
        text: `Sázka o bečku: ${loserName} platí po výsledku ${info.homeScore}:${info.awayScore}`,
      });
      const wonArticle = betWonNews(winnerName, loserName, `${info.homeScore}:${info.awayScore}`);
      await insertRelationNews(db, info.leagueId, wonArticle.headline, wonArticle.body);
      const { createNotification } = await import("./notifications");
      await createNotification(db, winnerId, "event", "🍺 Vyhrál jsi bečku!",
        `Sázka s trenérem ${loserName} vyšla. +${BET_AMOUNT} Kč a kabina slaví.`, "/dashboard/finances")
        .catch((e) => logger.warn({ module: "manager-relations" }, "bet win notification", e));
      await createNotification(db, betLoserId, "event", "🍺 Prohraná sázka",
        `Bečka pro ${winnerName} tě stojí ${BET_AMOUNT} Kč. Příště líp.`, "/dashboard/finances")
        .catch((e) => logger.warn({ module: "manager-relations" }, "bet loss notification", e));
    }
    await db.prepare(
      "UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.outcome', ?) WHERE id = ?"
    ).bind(outcome, bet.id).run();
  }
}

export async function getTeamGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>().catch((e) => {
      logger.warn({ module: "manager-relations" }, "load game_date", e);
      return null;
    });
  return row?.game_date ?? new Date().toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────────
// AI odpovědi na gesta (archetypy)
// ────────────────────────────────────────────────────────────────────────────

export type GestureChoice = "handshake" | "silent" | "jab";

/**
 * Jak AI manažer odpoví na pozápasové gesto lidského manažera.
 * Vrací protigesto + popis pro historii.
 */
export function aiGestureResponse(
  archetype: AiArchetype,
  incoming: GestureChoice,
  aiWon: boolean,
): { choice: GestureChoice; flavor: string } {
  switch (archetype) {
    case "provokater":
      if (incoming === "jab") return { choice: "jab", flavor: "nezůstal nic dlužen a přisadil si" };
      return aiWon
        ? { choice: "jab", flavor: "si neodpustil poznámku na účet poraženého" }
        : { choice: "silent", flavor: "po porážce zmizel beze slova" };
    case "urazeny":
      if (incoming === "jab") return { choice: "silent", flavor: "uraženě odešel a bouchl dveřmi kabiny" };
      return aiWon
        ? { choice: "handshake", flavor: "v dobré náladě podal ruku" }
        : { choice: "silent", flavor: "porážku nese těžce, ruku nepodal" };
    case "ferovka":
      return { choice: "handshake", flavor: "podal ruku jako vždy — fér je fér" };
    case "pohodar":
      if (incoming === "jab") return { choice: "handshake", flavor: "rýpnutí přešel s úsměvem a podal ruku" };
      return { choice: "handshake", flavor: "s úsměvem pozval na pivo někdy příště" };
  }
}

/** Přijme AI manažer sázku o bečku? */
export function aiAcceptsBet(archetype: AiArchetype, heat: number): boolean {
  switch (archetype) {
    case "provokater": return true;
    case "urazeny": return false;
    case "ferovka": return heat >= 30;
    case "pohodar": return true;
  }
}

export type StatementTone = "respect" | "provoke" | "humble";

/**
 * Reakce AI manažera na předzápasový výrok v novinách.
 * Delty vztahu drží tahle funkce, texty protivyroků dodává relation-texts.
 */
export function aiStatementResponse(
  archetype: AiArchetype,
  tone: StatementTone,
  names: { myName: string; theirName: string; myManager: string; theirManager: string },
): { respect: number; heat: number; counterQuote: string | null; historyText: string } {
  const aiManager = names.theirManager;
  const counterQuote = counterQuoteText(archetype, tone, names);
  switch (archetype) {
    case "provokater":
      if (tone === "provoke") {
        return { respect: 0, heat: 5, counterQuote, historyText: `${aiManager} kontroval vlastní provokací v novinách` };
      }
      return { respect: 0, heat: 3, counterQuote, historyText: `${aiManager} si i tak neodpustil rýpnutí` };
    case "urazeny":
      if (tone === "provoke") {
        return { respect: -3, heat: 8, counterQuote, historyText: `${aiManager} se urazil a stěžoval si redaktorovi` };
      }
      return { respect: 2, heat: 0, counterQuote: null, historyText: `${aiManager} výrok přešel mlčky` };
    case "ferovka":
      if (tone === "respect") {
        return { respect: 5, heat: 0, counterQuote, historyText: `${aiManager} uznání opětoval` };
      }
      return {
        respect: 0, heat: tone === "provoke" ? 3 : 0,
        counterQuote: tone === "provoke" ? counterQuote : null,
        historyText: tone === "provoke" ? `${aiManager} odmítl přestřelku — odpoví na hřišti` : `${aiManager} výrok vzal na vědomí`,
      };
    case "pohodar":
      return {
        respect: tone === "respect" ? 3 : 1, heat: 0,
        counterQuote: tone === "provoke" ? counterQuote : null,
        historyText: `${aiManager} to vzal s úsměvem`,
      };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Naplánované hospodské akce — vyhodnocují se při „odehrání" hospody
// (daily-tick, hned po generování pub sessions). Výsledek se propíše jako
// incident do pub_sessions, takže ho hráč uvidí na stránce Hospoda.
// ────────────────────────────────────────────────────────────────────────────

const STAMMTISCH_COST_PER_HEAD = 80;

async function appendPubIncident(
  db: D1Database,
  teamId: string,
  gameDate: string,
  incident: { type: string; playerIds: string[]; text: string; effects: unknown[] },
): Promise<void> {
  const session = await db.prepare(
    "SELECT id, incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?"
  ).bind(teamId, gameDate).first<{ id: number; incidents: string }>();
  if (!session) return; // bez session není kam psát — výsledek dorazí aspoň notifikací
  let incidents: unknown[] = [];
  try {
    const parsed = JSON.parse(session.incidents);
    if (Array.isArray(parsed)) incidents = parsed;
  } catch (e) {
    logger.warn({ module: "manager-relations" }, "parse pub incidents", e);
  }
  incidents.push(incident);
  await db.prepare("UPDATE pub_sessions SET incidents = ? WHERE id = ?")
    .bind(JSON.stringify(incidents), session.id).run();
}

async function chargeSocial(
  db: D1Database,
  teamId: string,
  amount: number,
  description: string,
  gameDate: string,
  refId: string,
): Promise<boolean> {
  try {
    const { recordTransaction } = await import("../season/finance-processor");
    await recordTransaction(db, teamId, "manager_social", -amount, description, gameDate, refId);
    return true;
  } catch (e) {
    // Záporný rozpočet — hospodský píše křídou na futro, akce ale proběhla
    logger.warn({ module: "manager-relations" }, "social charge blocked", e);
    return false;
  }
}

async function resolveStammtisch(
  db: D1Database,
  row: { id: string; actor_team_id: string; payload: string },
  gameDate: string,
): Promise<void> {
  const teamId = row.actor_team_id;
  let guestIds: string[] = [];
  let eventId: string | null = null;
  try {
    const parsed = JSON.parse(row.payload);
    if (Array.isArray(parsed?.guestTeamIds)) guestIds = parsed.guestTeamIds;
    eventId = parsed?.eventId ?? null;
  } catch (e) {
    logger.warn({ module: "manager-relations" }, "parse stammtisch payload", e);
  }

  const [myName, myManager] = await Promise.all([getTeamName(db, teamId), getManagerName(db, teamId)]);
  const host = await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string | null }>();
  const { createNotification } = await import("./notifications");

  // 1. Účast podle odpovědí na pozvánky (jen lidští trenéři)
  const attendees: Array<{ teamId: string; teamName: string; manager: string }> = [];
  const declineNotes: string[] = [];
  for (const gid of guestIds) {
    const gName = await getTeamName(db, gid);
    const manager = await getManagerName(db, gid);
    const invite = await db.prepare(
      "SELECT id, status FROM manager_interactions WHERE type = 'stammtisch_invite' AND target_team_id = ? AND json_extract(payload, '$.eventId') = ? LIMIT 1"
    ).bind(gid, eventId).first<{ id: string; status: string }>();

    if (invite?.status === "accepted") {
      attendees.push({ teamId: gid, teamName: gName, manager });
    } else if (invite?.status === "declined") {
      declineNotes.push(`${manager} pozvánku odmítl.`);
    } else {
      declineNotes.push(`${manager} nechal vzkaz bez odpovědi.`);
    }
    if (invite) {
      await db.prepare("UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.finalStatus', ?) WHERE id = ?")
        .bind(invite.status, invite.id).run();
    }
  }

  let narrative: string;
  if (attendees.length === 0) {
    await chargeSocial(db, teamId, STAMMTISCH_COST_PER_HEAD, "Posezení s trenéry — nikdo nedorazil, pivo na žal", gameDate, row.id);
    narrative = [
      "Nikdo z pozvaných trenérů nedorazil. Seděl jsi u velkého stolu sám a hospodský se tvářil soucitně.",
      ...declineNotes,
    ].join(" ");
  } else {
    // 2. Útrata podle skutečné účasti
    const cost = STAMMTISCH_COST_PER_HEAD * (attendees.length + 1);
    const paid = await chargeSocial(db, teamId, cost,
      `Posezení s trenéry — rundy pro ${attendees.length + 1} lidí`, gameDate, row.id);

    // 3. Hostitel × každý host
    for (const a of attendees) {
      await applyRelationEvent(db, teamId, a.teamId, {
        respect: 5, icon: "🍻", text: `Posezení u ${myManager} — ${a.manager} seděl u stolu`,
      });
    }

    // 4. Dynamika mezi hosty: rivalové (heat ≥ 50) se 50% šancí pohádají
    const quarrels: string[] = [];
    for (let i = 0; i < attendees.length; i++) {
      for (let j = i + 1; j < attendees.length; j++) {
        const a = attendees[i];
        const b = attendees[j];
        const rel = await getRelation(db, a.teamId, b.teamId);
        if (rel.heat >= 50 && Math.random() < 0.5) {
          const quarrelText = stammtischQuarrelText(a.manager, b.manager);
          await applyRelationEvent(db, a.teamId, b.teamId, { heat: 8, icon: "💢", text: quarrelText });
          await applyRelationEvent(db, teamId, a.teamId, { respect: 3, icon: "⚖️", text: `${myManager} se snažil hádku uklidnit` });
          await applyRelationEvent(db, teamId, b.teamId, { respect: 3, icon: "⚖️", text: `${myManager} se snažil hádku uklidnit` });
          quarrels.push(quarrelText);
        } else {
          await applyRelationEvent(db, a.teamId, b.teamId, {
            respect: 2, icon: "🍻", text: `Sblížení na posezení u trenéra ${myManager}`,
          });
        }
      }
    }

    // 5. Večerní situace — 1–2 náhodné události u stolu (pozitivní/vtipné/konflikt)
    const eventTexts: string[] = [];
    let extraCost = 0;
    for (const ev of pickStammtischEvents()) {
      const randomGuest = attendees[Math.floor(Math.random() * attendees.length)];
      const text = ev.text.replaceAll("{host}", myManager).replaceAll("{guest}", randomGuest.manager);
      eventTexts.push(text);
      if (ev.effect === "respect_all") {
        for (const a of attendees) {
          await applyRelationEvent(db, teamId, a.teamId, { respect: 1, icon: "🍻", text });
        }
      } else if (ev.effect === "heat_pair") {
        await applyRelationEvent(db, teamId, randomGuest.teamId, { heat: 3, icon: "💢", text });
      } else if (ev.effect === "extra_cost") {
        extraCost += 30;
      }
    }
    if (extraCost > 0) {
      await chargeSocial(db, teamId, extraCost, "Posezení s trenéry — nečekané výdaje", gameDate, row.id);
    }

    // 6. Zpravodaj — summit od 3 účastníků
    if (attendees.length >= 3 && host?.league_id) {
      const article = stammtischNews(myManager, myName, attendees.map((a) => `${a.manager} (${a.teamName})`));
      await insertRelationNews(db, host.league_id, article.headline, article.body, teamId);
    }

    narrative = [
      `Ke stolu dorazili: ${attendees.map((a) => a.manager).join(", ")}.`,
      stammtischSceneText(attendees.length),
      ...eventTexts,
      ...quarrels,
      ...declineNotes,
      paid ? `Útrata: ${cost + extraCost} Kč.` : "Na útratu nezbylo — hospodský to napsal křídou na futro.",
    ].join(" ");

    // 6. Večer vidí i hosté — incident v JEJICH hospodě + notifikace
    const guestText = [
      `Byl jsi na posezení u trenéra ${myManager} (${myName}).`,
      `U stolu: ${[myManager, ...attendees.map((a) => a.manager)].join(", ")}.`,
      stammtischSceneText(attendees.length),
      ...eventTexts,
      ...quarrels,
      "Útratu platil hostitel.",
    ].join(" ");
    for (const a of attendees) {
      await appendPubIncident(db, a.teamId, gameDate, { type: "manager_meetup", playerIds: [], text: guestText, effects: [] });
      await createNotification(db, a.teamId, "event", "🍻 Posezení s trenéry proběhlo",
        guestText.length > 140 ? guestText.slice(0, 137) + "…" : guestText, "/dashboard/hospoda")
        .catch((e) => logger.warn({ module: "manager-relations" }, "stammtisch guest notification", e));
    }
  }

  await db.prepare(
    "UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.narrative', ?) WHERE id = ?"
  ).bind(narrative, row.id).run();
  await appendPubIncident(db, teamId, gameDate, { type: "manager_meetup", playerIds: [], text: narrative, effects: [] });
  await createNotification(db, teamId, "event", "🍻 Posezení s trenéry proběhlo",
    narrative.length > 140 ? narrative.slice(0, 137) + "…" : narrative, "/dashboard/hospoda")
    .catch((e) => logger.warn({ module: "manager-relations" }, "stammtisch host notification", e));
}

async function resolvePubRound(
  db: D1Database,
  row: { id: string; actor_team_id: string; match_id: string | null },
  gameDate: string,
): Promise<void> {
  const teamId = row.actor_team_id;
  const { createNotification } = await import("./notifications");

  const patrons = 15 + Math.floor(Math.random() * 16);
  const cost = patrons * 12;
  const paid = await chargeSocial(db, teamId, cost, `Runda pro hospodu po výhře (${patrons} štamgastů)`, gameDate, row.id);

  let narrative: string;
  if (paid) {
    await shiftSquadMorale(db, teamId, 2);
    await db.prepare("UPDATE fans SET satisfaction = MIN(100, satisfaction + 1) WHERE team_id = ?")
      .bind(teamId).run().catch((e) => logger.warn({ module: "manager-relations" }, "pub round fans", e));
    const team = await db.prepare("SELECT village_id FROM teams WHERE id = ?").bind(teamId).first<{ village_id: string | null }>();
    if (team?.village_id) {
      await db.prepare("UPDATE village_team_favor SET favor = MIN(100, favor + 2) WHERE village_id = ? AND team_id = ?")
        .bind(team.village_id, teamId).run().catch((e) => logger.warn({ module: "manager-relations" }, "pub round favor", e));
    }
    narrative = pubRoundMessage(patrons);
  } else {
    narrative = "Slíbená runda se nekonala — pokladna zela prázdnotou a hospoda to trenérovi jen tak nezapomene.";
  }

  await db.prepare(
    "UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.narrative', ?, '$.patrons', ?, '$.paid', ?) WHERE id = ?"
  ).bind(narrative, patrons, paid ? 1 : 0, row.id).run();
  await appendPubIncident(db, teamId, gameDate, { type: "manager_round", playerIds: [], text: narrative, effects: [] });
  await createNotification(db, teamId, "event", paid ? "🍺 Runda pro hospodu" : "🍺 Runda nevyšla",
    narrative.length > 140 ? narrative.slice(0, 137) + "…" : narrative, "/dashboard/hospoda")
    .catch((e) => logger.warn({ module: "manager-relations" }, "pub round notification", e));
}

/**
 * Vyhodnotí všechny naplánované hospodské akce trenérů.
 * Volat z daily-ticku PO vygenerování pub sessions (incident se píše do dnešní session).
 */
export async function resolvePlannedSocialEvents(db: D1Database, gameDate: string): Promise<number> {
  const rows = await db.prepare(
    "SELECT id, type, actor_team_id, match_id, payload FROM manager_interactions WHERE type IN ('stammtisch', 'pub_round') AND status = 'planned'"
  ).all<{ id: string; type: string; actor_team_id: string; match_id: string | null; payload: string }>();

  let resolved = 0;
  for (const row of rows.results) {
    try {
      if (row.type === "stammtisch") await resolveStammtisch(db, row, gameDate);
      else await resolvePubRound(db, row, gameDate);
      resolved++;
    } catch (e) {
      logger.error({ module: "manager-relations" }, `resolve social event ${row.id}`, e);
    }
  }
  return resolved;
}
