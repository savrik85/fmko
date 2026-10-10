#!/usr/bin/env node
/**
 * Přehrání skutečné ligové sezóny lokálně — srovnání starého a nového zápasového enginu.
 *
 * Příkazy:
 *   run      --code <worktree> [--runs K] [--out file.json] [--label jméno] ...
 *   stats    --db <soubor.sqlite> [--out file.json] [--label jméno]   (statistika z hotové DB, např. z produkce)
 *   compare  <stary.json> <novy.json>
 *
 * Podrobnosti v README.md vedle tohoto souboru.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// node:sqlite je v Node 22 jen za přepínačem — skript se v tom případě spustí znovu s ním.
if (!process.execArgv.includes("--experimental-sqlite")) {
  const r = spawnSync(process.execPath, ["--experimental-sqlite", "--no-warnings", ...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ENTRY = path.join(HARNESS_DIR, "worker-entry.ts");
const SCRATCH = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/4cefeb10-9ac8-4f37-b930-0d37308738a5/scratchpad";
const DEFAULTS = {
  prod: path.join(SCRATCH, "prod.sqlite"),
  work: path.join(SCRATCH, "real-game", "work"),
  outDir: path.join(SCRATCH, "real-game"),
  runs: 1,
  warmupDays: 3,
  tickTimeoutS: 900,
  stallS: 45,
  mode: "queue",
};

// ───────────────────────────── pomocné ─────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      // --max-dates → maxDates (kebab-case na camelCase, jak je mají DEFAULTS)
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[key] = true;
      else { opts[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, opts };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

function findWrangler() {
  const candidates = [
    path.resolve(HARNESS_DIR, "../../../../../node_modules/.bin/wrangler"),
    "/Users/savrik/Projects/fmko/node_modules/.bin/wrangler",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("wrangler nenalezen v node_modules/.bin");
}

function gitInfo(codeRoot) {
  const head = spawnSync("git", ["-C", codeRoot, "rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  // Jen sledované soubory — nesledované *.scratch.test.ts v src do bundlu nejdou.
  const dirty = spawnSync("git", ["-C", codeRoot, "status", "--porcelain", "--untracked-files=no", "--", "apps/api/src", "packages/shared/src"], { encoding: "utf8" });
  return {
    head: head.stdout.trim() || null,
    dirtyFiles: dirty.stdout.split("\n").filter(Boolean).map((l) => l.slice(3)),
  };
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// ───────────────────────────── příprava DB ─────────────────────────────

/**
 * Vrátí aktuální sezónu všech lig do stavu před prvním kolem. Hráči, zranění, stopky,
 * finance a vše ostatní zůstávají ze snímku produkce — mění se jen to, co by jinak
 * bránilo runneru kolo odehrát znovu nebo by ho zkreslilo (statistiky sezóny, stará auto-sestava).
 */
const RESET_SQL = `
CREATE TEMP TABLE cur_cal AS
  SELECT sc.id FROM season_calendar sc
   WHERE sc.season_number = (SELECT MAX(s2.season_number) FROM season_calendar s2 WHERE s2.league_id = sc.league_id);
CREATE TEMP TABLE cur_match AS SELECT id FROM matches WHERE calendar_id IN (SELECT id FROM cur_cal);

UPDATE season_calendar SET status = 'scheduled', locked_at = NULL WHERE id IN (SELECT id FROM cur_cal);
UPDATE matches SET status = 'scheduled', home_score = NULL, away_score = NULL, events = NULL, commentary = NULL,
       player_ratings = NULL, simulated_at = NULL, home_seen_at = NULL, away_seen_at = NULL, attendance = NULL,
       stadium_name = NULL, pitch_condition = NULL, weather = NULL, home_lineup_data = NULL, away_lineup_data = NULL,
       absences = NULL, possession_home = NULL, mom_player_id = NULL, fastest_goal_minute = NULL, total_cards = NULL,
       referee_snapshot = NULL, referee_incidents = NULL, referee_grade = NULL, fan_incidents = NULL, away_fans = NULL
 WHERE id IN (SELECT id FROM cur_match);

-- Per-zápasové záznamy původního odehrání (UNIQUE(match_id, player_id) by jinak kolidovalo
-- a stopky se počítají z match_player_stats daného zápasu).
DELETE FROM match_player_stats WHERE match_id IN (SELECT id FROM cur_match);
DELETE FROM fans_match_history WHERE match_id IN (SELECT id FROM cur_match);
DELETE FROM concession_match_sales WHERE match_id IN (SELECT id FROM cur_match);

-- Auto-sestavy vyrábí runner až v okamžiku zápasu (copyOrCreateLineup) z tehdejšího kádru.
-- Ruční sestavy manažerů (is_auto = 0) zůstávají — to jsou skutečná rozhodnutí hráčů.
DELETE FROM lineups WHERE is_auto = 1 AND calendar_id IN (SELECT id FROM cur_cal);

-- Sezónní statistiky od nuly — jinak by se žluté z původní sezóny sčítaly s novými (stopky po 4 žlutých).
DELETE FROM player_stats WHERE season_id = (SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1);

-- Pohár se v přehrávání nehraje (jeho termín je v reálném čase, ne v čase přehrávání).
UPDATE cup_matches SET scheduled_at = '2099-01-01T16:00:00.000Z' WHERE status = 'scheduled';

DELETE FROM queue_runs;
DELETE FROM queue_failures;
`;

function prepareDb(dbFile, extraSqlFile) {
  const db = new DatabaseSync(dbFile);
  db.exec("BEGIN");
  db.exec(RESET_SQL);
  // Volitelný zásah do světa pro kontrolní experiment (např. těžší hráči jednoho týmu).
  if (extraSqlFile) db.exec(fs.readFileSync(extraSqlFile, "utf8"));
  db.exec("COMMIT");

  const timelineRows = db.prepare(`
    SELECT substr(sc.scheduled_at, 1, 10) AS day, l.name AS league, sc.game_week AS gw
      FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id
     WHERE sc.season_number = (SELECT MAX(s2.season_number) FROM season_calendar s2 WHERE s2.league_id = sc.league_id)
     ORDER BY sc.scheduled_at, l.name`).all();
  const timeline = [];
  for (const r of timelineRows) {
    let t = timeline.find((x) => x.day === r.day);
    if (!t) { t = { day: r.day, rounds: [] }; timeline.push(t); }
    t.rounds.push(`${r.league} #${r.gw}`);
  }
  const roundLeagues = db.prepare(`
    SELECT COUNT(*) AS n FROM (SELECT t.league_id FROM teams t JOIN leagues l ON t.league_id = l.id
      WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL GROUP BY t.league_id)`).get().n;
  const humanLeagues = db.prepare(`
    SELECT COUNT(*) AS n FROM (SELECT t.league_id FROM teams t WHERE t.user_id != 'ai' AND t.league_id IS NOT NULL GROUP BY t.league_id)`).get().n;
  const snapshotGameDate = db.prepare("SELECT MAX(game_date) AS d FROM teams").get().d;
  db.close();
  return { timeline, expectedQueueRuns: roundLeagues + humanLeagues, roundLeagues, humanLeagues, snapshotGameDate };
}

// ───────────────────────────── worker (Miniflare) ─────────────────────────────

/**
 * Konfigurace pro `wrangler deploy --dry-run` — slouží JEN k sestavení bundlu stejným
 * bundlerem, jakým se worker nasazuje (alias, nodejs_compat polyfilly). Nic se nenasazuje.
 */
function writeWranglerConfig(dir, codeRoot) {
  const productEntry = path.join(codeRoot, "apps/api/src/index.ts");
  const sharedEntry = path.join(codeRoot, "packages/shared/src/index.ts");
  for (const f of [productEntry, sharedEntry, WORKER_ENTRY]) {
    if (!fs.existsSync(f)) throw new Error(`chybí soubor ${f}`);
  }
  // Záměrně BEZ [ai] (Workers AI je vždy vzdálený), bez routes a bez secrets.
  const toml = `# Vygenerováno skriptem engine-lab/real-game/harness.mjs — jen pro sestavení bundlu.
name = "prales-api-harness"
main = ${JSON.stringify(WORKER_ENTRY)}
compatibility_date = "${COMPATIBILITY_DATE}"
compatibility_flags = ["nodejs_compat"]

[alias]
"prales-product-entry" = ${JSON.stringify(productEntry)}
"@okresni-masina/shared" = ${JSON.stringify(sharedEntry)}
`;
  const file = path.join(dir, "wrangler.toml");
  fs.writeFileSync(file, toml);
  return file;
}

const COMPATIBILITY_DATE = "2025-03-14";
const WRANGLER_ENV = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" };
for (const k of ["GEMINI_API_KEY", "SUNO_API_KEY", "REPLICATE_API_TOKEN", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "AI_GATEWAY_URL", "CLOUDFLARE_API_TOKEN"]) {
  delete WRANGLER_ENV[k];
}

/** Sestaví worker (obal + produktový kód zvolené verze) do jednoho ES modulu. */
function buildBundle(runDir, codeRoot) {
  fs.mkdirSync(runDir, { recursive: true });
  const configFile = writeWranglerConfig(runDir, codeRoot);
  const outDir = path.join(runDir, "bundle");
  fs.rmSync(outDir, { recursive: true, force: true });
  const r = spawnSync(findWrangler(), ["deploy", "--dry-run", "--outdir", outDir, "-c", configFile], {
    cwd: runDir, env: WRANGLER_ENV, encoding: "utf8",
  });
  const bundle = path.join(outDir, "worker-entry.js");
  if (r.status !== 0 || !fs.existsSync(bundle)) throw new Error(`sestavení bundlu selhalo: ${r.stderr || r.stdout}`);
  // Hash bez relativních cest v komentářích bundlu (liší se podle hloubky pracovní složky).
  const normalized = fs.readFileSync(bundle, "utf8").replace(/(\.\.\/)+/g, "");
  const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return { bundle, hash };
}

async function loadMiniflare() {
  const candidates = [
    path.resolve(HARNESS_DIR, "../../../../../node_modules/miniflare/dist/src/index.js"),
    "/Users/savrik/Projects/fmko/node_modules/miniflare/dist/src/index.js",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return import(c);
  throw new Error("miniflare nenalezen v node_modules");
}

/**
 * Miniflare se stejnými bindingy jako produkční worker (D1, KV, R2, fronty se stejným
 * nastavením konzumera). Je to totéž běhové prostředí (workerd), které spouští `wrangler dev`,
 * jen bez jeho vývojářské proxy — ta na každý D1 dotaz otevřela TCP spojení a jedno kolo
 * vyčerpalo lokální porty (EADDRNOTAVAIL, zamrzlé požadavky).
 */
async function createMiniflare(mfModule, { bundle, stateDir, logStream, mode }) {
  const { Miniflare, Log, LogLevel } = mfModule;
  class FileLog extends Log {
    constructor() { super(LogLevel.INFO); }
    log(message) { logStream.write(`[mf] ${message}\n`); }
  }
  const queues = mode === "queue" ? {
    queueProducers: { MATCH_QUEUE: { queueName: "harness-match-rounds" }, REPORTS_QUEUE: { queueName: "harness-reports" } },
    queueConsumers: {
      "harness-match-rounds": { maxBatchSize: 1, maxBatchTimeout: 5, maxRetries: 3, deadLetterQueue: "harness-match-dlq" },
      "harness-reports": { maxBatchSize: 1, maxBatchTimeout: 5, maxRetries: 3, deadLetterQueue: "harness-reports-dlq" },
      "harness-match-dlq": { maxBatchSize: 10, maxBatchTimeout: 30, maxRetries: 0 },
      "harness-reports-dlq": { maxBatchSize: 10, maxBatchTimeout: 30, maxRetries: 0 },
    },
  } : {};
  const mf = new Miniflare({
    modules: true,
    scriptPath: bundle,
    // Názvy modulů se počítají relativně k modulesRoot; bez něj by cesta vedla přes ".."
    // mimo pracovní adresář a workerd ji odmítne.
    modulesRoot: path.dirname(bundle),
    compatibilityDate: COMPATIBILITY_DATE,
    compatibilityFlags: ["nodejs_compat"],
    host: "127.0.0.1",
    port: 0,
    // Bez stahování request.cf z internetu (Miniflare jinak volá workers.cloudflare.com/cf.json).
    cf: false,
    bindings: { VAPID_SUBJECT: "mailto:admin@prales.fun" },
    d1Databases: { DB: "00000000-0000-4000-8000-00000000d1d1" },
    kvNamespaces: { SESSION_KV: "harness-session-kv", CACHE_KV: "harness-cache-kv" },
    r2Buckets: { SEED_DATA: "harness-seed" },
    ...queues,
    defaultPersistRoot: stateDir,
    log: new FileLog(),
    handleRuntimeStdio(stdout, stderr) {
      stdout.on("data", (d) => logStream.write(d));
      stderr.on("data", (d) => logStream.write(d));
    },
  });
  await mf.ready;
  return mf;
}

/** Založí prázdnou D1 přes Miniflare a nahradí její soubor kopií produkce. */
async function createLocalDb(mfModule, { bundle, stateDir, logStream, prodFile, mode }) {
  const mf = await createMiniflare(mfModule, { bundle, stateDir, logStream, mode });
  try {
    const db = await mf.getD1Database("DB");
    await withTimeout(db.prepare("SELECT 1").first(), 60000, "založení lokální D1");
  } finally {
    await mf.dispose();
  }
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".sqlite") && d.endsWith("miniflare-D1DatabaseObject")) found.push(p);
    }
  };
  walk(stateDir);
  if (found.length !== 1) throw new Error(`v ${stateDir} čekám právě jednu D1 databázi, je jich ${found.length}`);
  const dbFile = found[0];
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(dbFile + suffix)) fs.rmSync(dbFile + suffix);
  }
  fs.copyFileSync(prodFile, dbFile);
  return dbFile;
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: timeout ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function mfJson(mf, pathAndQuery, init = {}) {
  const res = await withTimeout(mf.dispatchFetch(`http://localhost${pathAndQuery}`, {
    method: init.method ?? "GET",
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body,
  }), 120000, pathAndQuery);
  const text = await withTimeout(res.text(), 120000, `${pathAndQuery} (tělo)`);
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw new Error(`${pathAndQuery} nevrátil JSON (${res.status}): ${text.slice(0, 300)} [${e.message}]`);
  }
  if (!res.ok) throw new Error(`${pathAndQuery} → ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Kolik dávek fronty zápasů Miniflare od dané pozice v logu odbavil (každá = jedna zpráva). */
const queueLogState = new Map();
function queueBatchesSince(logFile, fromByte) {
  const size = fs.statSync(logFile).size;
  const key = `${logFile}:${fromByte}`;
  const prev = queueLogState.get(key);
  const fd = fs.openSync(logFile, "r");
  const buf = Buffer.alloc(Math.max(0, size - fromByte));
  fs.readSync(fd, buf, 0, buf.length, fromByte);
  fs.closeSync(fd);
  const batches = (buf.toString("utf8").match(/QUEUE harness-match-rounds \d+\/\d+/g) ?? []).length;
  const lastGrowthAt = !prev || prev.size !== size ? Date.now() : prev.lastGrowthAt;
  queueLogState.set(key, { size, lastGrowthAt });
  return { batches, lastGrowthAt };
}

// ───────────────────────────── jeden průchod sezónou ─────────────────────────────

async function runPass({ passIndex, label, opts, build, mfModule }) {
  const passDir = path.join(opts.work, `${label}-pass${passIndex}`);
  fs.rmSync(passDir, { recursive: true, force: true });
  fs.mkdirSync(passDir, { recursive: true });
  const stateDir = path.join(passDir, "state");
  const logFile = path.join(passDir, "worker.log");
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  const flushLog = () => new Promise((r) => logStream.write("", r));

  const dbFile = await createLocalDb(mfModule, { bundle: build.bundle, stateDir, logStream, prodFile: opts.prod, mode: opts.mode });
  const prep = prepareDb(dbFile, opts.extraSql ? path.resolve(opts.extraSql) : null);
  let timeline = prep.timeline;
  if (opts.maxDates) timeline = timeline.slice(0, Number(opts.maxDates));
  log(`průchod ${passIndex}: ${timeline.length} herních dnů, ${timeline.reduce((s, t) => s + t.rounds.length, 0)} kol, DB ${dbFile}`);

  const passStart = Date.now();
  const ticks = [];
  const restarts = [];
  let failure = null;
  let mf = null;
  let worker = null;
  const startRuntime = async () => {
    mf = await createMiniflare(mfModule, { bundle: build.bundle, stateDir, logStream, mode: opts.mode });
    worker = await mf.getWorker();
    const kv = await mfJson(mf, "/__harness/kv", { method: "POST", body: JSON.stringify({ ai_provider: "off", match_tick_mode: opts.mode }) });
    if (kv.kv.ai_provider !== "off") throw new Error(`ai_provider se nenastavil: ${JSON.stringify(kv)}`);
    return kv.kv;
  };
  const triggerCron = async (cron, day) => {
    const hour = cron === "20 16 * * *" ? "16:20" : "16:00";
    const r = await withTimeout(worker.scheduled({ cron, scheduledTime: new Date(`${day}T${hour}:00.000Z`) }), 300000, `cron ${cron}`);
    if (r.outcome !== "ok") throw new Error(`cron ${cron} skončil s výsledkem ${r.outcome}`);
  };
  const stallMs = Number(opts.stallS) * 1000;

  /**
   * Čeká, až fronta odbaví zprávy jednoho spuštění cronu. Konec se pozná z logu Miniflare
   * (každá odbavená dávka) a ověří v DB. Vrací "done", nebo "stalled", když log `stallMs`
   * nehnul a hotovo není — Miniflare (pod tlakem paměti na tomhle stroji) občas přestane
   * doručovat zprávy fronty, i když worker na HTTP dál odpovídá.
   */
  const waitForTick = async (day, logOffset, before, expectedRuns, tickStart) => {
    let st = before;
    for (;;) {
      const q = queueBatchesSince(logFile, logOffset);
      const quietMs = Date.now() - q.lastGrowthAt;
      if (q.batches >= expectedRuns && quietMs > 1000) {
        st = await mfJson(mf, `/__harness/status?day=${day}`);
        const allDone = st.rounds.length > 0 && st.rounds.every((r) => r.status === "simulated");
        const queueDone = st.queueRuns - before.queueRuns >= expectedRuns;
        if (allDone && queueDone && st.locked === 0) return { status: "done", st };
      }
      if (quietMs > stallMs) return { status: "stalled", st, batches: q.batches };
      if (Date.now() - tickStart > Number(opts.tickTimeoutS) * 1000) {
        throw new Error(`den ${day}: kolo nedoběhlo do ${opts.tickTimeoutS} s (dávek ${q.batches}/${expectedRuns}, stav ${JSON.stringify(st.rounds.map((r) => r.status))}, zamčeno ${st.locked})`);
      }
      await sleep(250);
    }
  };

  try {
    const kv = await startRuntime();
    log(`worker běží (bundle ${build.hash}), KV: ${JSON.stringify(kv)}`);
    const expectedRuns = opts.mode === "queue" ? prep.expectedQueueRuns : 0;

    let prevDay = null;
    for (const t of timeline) {
      const restDays = prevDay === null ? Number(opts.warmupDays) : daysBetween(prevDay, t.day);
      const adv = await mfJson(mf, "/__harness/advance", { method: "POST", body: JSON.stringify({ gameDate: `${t.day}T16:00:00.000Z`, restDays }) });
      const firstBefore = await mfJson(mf, `/__harness/status?day=${t.day}`);
      const tickStart = Date.now();
      let attempt = 0;
      for (;;) {
        const before = attempt === 0 ? firstBefore : await mfJson(mf, `/__harness/status?day=${t.day}`);
        await flushLog();
        const logOffset = fs.statSync(logFile).size;
        // Přesně to, co dělá Cloudflare v 16:00 UTC: scheduled handler s cronem "0 16 * * *".
        await triggerCron("0 16 * * *", t.day);
        const res = await waitForTick(t.day, logOffset, before, expectedRuns, tickStart);
        if (res.status === "done") break;

        // Zaseknutá fronta: stejně jako na produkci (fronta doručuje „aspoň jednou“, kola se
        // zamykají atomicky) se worker restartuje a cron pustí znovu. Odehraná kola vrátí
        // „no-round“, zbylá se dohrají. Kolo zamčené uprostřed simulace dohraje recovery
        // cron 20 16 — zámek se jen zestárne o hodinu, ať na něj recovery smí sáhnout.
        attempt++;
        restarts.push({ day: t.day, attempt, batches: res.batches, rounds: res.st.rounds.map((r) => r.status), locked: res.st.locked });
        log(`  ${t.day}: fronta stojí ${opts.stallS} s (dávek ${res.batches}/${expectedRuns}), restart workeru #${attempt}`);
        if (attempt > 3) throw new Error(`den ${t.day}: fronta se zasekla ${attempt}× za sebou`);
        await mf.dispose();
        await startRuntime();
        const st = await mfJson(mf, `/__harness/status?day=${t.day}`);
        if (st.locked > 0) {
          const aged = await mfJson(mf, "/__harness/age-locks", { method: "POST", body: "{}" });
          log(`  ${t.day}: ${aged.aged} zamčených kol → recovery cron 20 16`);
          await triggerCron("20 16 * * *", t.day);
        }
      }
      const runs = await mfJson(mf, `/__harness/queue-runs?offset=${firstBefore.queueRuns}`);
      const tick = { day: t.day, rounds: t.rounds, restDays, healed: adv.healed, wallMs: Date.now() - tickStart, restarts: attempt, queueRuns: runs.runs };
      ticks.push(tick);
      const roundRuns = runs.runs.filter((r) => r.kind === "league_round" && r.status === "done");
      const errs = runs.runs.filter((r) => r.status === "error").length;
      log(`  ${t.day} [${t.rounds.join(", ")}] ${(tick.wallMs / 1000).toFixed(1)} s, kola: ${roundRuns.map((r) => `${(r.duration_ms / 1000).toFixed(1)}s/${r.queries}q`).join(" ")}${errs ? `, CHYB ve frontě: ${errs}` : ""}${attempt ? `, restartů ${attempt}` : ""}`);
      prevDay = t.day;
    }
  } catch (e) {
    failure = e.message;
    log(`PRŮCHOD ${passIndex} SELHAL: ${e.message}`);
  } finally {
    if (mf) await mf.dispose();
    await new Promise((r) => logStream.end(r));
  }
  const wallMs = Date.now() - passStart;

  const extracted = extractFromDb(dbFile, passIndex);
  const logs = parseWorkerLog(logFile);
  if (!opts.keepDb) fs.rmSync(stateDir, { recursive: true, force: true });
  return {
    passIndex, wallMs, failure, ticks, restarts, logs, logFile,
    dbFile: opts.keepDb ? dbFile : null,
    matches: extracted.matches,
    unplayed: extracted.unplayed,
    teams: extracted.teams,
  };
}

// ───────────────────────────── extrakce a statistika ─────────────────────────────

function parseJson(s, fallback) {
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch (e) {
    console.warn(`nečitelný JSON (${e.message}): ${String(s).slice(0, 80)}`);
    return fallback;
  }
}

/** Hráč z události → záznam v uložené sestavě. Engine ID = offset + pořadí (doma 1.., hosté 101..). */
function lineupEntry(lineupData, engineId, side, name) {
  const all = [...(lineupData?.starters ?? []).map((p) => ({ ...p, starter: true })), ...(lineupData?.subs ?? []).map((p) => ({ ...p, starter: false }))];
  const idx = side === 1 ? engineId - 1 : engineId - 101;
  const byId = all[idx];
  if (byId && byId.name === name) return { entry: byId, how: "id" };
  const byName = all.filter((p) => p.name === name);
  if (byName.length === 1) return { entry: byName[0], how: "name" };
  return { entry: null, how: "missing" };
}

function extractFromDb(dbFile, passIndex) {
  const db = new DatabaseSync(dbFile);
  const rows = db.prepare(`
    SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.status, m.events,
           m.possession_home, m.home_lineup_data, m.away_lineup_data, m.weather, m.attendance,
           sc.game_week, substr(sc.scheduled_at, 1, 10) AS day, l.name AS league, l.league_type AS league_type,
           th.name AS home_name, ta.name AS away_name
      FROM matches m
      JOIN season_calendar sc ON sc.id = m.calendar_id
      JOIN leagues l ON l.id = sc.league_id
      JOIN teams th ON th.id = m.home_team_id
      JOIN teams ta ON ta.id = m.away_team_id
     WHERE sc.season_number = (SELECT MAX(s2.season_number) FROM season_calendar s2 WHERE s2.league_id = sc.league_id)
     ORDER BY sc.scheduled_at, l.name, m.id`).all();
  const teams = {};
  const matches = [];
  let unplayed = 0;
  for (const r of rows) {
    teams[r.home_team_id] = r.home_name;
    teams[r.away_team_id] = r.away_name;
    if (r.status !== "simulated") { unplayed++; continue; }
    const events = parseJson(r.events, []);
    const hl = parseJson(r.home_lineup_data, null);
    const al = parseJson(r.away_lineup_data, null);
    const goals = [];
    const cards = { hy: 0, hr: 0, ay: 0, ar: 0 };
    const inj = { h: 0, a: 0 };
    let unresolved = 0;
    for (const e of events) {
      const side = e.teamId === 1 ? 1 : 2;
      if (e.type === "goal") {
        const { entry, how } = lineupEntry(side === 1 ? hl : al, e.playerId, side, e.playerName);
        if (!entry) unresolved++;
        goals.push({
          m: e.minute,
          s: side,
          src: e.source ?? "unknown",
          // post na hřišti: základ = slot ze sestavy, střídající hráč = jeho přirozený post
          pos: entry ? (entry.starter ? entry.position : entry.naturalPosition) ?? "unknown" : "unknown",
          npos: entry?.naturalPosition ?? "unknown",
          how,
        });
      } else if (e.type === "card") {
        const red = e.detail === "red";
        if (side === 1) red ? cards.hr++ : cards.hy++;
        else red ? cards.ar++ : cards.ay++;
      } else if (e.type === "injury") {
        side === 1 ? inj.h++ : inj.a++;
      }
    }
    matches.push({
      pass: passIndex,
      league: r.league,
      type: r.league_type,
      gw: r.game_week,
      day: r.day,
      h: r.home_team_id,
      a: r.away_team_id,
      hs: r.home_score,
      as: r.away_score,
      poss: r.possession_home,
      weather: r.weather,
      goals,
      cards,
      inj,
      unresolved,
    });
  }
  db.close();
  return { matches, unplayed, teams };
}

const round = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function computeStats(matches, teamNames) {
  const n = matches.length;
  if (n === 0) return { matches: 0 };
  const totals = matches.map((m) => m.hs + m.as);
  const dist = {};
  for (let g = 0; g <= 9; g++) dist[String(g)] = 0;
  dist["10+"] = 0;
  for (const t of totals) dist[t >= 10 ? "10+" : String(t)]++;
  const home = matches.filter((m) => m.hs > m.as).length;
  const draw = matches.filter((m) => m.hs === m.as).length;
  const away = n - home - draw;

  const allGoals = matches.flatMap((m) => m.goals);
  const countBy = (arr, key) => {
    const out = {};
    for (const x of arr) out[x[key]] = (out[x[key]] ?? 0) + 1;
    const total = arr.length || 1;
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { n: v, pct: round((100 * v) / total, 1) }]));
  };

  const yellow = matches.map((m) => m.cards.hy + m.cards.ay);
  const red = matches.map((m) => m.cards.hr + m.cards.ar);
  const injuries = matches.map((m) => m.inj.h + m.inj.a);
  const poss = matches.map((m) => m.poss).filter((p) => typeof p === "number");
  const name = (id) => teamNames?.[id] ?? id;
  const describe = (m) => ({
    score: `${m.hs}:${m.as}`, home: name(m.h), away: name(m.a), league: m.league, round: m.gw, day: m.day, pass: m.pass,
  });
  const byTotal = [...matches].sort((a, b) => (b.hs + b.as) - (a.hs + a.as) || Math.abs(b.hs - b.as) - Math.abs(a.hs - a.as)).slice(0, 5).map(describe);
  const byMargin = [...matches].sort((a, b) => Math.abs(b.hs - b.as) - Math.abs(a.hs - a.as) || (b.hs + b.as) - (a.hs + a.as)).slice(0, 5).map(describe);

  return {
    matches: n,
    goalsPerMatch: round(mean(totals)),
    goalsPerMatchSd: round(sd(totals)),
    homeGoalsPerMatch: round(mean(matches.map((m) => m.hs))),
    awayGoalsPerMatch: round(mean(matches.map((m) => m.as))),
    goalsDistribution: dist,
    share8plusPct: round((100 * totals.filter((t) => t >= 8).length) / n, 1),
    share0goalsPct: round((100 * totals.filter((t) => t === 0).length) / n, 1),
    biggestByTotal: byTotal,
    biggestByMargin: byMargin,
    homeWinPct: round((100 * home) / n, 1),
    drawPct: round((100 * draw) / n, 1),
    awayWinPct: round((100 * away) / n, 1),
    goals: allGoals.length,
    goalsByPosition: countBy(allGoals, "pos"),
    goalsByNaturalPosition: countBy(allGoals, "npos"),
    goalsBySource: countBy(allGoals, "src"),
    goalScorerUnresolved: allGoals.filter((g) => g.how === "missing").length,
    yellowPerMatch: round(mean(yellow)),
    redPerMatch: round(mean(red), 3),
    matchesWithRedPct: round((100 * red.filter((r) => r > 0).length) / n, 1),
    injuriesPerMatch: round(mean(injuries), 3),
    possession: poss.length ? {
      meanHome: round(mean(poss), 1),
      sd: round(sd(poss), 1),
      meanAbsDevFrom50: round(mean(poss.map((p) => Math.abs(p - 50))), 1),
      min: Math.min(...poss),
      max: Math.max(...poss),
      share65plusPct: round((100 * poss.filter((p) => p >= 65 || p <= 35).length) / poss.length, 1),
    } : null,
  };
}

function leagueTables(matches, teamNames, passes) {
  const out = {};
  const leagues = [...new Set(matches.map((m) => m.league))];
  for (const lg of leagues) {
    const lm = matches.filter((m) => m.league === lg);
    const rows = {};
    const ensure = (id) => (rows[id] ??= { team: teamNames?.[id] ?? id, teamId: id, perPass: {} });
    for (const m of lm) {
      for (const [id, gf, ga] of [[m.h, m.hs, m.as], [m.a, m.as, m.hs]]) {
        const r = ensure(id);
        const p = (r.perPass[m.pass] ??= { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
        p.p++; p.gf += gf; p.ga += ga;
        if (gf > ga) { p.w++; p.pts += 3; } else if (gf === ga) { p.d++; p.pts += 1; } else p.l++;
      }
    }
    const list = Object.values(rows).map((r) => {
      const ps = Object.values(r.perPass);
      const k = passes || ps.length || 1;
      const sum = (key) => ps.reduce((a, p) => a + p[key], 0);
      return {
        team: r.team,
        teamId: r.teamId,
        played: round(sum("p") / k, 1),
        w: round(sum("w") / k, 1), d: round(sum("d") / k, 1), l: round(sum("l") / k, 1),
        gf: round(sum("gf") / k, 1), ga: round(sum("ga") / k, 1),
        pts: round(sum("pts") / k, 1),
        ptsByPass: Object.keys(r.perPass).sort().map((k2) => r.perPass[k2].pts),
      };
    }).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    out[lg] = list;
  }
  return out;
}

function buildStatsBlock(matches, teamNames, passes) {
  const leagues = {};
  for (const lg of [...new Set(matches.map((m) => m.league))].sort()) {
    leagues[lg] = computeStats(matches.filter((m) => m.league === lg), teamNames);
  }
  return {
    totals: computeStats(matches, teamNames),
    groups: {
      senior: computeStats(matches.filter((m) => m.type !== "u21"), teamNames),
      u21: computeStats(matches.filter((m) => m.type === "u21"), teamNames),
    },
    leagues,
    tables: leagueTables(matches, teamNames, passes),
  };
}

// ───────────────────────────── log workeru ─────────────────────────────

function parseWorkerLog(file) {
  const res = { lines: 0, errors: 0, warns: 0, blockedFetches: 0, otherProblemLines: 0, errorKinds: {}, warnKinds: {}, otherExamples: [], blockedExamples: [] };
  if (!fs.existsSync(file)) return res;
  const text = fs.readFileSync(file, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    res.lines++;
    const jsonStart = line.indexOf("{\"");
    let entry = null;
    if (jsonStart >= 0) {
      try {
        entry = JSON.parse(line.slice(jsonStart));
      } catch (e) {
        entry = null;
        if (/"level":"(error|warn)"/.test(line)) res.otherExamples.length < 15 && res.otherExamples.push(`[nečitelný JSON: ${e.message}] ${line.slice(0, 300)}`);
      }
    }
    if (entry && entry.level) {
      const msg = String(entry.msg ?? "");
      if (msg.startsWith("HARNESS_BLOCKED_FETCH")) {
        res.blockedFetches++;
        if (res.blockedExamples.length < 10) res.blockedExamples.push(msg);
        continue;
      }
      const key = `${entry.mod ?? "?"}: ${msg.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>").replace(/\d+/g, "N").slice(0, 140)}`;
      const bucket = entry.level === "error" ? res.errorKinds : entry.level === "warn" ? res.warnKinds : null;
      if (!bucket) continue;
      if (entry.level === "error") res.errors++; else res.warns++;
      const b = (bucket[key] ??= { count: 0, example: `${msg.slice(0, 200)}${entry.err ? ` | err: ${String(entry.err).slice(0, 200)}` : ""}` });
      b.count++;
    } else if (/(✘|\[ERROR\]|uncaught|exception|error:|failed|internal error)/i.test(line) && !/HARNESS_BLOCKED_FETCH/.test(line)) {
      res.otherProblemLines++;
      if (res.otherExamples.length < 15) res.otherExamples.push(line.slice(0, 300));
    }
  }
  const sortKinds = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].count - a[1].count));
  res.errorKinds = sortKinds(res.errorKinds);
  res.warnKinds = sortKinds(res.warnKinds);
  return res;
}

function mergeLogs(list) {
  const out = { errors: 0, warns: 0, blockedFetches: 0, otherProblemLines: 0, errorKinds: {}, warnKinds: {}, otherExamples: [], blockedExamples: [] };
  for (const l of list) {
    out.errors += l.errors; out.warns += l.warns; out.blockedFetches += l.blockedFetches; out.otherProblemLines += l.otherProblemLines;
    for (const [kind, target] of [["errorKinds", out.errorKinds], ["warnKinds", out.warnKinds]]) {
      for (const [k, v] of Object.entries(l[kind])) {
        target[k] ??= { count: 0, example: v.example };
        target[k].count += v.count;
      }
    }
    out.otherExamples.push(...l.otherExamples.slice(0, 15 - out.otherExamples.length));
    out.blockedExamples.push(...l.blockedExamples.slice(0, 10 - out.blockedExamples.length));
  }
  const sortKinds = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].count - a[1].count));
  out.errorKinds = sortKinds(out.errorKinds);
  out.warnKinds = sortKinds(out.warnKinds);
  return out;
}

// ───────────────────────────── výpisy ─────────────────────────────

function fmtPct(o) {
  return Object.entries(o ?? {}).map(([k, v]) => `${k} ${v.pct} %`).join(", ");
}

function printSummary(result) {
  const t = result.stats.totals;
  console.log(`\n══ Souhrn: ${result.meta.label} (${result.meta.code ?? result.meta.db}) ══`);
  if (result.meta.wallMsTotal != null) console.log(`průchodů: ${result.meta.runs}, čas celkem ${(result.meta.wallMsTotal / 60000).toFixed(1)} min, neodehráno: ${result.meta.unplayedTotal}`);
  else console.log(`neodehráno (v DB naplánováno, ale bez výsledku): ${result.meta.unplayedTotal}`);
  const line = (label, s) => {
    if (!s?.matches) { console.log(`${label.padEnd(44)} —`); return; }
    console.log(`${label.padEnd(44)} ${String(s.matches).padStart(5)} z | gólů ${s.goalsPerMatch} (±${s.goalsPerMatchSd}) | 8+ ${s.share8plusPct} % | D/R/H ${s.homeWinPct}/${s.drawPct}/${s.awayWinPct} | ŽK ${s.yellowPerMatch} ČK ${s.redPerMatch} | zran. ${s.injuriesPerMatch} | drž. ±${s.possession?.meanAbsDevFrom50}`);
  };
  line("CELKEM", t);
  line("dospělí", result.stats.groups.senior);
  line("U21", result.stats.groups.u21);
  for (const [lg, s] of Object.entries(result.stats.leagues)) line(`  ${lg}`, s);
  console.log(`\nrozložení gólů v zápase: ${Object.entries(t.goalsDistribution).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  console.log(`góly podle postu (na hřišti): ${fmtPct(t.goalsByPosition)}`);
  console.log(`góly podle přirozeného postu: ${fmtPct(t.goalsByNaturalPosition)}`);
  console.log(`góly podle typu: ${fmtPct(t.goalsBySource)}`);
  console.log(`držení míče domácích: průměr ${t.possession?.meanHome}, sd ${t.possession?.sd}, rozsah ${t.possession?.min}–${t.possession?.max}, mimo 35–65: ${t.possession?.share65plusPct} %`);
  console.log(`nejvíc gólů: ${t.biggestByTotal.map((b) => `${b.home} ${b.score} ${b.away} (${b.league} ${b.round}. k.)`).join("; ")}`);
  console.log(`nejvyšší rozdíl: ${t.biggestByMargin.map((b) => `${b.home} ${b.score} ${b.away}`).join("; ")}`);
  if (result.logs) {
    console.log(`\nlog workeru: chyb ${result.logs.errors}, varování ${result.logs.warns}, zablokovaných fetchů ${result.logs.blockedFetches}, jiných problémových řádků ${result.logs.otherProblemLines}`);
    for (const [k, v] of Object.entries(result.logs.errorKinds).slice(0, 8)) console.log(`  ERR ${v.count}× ${k}\n        např.: ${v.example}`);
    for (const [k, v] of Object.entries(result.logs.warnKinds).slice(0, 8)) console.log(`  WARN ${v.count}× ${k}`);
  }
  if (result.timing) {
    console.log(`\nčas: průměr na herní den ${(result.timing.meanTickMs / 1000).toFixed(1)} s, na kolo jedné ligy (konzumer) ${(result.timing.meanRoundMs / 1000).toFixed(1)} s / ${result.timing.meanRoundQueries} dotazů, průchod sezónou ${(result.timing.meanPassMs / 60000).toFixed(1)} min`);
  }
  if (result.restarts?.length) console.log(`restarty workeru kvůli zaseknuté frontě: ${result.restarts.length} (${result.restarts.map((r) => `p${r.pass} ${r.day}`).join(", ")})`);
  for (const f of result.failures ?? []) console.log(`!! průchod ${f.pass}: ${f.failure}`);
}

function cmpRow(label, a, b, digits = 2, unit = "") {
  const fa = a == null ? "—" : String(a);
  const fb = b == null ? "—" : String(b);
  const d = typeof a === "number" && typeof b === "number" ? round(b - a, digits) : null;
  const ds = d == null ? "" : `${d > 0 ? "+" : ""}${d}${unit}`;
  return `  ${label.padEnd(30)} ${fa.padStart(10)} ${fb.padStart(10)} ${ds.padStart(10)}`;
}

function printCompare(oldR, newR) {
  console.log(`\n══ Srovnání: STARÝ = ${oldR.meta.label} (${oldR.meta.gitHead ?? oldR.meta.db ?? "?"}), NOVÝ = ${newR.meta.label} (${newR.meta.gitHead ?? newR.meta.db ?? "?"}) ══`);
  const blocks = [["CELKEM", oldR.stats.totals, newR.stats.totals], ["dospělí", oldR.stats.groups.senior, newR.stats.groups.senior], ["U21", oldR.stats.groups.u21, newR.stats.groups.u21]];
  for (const lg of [...new Set([...Object.keys(oldR.stats.leagues), ...Object.keys(newR.stats.leagues)])].sort()) {
    blocks.push([lg, oldR.stats.leagues[lg], newR.stats.leagues[lg]]);
  }
  for (const [label, a, b] of blocks) {
    console.log(`\n── ${label} ──${"".padEnd(4)}${"STARÝ".padStart(26)} ${"NOVÝ".padStart(10)} ${"Δ".padStart(10)}`);
    if (!a?.matches || !b?.matches) { console.log("  (chybí data)"); continue; }
    console.log(cmpRow("zápasů", a.matches, b.matches, 0));
    console.log(cmpRow("gólů na zápas", a.goalsPerMatch, b.goalsPerMatch));
    console.log(cmpRow("  sd", a.goalsPerMatchSd, b.goalsPerMatchSd));
    console.log(cmpRow("  domácí / hosté", `${a.homeGoalsPerMatch}/${a.awayGoalsPerMatch}`, `${b.homeGoalsPerMatch}/${b.awayGoalsPerMatch}`));
    console.log(cmpRow("zápasy s 8+ góly %", a.share8plusPct, b.share8plusPct, 1));
    console.log(cmpRow("zápasy 0:0 %", a.share0goalsPct, b.share0goalsPct, 1));
    console.log(cmpRow("výhra domácích %", a.homeWinPct, b.homeWinPct, 1));
    console.log(cmpRow("remíza %", a.drawPct, b.drawPct, 1));
    console.log(cmpRow("výhra hostů %", a.awayWinPct, b.awayWinPct, 1));
    console.log(cmpRow("žluté na zápas", a.yellowPerMatch, b.yellowPerMatch));
    console.log(cmpRow("červené na zápas", a.redPerMatch, b.redPerMatch, 3));
    console.log(cmpRow("zranění na zápas", a.injuriesPerMatch, b.injuriesPerMatch, 3));
    console.log(cmpRow("držení: odchylka od 50", a.possession?.meanAbsDevFrom50, b.possession?.meanAbsDevFrom50, 1));
    console.log(cmpRow("držení: sd", a.possession?.sd, b.possession?.sd, 1));
    console.log(cmpRow("držení mimo 35–65 %", a.possession?.share65plusPct, b.possession?.share65plusPct, 1));
    for (const [title, key] of [["post střelce", "goalsByPosition"], ["typ gólu", "goalsBySource"]]) {
      const keys = [...new Set([...Object.keys(a[key] ?? {}), ...Object.keys(b[key] ?? {})])];
      for (const k of keys) console.log(cmpRow(`${title}: ${k} %`, a[key]?.[k]?.pct ?? 0, b[key]?.[k]?.pct ?? 0, 1));
    }
    if (label === "CELKEM") {
      const keys = Object.keys(a.goalsDistribution);
      console.log(`  rozložení gólů STARÝ: ${keys.map((k) => `${k}:${a.goalsDistribution[k]}`).join(" ")}`);
      console.log(`  rozložení gólů NOVÝ:  ${keys.map((k) => `${k}:${b.goalsDistribution[k]}`).join(" ")}`);
      console.log(`  nejvyšší výsledky STARÝ: ${a.biggestByTotal.map((x) => x.score).join(", ")}`);
      console.log(`  nejvyšší výsledky NOVÝ:  ${b.biggestByTotal.map((x) => x.score).join(", ")}`);
    }
  }

  console.log("\n── Tabulky (průměr bodů na průchod) ──");
  for (const lg of Object.keys(oldR.stats.tables).sort()) {
    const ta = oldR.stats.tables[lg] ?? [];
    const tb = newR.stats.tables[lg] ?? [];
    console.log(`\n${lg}`);
    console.log(`  ${"tým".padEnd(32)} ${"STARÝ b.".padStart(9)} ${"skóre".padStart(12)} ${"NOVÝ b.".padStart(9)} ${"skóre".padStart(12)} ${"Δ b.".padStart(7)}  pořadí S→N`);
    const rankB = new Map(tb.map((r, i) => [r.teamId, i + 1]));
    ta.forEach((r, i) => {
      const nb = tb.find((x) => x.teamId === r.teamId);
      const d = nb ? round(nb.pts - r.pts, 1) : null;
      console.log(`  ${r.team.slice(0, 32).padEnd(32)} ${String(r.pts).padStart(9)} ${`${r.gf}:${r.ga}`.padStart(12)} ${String(nb?.pts ?? "—").padStart(9)} ${nb ? `${nb.gf}:${nb.ga}`.padStart(12) : "—".padStart(12)} ${d == null ? "" : `${d > 0 ? "+" : ""}${d}`.padStart(7)}  ${i + 1}→${rankB.get(r.teamId) ?? "—"}`);
    });
  }

  console.log("\n── Provoz ──");
  console.log(cmpRow("chyb v logu", oldR.logs?.errors, newR.logs?.errors, 0));
  console.log(cmpRow("varování v logu", oldR.logs?.warns, newR.logs?.warns, 0));
  console.log(cmpRow("zablokované fetche", oldR.logs?.blockedFetches, newR.logs?.blockedFetches, 0));
  console.log(cmpRow("restarty (zaseklá fronta)", oldR.restarts?.length ?? 0, newR.restarts?.length ?? 0, 0));
  console.log(cmpRow("neodehrané zápasy", oldR.meta.unplayedTotal, newR.meta.unplayedTotal, 0));
  console.log(cmpRow("s / herní den", round((oldR.timing?.meanTickMs ?? NaN) / 1000, 1), round((newR.timing?.meanTickMs ?? NaN) / 1000, 1), 1));
  console.log(cmpRow("s / kolo ligy", round((oldR.timing?.meanRoundMs ?? NaN) / 1000, 1), round((newR.timing?.meanRoundMs ?? NaN) / 1000, 1), 1));
  const newErrKinds = Object.keys(newR.logs?.errorKinds ?? {}).filter((k) => !(k in (oldR.logs?.errorKinds ?? {})));
  if (newErrKinds.length) {
    console.log("  NOVÉ druhy chyb, které starý běh neměl:");
    for (const k of newErrKinds) console.log(`    ${newR.logs.errorKinds[k].count}× ${k}\n        např.: ${newR.logs.errorKinds[k].example}`);
  }
}

// ───────────────────────────── příkazy ─────────────────────────────

async function cmdRun(opts) {
  if (!opts.code) throw new Error("chybí --code <cesta k worktree>");
  const codeRoot = path.resolve(opts.code);
  const label = opts.label ?? path.basename(codeRoot);
  const o = { ...DEFAULTS, ...opts };
  o.runs = Number(o.runs);
  if (!fs.existsSync(o.prod)) throw new Error(`kopie produkce ${o.prod} neexistuje`);
  fs.mkdirSync(o.work, { recursive: true });
  const out = o.out ?? path.join(o.outDir, `results-${label}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
  const git = gitInfo(codeRoot);
  log(`kód ${codeRoot} @ ${git.head}${git.dirtyFiles.length ? ` (+${git.dirtyFiles.length} neuložených změn v src)` : ""}, průchodů ${o.runs}, režim ${o.mode}`);

  const startedAt = nowIso();
  // Bundle se sestaví JEDNOU na začátku — všechny průchody běží na stejném snímku kódu,
  // i kdyby se mezitím ve worktree dál editovalo.
  const build = buildBundle(path.join(o.work, `${label}-build`), codeRoot);
  log(`bundle sestaven: ${build.bundle} (sha256 ${build.hash})`);
  const mfModule = await loadMiniflare();
  const passes = [];
  for (let p = 1; p <= o.runs; p++) {
    passes.push(await runPass({ passIndex: p, label, opts: o, build, mfModule }));
  }
  const teamNames = Object.assign({}, ...passes.map((p) => p.teams));
  const matches = passes.flatMap((p) => p.matches);
  const allTicks = passes.flatMap((p) => p.ticks);
  const roundRuns = allTicks.flatMap((t) => t.queueRuns.filter((r) => r.kind === "league_round" && r.status === "done"));
  const result = {
    meta: {
      label, code: codeRoot, gitHead: git.head, gitDirtyFiles: git.dirtyFiles, bundleHash: build.hash, runs: o.runs, mode: o.mode,
      between: "recover", warmupDays: Number(o.warmupDays), prod: o.prod, startedAt, finishedAt: nowIso(),
      extraSql: o.extraSql ? { file: path.resolve(o.extraSql), sql: fs.readFileSync(path.resolve(o.extraSql), "utf8") } : null,
      wallMsTotal: passes.reduce((a, p) => a + p.wallMs, 0),
      unplayedTotal: passes.reduce((a, p) => a + p.unplayed, 0),
    },
    failures: passes.filter((p) => p.failure).map((p) => ({ pass: p.passIndex, failure: p.failure, logFile: p.logFile })),
    restarts: passes.flatMap((p) => p.restarts.map((r) => ({ pass: p.passIndex, ...r }))),
    timing: {
      meanPassMs: round(mean(passes.map((p) => p.wallMs)), 0),
      meanTickMs: round(mean(allTicks.map((t) => t.wallMs)), 0),
      meanRoundMs: round(mean(roundRuns.map((r) => r.duration_ms)), 0),
      meanRoundQueries: round(mean(roundRuns.map((r) => r.queries)), 0),
      passes: passes.map((p) => ({ pass: p.passIndex, wallMs: p.wallMs, logFile: p.logFile, dbFile: p.dbFile, ticks: p.ticks })),
    },
    logs: mergeLogs(passes.map((p) => p.logs)),
    stats: buildStatsBlock(matches, teamNames, o.runs),
    teamNames,
    matches,
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  printSummary(result);
  console.log(`\nvýsledek: ${out}`);
  if (result.failures.length) process.exitCode = 2;
}

function cmdStats(opts) {
  if (!opts.db) throw new Error("chybí --db <soubor.sqlite>");
  const label = opts.label ?? path.basename(opts.db);
  // Node 22.9 volbu readOnly ignoruje — zdrojová DB (třeba kopie produkce) se proto
  // nikdy neotvírá přímo, čte se z dočasné kopie.
  fs.mkdirSync(DEFAULTS.outDir, { recursive: true });
  const tmp = path.join(DEFAULTS.outDir, `.stats-tmp-${process.pid}.sqlite`);
  fs.copyFileSync(path.resolve(opts.db), tmp);
  let ex;
  try {
    ex = extractFromDb(tmp, 1);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const result = {
    meta: { label, db: path.resolve(opts.db), runs: 1, unplayedTotal: ex.unplayed },
    stats: buildStatsBlock(ex.matches, ex.teams, 1),
    teamNames: ex.teams,
    matches: ex.matches,
  };
  const out = opts.out ?? path.join(DEFAULTS.outDir, `stats-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  printSummary(result);
  console.log(`\nvýsledek: ${out}`);
}

/**
 * Sloučí víc výsledků téhož kódu (např. 3 + 5 průchodů) do jednoho a přepočítá statistiku.
 * Kontroluje, že všechny vstupy běžely na stejném bundlu — jinak by se míchaly dvě verze enginu.
 */
function cmdMerge(positional, opts) {
  const [out, ...inputs] = positional;
  if (!out || inputs.length < 2) throw new Error("použití: merge <výstup.json> <vstup1.json> <vstup2.json> ...");
  const results = inputs.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const hashes = [...new Set(results.map((r) => r.meta.bundleHash ?? r.meta.db))];
  if (hashes.length > 1 && !opts.force) throw new Error(`vstupy běžely na různém kódu (${hashes.join(", ")}); --force sloučí i tak`);
  let offset = 0;
  const matches = [];
  const passesTiming = [];
  const restarts = [];
  const failures = [];
  for (const r of results) {
    const runs = r.meta.runs ?? 1;
    for (const m of r.matches) matches.push({ ...m, pass: m.pass + offset });
    for (const p of r.timing?.passes ?? []) passesTiming.push({ ...p, pass: p.pass + offset });
    for (const x of r.restarts ?? []) restarts.push({ ...x, pass: x.pass + offset });
    for (const x of r.failures ?? []) failures.push({ ...x, pass: x.pass + offset });
    offset += runs;
  }
  const teamNames = Object.assign({}, ...results.map((r) => r.teamNames));
  const allTicks = passesTiming.flatMap((p) => p.ticks ?? []);
  const roundRuns = allTicks.flatMap((t) => (t.queueRuns ?? []).filter((x) => x.kind === "league_round" && x.status === "done"));
  const merged = {
    meta: {
      ...results[0].meta,
      label: opts.label ?? results[0].meta.label,
      runs: offset,
      mergedFrom: inputs.map((f) => path.resolve(f)),
      wallMsTotal: results.reduce((a, r) => a + (r.meta.wallMsTotal ?? 0), 0),
      unplayedTotal: results.reduce((a, r) => a + (r.meta.unplayedTotal ?? 0), 0),
    },
    failures,
    restarts,
    timing: {
      meanPassMs: round(mean(passesTiming.map((p) => p.wallMs)), 0),
      meanTickMs: round(mean(allTicks.map((t) => t.wallMs)), 0),
      meanRoundMs: round(mean(roundRuns.map((x) => x.duration_ms)), 0),
      meanRoundQueries: round(mean(roundRuns.map((x) => x.queries)), 0),
      passes: passesTiming,
    },
    logs: mergeLogs(results.map((r) => r.logs).filter(Boolean)),
    stats: buildStatsBlock(matches, teamNames, offset),
    teamNames,
    matches,
  };
  fs.writeFileSync(out, JSON.stringify(merged, null, 1));
  printSummary(merged);
  console.log(`\nvýsledek: ${out}`);
}

function cmdCompare(positional, opts) {
  const [a, b] = positional;
  if (!a || !b) throw new Error("použití: compare <stary.json> <novy.json> [--team část-názvu]");
  const oldR = JSON.parse(fs.readFileSync(a, "utf8"));
  const newR = JSON.parse(fs.readFileSync(b, "utf8"));
  if (opts.team) {
    printTeamDetail(oldR, newR, String(opts.team));
    return;
  }
  printCompare(oldR, newR);
}

/** Jeden tým podrobně: body po průchodech, skóre, V/R/P a rozdíl proti druhému běhu. */
function printTeamDetail(oldR, newR, needle) {
  const n = needle.toLowerCase();
  for (const lg of Object.keys(oldR.stats.tables)) {
    for (const r of oldR.stats.tables[lg]) {
      if (!r.team.toLowerCase().includes(n) && r.teamId !== needle) continue;
      const nb = (newR.stats.tables[lg] ?? []).find((x) => x.teamId === r.teamId);
      const rankA = oldR.stats.tables[lg].indexOf(r) + 1;
      const rankB = nb ? newR.stats.tables[lg].indexOf(nb) + 1 : null;
      console.log(`\n${r.team} (${lg})`);
      console.log(`  ${oldR.meta.label.padEnd(14)} body ${r.pts} (po průchodech ${r.ptsByPass.join(", ")}), V/R/P ${r.w}/${r.d}/${r.l}, skóre ${r.gf}:${r.ga}, pořadí ${rankA}.`);
      if (nb) {
        console.log(`  ${newR.meta.label.padEnd(14)} body ${nb.pts} (po průchodech ${nb.ptsByPass.join(", ")}), V/R/P ${nb.w}/${nb.d}/${nb.l}, skóre ${nb.gf}:${nb.ga}, pořadí ${rankB}.`);
        console.log(`  rozdíl: ${round(nb.pts - r.pts, 1)} b., góly ${round(nb.gf - r.gf, 1)} / ${round(nb.ga - r.ga, 1)} na sezónu`);
        // Body a rozdíl skóre na zápas se směrodatnou chybou — ať je vidět, jestli rozdíl
        // není jen šum ze dvou tří průchodů.
        const perMatch = (res) => res.matches.filter((m) => m.h === r.teamId || m.a === r.teamId).map((m) => {
          const gf = m.h === r.teamId ? m.hs : m.as;
          const ga = m.h === r.teamId ? m.as : m.hs;
          return { pts: gf > ga ? 3 : gf === ga ? 1 : 0, gd: gf - ga };
        });
        const pa = perMatch(oldR);
        const pb = perMatch(newR);
        const se = (xs) => (xs.length > 1 ? sd(xs) / Math.sqrt(xs.length) : null);
        const dPts = mean(pb.map((x) => x.pts)) - mean(pa.map((x) => x.pts));
        const sePts = Math.sqrt(se(pa.map((x) => x.pts)) ** 2 + se(pb.map((x) => x.pts)) ** 2);
        const dGd = mean(pb.map((x) => x.gd)) - mean(pa.map((x) => x.gd));
        const seGd = Math.sqrt(se(pa.map((x) => x.gd)) ** 2 + se(pb.map((x) => x.gd)) ** 2);
        console.log(`  na zápas: body ${round(mean(pa.map((x) => x.pts)))} → ${round(mean(pb.map((x) => x.pts)))} (Δ ${round(dPts)} ± ${round(sePts)}, z = ${round(dPts / sePts, 1)}), rozdíl skóre ${round(mean(pa.map((x) => x.gd)))} → ${round(mean(pb.map((x) => x.gd)))} (Δ ${round(dGd)} ± ${round(seGd)}, z = ${round(dGd / seGd, 1)}); zápasů ${pa.length} / ${pb.length}`);
      }
    }
  }
}

const { positional, opts } = parseArgs(process.argv.slice(2));
const cmd = positional.shift();
try {
  if (cmd === "run") await cmdRun(opts);
  else if (cmd === "stats") cmdStats(opts);
  else if (cmd === "compare") cmdCompare(positional, opts);
  else if (cmd === "merge") cmdMerge(positional, opts);
  else {
    console.log("použití: node harness.mjs run --code <worktree> [--runs K] [--out f.json] [--label x]\n         node harness.mjs stats --db <soubor.sqlite> [--out f.json]\n         node harness.mjs compare <stary.json> <novy.json> [--team část-názvu]\n         node harness.mjs merge <výstup.json> <vstup1.json> <vstup2.json> ...");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`CHYBA: ${e.stack ?? e.message}`);
  process.exitCode = 1;
}
