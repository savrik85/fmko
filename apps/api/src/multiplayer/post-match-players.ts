/**
 * Kondice a morálka hráčů po zápase. Jeden zápis pro ligu, pohár, přátelák i turnaj.
 *
 * Dřív si každý runner zapisoval jen konečnou jedenáctku (`result.homeLineup`), ze které
 * engine vyřazuje vystřídané a vyloučené. Ti odešli ze zápasu bez únavy a se starou
 * morálkou, takže střídat v 60. minutě bylo zadarmo (kolo 1. 10. na produ: záznam o únavě
 * u 371 z 372 hráčů, kteří dohráli, a u 0 ze 70 vystřídaných). Střídající zase neměli
 * záznam v `condition_log`, protože kondici před zápasem znala jen základní sestava.
 */

import type { MatchPlayer, MatchResult } from "../engine/types";
import { logConditionStmt, type ConditionSource } from "../lib/condition-log";

export interface PostMatchSide {
  /** Tým v `players`. Null = pohárový velkoklub, jeho kádr v `players` není. */
  teamId: string | null;
  /** Engine ID → ID hráče v DB. */
  idMap: ReadonlyMap<number, string>;
}

export interface PostMatchPlayer {
  dbId: string;
  teamId: string;
  /** Kondice při výkopu. */
  conditionBefore: number;
  /** Kondice, se kterou hráč odešel ze hřiště (po odehraných minutách). */
  conditionAfter: number;
  /** Morálka k uložení. */
  morale: number;
}

type ParticipantsResult = Pick<MatchResult, "homeParticipants" | "awayParticipants" | "kickoffCondition">;

/**
 * Každý, kdo za tým nastoupil (základ, střídající, vystřídaný i vyloučený), s kondicí
 * při výkopu a po zápase. Hráči velkoklubů (teamId null) se vynechají.
 *
 * @param temporaryMoraleDelta dočasná změna morálky jen pro tenhle zápas (incidenty),
 *   která se od výsledné morálky odečte, aby se nepropsala natrvalo
 */
export function postMatchPlayers(
  result: ParticipantsResult,
  home: PostMatchSide,
  away: PostMatchSide,
  temporaryMoraleDelta?: ReadonlyMap<number, number>,
): PostMatchPlayer[] {
  const out: PostMatchPlayer[] = [];
  const add = (players: readonly MatchPlayer[], side: PostMatchSide) => {
    if (!side.teamId) return;
    for (const p of players) {
      const dbId = side.idMap.get(p.id);
      if (!dbId) continue;
      out.push({
        dbId,
        teamId: side.teamId,
        conditionBefore: result.kickoffCondition[p.id] ?? p.condition,
        conditionAfter: p.condition,
        morale: Math.max(0, Math.min(100, Math.round(p.morale - (temporaryMoraleDelta?.get(p.id) ?? 0)))),
      });
    }
  };
  add(result.homeParticipants, home);
  add(result.awayParticipants, away);
  return out;
}

/**
 * Zápis kondice a morálky do `players.life_context` a změny kondice do `condition_log`.
 * Volající si statementy pustí v jedné dávce (`db.batch`).
 */
export function postMatchPlayerStatements(
  db: D1Database,
  players: readonly PostMatchPlayer[],
  log: { source: ConditionSource; description: string },
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const p of players) {
    stmts.push(db.prepare(
      "UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?",
    ).bind(Math.round(p.conditionAfter), p.morale, p.dbId));
    if (Math.round(p.conditionBefore) !== Math.round(p.conditionAfter)) {
      stmts.push(logConditionStmt(db, p.dbId, p.teamId, p.conditionBefore, p.conditionAfter, log.source, log.description));
    }
  }
  return stmts;
}
