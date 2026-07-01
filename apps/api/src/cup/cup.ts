/**
 * Celorepublikový amatérský pohár — KO soutěž napříč všemi ligami + generované velkokluby.
 * Silová simulace (bez sestav) s šancí na překvapení (giant-killing).
 */

import { createRng, type Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";

/** Odměna za VÝHRU kola podle hloubky (od finále). Platí pro libovolný počet kol. */
const CUP_PRIZE_BY_DEPTH = [240000, 120000, 72000, 42000, 24000, 15000, 9000];
export function cupPrize(round: number, totalRounds: number): number {
  return CUP_PRIZE_BY_DEPTH[Math.min(Math.max(0, totalRounds - round), CUP_PRIZE_BY_DEPTH.length - 1)];
}
/** Reputace za výhru kola (trenér + tým). Pohár je prestižnější než liga —
 *  vítěz poháru naskládá kumulativně víc reputace než vítěz ligy. */
function cupRepBonus(round: number, totalRounds: number): { manager: number; team: number } {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return { manager: 8, team: 5 }; // výhra ve finále = vítěz poháru
  if (fromEnd === 1) return { manager: 5, team: 3 }; // výhra v semifinále (postup do finále)
  if (fromEnd === 2) return { manager: 3, team: 2 }; // výhra ve čtvrtfinále
  if (fromEnd === 3) return { manager: 2, team: 1 }; // výhra v osmifinále
  return { manager: 0, team: 0 };
}
/** Tabulka odměn pro UI: název kola → částka za výhru. */
export function cupPrizeTable(totalRounds: number): { round: number; roundName: string; prize: number }[] {
  const out: { round: number; roundName: string; prize: number }[] = [];
  for (let r = 1; r <= totalRounds; r++) out.push({ round: r, roundName: roundName(r, totalRounds), prize: cupPrize(r, totalRounds) });
  return out;
}

/**
 * Datumy jednotlivých kol poháru — rozprostřené přes celou sezónu, FINÁLE na konci ligy.
 * Kola padají na sobotu (ligový den je po/čt), takže se s ligou nekříží.
 */
export async function cupRoundDates(db: D1Database, seasonNumber: number, totalRounds: number): Promise<string[]> {
  const span = await db.prepare(
    "SELECT MIN(scheduled_at) AS first, MAX(scheduled_at) AS last FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id WHERE l.league_type = 'senior' AND sc.season_number = ?",
  ).bind(seasonNumber).first<{ first: string | null; last: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "cup span", e); return null; });
  const startMs = span?.first ? new Date(span.first).getTime() : Date.now();
  const endMs = span?.last ? new Date(span.last).getTime() : startMs + totalRounds * 14 * 86400000;
  const dates: string[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    const frac = r / totalRounds; // r = totalRounds → 1.0 → konec ligy (finále)
    const d = new Date(startMs + frac * (endMs - startMs));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1); // snap na sobotu (pohárový den)
    d.setUTCHours(16, 0, 0, 0);
    dates.push(d.toISOString());
  }
  // Zajisti přísně rostoucí (snap mohl kola slepit) — posuň duplicity o týden.
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] <= dates[i - 1]) { const nd = new Date(dates[i - 1]); nd.setUTCDate(nd.getUTCDate() + 7); dates[i] = nd.toISOString(); }
  }
  return dates;
}

const M = "cup";
const CUP_NAME = "Český amatérský pohár";
const HOME_ADV = 3;

const BIG_CLUB_PREFIX = ["FC", "Sparta", "Slávia", "Viktoria", "Baník", "Tatran", "Sokol", "Union", "Dynamo", "Slovan", "Spartak", "Lokomotiva", "Jiskra", "Real", "Inter", "Dukla", "Slavoj", "AC", "FK", "SK"];
const BIG_CLUB_PLACE = ["Vysočina", "Podhůří", "Polabí", "Pošumaví", "Pohraničí", "Kovárna", "Pivovar", "Chmelnice", "Šachta", "Halda", "Kasárna", "Rybník", "Sklepmistr", "Knedlík", "Klobása", "Traktor", "Severka", "Stará Garda", "Velký Týnec", "Dolní Lhota", "Horní Ves", "Depo", "Brambory", "Okres", "Kotelna", "Sklárna", "Cihelna", "Mlýn", "Pila", "Kamenolom", "Bažina", "Močál", "Stráň", "Úžlabí", "Kopec"];

function nextPow2(n: number): number { let p = 1; while (p < n) p <<= 1; return p; }

/** Název kola podle vzdálenosti od finále. */
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Finále";
  if (fromEnd === 1) return "Semifinále";
  if (fromEnd === 2) return "Čtvrtfinále";
  if (fromEnd === 3) return "Osmifinále";
  return `${round}. kolo`;
}

function samplePoisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.random(); } while (p > L && k < 12);
  return k - 1;
}

/** Odsimuluje jeden pohárový zápas (silově). Vrací skóre + vítěze + příznak překvapení. */
function simMatch(sH: number, sA: number, rng: Rng): { hg: number; ag: number; hp: number | null; ap: number | null; homeWin: boolean; upset: boolean } {
  const diff = (sH + HOME_ADV) - sA;
  const expH = Math.max(0.25, Math.min(4.5, 1.45 + diff * 0.055));
  const expA = Math.max(0.25, Math.min(4.5, 1.45 - diff * 0.055));
  let hg = samplePoisson(expH, rng);
  let ag = samplePoisson(expA, rng);
  let hp: number | null = null, ap: number | null = null;
  let homeWin: boolean;
  if (hg === ag) {
    // Penalty — mírně favorizuj silnějšího, ale je to loterie
    const homePenChance = 0.5 + (sH - sA) * 0.01;
    homeWin = rng.random() < Math.max(0.3, Math.min(0.7, homePenChance));
    hp = homeWin ? 5 : 3 + Math.floor(rng.random() * 2);
    ap = homeWin ? 3 + Math.floor(rng.random() * 2) : 5;
  } else {
    homeWin = hg > ag;
  }
  const winnerStr = homeWin ? sH : sA;
  const loserStr = homeWin ? sA : sH;
  const upset = loserStr - winnerStr >= 12; // slabší vyřadil výrazně silnějšího
  return { hg, ag, hp, ap, homeWin, upset };
}

interface CupTeamRow { id: string; team_id: string | null; name: string; strength: number; is_big_club: number; primary_color: string | null }

/** Vytvoří pohár pro danou sezónu: los všech senior týmů + doplnění velkokluby na mocninu 2. */
export async function createCup(db: D1Database, seasonNumber: number): Promise<{ created: boolean; cupId?: string; teams?: number; rounds?: number }> {
  const existing = await db.prepare("SELECT id FROM cup_competitions WHERE season_number = ? LIMIT 1").bind(seasonNumber).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "guard cup", e); return null; });
  if (existing) return { created: false, cupId: existing.id };

  const teamsRes = await db.prepare(
    "SELECT t.id, t.name, t.primary_color, CAST(COALESCE(ROUND(AVG(p.overall_rating)), 30) AS INTEGER) AS strength FROM teams t LEFT JOIN players p ON p.team_id = t.id AND p.status = 'active' WHERE t.team_type = 'senior' GROUP BY t.id",
  ).all<{ id: string; name: string; primary_color: string | null; strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "load teams for cup", e); return { results: [] as any[] }; });
  const real = teamsRes.results;
  if (real.length < 2) return { created: false };

  const rng = createRng((seasonNumber * 2654435761) >>> 0);
  const bracketSize = nextPow2(real.length);
  const totalRounds = Math.round(Math.log2(bracketSize));
  const cupId = crypto.randomUUID();
  const roundDates = await cupRoundDates(db, seasonNumber, totalRounds);

  // Účastníci: reálné týmy + velkokluby
  const participants: CupTeamRow[] = real.map((t) => ({
    id: crypto.randomUUID(), team_id: t.id, name: t.name, strength: t.strength, is_big_club: 0, primary_color: t.primary_color,
  }));
  const usedNames = new Set<string>();
  let guard = 0;
  while (participants.length < bracketSize && guard++ < 2000) {
    const nm = `${BIG_CLUB_PREFIX[Math.floor(rng.random() * BIG_CLUB_PREFIX.length)]} ${BIG_CLUB_PLACE[Math.floor(rng.random() * BIG_CLUB_PLACE.length)]}`;
    if (usedNames.has(nm)) continue;
    usedNames.add(nm);
    participants.push({ id: crypto.randomUUID(), team_id: null, name: nm, strength: 45 + Math.floor(rng.random() * 21), is_big_club: 1, primary_color: null });
  }

  // Insert competition + teams
  await db.prepare("INSERT INTO cup_competitions (id, season_number, name, status, total_rounds, current_round) VALUES (?, ?, ?, 'active', ?, 1)")
    .bind(cupId, seasonNumber, CUP_NAME, totalRounds).run()
    .catch((e) => logger.error({ module: M }, "insert cup", e));

  for (let i = 0; i < participants.length; i += 20) {
    const batch = participants.slice(i, i + 20).map((p) =>
      db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength, is_big_club, primary_color) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(p.id, cupId, p.team_id, p.name, p.strength, p.is_big_club, p.primary_color));
    await db.batch(batch).catch((e) => logger.error({ module: M }, "insert cup teams", e));
  }

  // Los: zamíchej a spáruj sousedy → 1. kolo
  const order = [...participants];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const matchStmts: D1PreparedStatement[] = [];
  for (let pos = 0; pos < order.length / 2; pos++) {
    matchStmts.push(db.prepare(
      "INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, 1, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), cupId, pos, order[pos * 2].id, order[pos * 2 + 1].id, roundDates[0] ?? null));
  }
  for (let i = 0; i < matchStmts.length; i += 40) await db.batch(matchStmts.slice(i, i + 40)).catch((e) => logger.error({ module: M }, "insert round1", e));

  logger.info({ module: M }, `cup created s=${seasonNumber} teams=${participants.length} rounds=${totalRounds}`);
  return { created: true, cupId, teams: participants.length, rounds: totalRounds };
}

/** Odsimuluje aktuální kolo poháru a vygeneruje další kolo z vítězů (nebo ukončí pohár ve finále). */
export async function simulateCupRound(db: D1Database, cupId: string): Promise<{ ok: boolean; round?: number; finished?: boolean; winner?: string }> {
  const cup = await db.prepare("SELECT total_rounds, current_round, status, season_number FROM cup_competitions WHERE id = ?").bind(cupId)
    .first<{ total_rounds: number; current_round: number; status: string; season_number: number }>()
    .catch((e) => { logger.warn({ module: M }, "load cup", e); return null; });
  if (!cup || cup.status !== "active") return { ok: false };
  const round = cup.current_round;

  const matchesRes = await db.prepare("SELECT id, bracket_pos, home_cup_team_id, away_cup_team_id FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled'")
    .bind(cupId, round).all<{ id: string; bracket_pos: number; home_cup_team_id: string | null; away_cup_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load round matches", e); return { results: [] as any[] }; });

  const teamsRes = await db.prepare("SELECT id, strength, team_id FROM cup_teams WHERE cup_id = ?").bind(cupId).all<{ id: string; strength: number; team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load cup teams", e); return { results: [] as any[] }; });
  const strengthOf = new Map<string, number>(teamsRes.results.map((t) => [t.id, t.strength]));
  const realTeamOf = new Map<string, string | null>(teamsRes.results.map((t) => [t.id, t.team_id]));

  // Odměny za postup — herní datum pro transakce + částka/reputace daného kola
  const gdRow = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load game date", e); return null; });
  const gameDate = gdRow?.d ?? new Date().toISOString();
  const prize = cupPrize(round, cup.total_rounds);
  const repBonus = cupRepBonus(round, cup.total_rounds);
  const roundLabel = roundName(round, cup.total_rounds);

  const rng = createRng((cupId.charCodeAt(0) + round * 7919) >>> 0);
  const winners: { pos: number; teamId: string }[] = [];

  for (const m of matchesRes.results) {
    if (!m.home_cup_team_id || !m.away_cup_team_id) continue;
    const r = simMatch(strengthOf.get(m.home_cup_team_id) ?? 30, strengthOf.get(m.away_cup_team_id) ?? 30, rng);
    const winnerId = r.homeWin ? m.home_cup_team_id : m.away_cup_team_id;
    const loserId = r.homeWin ? m.away_cup_team_id : m.home_cup_team_id;
    await db.prepare("UPDATE cup_matches SET home_score=?, away_score=?, home_pens=?, away_pens=?, winner_cup_team_id=?, status='simulated', upset=? WHERE id=?")
      .bind(r.hg, r.ag, r.hp, r.ap, winnerId, r.upset ? 1 : 0, m.id).run()
      .catch((e) => logger.warn({ module: M }, "update cup match", e));
    await db.prepare("UPDATE cup_teams SET eliminated_round = ? WHERE id = ?").bind(round, loserId).run()
      .catch((e) => logger.warn({ module: M }, "eliminate", e));
    winners.push({ pos: m.bracket_pos, teamId: winnerId });

    // Odměna reálnému vítězi (velkokluby nemají rozpočet)
    const realWinner = realTeamOf.get(winnerId);
    if (realWinner) {
      await recordTransaction(db, realWinner, "cup_prize", prize, `Pohár — postup (${roundLabel})`, gameDate, `cup-${cupId}-r${round}-${winnerId}`)
        .catch((e) => logger.warn({ module: M }, "cup prize", e));
      if (repBonus.manager > 0) {
        await db.prepare("UPDATE managers SET reputation = MAX(15, MIN(75, reputation + ?)) WHERE team_id = ?").bind(repBonus.manager, realWinner).run()
          .catch((e) => logger.warn({ module: M }, "cup manager reputation", e));
      }
      if (repBonus.team > 0) {
        await db.prepare("UPDATE teams SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE id = ?").bind(repBonus.team, realWinner).run()
          .catch((e) => logger.warn({ module: M }, "cup team reputation", e));
      }
    }
  }

  // Finále hotové?
  if (round >= cup.total_rounds) {
    const champ = winners[0]?.teamId ?? null;
    await db.prepare("UPDATE cup_competitions SET status='finished', winner_team_id=? WHERE id=?").bind(champ, cupId).run()
      .catch((e) => logger.warn({ module: M }, "finish cup", e));
    return { ok: true, round, finished: true, winner: champ ?? undefined };
  }

  // Vygeneruj další kolo: vítěz pozice i → další kolo pozice floor(i/2), home pokud i sudé
  winners.sort((a, b) => a.pos - b.pos);
  const nextByPos = new Map<number, { home?: string; away?: string }>();
  for (const w of winners) {
    const np = Math.floor(w.pos / 2);
    const slot = nextByPos.get(np) ?? {};
    if (w.pos % 2 === 0) slot.home = w.teamId; else slot.away = w.teamId;
    nextByPos.set(np, slot);
  }
  const roundDates = await cupRoundDates(db, cup.season_number, cup.total_rounds);
  const nextDate = roundDates[round] ?? null; // datum kola round+1 (0-indexováno)
  const nextStmts: D1PreparedStatement[] = [];
  for (const [np, slot] of nextByPos) {
    nextStmts.push(db.prepare(
      "INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), cupId, round + 1, np, slot.home ?? null, slot.away ?? null, nextDate));
  }
  for (let i = 0; i < nextStmts.length; i += 40) await db.batch(nextStmts.slice(i, i + 40)).catch((e) => logger.error({ module: M }, "insert next round", e));
  await db.prepare("UPDATE cup_competitions SET current_round = ? WHERE id = ?").bind(round + 1, cupId).run()
    .catch((e) => logger.warn({ module: M }, "bump round", e));

  return { ok: true, round };
}

/**
 * Auto-postup poháru: pokud aktuální kolo aktivního poháru má naplánované datum
 * <= herní den, odsimuluj ho (i víc kol dozadu, kdyby se hra opozdila). Volá se z daily-ticku.
 */
export async function maybeAdvanceCup(db: D1Database): Promise<number> {
  const season = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "advance: season", e); return null; });
  if (!season?.n) return 0;
  const gd = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "advance: game date", e); return null; });
  if (!gd?.d) return 0;

  let advanced = 0, guard = 0;
  while (guard++ < 8) {
    const cup = await db.prepare("SELECT id, current_round FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1")
      .bind(season.n).first<{ id: string; current_round: number }>()
      .catch((e) => { logger.warn({ module: M }, "advance: load cup", e); return null; });
    if (!cup) break;
    const cur = await db.prepare("SELECT MIN(scheduled_at) AS d FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled'")
      .bind(cup.id, cup.current_round).first<{ d: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "advance: round date", e); return null; });
    if (!cur?.d || cur.d > gd.d) break; // kolo ještě nemá nadejít / už je dohrané
    await simulateCupRound(db, cup.id);
    advanced++;
  }
  if (advanced > 0) logger.info({ module: M }, `cup auto-advanced ${advanced} kol (s=${season.n})`);
  return advanced;
}
