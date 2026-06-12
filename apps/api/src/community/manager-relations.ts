/**
 * Vztahy mezi manažery — respekt (−100..100) a heat/napětí (0..100) na dvojici týmů.
 *
 * Pasivní zdroje: výsledky vzájemných zápasů (match-runner hook), blízkost vesnic.
 * Aktivní interakce: pozápasové gesto, pivo, sázka o bečku, anonymní inzerát, dárek.
 * AI manažeři reagují pravidlově podle archetypu (deterministicky z team id).
 */

import { logger } from "../lib/logger";

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

  // Lazy init — sousedství podle vzdálenosti vesnic
  let heat = 0;
  const history: RelationMoment[] = [];
  try {
    const villages = await db.prepare(
      `SELECT t.id as team_id, v.latitude as lat, v.longitude as lng
       FROM teams t JOIN villages v ON t.village_id = v.id
       WHERE t.id IN (?, ?)`
    ).bind(a, b).all<{ team_id: string; lat: number | null; lng: number | null }>();
    const [va, vb] = [
      villages.results.find((r) => r.team_id === a),
      villages.results.find((r) => r.team_id === b),
    ];
    if (va?.lat != null && va?.lng != null && vb?.lat != null && vb?.lng != null) {
      const km = haversineKm(va.lat, va.lng, vb.lat, vb.lng);
      if (km > 0.01 && km < NEIGHBOR_KM) {
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
  return row?.name ?? "trenér";
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
    await insertRelationNews(
      db, leagueId,
      `DERBY: ${homeName} ${score} ${awayName}`,
      `${winnerName} ovládl derby plné emocí. V hospodě vítězů se slaví, u poražených se dnes mlčí.`,
    );
  }

  // Vyhodnocení sázek o bečku vázaných na tento zápas
  await resolveBets(db, info, { homeName, awayName });
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
      await insertRelationNews(
        db, info.leagueId,
        "Sázka o bečku skončila remízou",
        `Trenéři ${names.homeName} a ${names.awayName} se vsadili o bečku — jenže zápas skončil ${info.homeScore}:${info.awayScore}. Bečka zůstává v hospodě a čeká na odvetu.`,
      );
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
      await insertRelationNews(
        db, info.leagueId,
        `${loserName} prohrál bečku`,
        `Trenéři se před zápasem vsadili o bečku piva. Po výsledku ${info.homeScore}:${info.awayScore} platí trenér ${loserName} — v hospodě ${winnerName} se dnes slaví dvakrát.`,
      );
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
        ? { choice: "jab", flavor: "neodpustil si poznámku na účet poraženého" }
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
