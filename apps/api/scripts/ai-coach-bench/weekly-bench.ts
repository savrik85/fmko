// Srovnání modelů na pondělní správě AI klubů (kopie produkce, jen lokálně, nic se neprovede).
// Spuštění (viz README.md): BENCH_DB=<kopie.sqlite> node --experimental-sqlite weekly-bench.mjs <model[#effort],...> <out.json> <concurrency> <timeoutMs>
import { restAi } from "./ai-rest";
import { writeFileSync } from "node:fs";
import { openD1 } from "./d1-shim";
import { completeAiClub } from "../../src/ai-clubs/complete-club";
import { decideWeekly, loadWeeklyContext } from "../../src/ai-coach/weekly";
import { fallbackWeeklyDecision, planWeeklyActions, type WeeklyContext, type WeeklyDecision } from "../../src/ai-coach/weekly-decision";

const DB_PATH = process.env.BENCH_DB ?? "";
if (!DB_PATH) throw new Error("BENCH_DB = cesta ke kopii produkce (sqlite), viz README.md");
const models = (process.argv[2] ?? "").split(",").filter(Boolean);
const outPath = process.argv[3] ?? "weekly-results.json";
const concurrency = Number(process.argv[4] ?? 4);
const TIMEOUT_MS = Number(process.argv[5] ?? 180_000);

const quiet = <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log; const warn = console.warn; const info = console.info;
  console.log = () => undefined; console.warn = () => undefined; console.info = () => undefined;
  return fn().finally(() => { console.log = log; console.warn = warn; console.info = info; });
};

function score(ctx: WeeklyContext, d: WeeklyDecision) {
  const plan = planWeeklyActions(ctx, d);
  const freeSlots = Math.max(0, ctx.banners.max - ctx.banners.active);
  const bannersWanted = Math.min(freeSlots, ctx.banners.offers.length);
  const bannersSigned = plan.actions.filter((a) => a.kind === "banner").length;
  const pitchNeeded = ctx.pitch.condition < 45;
  const pitchFixed = plan.actions.some((a) => a.kind === "pitch_maintenance");
  const spendShare = ctx.finance.spendable > 0 ? plan.totalCost / ctx.finance.spendable : 0;
  const skippedForMoney = plan.skipped.filter((s) => s.reason.startsWith("rezerva")).length;
  let sensible = 100;
  if (bannersWanted > 0 && bannersSigned < bannersWanted) sensible -= 10 * (bannersWanted - bannersSigned) / bannersWanted;
  if (pitchNeeded && !pitchFixed) sensible -= 15;
  if (d.training.sessions < 2) sensible -= 10;
  if (d.training.intensity === "hard" && ctx.training.avgCondition < 65) sensible -= 10;
  sensible -= Math.min(20, skippedForMoney * 5);
  return {
    bannersSigned, bannersWanted, pitchNeeded, pitchFixed, spendShare: Math.round(spendShare * 100) / 100,
    totalCost: plan.totalCost, spendable: ctx.finance.spendable, skippedForMoney, actions: plan.actions.map((a) => a.kind),
    sensible: Math.max(0, Math.round(sensible)),
  };
}

async function main() {
  const db = openD1(DB_PATH);
  const teams = await db.prepare(
    "SELECT id, name FROM teams WHERE user_id = 'ai' AND parent_team_id IS NULL AND league_id IS NOT NULL ORDER BY name",
  ).all<{ id: string; name: string }>();
  const contexts: WeeklyContext[] = [];
  for (const t of teams.results) {
    // Jako po nasazení fáze 2: AI klub má stadion, vybavení a trenéra s povahou (jen v kopii).
    await quiet(() => completeAiClub(db, t.id));
    const ctx = await quiet(() => loadWeeklyContext(db, t.id, "2026-10-26"));
    if (ctx) contexts.push(ctx);
  }
  console.log(`kontextů: ${contexts.length}`);
  const proxy = { env: { AI: restAi() }, dispose: async () => undefined };
  const results: Record<string, unknown[]> = {};
  results.fallback = contexts.map((ctx) => {
    const d = fallbackWeeklyDecision(ctx);
    return { team: ctx.teamName, profile: ctx.profile, budget: ctx.budget, decision: d, score: score(ctx, d) };
  });
  for (const model of models) {
    const rows: unknown[] = new Array(contexts.length);
    let next = 0;
    const worker = async () => {
      while (next < contexts.length) {
        const i = next++;
        const ctx = contexts[i];
        const [name, effort] = model.split("#");
        const r = await quiet(() => decideWeekly({ AI: proxy.env.AI }, ctx, {
          useModel: true, model: name, reasoningEffort: effort as "low" | "medium" | "high" | undefined, timeoutMs: TIMEOUT_MS,
        }));
        rows[i] = {
          team: ctx.teamName, profile: ctx.profile, budget: ctx.budget, spendable: ctx.finance.spendable,
          used: r.used, error: r.error, rejected: r.rejected, latencyMs: r.latencyMs, tokensIn: r.tokensIn, tokensOut: r.tokensOut,
          decision: r.decision, raw: r.raw?.slice(0, 1500), score: score(ctx, r.decision),
        };
        process.stdout.write(`${model} ${i + 1}/${contexts.length} ${r.used} ${r.latencyMs} ms ${r.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    results[model] = rows;
    writeFileSync(outPath, JSON.stringify({ teams: contexts.map((c) => c.teamName), results }, null, 1));
  }
  writeFileSync(outPath, JSON.stringify({ teams: contexts.map((c) => c.teamName), results }, null, 1));
  await proxy.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });
