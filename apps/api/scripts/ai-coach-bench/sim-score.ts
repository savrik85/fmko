// Kvalita rozhodnutí podle skutečného enginu: každá sestava (model i náhradní pravidlo)
// odehraje stejné zápasy se stejnými semínky proti stejné sestavě soupeře.
// Spuštění (viz README.md): BENCH_DB=<kopie.sqlite> node --experimental-sqlite sim-score.mjs <results.json> <contexts.json> <runs>
import { readFileSync, writeFileSync } from "node:fs";
import { openD1 } from "./d1-shim";
import { loadMatchContext } from "../../src/ai-coach/match";
import { assembleLineup, pickEleven, slotRatings, type MatchContext, type MatchDecision, type Slot, type SquadPlayer } from "../../src/ai-coach/match-decision";
import { mapRowToMatchPlayer } from "../../src/engine/lineup-loader";
import { simulateMatch } from "../../src/engine/simulation";
import { toEnginePlan } from "../../src/engine/plan-mapping";
import { NEUTRAL_REFEREE } from "../../src/engine/referee";
import { createRng } from "../../src/generators/rng";
import type { MatchPlayer, TeamSetup, Weather } from "../../src/engine/types";

const DB_PATH = process.env.BENCH_DB ?? "";
if (!DB_PATH) throw new Error("BENCH_DB = cesta ke kopii produkce (sqlite), viz README.md");
const resultsPath = process.argv[2];
const contextsPath = process.argv[3];
const RUNS = Number(process.argv[4] ?? 300);

const quiet = <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log; const warn = console.warn; const info = console.info;
  console.log = () => undefined; console.warn = () => undefined; console.info = () => undefined;
  return fn().finally(() => { console.log = log; console.warn = warn; console.info = info; });
};

function natural(p: MatchPlayer): MatchPlayer {
  return { ...p, matchPosition: p.position };
}

function ourSetup(ctx: MatchContext, d: MatchDecision, teamId: 1 | 2): TeamSetup | null {
  const squadIds = new Set([...ctx.squad.map((p) => p.id), ...ctx.unavailable.map((p) => p.id)]);
  const lineup = assembleLineup(ctx, d, squadIds);
  const byId = new Map(ctx.squad.map((p) => [p.id, p]));
  const xi = lineup.players.map((x) => {
    const p = byId.get(x.playerId);
    return p ? { ...p.engine, matchPosition: x.matchPosition } : null;
  }).filter((p): p is MatchPlayer => !!p);
  if (xi.length < 11) return null;
  const subs = lineup.bench.map((id) => byId.get(id)).filter((p): p is SquadPlayer => !!p).map((p) => natural(p.engine));
  const idMap = new Map<number, string>();
  for (const p of ctx.squad) idMap.set(p.engine.id, p.id);
  const eng = (id: string | null) => (id ? byId.get(id)?.engine.id : undefined);
  return {
    teamId, teamName: ctx.teamName, lineup: xi, subs, tactic: lineup.tactic, formation: lineup.formation,
    captainId: eng(lineup.captainId), hardness: lineup.hardness,
    penaltyTakerId: eng(lineup.penaltyTakerId), freekickTakerId: eng(lineup.freekickTakerId),
    formationFamiliarity: ctx.familiarity[lineup.formation] ?? 0,
    plan: toEnginePlan(idMap, JSON.stringify(lineup.matchPlan)),
  };
}

function opponentSetup(opp: MatchContext, teamId: 1 | 2): TeamSetup {
  const { picks } = pickEleven(opp.squad, "4-4-2");
  const used = new Set(picks.map((x) => x.player.key));
  return {
    teamId, teamName: opp.teamName,
    lineup: picks.map((x) => ({ ...x.player.engine, matchPosition: x.slot })),
    subs: opp.squad.filter((p) => !used.has(p.key)).sort((a, b) => b.rating - a.rating).slice(0, 7).map((p) => natural(p.engine)),
    tactic: "balanced", formation: "4-4-2", hardness: "normal", formationFamiliarity: opp.familiarity["4-4-2"] ?? 50,
  };
}

async function main() {
  const db = openD1(DB_PATH);
  const contexts = JSON.parse(readFileSync(contextsPath, "utf8")) as MatchContext[];
  const results = JSON.parse(readFileSync(resultsPath, "utf8")).results as Record<string, Array<{ decision: MatchDecision; used?: string } | null>>;
  const opponents: Array<MatchContext | null> = [];
  for (const ctx of contexts) {
    const m = await db.prepare(
      ctx.fixture.kind === "cup"
        ? `SELECT CASE WHEN ht.team_id = ?1 THEN at.team_id ELSE ht.team_id END AS opp FROM cup_matches cm
             JOIN cup_teams ht ON ht.id = cm.home_cup_team_id JOIN cup_teams at ON at.id = cm.away_cup_team_id WHERE cm.id = ?2`
        : "SELECT CASE WHEN home_team_id = ?1 THEN away_team_id ELSE home_team_id END AS opp FROM matches WHERE calendar_id = ?2 AND (home_team_id = ?1 OR away_team_id = ?1)",
    ).bind(ctx.teamId, ctx.fixture.calendarId.replace(/-friendly$/, "")).first<{ opp: string | null }>();
    const fixture = { calendarId: ctx.fixture.calendarId.replace(/-friendly$/, ""), kind: ctx.fixture.kind === "friendly" ? "league" as const : ctx.fixture.kind };
    if (m?.opp) {
      opponents.push(await quiet(() => loadMatchContext(db, m.opp as string, fixture)));
      continue;
    }
    // Pohár proti klubu mimo hru: kádr z cup_club_players (stejně jako simulace poháru).
    if (ctx.fixture.kind === "cup") {
      const oppCup = await db.prepare(
        `SELECT CASE WHEN ht.team_id = ?1 THEN at.id ELSE ht.id END AS id FROM cup_matches cm
           JOIN cup_teams ht ON ht.id = cm.home_cup_team_id JOIN cup_teams at ON at.id = cm.away_cup_team_id WHERE cm.id = ?2`,
      ).bind(ctx.teamId, ctx.fixture.calendarId).first<{ id: string }>();
      const rows = oppCup ? await db.prepare("SELECT * FROM cup_club_players WHERE cup_team_id = ? ORDER BY overall_rating DESC").bind(oppCup.id).all<Record<string, unknown>>() : { results: [] };
      const squad: SquadPlayer[] = rows.results.map((r, i) => {
        const engine = mapRowToMatchPlayer({
          id: r.id as string, first_name: String(r.first_name ?? "X"), last_name: String(r.last_name ?? "Y"), nickname: null,
          position: r.position as string, skills: r.skills as string, personality: (r.personality as string) ?? "{}",
          life_context: JSON.stringify({ morale: r.morale ?? 60, condition: r.condition ?? 100 }), physical: (r.physical as string) ?? null,
          age: r.age as number,
        });
        return {
          key: `O${i + 1}`, id: r.id as string, name: "", position: r.position as Slot, age: (r.age as number) ?? 25,
          rating: (r.overall_rating as number) ?? 30, condition: 100, morale: 60, form: null, appearances: 0,
          leadership: engine.leadership, aggression: engine.aggression, setPieces: engine.setPieces, shooting: engine.shooting,
          oneYellowFromBan: false, slotRating: slotRatings(engine), engine,
        };
      });
      opponents.push(squad.length >= 11 ? { ...ctx, teamName: "cup club", squad, familiarity: {} } : null);
      continue;
    }
    opponents.push(null);
  }

  const table: Record<string, { points: number; gd: number; n: number; byKind: Record<string, { points: number; n: number }> }> = {};
  const perContext: Record<string, number[]> = {};
  for (const [model, rows] of Object.entries(results)) {
    table[model] = { points: 0, gd: 0, n: 0, byKind: {} };
    perContext[model] = [];
    rows.forEach((row, i) => {
      const ctx = contexts[i];
      const opp = opponents[i];
      if (!row || !ctx || !opp || opp.squad.length < 11) { perContext[model].push(NaN); return; }
      const home = ctx.fixture.isHome;
      const mine = ourSetup(ctx, row.decision, home ? 1 : 2);
      if (!mine) { perContext[model].push(NaN); return; }
      const theirs = opponentSetup(opp, home ? 2 : 1);
      let pts = 0, gd = 0;
      for (let s = 0; s < RUNS; s++) {
        const rng = createRng(1_000_003 * (i + 1) + s);
        const res = simulateMatch(rng, {
          home: structuredClone(home ? mine : theirs),
          away: structuredClone(home ? theirs : mine),
          weather: (ctx.weather ?? "cloudy") as Weather,
          isHomeAdvantage: ctx.fixture.kind !== "cup" || home,
          pitchCondition: ctx.pitchCondition ?? 60,
          referee: { ...NEUTRAL_REFEREE, strictness: ctx.refereeStrictness ?? 50 },
        });
        const gf = home ? res.homeScore : res.awayScore;
        const ga = home ? res.awayScore : res.homeScore;
        pts += gf > ga ? 3 : gf === ga ? 1 : 0;
        gd += gf - ga;
      }
      const t = table[model];
      t.points += pts / RUNS; t.gd += gd / RUNS; t.n++;
      const k = (t.byKind[ctx.fixture.kind] ??= { points: 0, n: 0 });
      k.points += pts / RUNS; k.n++;
      perContext[model].push(pts / RUNS);
    });
  }
  const base = perContext.fallback;
  const out: Record<string, unknown> = {};
  for (const [model, t] of Object.entries(table)) {
    const deltas = perContext[model].map((v, i) => v - base[i]).filter((v) => Number.isFinite(v));
    const wins = deltas.filter((d) => d > 0.02).length;
    const losses = deltas.filter((d) => d < -0.02).length;
    out[model] = {
      contexts: t.n,
      pointsPerMatch: Math.round((t.points / t.n) * 1000) / 1000,
      goalDiffPerMatch: Math.round((t.gd / t.n) * 1000) / 1000,
      deltaVsFallback: Math.round((deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length)) * 1000) / 1000,
      betterThanFallback: wins, worseThanFallback: losses,
      byKind: Object.fromEntries(Object.entries(t.byKind).map(([k, v]) => [k, Math.round((v.points / v.n) * 1000) / 1000])),
    };
  }
  console.log(JSON.stringify(out, null, 1));
  writeFileSync(resultsPath.replace(/\.json$/, "-sim.json"), JSON.stringify({ runs: RUNS, summary: out, perContext }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
