import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./routes/auth";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";
import { gameRouter } from "./routes/game";
import { messagingRouter } from "./routes/messaging";
import { pushRouter } from "./routes/push";
import { votesRouter } from "./routes/votes";
// transfers endpoints are in gameRouter
import { runScheduledMatches } from "./multiplayer/match-runner";
import { executeDailyTick } from "./season/daily-tick";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
  GEMINI_API_KEY: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

// Global error handler — structured JSON logging, bez expose interních detailů klientovi.
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
app.route("/api", pushRouter);
app.route("/api", votesRouter);

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

    // ── MATCH TICK: 18:00 CEST — simuluje zápasy, všechny ligy najednou ──
    const isMatchTick = cron?.startsWith("0 16") || cron?.startsWith("5 16") || cron?.startsWith("10 16") || cron?.startsWith("15 16") || !cron;
    if (isMatchTick) {
      try {
        log("info", "match tick starting");
        const leagues = await env.DB.prepare(
          "SELECT league_id, MAX(game_date) as max_game_date FROM teams WHERE league_id IS NOT NULL AND game_date IS NOT NULL GROUP BY league_id"
        ).all();

        // Process ALL leagues in one invocation (no KV tracking needed)
        let totalMatches = 0;
        for (const league of leagues.results) {
          const gameDate = league.max_game_date as string | null;
          const leagueId = league.league_id as string | null;
          if (!gameDate || !leagueId) continue;

          const gd = new Date(gameDate);
          const dayEnd = new Date(gd); dayEnd.setUTCHours(23, 59, 59, 999);

          // Process exactly 1 round per invocation — never more
          const matchCal = await env.DB.prepare(
            "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1"
          ).bind(leagueId, dayEnd.toISOString()).first<{ id: string }>();

          if (matchCal) {
            // Snapshot tabulky PŘED kolem (pro AI reportera)
            const { calculateStandings } = await import("./stats/standings");
            const standingsBefore = await calculateStandings(env.DB, leagueId);

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
                  "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
                ).bind(crypto.randomUUID(), leagueId, headline, body, gameWeek).run();
              } catch (e) { log("error", "news generation failed", e); }

              // match_result notifikace pro lidské týmy
              try {
                const { createNotification } = await import("./community/notifications");
                const pushEnv = { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB };
                for (const mr of results) {
                  if (mr.matchType === "ai_vs_ai") continue;
                  const md = await env.DB.prepare(
                    "SELECT m.home_score, m.away_score, m.home_team_id, m.away_team_id, t1.name as hn, t2.name as an, t1.user_id as hu, t2.user_id as au FROM matches m JOIN teams t1 ON m.home_team_id=t1.id JOIN teams t2 ON m.away_team_id=t2.id WHERE m.id=?"
                  ).bind(mr.matchId).first<Record<string, unknown>>();
                  if (!md) continue;
                  const title = `⚽ Zápas skončil!`;
                  const body = `${md.hn} vs ${md.an} — výsledek čeká v aplikaci.`;
                  if (md.hu !== "ai") await createNotification(env.DB, md.home_team_id as string, "match_result", title, body, "/dashboard/match", pushEnv).catch((e) => log("warn", "match_result notif home", e));
                  if (md.au !== "ai") await createNotification(env.DB, md.away_team_id as string, "match_result", title, body, "/dashboard/match", pushEnv).catch((e) => log("warn", "match_result notif away", e));
                }
              } catch (e) { log("warn", "match_result notifications failed", e); }

              // AI zpravodajský článek (async, neblokuje)
              if (env.GEMINI_API_KEY) {
                try {
                  const { generateAiRoundReport } = await import("./news/ai-reporter");
                  ctx.waitUntil(
                    generateAiRoundReport(env.DB, env.GEMINI_API_KEY, leagueId, matchCal.id as string, gameWeek, standingsBefore)
                      .catch((e) => log("error", "AI report failed", e))
                  );
                } catch (e) { log("error", "AI reporter import failed", e); }
              }

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
                  const teamDistrict = await env.DB.prepare("SELECT v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.id=?").bind(humanTeamId).first<{district:string}>().catch((e) => { log("warn", "Failed to get team district", e); return null; });
                  const brEvents = generateBetweenRoundEvents(brRng, squad, td?.budget??0, td?.reputation??50, lastWon, gameWeek, teamDistrict?.district);

                  for (const ev of brEvents) {
                    if (ev.effect) {
                      const eff = ev.effect;
                      if (eff.type === "morale" && eff.value) {
                        await env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?))) WHERE team_id = ?")
                          .bind(eff.value, humanTeamId).run().catch((e) => log("warn", "morale effect failed", e));
                      }
                      if (eff.type === "budget" && eff.value) {
                        await recordTransaction(env.DB, humanTeamId, "event", eff.value, ev.title, td?.game_date ?? new Date().toISOString()).catch((e) => log("warn", "budget effect failed", e));
                      }
                      if (eff.type === "reputation" && eff.value) {
                        await env.DB.prepare("UPDATE teams SET reputation = MIN(100, MAX(0, reputation + ?)) WHERE id = ?")
                          .bind(eff.value, humanTeamId).run().catch((e) => log("warn", "reputation effect failed", e));
                      }
                      if (eff.type === "player_leave" && eff.playerIndex != null) {
                        // Mark player as quit (wants to leave)
                        const leaver = sqRows.results[eff.playerIndex];
                        if (leaver) {
                          await env.DB.prepare("UPDATE players SET status = 'quit' WHERE id = ?").bind(leaver.id).run().catch((e) => log("warn", "player_leave effect failed", e));
                        }
                      }
                      if (eff.type === "injury" && eff.playerIndex != null) {
                        const injured = sqRows.results[eff.playerIndex];
                        if (injured) {
                          const days = (eff.duration ?? 1) * 7; // rounds to days
                          await env.DB.prepare("INSERT OR IGNORE INTO injuries (id, player_id, type, days_remaining) VALUES (?, ?, 'training', ?)")
                            .bind(crypto.randomUUID(), injured.id, days).run().catch((e) => log("warn", "injury effect failed", e));
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
                      .bind(humanTeamId, roleConvTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { log("warn", "Failed to find role conversation", e); return null; });
                    if (!roleConvId) {
                      roleConvId = crypto.randomUUID();
                      await env.DB.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                        .bind(roleConvId, humanTeamId, roleConvTitle).run().catch((e) => log("warn", "Failed to create role conversation", e));
                    }
                    await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
                      .bind(crypto.randomUUID(), roleConvId, sender.name, `${ev.emoji} ${ev.description}`, JSON.stringify({ type: "event", category: ev.category }))
                      .run().catch((e) => log("warn", "Failed to insert event message", e));
                    await env.DB.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                      .bind(`${ev.emoji} ${ev.title}`, roleConvId).run().catch((e) => log("warn", "Failed to update conversation unread", e));
                  }
                }
              } catch (e) { log("error", "between-round events failed", e); }

              // Ad-hoc události pro human týmy
              try {
                const { pickRandomAdhocEvent } = await import("./season/seasonal-events");
                const { createRng: createAdhocRng } = await import("./generators/rng");
                const humanTeams = await env.DB.prepare(
                  "SELECT t.id, t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.league_id = ? AND t.user_id <> 'ai'"
                ).bind(leagueId).all();

                for (const ht of humanTeams.results) {
                  const adhocRng = createAdhocRng(Date.now() + (ht.id as string).charCodeAt(0));
                  const adhocEvent = pickRandomAdhocEvent(adhocRng, gameWeek, ht.district as string);
                  if (adhocEvent) {
                    await env.DB.prepare(
                      "INSERT INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, '1', ?, 'pending')"
                    ).bind(crypto.randomUUID(), ht.league_id, adhocEvent.type, adhocEvent.title, adhocEvent.description,
                      JSON.stringify(adhocEvent.effects), JSON.stringify(adhocEvent.choices), adhocEvent.gameWeek
                    ).run().catch((e) => log("warn", "adhoc event insert failed", e));
                    // event notifikace
                    const { createNotification } = await import("./community/notifications");
                    await createNotification(env.DB, ht.id as string, "event", `${adhocEvent.title}`, adhocEvent.description ?? "Nová událost v klubu", "/dashboard/events",
                      { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB }
                    ).catch((e) => log("warn", "event notification failed", e));
                  }
                }
              } catch (e) { log("error", "adhoc events failed", e); }

              // Delete match-day attendance conversations (they served their purpose)
              try {
                const matchConvs = await env.DB.prepare(
                  "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.team_id IN (SELECT DISTINCT home_team_id FROM matches WHERE calendar_id = ? UNION SELECT DISTINCT away_team_id FROM matches WHERE calendar_id = ?) AND c.type = 'squad_group' AND c.title LIKE '⚽ vs %' AND m.metadata LIKE ?"
                ).bind(matchCal.id, matchCal.id, `%${matchCal.id}%`).all().catch((e) => { log("warn", "Failed to fetch match conversations for cleanup", e); return { results: [] }; });
                for (const conv of matchConvs.results) {
                  await env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv.id).run().catch((e) => log("warn", "Failed to delete match messages", e));
                  await env.DB.prepare("DELETE FROM conversations WHERE id = ?").bind(conv.id).run().catch((e) => log("warn", "Failed to delete match conversation", e));
                }
              } catch (e) { log("warn", "match conversation cleanup failed", e); }
            }
          }
        }
        // ── Přáteláky: simulovat accepted challenges ──
        try {
          const { simulateFriendlyMatches } = await import("./multiplayer/friendly-runner");
          const friendlyCount = await simulateFriendlyMatches(env.DB);
          totalMatches += friendlyCount;
          if (friendlyCount > 0) log("info", `${friendlyCount} friendly matches simulated`);
        } catch (e) { log("error", "friendly matches failed", e); }

        log("info", `match tick done: ${totalMatches} matches simulated (all leagues)`);

        // ── Celebrity spawn check (runs after match tick, separate query budget) ──
        try {
          const { createRng } = await import("./generators/rng");
          const celebRng = createRng(Date.now() + 55555);
          const celebLeagues = await env.DB.prepare(
            "SELECT DISTINCT league_id FROM teams WHERE user_id != 'ai' AND league_id IS NOT NULL"
          ).all();
          for (const cl of celebLeagues.results) {
            const lid = cl.league_id as string;
            const existing = await env.DB.prepare(
              "SELECT id FROM free_agents WHERE is_celebrity = 1 AND district = (SELECT district FROM leagues WHERE id = ?)"
            ).bind(lid).first().catch((e) => { log("error", "celeb check existing", e); return null; });
            if (existing) continue;
            const recent = await env.DB.prepare(
              "SELECT id FROM players WHERE is_celebrity = 1 AND team_id IN (SELECT id FROM teams WHERE league_id = ?)"
            ).bind(lid).first().catch((e) => { log("error", "celeb check recent", e); return null; });
            if (recent) continue;
            if (celebRng.random() < 0.004) {
              const { spawnCelebrity } = await import("./season/celebrity-spawn");
              const result = await spawnCelebrity(env.DB, lid, celebRng);
              if (result) log("info", `celebrity spawned: ${result.name} (${result.type}) in league ${lid}`);
            }
          }
        } catch (e) { log("error", "celebrity spawn failed", e); }

        // ── Virtual AI market activity (listings + offers from neighboring districts) ──
        try {
          const { createRng } = await import("./generators/rng");
          const marketRng = createRng(Date.now() + 77777);
          const { generateAiListings, generateAiOffers } = await import("./transfers/virtual-teams");
          const marketLeagues = await env.DB.prepare(
            "SELECT l.id, l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.user_id != 'ai' GROUP BY l.id"
          ).all().catch((e) => { log("error", "fetch leagues for AI market", e); return { results: [] }; });
          for (const ml of marketLeagues.results) {
            const lid = ml.id as string;
            const dist = ml.district as string;
            const listings = await generateAiListings(env.DB, dist, lid, marketRng);
            const offers = await generateAiOffers(env.DB, dist, lid, marketRng);
            if (listings > 0 || offers > 0) {
              log("info", `AI market: ${dist} — ${listings} listings, ${offers} offers`);
            }
          }
        } catch (e) { log("error", "AI market activity failed", e); }

      } catch (e: any) {
        log("error", "match tick failed", e);
      }
    }
  },
};
