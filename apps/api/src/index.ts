import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./routes/auth";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";
import { gameRouter } from "./routes/game";
import { messagingRouter } from "./routes/messaging";
// transfers endpoints are in gameRouter
import { runScheduledMatches } from "./multiplayer/match-runner";
import { executeDailyTick } from "./season/daily-tick";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

// Global error handler — structured JSON logging
app.onError((err, c) => {
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
  return c.json({ error: err.message, reqId }, 500);
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

    // ── MATCH TICK: 18:00 CET (17:00 UTC) — simuluje zápasy naplánované na dnešek ──
    // Manuální trigger spustí taky
    if (cron === "0 17 * * *" || !cron) {
      try {
        log("info", "match tick starting");
        // Find max game_date per league to know which rounds to simulate
        const leagues = await env.DB.prepare(
          "SELECT league_id, MAX(game_date) as max_game_date FROM teams WHERE league_id IS NOT NULL AND game_date IS NOT NULL GROUP BY league_id"
        ).all();

        let totalMatches = 0;
        for (const league of leagues.results) {
          const gameDate = league.max_game_date as string | null;
          const leagueId = league.league_id as string | null;
          if (!gameDate || !leagueId) continue;

          const gd = new Date(gameDate);
          const dayEnd = new Date(gd); dayEnd.setUTCHours(23, 59, 59, 999);

          // Process ALL unplayed rounds up to current game_date
          const pendingCals = await env.DB.prepare(
            "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' ORDER BY scheduled_at ASC"
          ).bind(leagueId, dayEnd.toISOString()).all();

          for (const matchCal of pendingCals.results) {
            await env.DB.prepare(
              "UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'"
            ).bind(matchCal.id).run();

            const results = await runScheduledMatches(env.DB, matchCal.id as string);
            await env.DB.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?")
              .bind(matchCal.id).run();
            totalMatches += results.length;

            // Between-round events + news (zpravodaj)
            if (results.length > 0) {
              const calRow = await env.DB.prepare("SELECT game_week FROM season_calendar WHERE id = ?")
                .bind(matchCal.id).first<{ game_week: number }>();
              const gameWeek = calRow?.game_week ?? 0;
              try {
                const matchRows = await env.DB.prepare(
                  `SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name
                   FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id
                   WHERE m.calendar_id = ? AND m.status = 'simulated'`
                ).bind(matchCal.id).all();
                const lines: string[] = [];
                let topScore = 0; let topMatch = "";
                for (const r of matchRows.results) {
                  const hs = r.home_score as number; const as_ = r.away_score as number;
                  const hn = r.home_name as string; const an = r.away_name as string;
                  if (hs > as_) lines.push(`${hn} porazil ${an} ${hs}:${as_}`);
                  else if (hs < as_) lines.push(`${an} zvítězil nad ${hn} ${as_}:${hs}`);
                  else lines.push(`${hn} remizoval s ${an} ${hs}:${as_}`);
                  if (hs + as_ > topScore) { topScore = hs + as_; topMatch = `${hn} vs ${an} ${hs}:${as_}`; }
                }
                const headline = `${gameWeek}. kolo: přehled výsledků`;
                const body = lines.join(". ") + "." + (topScore >= 4 ? ` Nejvíce gólů padlo v utkání ${topMatch}.` : "");
                await env.DB.prepare(
                  "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, datetime('now'))"
                ).bind(crypto.randomUUID(), leagueId, headline, body, gameWeek).run();
              } catch (e) { log("error", "news generation failed", e); }

              // Between-round events for human teams
              try {
                const { generateBetweenRoundEvents } = await import("./events/between-rounds");
                const { createRng } = await import("./generators/rng");
                const { recordTransaction } = await import("./season/finance-processor");
                const brRng = createRng(Date.now());

                for (const mr of results) {
                  if (mr.matchType === "ai_vs_ai") continue;
                  const humanTeamId = mr.matchType === "pve_home" || mr.matchType === "pvp"
                    ? (await env.DB.prepare("SELECT home_team_id FROM matches WHERE id = ?").bind(mr.matchId).first<{home_team_id:string}>())?.home_team_id
                    : (await env.DB.prepare("SELECT away_team_id FROM matches WHERE id = ?").bind(mr.matchId).first<{away_team_id:string}>())?.away_team_id;
                  if (!humanTeamId) continue;

                  const td = await env.DB.prepare("SELECT budget, reputation, game_date FROM teams WHERE id = ?").bind(humanTeamId).first<{budget:number; reputation:number; game_date:string}>();
                  const sqRows = await env.DB.prepare("SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')").bind(humanTeamId).all();
                  const squad = sqRows.results.map((r: any) => {
                    const s = JSON.parse(r.skills); const p = JSON.parse(r.personality); const lc = JSON.parse(r.life_context);
                    return { firstName: r.first_name, lastName: r.last_name, age: r.age, position: r.position,
                      speed: s.speed??50, technique: s.technique??50, shooting: s.shooting??50, passing: s.passing??50,
                      heading: s.heading??50, defense: s.defense??50, goalkeeping: s.goalkeeping??0,
                      stamina: s.stamina??50, strength: s.strength??50, discipline: p.discipline??50,
                      patriotism: p.patriotism??50, alcohol: p.alcohol??30, temper: p.temper??40,
                      injuryProneness: p.injuryProneness??50, occupation: lc.occupation??"",
                      bodyType: "normal" as const, avatarConfig: {} as any, condition: lc.condition??100, morale: lc.morale??50,
                      preferredFoot: "right" as const, preferredSide: "center" as const,
                      leadership: p.leadership??30, workRate: p.workRate??50, aggression: p.aggression??40,
                      consistency: p.consistency??50, clutch: p.clutch??50 };
                  });

                  const lastWon = mr.matchType === "pve_home" ? mr.homeScore > mr.awayScore : mr.awayScore > mr.homeScore;
                  const brEvents = generateBetweenRoundEvents(brRng, squad, td?.budget??0, td?.reputation??50, lastWon, gameWeek);

                  for (const ev of brEvents) {
                    if (ev.effect) {
                      const eff = ev.effect;
                      if (eff.type === "morale" && eff.value) {
                        await env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?))) WHERE team_id = ?")
                          .bind(eff.value, humanTeamId).run().catch(() => {});
                      }
                      if (eff.type === "budget" && eff.value) {
                        await recordTransaction(env.DB, humanTeamId, "event", eff.value, ev.title, td?.game_date ?? new Date().toISOString()).catch(() => {});
                      }
                      if (eff.type === "reputation" && eff.value) {
                        await env.DB.prepare("UPDATE teams SET reputation = MIN(100, MAX(0, reputation + ?)) WHERE id = ?")
                          .bind(eff.value, humanTeamId).run().catch(() => {});
                      }
                      if (eff.type === "player_leave" && eff.playerIndex != null) {
                        // Mark player as quit (wants to leave)
                        const leaver = sqRows.results[eff.playerIndex];
                        if (leaver) {
                          await env.DB.prepare("UPDATE players SET status = 'quit' WHERE id = ?").bind(leaver.id).run().catch(() => {});
                        }
                      }
                      if (eff.type === "injury" && eff.playerIndex != null) {
                        const injured = sqRows.results[eff.playerIndex];
                        if (injured) {
                          const days = (eff.duration ?? 1) * 7; // rounds to days
                          await env.DB.prepare("INSERT OR IGNORE INTO injuries (id, player_id, type, days_remaining) VALUES (?, ?, 'training', ?)")
                            .bind(crypto.randomUUID(), injured.id, days).run().catch(() => {});
                        }
                      }
                      // player_add → creates a free agent offer (shows in transfers)
                      if (eff.type === "player_add") {
                        // Add to free agents pool so player can sign them via transfers page
                        try {
                          const { maintainFreeAgentPool } = await import("./transfers/free-agent-pool");
                          await maintainFreeAgentPool(env.DB, brRng, new Date());
                        } catch { /* pool generation optional */ }
                      }
                    }
                    // Send as message from relevant role (NOT public zpravodaj)
                    const roleSenders: Record<string, { name: string; title: string }> = {
                      budget: { name: "Účetní", title: "Účetní klubu" },
                      reputation: { name: "Starosta", title: "Starosta obce" },
                      morale: { name: "Asistent trenéra", title: "Asistent" },
                      player_leave: { name: "Kapitán", title: "Kapitán týmu" },
                      player_add: { name: "Hospodský", title: "Místní kontakt" },
                      injury: { name: "Zdravotník", title: "Správce hřiště" },
                      condition: { name: "Masér", title: "Masér" },
                    };
                    const sender = roleSenders[ev.effect?.type ?? ""] ?? { name: "Vedení klubu", title: "Vedení" };

                    // Find or create conversation for this sender role
                    const roleConvTitle = sender.title;
                    let roleConvId = await env.DB.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
                      .bind(humanTeamId, roleConvTitle).first<{ id: string }>().then((r) => r?.id).catch(() => null);
                    if (!roleConvId) {
                      roleConvId = crypto.randomUUID();
                      await env.DB.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', datetime('now'), datetime('now'))")
                        .bind(roleConvId, humanTeamId, roleConvTitle).run().catch(() => {});
                    }
                    await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, datetime('now'))")
                      .bind(crypto.randomUUID(), roleConvId, sender.name, `${ev.emoji} ${ev.description}`, JSON.stringify({ type: "event", category: ev.category }))
                      .run().catch(() => {});
                    await env.DB.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = datetime('now') WHERE id = ?")
                      .bind(`${ev.emoji} ${ev.title}`, roleConvId).run().catch(() => {});
                  }
                }
              } catch (e) { log("error", "between-round events failed", e); }

              // Delete match-day attendance conversations (they served their purpose)
              try {
                const matchConvs = await env.DB.prepare(
                  "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.team_id IN (SELECT DISTINCT home_team_id FROM matches WHERE calendar_id = ? UNION SELECT DISTINCT away_team_id FROM matches WHERE calendar_id = ?) AND c.type = 'squad_group' AND c.title LIKE '⚽ vs %' AND m.metadata LIKE ?"
                ).bind(matchCal.id, matchCal.id, `%${matchCal.id}%`).all().catch(() => ({ results: [] }));
                for (const conv of matchConvs.results) {
                  await env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv.id).run().catch(() => {});
                  await env.DB.prepare("DELETE FROM conversations WHERE id = ?").bind(conv.id).run().catch(() => {});
                }
              } catch { /* cleanup optional */ }
            }
          }
        }
        log("info", `match tick done: ${totalMatches} matches simulated`);
      } catch (e: any) {
        log("error", "match tick failed", e);
      }
    }
  },
};
