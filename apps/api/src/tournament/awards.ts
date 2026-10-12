/**
 * Ceny Turnaje P-Mobile: hráč turnaje, gólman turnaje, mladý hráč (do 21) a osobnost turnaje (30+).
 * Vyhlašují se po finále z turnajových statistik (match_player_stats). Výběr stejným vzorcem jako
 * Hráč sezóny (season-awards.ts): průměrná známka + góly × 0,08 + asistence × 0,04 + zápasy × 0,03.
 * Jeden hráč dostane nejvýš jednu cenu, rozdělují se v pořadí hráč, gólman, mladý, osobnost.
 */

import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import type { TournamentRow } from "./service";

const M = "tournament-awards";

export type AwardKind = "player" | "goalkeeper" | "young" | "veteran";

export const AWARD_LABEL: Record<AwardKind, string> = {
  player: "Hráč turnaje",
  goalkeeper: "Gólman turnaje",
  young: "Mladý hráč turnaje",
  veteran: "Osobnost turnaje",
};

export const YOUNG_MAX_AGE = 21;
export const VETERAN_MIN_AGE = 30;
const MIN_APPS: Record<AwardKind, number> = { player: 4, goalkeeper: 4, young: 3, veteran: 3 };

export interface AwardCandidate {
  playerId: string;
  teamId: string;
  name: string;
  teamName: string;
  position: string;
  age: number;
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
  cleanSheets: number;
}

/** Skóre jako u Hráče sezóny. */
export function awardScore(p: AwardCandidate): number {
  return p.avgRating + p.goals * 0.08 + p.assists * 0.04 + p.apps * 0.03;
}

/** Vybere vítěze cen (pořadí rozdělování: hráč, gólman, mladý, osobnost). Chybí-li kandidát, cena se nevyhlásí. */
export function pickAwards(candidates: AwardCandidate[]): Array<{ award: AwardKind; winner: AwardCandidate }> {
  const taken = new Set<string>();
  const out: Array<{ award: AwardKind; winner: AwardCandidate }> = [];
  const byScore = (a: AwardCandidate, b: AwardCandidate) =>
    awardScore(b) - awardScore(a) || b.avgRating - a.avgRating || b.apps - a.apps || a.name.localeCompare(b.name, "cs");
  const pick = (award: AwardKind, filter: (p: AwardCandidate) => boolean, order = byScore) => {
    const winner = candidates.filter((p) => !taken.has(p.playerId) && p.apps >= MIN_APPS[award] && filter(p)).sort(order)[0];
    if (!winner) return;
    taken.add(winner.playerId);
    out.push({ award, winner });
  };
  pick("player", (p) => p.position !== "GK");
  pick("goalkeeper", (p) => p.position === "GK",
    (a, b) => b.avgRating - a.avgRating || b.cleanSheets - a.cleanSheets || b.apps - a.apps || a.name.localeCompare(b.name, "cs"));
  pick("young", (p) => p.age <= YOUNG_MAX_AGE);
  pick("veteran", (p) => p.age >= VETERAN_MIN_AGE);
  return out;
}

/** Kandidáti z turnajových statistik: zápasy s minutami, góly, asistence, průměrná známka, čistá konta brankářů. */
export async function loadAwardCandidates(db: D1Database, tournamentId: string): Promise<AwardCandidate[]> {
  const rows = await db.prepare(
    `SELECT s.player_id, s.team_id, p.first_name, p.last_name, p.position, p.age, t.name AS team_name,
            COUNT(*) AS apps, SUM(s.goals) AS goals, SUM(s.assists) AS assists, AVG(s.rating) AS avg_rating,
            SUM(CASE WHEN (CASE WHEN m.home_team_id = s.team_id THEN m.away_score ELSE m.home_score END) = 0 THEN 1 ELSE 0 END) AS clean_sheets
       FROM match_player_stats s
       JOIN tournament_matches m ON m.id = s.match_id AND m.tournament_id = ?
       JOIN players p ON p.id = s.player_id
       JOIN teams t ON t.id = s.team_id
      WHERE s.minutes_played > 0 AND s.rating IS NOT NULL
      GROUP BY s.player_id, s.team_id`
  ).bind(tournamentId).all<{
    player_id: string; team_id: string; first_name: string | null; last_name: string | null; position: string; age: number;
    team_name: string; apps: number; goals: number; assists: number; avg_rating: number; clean_sheets: number;
  }>();
  return rows.results.map((r) => ({
    playerId: r.player_id,
    teamId: r.team_id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Neznámý hráč",
    teamName: r.team_name,
    position: r.position,
    age: r.age,
    apps: r.apps,
    goals: r.goals ?? 0,
    assists: r.assists ?? 0,
    avgRating: Math.round((r.avg_rating ?? 0) * 100) / 100,
    cleanSheets: r.clean_sheets ?? 0,
  }));
}

/** „1 gól", „3 góly", „5 gólů". */
function count(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

function statLine(award: AwardKind, w: AwardCandidate): string {
  const zapasy = count(w.apps, "zápas", "zápasy", "zápasů");
  const rating = `průměrná známka ${w.avgRating.toFixed(2).replace(".", ",")}`;
  if (award === "goalkeeper") return `${zapasy}, ${rating}, ${count(w.cleanSheets, "čisté konto", "čistá konta", "čistých kont")}`;
  // Nulové góly a asistence se nepíšou, „0 asistencí" u střelce by znělo jako výtka.
  return [zapasy, w.goals > 0 ? count(w.goals, "gól", "góly", "gólů") : null, w.assists > 0 ? count(w.assists, "asistence", "asistence", "asistencí") : null, rating]
    .filter(Boolean).join(", ");
}

/**
 * Vyhlášení po finále: uloží ceny, pošle SMS klubům oceněných a článek do Zpravodaje lig, kde
 * oceněné kluby hrají. Opakované volání nic nezdvojí (ceny jsou unikátní na ročník a druh).
 */
export async function announceTournamentAwards(db: D1Database, t: TournamentRow): Promise<number> {
  const existing = await db.prepare("SELECT COUNT(*) AS n FROM tournament_awards WHERE tournament_id = ?").bind(t.id).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return 0;
  const awards = pickAwards(await loadAwardCandidates(db, t.id));
  if (awards.length === 0) return 0;

  await db.batch(awards.map(({ award, winner: w }) => db.prepare(
    `INSERT OR IGNORE INTO tournament_awards (tournament_id, award, player_id, team_id, player_name, team_name, age, apps, goals, assists, avg_rating, clean_sheets)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(t.id, award, w.playerId, w.teamId, w.name, w.teamName, w.age, w.apps, w.goals, w.assists, w.avgRating, w.cleanSheets)));

  for (const { award, winner: w } of awards) {
    await sendSystemSMS(db, w.teamId, t.sponsor,
      `${AWARD_LABEL[award]} ${t.edition}. ročníku je váš ${w.name}! ${statLine(award, w)}. Gratulujeme!`,
      { type: "tournament" })
      .catch((e) => logger.warn({ module: M }, `SMS o ceně ${award} týmu ${w.teamId}`, e));
  }

  const body = awards.map(({ award, winner: w }) => `${AWARD_LABEL[award]}: ${w.name} (${w.teamName}), ${statLine(award, w)}.`).join(" ");
  const leagues = await db.prepare(
    `SELECT DISTINCT league_id FROM teams WHERE id IN (${awards.map(() => "?").join(",")}) AND league_id IS NOT NULL`
  ).bind(...awards.map((a) => a.winner.teamId)).all<{ league_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "ligy oceněných klubů", e); return { results: [] as Array<{ league_id: string }> }; });
  for (const l of leagues.results) {
    await db.prepare(
      "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'announcement', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(crypto.randomUUID(), l.league_id, `${t.name}: hráčem turnaje je ${awards[0].winner.name}`, body)
      .run().catch((e) => logger.warn({ module: M }, "zpráva o cenách do Zpravodaje", e));
  }
  logger.info({ module: M }, `${t.id}: vyhlášeno ${awards.length} cen`);
  return awards.length;
}

/** Ceny ročníku pro stránku turnaje. */
export async function loadTournamentAwards(db: D1Database, tournamentId: string) {
  const rows = await db.prepare(
    "SELECT award, player_id, team_id, player_name, team_name, age, apps, goals, assists, avg_rating, clean_sheets FROM tournament_awards WHERE tournament_id = ?"
  ).bind(tournamentId).all<{
    award: AwardKind; player_id: string; team_id: string; player_name: string; team_name: string; age: number | null;
    apps: number; goals: number; assists: number; avg_rating: number; clean_sheets: number;
  }>().catch((e) => { logger.warn({ module: M }, "načtení cen turnaje", e); return { results: [] }; });
  const order: AwardKind[] = ["player", "goalkeeper", "young", "veteran"];
  return [...rows.results].sort((a, b) => order.indexOf(a.award) - order.indexOf(b.award)).map((r) => ({
    award: r.award,
    label: AWARD_LABEL[r.award],
    playerId: r.player_id,
    playerName: r.player_name,
    teamId: r.team_id,
    teamName: r.team_name,
    age: r.age,
    apps: r.apps,
    goals: r.goals,
    assists: r.assists,
    avgRating: r.avg_rating,
    cleanSheets: r.clean_sheets,
  }));
}
