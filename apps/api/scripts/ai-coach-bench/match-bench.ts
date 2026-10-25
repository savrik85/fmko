// Srovnání modelů na skutečných předzápasových rozhodnutích AI klubů (kopie produkce, jen lokálně).
// Spuštění (viz README.md): BENCH_DB=<kopie.sqlite> node --experimental-sqlite match-bench.mjs <model[#effort],...> <maxContexts> <out.json> <concurrency> <timeoutMs>
import { restAi } from "./ai-rest";
import { writeFileSync } from "node:fs";
import { openD1 } from "./d1-shim";
import { loadMatchContext, decideMatch } from "../../src/ai-coach/match";
import { assembleLineup, formationOptions, tacticOptions, fallbackMatchDecision, type MatchContext, type MatchDecision } from "../../src/ai-coach/match-decision";

const DB_PATH = process.env.BENCH_DB ?? "";
if (!DB_PATH) throw new Error("BENCH_DB = cesta ke kopii produkce (sqlite), viz README.md");
const models = (process.argv[2] ?? "").split(",").filter(Boolean);
const maxContexts = Number(process.argv[3] ?? 24);
const outPath = process.argv[4] ?? "match-results.json";
const concurrency = Number(process.argv[5] ?? 4);
const TIMEOUT_MS = Number(process.argv[6] ?? 90_000);

const quiet = <T>(fn: () => Promise<T>): Promise<T> => {
  if (process.env.BENCH_VERBOSE) return fn();
  const log = console.log; const warn = console.warn; const info = console.info;
  console.log = () => undefined; console.warn = () => undefined; console.info = () => undefined;
  return fn().finally(() => { console.log = log; console.warn = warn; console.info = info; });
};

async function buildContexts(db: D1Database): Promise<MatchContext[]> {
  const teams = await db.prepare(
    "SELECT id, name, league_id FROM teams WHERE user_id = 'ai' AND parent_team_id IS NULL AND league_id IS NOT NULL ORDER BY name",
  ).all<{ id: string; name: string; league_id: string }>();
  const out: MatchContext[] = [];
  for (const t of teams.results) {
    const league = await db.prepare(
      `SELECT sc.id FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id
        WHERE sc.league_id = ? AND sc.status = 'scheduled' AND (m.home_team_id = ? OR m.away_team_id = ?)
          AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
        ORDER BY sc.scheduled_at LIMIT 1`,
    ).bind(t.league_id, t.id, t.id, t.league_id).first<{ id: string }>();
    if (league) {
      const ctx = await quiet(() => loadMatchContext(db, t.id, { calendarId: league.id, kind: "league" }));
      if (ctx && ctx.squad.length >= 11) out.push(ctx);
    }
    const cup = await db.prepare(
      `SELECT cm.id FROM cup_matches cm JOIN cup_teams my ON my.cup_id = cm.cup_id AND my.team_id = ? AND my.id IN (cm.home_cup_team_id, cm.away_cup_team_id)
        WHERE cm.status = 'scheduled' ORDER BY cm.scheduled_at LIMIT 1`,
    ).bind(t.id).first<{ id: string }>();
    if (cup) {
      const ctx = await quiet(() => loadMatchContext(db, t.id, { calendarId: cup.id, kind: "cup" }));
      if (ctx && ctx.squad.length >= 11) out.push(ctx);
    }
  }
  // Přáteláky: několik ligových kontextů jako přátelák (rotace, šance mladým).
  const friendlies = out.filter((c) => c.fixture.kind === "league").slice(0, 4).map((c) => ({
    ...c, fixture: { ...c.fixture, kind: "friendly" as const, label: "friendly", calendarId: `${c.fixture.calendarId}-friendly` },
  }));
  // Prokládat druhy, ať i krátký běh vidí všechno.
  const leagues = out.filter((c) => c.fixture.kind === "league");
  const cups = out.filter((c) => c.fixture.kind === "cup");
  const mixed: MatchContext[] = [];
  while (leagues.length || cups.length || friendlies.length) {
    if (leagues.length) mixed.push(leagues.shift()!);
    if (leagues.length) mixed.push(leagues.shift()!);
    if (cups.length) mixed.push(cups.shift()!);
    if (friendlies.length) mixed.push(friendlies.shift()!);
  }
  return mixed.slice(0, maxContexts);
}

interface Score {
  formationGap: number;
  outOfPosition: number;
  minOutOfPosition: number;
  tacticEff: number;
  hardBad: boolean;
  tiredStarters: number;
  captainRank: number;
  youthStarts: number;
  planRules: number;
  planKept: number;
  favouriteFormation: boolean;
  favouriteTactic: boolean;
  sensible: number;
}

function score(ctx: MatchContext, d: MatchDecision): Score {
  const opts = formationOptions(ctx);
  const best = Math.max(...opts.map((o) => o.strength));
  const chosen = opts.find((o) => o.formation === d.formation)!;
  const minOop = Math.min(...opts.map((o) => o.outOfPosition));
  const tac = tacticOptions(ctx, d.formation).find((t) => t.tactic === d.tactic)!;
  const eff = tac.fit * tac.synergy;
  const squadIds = new Set([...ctx.squad.map((p) => p.id), ...ctx.unavailable.map((p) => p.id)]);
  const lineup = assembleLineup(ctx, d, squadIds);
  const xi = ctx.squad.filter((p) => lineup.players.some((x) => x.playerId === p.id));
  const aggression = xi.reduce((s, p) => s + p.aggression, 0) / Math.max(1, xi.length);
  const hardBad = d.hardness === "hard" && ((ctx.refereeStrictness ?? 50) >= 65 || aggression < 50);
  const tired = xi.filter((p) => p.condition < 50 && ctx.squad.some((o) => o.position === p.position && o.condition >= 70 && !xi.includes(o))).length;
  const byLeadership = [...xi].sort((a, b) => b.leadership - a.leadership);
  const captainRank = byLeadership.findIndex((p) => p.id === lineup.captainId) + 1;
  const youthStarts = xi.filter((p) => p.age <= 21).length;
  let sensible = 100;
  sensible -= Math.max(0, best - chosen.strength - 1) * 10;
  sensible -= Math.max(0, chosen.outOfPosition - minOop) * 8;
  if (eff < 0.9) sensible -= 15;
  if (hardBad) sensible -= 10;
  sensible -= tired * 5;
  if (captainRank > 3) sensible -= 5;
  sensible -= (d.plan.length - lineup.matchPlan.length) * 5;
  return {
    formationGap: Math.round((best - chosen.strength) * 10) / 10,
    outOfPosition: chosen.outOfPosition, minOutOfPosition: minOop,
    tacticEff: Math.round(eff * 100) / 100, hardBad, tiredStarters: tired, captainRank, youthStarts,
    planRules: d.plan.length, planKept: lineup.matchPlan.length,
    favouriteFormation: ctx.profile.favouriteFormations.includes(d.formation),
    favouriteTactic: ctx.profile.favouriteTactic === d.tactic,
    sensible: Math.max(0, Math.round(sensible)),
  };
}

async function main() {
  const db = openD1(DB_PATH);
  // Stejné kontexty jako v předchozím kole (BENCH_CONTEXTS), ať jde srovnávat i simulací.
  const contexts: MatchContext[] = process.env.BENCH_CONTEXTS
    ? JSON.parse((await import("node:fs")).readFileSync(process.env.BENCH_CONTEXTS, "utf8")).slice(0, maxContexts)
    : await buildContexts(db);
  console.log(`kontextů: ${contexts.length} (${contexts.map((c) => c.fixture.kind[0]).join("")})`);
  writeFileSync(outPath.replace(/\.json$/, "-contexts.json"), JSON.stringify(contexts));
  const proxy = { env: { AI: restAi() }, dispose: async () => undefined };
  let results: Record<string, unknown[]> = {};
  if (process.argv[7]) {
    // Doplnit do existujícího výsledku (další kolo měření).
    const { readFileSync } = await import("node:fs");
    results = JSON.parse(readFileSync(outPath, "utf8")).results;
  }
  // Náhradní pravidlo jako srovnávací základ.
  results.fallback = contexts.map((ctx) => {
    const d = fallbackMatchDecision(ctx);
    return { team: ctx.teamName, kind: ctx.fixture.kind, decision: d, score: score(ctx, d) };
  });
  for (const model of models) {
    const rows: unknown[] = new Array(contexts.length);
    let next = 0;
    const worker = async () => {
      while (next < contexts.length) {
        const i = next++;
        const ctx = contexts[i];
        const [name, effort] = model.split("#");
        const r = await quiet(() => decideMatch({ AI: proxy.env.AI }, ctx, {
          useModel: true, model: name, reasoningEffort: effort as "low" | "medium" | "high" | undefined, timeoutMs: TIMEOUT_MS,
        }));
        rows[i] = {
          team: ctx.teamName, kind: ctx.fixture.kind, profile: ctx.profile,
          used: r.used, error: r.error, rejected: r.rejected, latencyMs: r.latencyMs, tokensIn: r.tokensIn, tokensOut: r.tokensOut,
          decision: r.decision, raw: r.raw?.slice(0, 1500), score: score(ctx, r.decision),
        };
        process.stdout.write(`${model.split("/").pop()} ${i + 1}/${contexts.length} ${r.used} ${r.latencyMs} ms ${r.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    results[model] = rows;
    writeFileSync(outPath, JSON.stringify({ contexts: contexts.map((c) => ({ team: c.teamName, kind: c.fixture.kind, opponent: c.fixture.opponentName })), results }, null, 1));
  }
  writeFileSync(outPath, JSON.stringify({ contexts: contexts.map((c) => ({ team: c.teamName, kind: c.fixture.kind, opponent: c.fixture.opponentName })), results }, null, 1));
  await proxy.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });
