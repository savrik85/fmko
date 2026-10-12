/**
 * Průběh Turnaje P-Mobile: odehrání splatných zápasů, výplaty od sponzora, play-off a konec.
 * Volá se z cronu zápasového ticku (16:00, 16:05, 16:20 UTC) a z admina („odehrát den").
 *
 * Každý zápas se před simulací zabere (`claimed_at`), takže souběžné běhy ani recovery
 * neodsimulují tentýž zápas dvakrát (poučení z incidentu 2026-09-21). Navazující fáze
 * play-off se vkládají přes unikátní slot (`INSERT OR IGNORE`), opakovaný běh nic nezdvojí.
 */

import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import { sendSystemSMS } from "../messaging/system-sms";
import { computeStandings, groupPlayoffSeeding, playoffSeeding, playoffStages, playoffVenues, pointsFor } from "./draw";
import { kickoffAt, loadCurrentTournament, loadGroups, loadVenues, type TournamentRow, type VenueRow } from "./service";
import { simulateTournamentMatch, type TournamentMatchRow } from "./match";

const M = "tournament";
const CLAIM_TTL_MS = 15 * 60 * 1000;
const SMS_META = { type: "tournament" };

const STAGE_LABEL: Record<string, string> = { league: "ligová fáze", qf: "čtvrtfinále", sf: "semifinále", third: "zápas o 3. místo", final: "finále" };

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function kc(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
}

/** Výplata od sponzora jen jednou — `reference_id` je klíč. */
async function payOnce(db: D1Database, teamId: string, amount: number, description: string, referenceId: string): Promise<boolean> {
  if (amount <= 0) return false;
  const done = await db.prepare("SELECT 1 FROM transactions WHERE reference_id = ? AND team_id = ? LIMIT 1")
    .bind(referenceId, teamId).first();
  if (done) return false;
  await recordTransaction(db, teamId, "tournament_prize", amount, description, new Date().toISOString(), referenceId);
  return true;
}

async function teamName(db: D1Database, teamId: string): Promise<string> {
  const r = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, `jméno týmu ${teamId}`, e); return null; });
  return r?.name ?? "soupeř";
}

/** Zabere zápas pro simulaci. Starý zábor (spadlá invokace) po 15 minutách propadne. */
async function claim(db: D1Database, matchId: string, now: Date): Promise<boolean> {
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  const res = await db.prepare(
    "UPDATE tournament_matches SET claimed_at = ? WHERE id = ? AND status = 'scheduled' AND (claimed_at IS NULL OR claimed_at < ?)"
  ).bind(now.toISOString(), matchId, stale).run();
  return res.meta.changes > 0;
}

/** Odehraje jeden zápas, uloží výsledek a vyplatí body. */
async function playMatch(db: D1Database, t: TournamentRow, m: TournamentMatchRow, venues: Map<string, VenueRow>): Promise<void> {
  const r = await simulateTournamentMatch(db, m, t, m.venue_id ? venues.get(m.venue_id) ?? null : null);
  await db.prepare(
    `UPDATE tournament_matches SET status = 'simulated', home_score = ?, away_score = ?, home_pens = ?, away_pens = ?, winner_team_id = ?,
       simulated_at = COALESCE(simulated_at, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     WHERE id = ?`
  ).bind(r.homeScore, r.awayScore, r.homePens, r.awayPens, r.winnerTeamId, m.id).run();

  if (m.stage === "league") {
    const [homeName, awayName] = await Promise.all([teamName(db, m.home_team_id), teamName(db, m.away_team_id)]);
    for (const [teamId, mine, theirs, opp] of [
      [m.home_team_id, r.homeScore, r.awayScore, awayName],
      [m.away_team_id, r.awayScore, r.homeScore, homeName],
    ] as const) {
      const pts = pointsFor(mine, theirs);
      if (pts === 0) continue;
      await payOnce(db, teamId, pts * t.point_reward,
        `${t.name}: ${pts === 3 ? "výhra" : "remíza"} ${mine}:${theirs} s ${opp} (${pts} ${pts === 1 ? "bod" : "body"})`,
        `tournament-${m.id}-${teamId}`)
        .catch((e) => logger.error({ module: M }, `výplata za body, zápas ${m.id}, tým ${teamId}`, e));
    }
  }
}

async function loadStageMatches(db: D1Database, tournamentId: string, stage: string) {
  const rows = await db.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND stage = ? ORDER BY bracket_pos")
    .bind(tournamentId, stage).all<TournamentMatchRow & { home_score: number | null; away_score: number | null; home_pens: number | null; away_pens: number | null; winner_team_id: string | null }>();
  return rows.results;
}

/** Pořadí ligové fáze (id týmů od 1. místa), volitelně jen pro týmy jedné skupiny. */
export async function leagueRanking(db: D1Database, t: TournamentRow, only?: string[]): Promise<string[]> {
  const teams = await db.prepare(
    "SELECT t.id, t.name, COALESCE(t.reputation, 0) AS reputation FROM tournament_entries e JOIN teams t ON t.id = e.team_id WHERE e.tournament_id = ?"
  ).bind(t.id).all<{ id: string; name: string; reputation: number }>();
  const played = (await loadStageMatches(db, t.id, "league")).filter((m) => m.status === "simulated");
  const inScope = only ? new Set(only) : null;
  return computeStandings(
    inScope ? teams.results.filter((x) => inScope.has(x.id)) : teams.results,
    played
      .filter((m) => !inScope || (inScope.has(m.home_team_id) && inScope.has(m.away_team_id)))
      .map((m) => ({ home: m.home_team_id, away: m.away_team_id, homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0 })),
  ).map((r) => r.teamId);
}

interface FirstStagePlan {
  grouped: boolean;
  pairs: Array<{ home: string; away: string }>;
  /** Umístění týmu pro SMS: místo a případně skupina. */
  placeText: (teamId: string) => { place: number; where: string } | null;
}

/** Kdo postupuje do první fáze play-off: z jedné tabulky nejlepších 8 (4), ze skupin první dva. */
async function planFirstStage(db: D1Database, t: TournamentRow, first: "qf" | "sf"): Promise<FirstStagePlan> {
  const groups = await loadGroups(db, t.id);
  if (groups.size > 0) {
    const codes = [...groups.keys()].sort();
    const rankings = await Promise.all(codes.map((code) => leagueRanking(db, t, groups.get(code))));
    return {
      grouped: true,
      pairs: groupPlayoffSeeding(rankings),
      placeText: (teamId) => {
        const g = rankings.findIndex((r) => r.includes(teamId));
        return g < 0 ? null : { place: rankings[g].indexOf(teamId) + 1, where: ` ve skupině ${codes[g]}` };
      },
    };
  }
  const ranking = await leagueRanking(db, t);
  const advancing = ranking.slice(0, first === "qf" ? 8 : 4);
  return {
    grouped: false,
    pairs: playoffSeeding(advancing, first),
    placeText: (teamId) => {
      const i = ranking.indexOf(teamId);
      return i < 0 ? null : { place: i + 1, where: "" };
    },
  };
}

async function insertStage(db: D1Database, t: TournamentRow, stage: "qf" | "sf" | "final", day: number, pairs: Array<{ home: string; away: string }>, venues: VenueRow[]): Promise<void> {
  const venueIds = playoffVenues(pairs.length, venues.map((v) => ({ id: v.id, capacity: v.capacity, isMain: v.is_main === 1 })));
  const stmts = pairs.map((p, i) => db.prepare(
    `INSERT OR IGNORE INTO tournament_matches (id, tournament_id, stage, day, bracket_pos, scheduled_at, venue_id, home_team_id, away_team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), t.id, stage, day, i + 1, kickoffAt(t.starts_on as string, day), venueIds[i], p.home, p.away));
  await db.batch(stmts);
}

/**
 * Zápas o 3. místo: poražení semifinalisté, ve stejný den jako finále na největším vedlejším
 * hřišti (hlavní stadion patří finále). Prémie za semifinále jim zůstává, zápas rozhodne jen
 * o pořadí. Idempotentní přes unikátní slot, SMS odejde jen při prvním založení.
 */
async function ensureThirdPlace(
  db: D1Database, t: TournamentRow, semis: Array<{ home_team_id: string; away_team_id: string; winner_team_id: string | null }>, day: number, venues: VenueRow[],
): Promise<void> {
  const losers = semis.map((m) => (m.winner_team_id === m.home_team_id ? m.away_team_id : m.home_team_id));
  if (losers.length !== 2) return;
  const [, venueId] = playoffVenues(2, venues.map((v) => ({ id: v.id, capacity: v.capacity, isMain: v.is_main === 1 })));
  const res = await db.prepare(
    `INSERT OR IGNORE INTO tournament_matches (id, tournament_id, stage, day, bracket_pos, scheduled_at, venue_id, home_team_id, away_team_id)
     VALUES (?, ?, 'third', ?, 1, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), t.id, day, kickoffAt(t.starts_on as string, day), venueId ?? null, losers[0], losers[1]).run();
  if (res.meta.changes === 0) return;
  const [home, away] = await Promise.all(losers.map((id) => teamName(db, id)));
  for (const [teamId, opp] of [[losers[0], away], [losers[1], home]] as const) {
    await sendSystemSMS(db, teamId, t.sponsor,
      `Do finále to tentokrát nevyšlo, ale turnaj pro vás ještě nekončí. Zítra v 18:00 hrajete o 3. místo proti ${opp}.`, SMS_META)
      .catch((e) => logger.warn({ module: M }, `SMS o 3. místo týmu ${teamId}`, e));
  }
}

/** Prémie za umístění v play-off (nekumulativní, podle toho, kde tým skončil). */
async function payPlacement(db: D1Database, t: TournamentRow, teamId: string, place: "qf" | "sf" | "final" | "winner"): Promise<void> {
  const amount = { qf: t.prize_quarterfinal, sf: t.prize_semifinal, final: t.prize_finalist, winner: t.prize_winner }[place];
  const label = { qf: "čtvrtfinále", sf: "semifinále", final: "finále", winner: "vítězství" }[place];
  await payOnce(db, teamId, amount, `${t.name}: prémie za ${label}`, `tournament-${t.id}-place-${teamId}`)
    .catch((e) => logger.error({ module: M }, `prémie za umístění, tým ${teamId}`, e));
}

/** Vítěz do vitríny: stejný tvar jako ligové trofeje (`teams.trophies`). */
async function awardTrophy(db: D1Database, t: TournamentRow, teamId: string): Promise<void> {
  const row = await db.prepare("SELECT trophies FROM teams WHERE id = ?").bind(teamId).first<{ trophies: string | null }>();
  let list: Array<Record<string, unknown>> = [];
  try {
    list = JSON.parse(row?.trophies ?? "[]") as Array<Record<string, unknown>>;
  } catch (e) {
    logger.warn({ module: M }, `nečitelné trofeje týmu ${teamId}`, e);
  }
  const leagueId = `tournament-${t.id}`;
  if (list.some((x) => x.leagueId === leagueId)) return;
  const season = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number | null }>();
  list.push({ seasonNumber: season?.n ?? 0, leagueId, leagueName: `${t.name}, ${t.edition}. ročník`, place: 1, title: `Vítěz: ${t.name}` });
  await db.prepare("UPDATE teams SET trophies = ? WHERE id = ?").bind(JSON.stringify(list), teamId).run();
}

async function notifyEntrants(db: D1Database, t: TournamentRow, body: (teamId: string) => string | null): Promise<void> {
  const entries = await db.prepare("SELECT team_id FROM tournament_entries WHERE tournament_id = ?").bind(t.id).all<{ team_id: string }>();
  for (const e of entries.results) {
    const text = body(e.team_id);
    if (!text) continue;
    await sendSystemSMS(db, e.team_id, t.sponsor, text, SMS_META)
      .catch((err) => logger.warn({ module: M }, `SMS turnaje týmu ${e.team_id}`, err));
  }
}

/**
 * Po odehraném dni: když je fáze dohraná, založí další (play-off) nebo turnaj ukončí.
 * Idempotentní — opakovaný běh nic nezdvojí.
 */
export async function progressStages(db: D1Database, t: TournamentRow): Promise<void> {
  const venues = await loadVenues(db, t.city);
  const entrants = await db.prepare("SELECT COUNT(*) AS n FROM tournament_entries WHERE tournament_id = ?").bind(t.id).first<{ n: number }>();
  const stages = playoffStages(entrants?.n ?? 0);
  const leagueDays = t.league_days ?? 0;

  const league = await loadStageMatches(db, t.id, "league");
  if (league.length === 0 || league.some((m) => m.status !== "simulated")) return;

  // Ligová fáze dohraná → první fáze play-off z tabulky.
  // První fáze play-off je vždy čtvrtfinále nebo semifinále (viz playoffStages).
  const first = stages[0] as "qf" | "sf";
  const firstMatches = await loadStageMatches(db, t.id, first);
  if (firstMatches.length === 0) {
    const { grouped, pairs, placeText } = await planFirstStage(db, t, first);
    await insertStage(db, t, first, leagueDays + 1, pairs, venues);
    const names = new Map((await db.prepare("SELECT id, name FROM teams WHERE id IN (SELECT team_id FROM tournament_entries WHERE tournament_id = ?)")
      .bind(t.id).all<{ id: string; name: string }>()).results.map((r) => [r.id, r.name]));
    await notifyEntrants(db, t, (teamId) => {
      const pair = pairs.find((p) => p.home === teamId || p.away === teamId);
      const at = placeText(teamId);
      const placed = at ? `na ${at.place}. místě${at.where}` : "mimo postupová místa";
      if (!pair) {
        return `${grouped ? "Skupiny jsou" : "Ligová fáze je"} u konce. Skončili jste ${placed} a do ${grouped ? "čtvrtfinále" : "play-off"} to nestačilo. Díky za skvělé zápasy, za body jsme vám vyplatili odměnu průběžně.`;
      }
      const opp = names.get(pair.home === teamId ? pair.away : pair.home) ?? "soupeř";
      const from = at ? ` z ${at.place}. místa${at.where}` : "";
      return `Gratulujeme, postupujete do ${grouped ? "čtvrtfinále" : "play-off"}${from}! ${capitalize(STAGE_LABEL[first])} hrajete zítra v 18:00 proti ${opp}.`;
    });
    logger.info({ module: M }, `${t.id}: ligová fáze dohraná, založeno ${first}`);
    return;
  }

  // Play-off: každá dohraná fáze založí další, finále turnaj uzavře.
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const matches = await loadStageMatches(db, t.id, stage);
    if (matches.length === 0 || matches.some((m) => m.status !== "simulated")) return;

    if (stage === "final") {
      // Turnaj končí, až je dohraný i zápas o 3. místo (hraje se ve stejný den).
      const third = await loadStageMatches(db, t.id, "third");
      if (third.some((m) => m.status !== "simulated")) return;
      const final = matches[0];
      const winner = final.winner_team_id;
      if (!winner) return;
      const loser = winner === final.home_team_id ? final.away_team_id : final.home_team_id;
      await payPlacement(db, t, winner, "winner");
      await payPlacement(db, t, loser, "final");
      await awardTrophy(db, t, winner).catch((e) => logger.error({ module: M }, `trofej vítěze ${winner}`, e));
      const fin = await db.prepare("UPDATE tournaments SET status = 'finished', winner_team_id = ? WHERE id = ? AND status != 'finished'")
        .bind(winner, t.id).run();
      if (fin.meta.changes > 0) {
        const winnerName = await teamName(db, winner);
        await notifyEntrants(db, t, (teamId) => teamId === winner
          ? `Jste vítězi ${t.edition}. ročníku! ${t.name} je váš. Prémii ${kc(t.prize_winner)} jsme vám poslali na účet a trofej už stojí ve vaší vitríně. Gratulujeme!`
          : `${t.edition}. ročník je za námi, vítězem je ${winnerName}. Díky, že jste byli u toho, a uvidíme se na dalším ročníku!`);
        const league = await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(winner).first<{ league_id: string | null }>();
        if (league?.league_id) {
          await db.prepare(
            "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'announcement', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
          ).bind(crypto.randomUUID(), league.league_id, `${winnerName} vyhrál ${t.name}`,
            `Ve finále ${t.edition}. ročníku ${t.city_locative ?? `ve městě ${t.city}`} zvítězil ${winnerName} ${final.home_score}:${final.away_score}${final.home_pens != null ? ` (na penalty ${final.home_pens}:${final.away_pens})` : ""}.`)
            .run().catch((e) => logger.warn({ module: M }, "zpráva o vítězi do zpravodaje", e));
        }
      }
      logger.info({ module: M }, `${t.id}: turnaj dohrán, vítěz ${winner}`);
      return;
    }

    // Poražení této fáze dostanou prémii, vítězové postupují.
    for (const m of matches) {
      const loser = m.winner_team_id === m.home_team_id ? m.away_team_id : m.home_team_id;
      await payPlacement(db, t, loser, stage);
    }
    const next = stages[i + 1];
    if (next === "final") await ensureThirdPlace(db, t, matches, leagueDays + i + 2, venues);
    const nextMatches = await loadStageMatches(db, t.id, next);
    if (nextMatches.length > 0) continue;
    const winners = matches.map((m) => m.winner_team_id).filter((w): w is string => !!w);
    const pairs: Array<{ home: string; away: string }> = [];
    for (let k = 0; k + 1 < winners.length; k += 2) pairs.push({ home: winners[k], away: winners[k + 1] });
    await insertStage(db, t, next, leagueDays + i + 2, pairs, venues);
    logger.info({ module: M }, `${t.id}: ${stage} dohráno, založeno ${next}`);
    return;
  }
}

/**
 * Odehraje splatné zápasy turnaje (nejvýš `maxMatches` za běh) a posune fáze.
 * `forceDay`: admin na testu odehraje nejbližší neodehraný den bez ohledu na čas.
 */
export async function maybeAdvanceTournament(
  db: D1Database, opts: { maxMatches?: number; now?: Date; forceDay?: boolean } = {},
): Promise<{ played: number }> {
  const now = opts.now ?? new Date();
  const t = await loadCurrentTournament(db);
  if (!t || (t.status !== "drawn" && t.status !== "running")) return { played: 0 };

  let due: TournamentMatchRow[];
  if (opts.forceDay) {
    const next = await db.prepare("SELECT MIN(day) AS d FROM tournament_matches WHERE tournament_id = ? AND status = 'scheduled'")
      .bind(t.id).first<{ d: number | null }>();
    if (next?.d == null) {
      await progressStages(db, t);
      return { played: 0 };
    }
    due = (await db.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND status = 'scheduled' AND day = ? ORDER BY bracket_pos LIMIT ?")
      .bind(t.id, next.d, opts.maxMatches ?? 4).all<TournamentMatchRow>()).results;
  } else {
    due = (await db.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND status = 'scheduled' AND scheduled_at <= ? ORDER BY day, bracket_pos LIMIT ?")
      .bind(t.id, now.toISOString(), opts.maxMatches ?? 4).all<TournamentMatchRow>()).results;
  }

  if (due.length > 0 && t.status === "drawn") {
    await db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ? AND status = 'drawn'").bind(t.id).run();
  }

  const venues = new Map((await loadVenues(db, t.city)).map((v) => [v.id, v]));
  let played = 0;
  for (const m of due) {
    if (!(await claim(db, m.id, now))) continue;
    try {
      await playMatch(db, t, m, venues);
      played++;
    } catch (e) {
      // Zábor zůstane, recovery (16:20) nebo další tick zápas po 15 minutách zkusí znovu.
      logger.error({ module: M }, `simulace zápasu ${m.id} (${m.stage}, den ${m.day}) selhala`, e);
    }
  }

  await progressStages(db, t).catch((e) => logger.error({ module: M }, `${t.id}: posun fází turnaje`, e));
  if (played > 0) logger.info({ module: M }, `${t.id}: odehráno ${played} zápasů`);
  return { played };
}
