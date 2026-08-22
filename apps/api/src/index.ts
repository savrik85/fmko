import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./routes/auth";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";
import { gameRouter } from "./routes/game";
import { messagingRouter } from "./routes/messaging";
import { groupChatsRouter } from "./routes/group-chats";
import { pushRouter } from "./routes/push";
import { votesRouter } from "./routes/votes";
import { cashLoansRouter } from "./routes/cash-loans";
import { relationsRouter } from "./routes/relations";
import u21Router from "./routes/u21";
import { staffRouter } from "./routes/staff";
import { equipmentMarketRouter } from "./routes/equipment-market";
import { refereesRouter } from "./routes/referees";
import competitionRouter from "./routes/competition";
import bettingRouter from "./routes/betting";
// transfers endpoints are in gameRouter
import { recoverStuckRounds } from "./multiplayer/match-runner";
import { executeDailyTick } from "./season/daily-tick";
import type { MatchQueueMessage, ReportQueueMessage } from "./queue/messages";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
  /**
   * Fronty. Volitelné — bez bindingu (lokální dev, starý deploy) běží zpracování
   * po staré cestě "loop". Viz docs/analyza-fronty-2026-08-16.md.
   */
  MATCH_QUEUE?: Queue<MatchQueueMessage>;
  REPORTS_QUEUE?: Queue<ReportQueueMessage>;
  /** Workers AI — používá se jen když je ai_provider = "workers-ai" (dnes testing). */
  AI?: Ai;
  GEMINI_API_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /**
   * Základ Cloudflare AI Gateway pro Gemini. Když chybí, volá se Google přímo
   * (dosavadní chování). Nastavuje se jako secret, aby v konfiguraci nefiguroval
   * account id.
   */
  AI_GATEWAY_URL?: string;
  SUNO_API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
  API_BASE_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

// AI Gateway se nastavuje jednou na vstupu; bez proměnné se volá Google přímo.
app.use("*", async (c, next) => {
  const { configureAiGateway } = await import("./news/gemini-helper");
  configureAiGateway(c.env.AI_GATEWAY_URL);
  return next();
});

// Global error handler — structured JSON logging, bez expose interních detailů klientovi.
app.onError((err, c) => {
  // Business-level guard z finance-processor: přeložit na 400 s uživatelskou hláškou.
  if (err.message.startsWith("BUDGET_BLOCKED:")) {
    return c.json({ error: err.message.replace(/^BUDGET_BLOCKED:\s*/, "") }, 400);
  }
  const reqId = crypto.randomUUID().slice(0, 8);
  const entry = {
    ts: new Date().toISOString(),
    level: "error",
    mod: "api",
    msg: `${c.req.method} ${c.req.url}`,
    err: err.message,
    stack: err.stack?.split("\n").slice(0, 4).join(" | "),
    reqId,
  };
  console.error(JSON.stringify(entry));
  // Vracíme pouze reqId pro debugging, nikoli raw err.message (může obsahovat SQL detaily).
  return c.json({ error: "Interní chyba serveru", reqId }, 500);
});

app.get("/", (c) => c.json({ name: "Prales API", version: "0.2.0" }));
app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRouter);
app.route("/api/villages", villagesRouter);
app.route("/api/teams", teamsRouter);
app.route("/api", matchesRouter);
app.route("/api", leagueRouter);
app.route("/api", gameRouter);
app.route("/api", messagingRouter);
app.route("/api", groupChatsRouter);
app.route("/api", pushRouter);
app.route("/api", votesRouter);
app.route("/api", cashLoansRouter);
app.route("/api", relationsRouter);
app.route("/api", u21Router);
app.route("/api", staffRouter);
app.route("/api", equipmentMarketRouter);
app.route("/api", refereesRouter);
app.route("/api", competitionRouter);
app.route("/api", bettingRouter);

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const cron = event.cron;
    const log = (level: string, msg: string, err?: any) => {
      const entry: Record<string, unknown> = { ts: new Date().toISOString(), level, mod: "cron", msg };
      if (err) { entry.err = err.message; entry.stack = err.stack?.split("\n").slice(0, 3).join(" | "); }
      console[level === "error" ? "error" : "log"](JSON.stringify(entry));
    };
    log("info", `trigger: cron=${cron || "manual"}`);

    // ── Přepínač poskytovatele AI ──
    // Testing má od 2026-08-17 vlastní crony a sdílí s produkcí hodnotu GEMINI_API_KEY.
    // Bez tohohle by testovací crony ujídaly produkční kvótu každý den. Default je
    // "gemini", takže bez klíče v KV se nic nemění.
    const { applyAiProvider } = await import("./lib/ai-provider");
    const { configureAiGateway } = await import("./news/gemini-helper");
    configureAiGateway(env.AI_GATEWAY_URL);
    const aiSwitch = await applyAiProvider(env);
    env = aiSwitch.env;
    if (aiSwitch.provider !== "gemini") log("info", `AI poskytovatel: ${aiSwitch.provider}`);

    // ── DAILY TICK: 4:00 CET (3:00 UTC) — posouvá dny, tréninky, zprávy ──
    // Manuální trigger (!cron) spustí denní tick + zápasový tick
    if (cron === "0 3 * * *" || !cron) {
      try {
        log("info", "daily tick starting");
        const result = await executeDailyTick(env);
        log("info", `daily tick done: ${result.events.length} events, training=${result.isTrainingDay}`);
      } catch (e: any) {
        log("error", "daily tick failed", e);
      }
    }

    // ── CUP TICK: pohár se hraje od poledne, pak při každém dalším cronu ──
    // Ranní crony (3:00 posun dne, 5:00 zaměstnanci, 6:00 preview) pohár míjejí, aby se
    // nedohrával v 7 ráno — první pohárový tick je 10:00 UTC = 12:00 SELČ.
    // Zbylé čtyři ticky (10, 14, 16, 16:05) dají 12 dávek po 48 zápasech denně, takže i
    // největší kolo (128 zápasů v 1. předkole) je hotové hned tím poledním.
    // Předčasně se nic neodehraje — maybeAdvanceCup simuluje jen kola, jejichž termín už nastal,
    // a herní datum se posouvá výhradně v nočním ticku.
    const isCupTick = !!cron && !["0 3 * * *", "0 5 * * *", "0 6 * * *"].includes(cron);
    if (isCupTick) {
      try {
        const { maybeAdvanceCup } = await import("./cup/cup");
        const batches = await maybeAdvanceCup(env.DB);
        if (batches > 0) log("info", `cup tick: ${batches} dávek`);
      } catch (e: any) {
        log("error", "cup tick failed", e);
      }
    }

    // ── STAFF TICK: 5:00 UTC — efekty zaměstnanců (masér, lékař, správce, psycholog, kurzy, skaut, pool) ──
    // Samostatný cron mimo daily-tick. Manuální trigger (!cron) ho spustí taky.
    if (cron === "0 5 * * *" || !cron) {
      try {
        log("info", "staff tick starting");
        const { executeStaffTick } = await import("./staff/staff-tick");
        const r = await executeStaffTick(env);
        log("info", `staff tick done: regen=${r.regenTeams} healed=${r.healedExtra} courses=${r.coursesDone} scout=${r.scoutTips} newCand=${r.newCandidates}`);
      } catch (e: any) {
        log("error", "staff tick failed", e);
      }
    }

    // ── TRANSFER PRESSURE: 12:00 CEST (10:00 UTC) — expirace nabídek, CPU nabídky, truc ──
    if (cron === "0 10 * * *") {
      try {
        log("info", "transfer pressure tick starting");
        const { executeTransferPressureTick } = await import("./transfers/transfer-pressure-tick");
        const r = await executeTransferPressureTick(env);
        log("info", `transfer pressure tick done: expired=${r.expiredOffers} aiOffers=${r.aiOffers} unrest=${r.unrestProcessed}${r.skipped ? " (skipped)" : ""}`);
      } catch (e: any) {
        log("error", "transfer pressure tick failed", e);
      }
    }

    // ── AI PLAYER CHATS: 16:00 CEST (14:00 UTC) — random thready od hráčů + expirace stale ──
    if (cron === "0 14 * * *") {
      try {
        log("info", "ai player chats tick starting");
        const { applyAiPlayerThreads, expireStaleAiThreads } = await import("./messaging/ai-player-spawn");
        const spawnRes = await applyAiPlayerThreads(env.DB, env);
        const expireRes = await expireStaleAiThreads(env.DB);
        log("info", `ai player chats: ${spawnRes.spawned} spawned, ${spawnRes.skipped} skipped, ${expireRes.offended} offended, ${expireRes.safetyClosed} safety closed`);
      } catch (e: any) {
        log("error", "ai player chats tick failed", e);
      }
    }

    // ── MATCH TICK: 18:00 CEST — simuluje zápasy ──
    // Režim "queue": cron jen rozešle zprávy, ligy se zpracují každá ve vlastní invokaci.
    // Režim "loop": stará cesta, všechny ligy v jedné invokaci (přepínač v CACHE_KV).
    const isMatchTick = cron?.startsWith("0 16") || cron?.startsWith("5 16") || cron?.startsWith("10 16") || cron?.startsWith("15 16") || !cron;
    if (isMatchTick) {
      try {
        log("info", "match tick starting");

        // Recovery PŘED běžným zpracováním: dohraj kola uvízlá v 'lineup_locked'
        // (simulace spadla v půlce). Jinak match-tick locked kolo ignoruje a liga se zasekne.
        try {
          const recovered = await recoverStuckRounds(env.DB, env.GEMINI_API_KEY);
          for (const r of recovered) {
            log("info", `recovered stuck round ${r.calendarId} (liga ${r.leagueId}): ${r.matches} zápasů dohráno`);
          }
        } catch (e) { log("error", "stuck round recovery failed", e); }

        const { readMatchTickMode } = await import("./queue/messages");
        const mode = await readMatchTickMode(env.CACHE_KV);
        let totalMatches = 0;

        if (mode === "queue") {
          // Cron je jen PRODUCENT — zjistí, co je splatné, a rozešle zprávy.
          // Doběhne za sekundu bez ohledu na počet lig; vlastní práci udělá
          // konzumer, kde každá liga dostane vlastní invokaci a vlastní rozpočet.
          const { enqueueMatchTick } = await import("./queue/producer");
          const enq = await enqueueMatchTick(env);
          log("info", `match tick zařazen do fronty: ${enq.rounds} kol, ${enq.maintenance} údržeb`);
        } else {
          // ── STARÁ CESTA (režim "loop") ──
          // Všechny ligy v JEDNÉ invokaci = jeden sdílený rozpočet CPU a subrequestů.
          // Proto se tu pořád vylučují České Budějovice: bez toho tick přeteče limit
          // a neodsimuluje NIC. Vyloučení i celá tahle větev padnou ve fázi 2,
          // až se frontový režim ověří na produkci.
          const { findLeaguesWithDueRound, processLeagueRound, processLeagueMaintenance } =
            await import("./season/league-round");
          const leagues = await findLeaguesWithDueRound(env.DB, {
            legacyExcludeDistrictLike: "České Budějovice%",
          });
          for (const lg of leagues) {
            const r = await processLeagueRound(env, lg.leagueId, { ctx });
            totalMatches += r.matches;
          }

          // Údržba lig (celebrity, AI inzeráty) — dřív dvě další globální smyčky
          // ve stejné invokaci, teď per liga uvnitř processLeagueMaintenance.
          const humanLeagues = await env.DB.prepare(
            "SELECT DISTINCT league_id FROM teams WHERE user_id != 'ai' AND league_id IS NOT NULL"
          ).all<{ league_id: string }>().catch((e) => {
            log("error", "fetch human leagues for maintenance", e);
            return { results: [] as Array<{ league_id: string }> };
          });
          for (const hl of humanLeagues.results) {
            if (hl.league_id) await processLeagueMaintenance(env, hl.league_id);
          }
          log("info", `match tick: ${leagues.length} lig zpracováno smyčkou`);
        }
        // ── Přáteláky: simulovat accepted challenges ──
        try {
          const { simulateFriendlyMatches } = await import("./multiplayer/friendly-runner");
          const friendlyCount = await simulateFriendlyMatches(env.DB);
          totalMatches += friendlyCount;
          if (friendlyCount > 0) log("info", `${friendlyCount} friendly matches simulated`);
        } catch (e) { log("error", "friendly matches failed", e); }

        log("info", `match tick done: ${totalMatches} matches simulated (režim ${mode})`);

        // Pozn.: spawn celebrit a AI inzeráty na trhu se přesunuly do
        // processLeagueMaintenance() v season/league-round.ts. Dřív to byly dvě další
        // globální smyčky přes ligy ve stejné invokaci jako zápasy — teď je to per liga,
        // takže to škáluje stejně jako zbytek zpracování.

      } catch (e: any) {
        log("error", "match tick failed", e);
      }
    }

    // ── HLÍDAČ: 6:00 UTC — kontrola, že se v noci opravdu něco stalo ──
    // Cloudflare umí upozornit na chybu, ne na ticho. Tohle hlídá ticho:
    // neproběhlé kolo, zaseklá kola, dead-letter frontu, rostoucí backlog.
    if (cron === "0 6 * * *") {
      try {
        const { runWatchdogAndAlert } = await import("./lib/watchdog");
        const r = await runWatchdogAndAlert(env);
        log(r.ok ? "info" : "error", `hlídač: ${r.ok ? "v pořádku" : r.problemy.map((p) => p.kod).join(", ")}`);
      } catch (e: any) {
        log("error", "hlídač selhal", e);
      }
    }

    // ── MATCHDAY PREVIEW: 6:00 UTC (8:00 CEST) — článek před kolem ──
    // Izolovaný od daily i match ticku — selhání neohrozí ostatní.
    // V režimu "queue" se jen zařadí zprávy (jeden článek = jedna invokace),
    // v režimu "loop" běží sériově jako dosud.
    if (cron === "0 6 * * *") {
      try {
        log("info", "matchday preview tick starting");
        if (!env.GEMINI_API_KEY) {
          log("warn", "skip matchday preview — no GEMINI_API_KEY");
        } else {
          const { readMatchTickMode } = await import("./queue/messages");
          const previewMode = await readMatchTickMode(env.CACHE_KV);

          if (previewMode === "queue") {
            const { enqueueMatchdayPreviews } = await import("./queue/producer");
            const queued = await enqueueMatchdayPreviews(env);
            log("info", `matchday preview zařazeno do fronty: ${queued} článků`);
          } else {
            const { generateMatchdayPreview } = await import("./news/matchday-preview");
            const leagues = await env.DB.prepare(
              "SELECT DISTINCT t.league_id, t.game_date FROM teams t WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL AND t.user_id != 'ai'"
            ).all();
            let generated = 0;
            for (const lg of leagues.results) {
              const leagueId = lg.league_id as string;
              const gameDate = lg.game_date as string;
              if (!leagueId || !gameDate) continue;
              const gd = new Date(gameDate);
              const dayStart = new Date(gd); dayStart.setUTCHours(0, 0, 0, 0);
              const dayEnd = new Date(gd); dayEnd.setUTCHours(23, 59, 59, 999);
              const todayCal = await env.DB.prepare(
                "SELECT id FROM season_calendar WHERE league_id = ? AND status = 'scheduled' AND scheduled_at BETWEEN ? AND ? LIMIT 1"
              ).bind(leagueId, dayStart.toISOString(), dayEnd.toISOString()).first<{ id: string }>()
                .catch((e) => { log("warn", `preview cal lookup ${leagueId}`, e); return null; });
              if (!todayCal) continue;
              try {
                await generateMatchdayPreview(env.DB, env.GEMINI_API_KEY, leagueId, todayCal.id);
                generated++;
              } catch (e: any) {
                log("error", `preview failed for league ${leagueId}`, e);
              }
            }
            log("info", `matchday preview tick done: ${generated} articles`);
          }
        }
      } catch (e: any) {
        log("error", "matchday preview tick failed", e);
      }
    }
  },

  /**
   * Konzumer front. Jedna zpráva = jedna invokace = vlastní čerstvý rozpočet CPU,
   * subrequestů a paměti. Tohle je jádro škálování na libovolný počet lig.
   *
   * DLQ fronty (název končí na "-dlq") jdou do jiného handleru — tam se už nic
   * nezpracovává, jen se selhání zaznamená, aby liga nevypadla potichu.
   */
  async queue(
    batch: MessageBatch<MatchQueueMessage | ReportQueueMessage>,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const { handleQueueBatch, handleDeadLetterBatch } = await import("./queue/consumer");
    if (batch.queue.includes("-dlq")) {
      await handleDeadLetterBatch(batch, env);
      return;
    }
    // Stejný přepínač jako u cronu — konzumer generuje články, takže bez něj
    // by testing na produkční kvótu sáhl právě tudy.
    const { applyAiProvider } = await import("./lib/ai-provider");
    const { configureAiGateway } = await import("./news/gemini-helper");
    configureAiGateway(env.AI_GATEWAY_URL);
    const { env: aiEnv } = await applyAiProvider(env);
    await handleQueueBatch(batch, aiEnv, ctx);
  },
};
