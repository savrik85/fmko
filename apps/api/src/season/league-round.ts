/**
 * Zpracování JEDNOHO kola JEDNÉ ligy.
 *
 * Vytaženo z index.ts (match tick), aby tutéž práci dělaly všechny tři cesty:
 *   1. cron — stará smyčka přes ligy (režim "loop")
 *   2. HTTP endpoint /api/game/run-matches?leagueId=
 *   3. konzumer fronty MATCH_QUEUE (režim "queue")
 *
 * Díky tomu je ruční test na testingu bit po bitu totéž co produkční fronta.
 * Viz docs/analyza-fronty-2026-08-16.md.
 */

import type { Bindings } from "../index";
import type { StandingEntry } from "../stats/standings";
import type { ReportQueueMessage } from "../queue/messages";
import { logger } from "../lib/logger";

export type LeagueRoundStatus =
  /** Kolo odsimulováno. */
  | "done"
  /** Jiný trigger už drží lock — typicky duplicitní doručení zprávy. */
  | "skipped"
  /** Liga dnes žádné kolo nemá. */
  | "no-round"
  /** Zpráva je zastaralá — herní den se mezitím posunul. */
  | "stale";

export interface LeagueRoundResult {
  status: LeagueRoundStatus;
  leagueId: string;
  calendarId?: string;
  matches: number;
  /** Doba běhu v ms — podklad pro důkaz, že zátěž na ligu je konstantní. */
  durationMs: number;
  /** Počet D1 dotazů — totéž. */
  queries: number;
}

export interface LeagueRoundOpts {
  /**
   * Herní datum v okamžiku zařazení zprávy. Když se mezitím posunul den,
   * kolo se NEODSIMULUJE (vrátí "stale"). Chrání před zaseknutou frontou,
   * která by dohnala kolo proti špatnému datu. Riziko 4.2 v analýze.
   */
  expectedGameDate?: string;
  /**
   * Kam poslat AI články. Když chybí, použije se ctx.waitUntil (stará cesta).
   * Ve frontě mají články vlastní rozpočet i retry, takže pád Gemini neohrozí zápas.
   */
  reportsQueue?: Queue<ReportQueueMessage>;
  /** Pro starou cestu — waitUntil na AI články. */
  ctx?: ExecutionContext;
}

/**
 * Obalí D1 a počítá `prepare()` volání. Slouží jen k měření — bez něj není
 * jak doložit, že zpracování jedné ligy nezávisí na počtu lig (test T6).
 */
function countingDb(db: D1Database, counter: { n: number }): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (query: string) => {
          counter.n++;
          return target.prepare(query);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
}

/** Herní datum ligy = max(game_date) jejích týmů (stejně jako to počítal cron). */
export async function readLeagueGameDate(db: D1Database, leagueId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT MAX(game_date) AS game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL")
    .bind(leagueId)
    .first<{ game_date: string | null }>()
    .catch((e) => {
      logger.warn({ module: "league-round" }, `read game_date for league ${leagueId}`, e);
      return null;
    });
  return row?.game_date ?? null;
}

/**
 * Ligy, které mají dnes naplánované kolo. Používá producent fronty i stará smyčka.
 *
 * `legacyExcludeNameLike` existuje JEN pro starou smyčku (režim "loop"), kde se natvrdo
 * vylučovaly České Budějovice, protože 6 lig přeteklo limit workeru. Ve frontovém režimu
 * se nepředává — každá liga má vlastní invokaci, takže obcházení limitu není potřeba.
 * Až padne stará cesta (fáze 2), zmizí i tenhle parametr.
 */
export async function findLeaguesWithDueRound(
  db: D1Database,
  opts: { legacyExcludeNameLike?: string } = {},
): Promise<Array<{ leagueId: string; gameDate: string }>> {
  const exclude = opts.legacyExcludeNameLike;
  const stmt = db.prepare(
    `SELECT t.league_id AS league_id, MAX(t.game_date) AS max_game_date
       FROM teams t JOIN leagues l ON t.league_id = l.id
      WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL
        ${exclude ? "AND l.name NOT LIKE ?" : ""}
      GROUP BY t.league_id`,
  );
  const rows = await (exclude ? stmt.bind(exclude) : stmt).all<{
    league_id: string | null;
    max_game_date: string | null;
  }>();

  const out: Array<{ leagueId: string; gameDate: string }> = [];
  for (const row of rows.results) {
    if (!row.league_id || !row.max_game_date) continue;
    out.push({ leagueId: row.league_id, gameDate: row.max_game_date });
  }
  return out;
}

/**
 * Odsimuluje nejbližší splatné kolo dané ligy včetně veškeré návazné agendy
 * (zpravodaj, notifikace, události mezi koly, ad-hoc události, úklid).
 *
 * IDEMPOTENTNÍ: kolo se zamyká atomickým UPDATE `WHERE status = 'scheduled'`.
 * Druhé (duplicitní) doručení dostane changes === 0 a skončí jako "skipped".
 */
export async function processLeagueRound(
  env: Bindings,
  leagueId: string,
  opts: LeagueRoundOpts = {},
): Promise<LeagueRoundResult> {
  const startedAt = Date.now();
  const counter = { n: 0 };
  const db = countingDb(env.DB, counter);

  const done = (status: LeagueRoundStatus, matches: number, calendarId?: string): LeagueRoundResult => ({
    status,
    leagueId,
    calendarId,
    matches,
    durationMs: Date.now() - startedAt,
    queries: counter.n,
  });

  const gameDate = await readLeagueGameDate(db, leagueId);
  if (!gameDate) return done("no-round", 0);

  // Zastaralá zpráva — herní den se posunul, než se konzumer dostal ke slovu.
  if (opts.expectedGameDate && opts.expectedGameDate !== gameDate) {
    logger.warn(
      { module: "league-round" },
      `stale zpráva pro ligu ${leagueId}: zařazeno pro ${opts.expectedGameDate}, teď je ${gameDate} — zahazuji`,
    );
    return done("stale", 0);
  }

  const dayEnd = new Date(gameDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Přesně JEDNO kolo na invokaci a jen z AKTUÁLNÍ sezóny — staré neodehrané
  // zápasy z minulých sezón se nikdy nepálí.
  const matchCal = await db
    .prepare(
      "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' AND season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?) ORDER BY scheduled_at ASC LIMIT 1",
    )
    .bind(leagueId, dayEnd.toISOString(), leagueId)
    .first<{ id: string }>();

  if (!matchCal) return done("no-round", 0);
  const calendarId = matchCal.id;

  // ── Atomický lock ──
  // Zabrání souběžnému cronu / endpointu / duplicitní zprávě zpracovat stejné kolo
  // a tím zdvojit finance (concession, vstupné, prémie) — viz incident 2026-04.
  const lockResult = await db
    .prepare("UPDATE season_calendar SET status = 'lineup_locked' WHERE id = ? AND status = 'scheduled'")
    .bind(calendarId)
    .run();
  if (lockResult.meta.changes === 0) {
    logger.info({ module: "league-round" }, `skip ${calendarId}: jiný trigger už drží lock`);
    return done("skipped", 0, calendarId);
  }

  // Snapshot tabulky PŘED kolem (pro AI reportera)
  const { calculateStandings } = await import("../stats/standings");
  const standingsBefore: StandingEntry[] = await calculateStandings(db, leagueId);

  await db
    .prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'")
    .bind(calendarId)
    .run();

  const { runScheduledMatches } = await import("../multiplayer/match-runner");
  const results = await runScheduledMatches(db, calendarId, env.GEMINI_API_KEY);
  await db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?").bind(calendarId).run();

  // Po U21 kole: vrátit hráče s next_match_return zpět do A-týmu
  try {
    const isU21Round = await db.prepare("SELECT 1 FROM leagues WHERE id = ? AND league_type = 'u21'").bind(leagueId).first();
    if (isU21Round) {
      const { returnNextMatchPlayers } = await import("./u21-return");
      const returned = await returnNextMatchPlayers(db, calendarId);
      if (returned > 0) logger.info({ module: "league-round" }, `U21 návrat: ${returned} hráčů zpět do A-týmu`);
    }
  } catch (e) {
    logger.warn({ module: "league-round" }, "u21 return hook", e);
  }

  // Po zápase: smaž zbývající pending PŘEDZÁPASOVÉ interview žádosti (po zápase už nemají
  // smysl). Filtr na kind je nutný: pozápasový rozhovor vzniká uvnitř runScheduledMatches
  // pro TENTÝŽ calendar_id, takže bez něj by ho tenhle úklid zabil pár řádků po vzniku.
  try {
    const expired = await db
      .prepare("SELECT id FROM coach_interviews WHERE match_calendar_id = ? AND status = 'pending' AND kind = 'pre_match'")
      .bind(calendarId)
      .all<{ id: string }>();
    for (const ci of expired.results) {
      await db
        .prepare("DELETE FROM messages WHERE metadata LIKE ?")
        .bind(`%"interviewId":"${ci.id}"%`)
        .run()
        .catch((e) => logger.warn({ module: "league-round" }, `cleanup interview msg ${ci.id}`, e));
    }
    await db
      .prepare("UPDATE coach_interviews SET status = 'expired' WHERE match_calendar_id = ? AND status = 'pending' AND kind = 'pre_match'")
      .bind(calendarId)
      .run();
    if (expired.results.length > 0) {
      logger.info({ module: "league-round" }, `expired ${expired.results.length} unanswered interviews after match`);
    }
  } catch (e) {
    logger.warn({ module: "league-round" }, "post-match interview cleanup", e);
  }

  if (results.length > 0) {
    const calRow = await db.prepare("SELECT game_week FROM season_calendar WHERE id = ?").bind(calendarId).first<{ game_week: number }>();
    const gameWeek = calRow?.game_week ?? 0;

    await writeRoundSummaryNews(db, leagueId, calendarId, gameWeek);
    await sendMatchResultNotifications(env, db, results);
    await dispatchRoundReports(env, leagueId, calendarId, gameWeek, standingsBefore, opts);
    await runBetweenRoundEvents(db, results, gameWeek);
    await runAdhocEvents(env, db, leagueId, gameWeek);
    await cleanupMatchDayConversations(db, calendarId);
  }

  const result = done("done", results.length, calendarId);
  logger.info(
    { module: "league-round" },
    `liga ${leagueId}: ${result.matches} zápasů, ${result.queries} dotazů, ${result.durationMs} ms`,
  );
  return result;
}

/** Zpravodajský souhrn kola. */
async function writeRoundSummaryNews(db: D1Database, leagueId: string, calendarId: string, gameWeek: number): Promise<void> {
  try {
    const matchRows = await db
      .prepare(
        `SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name
           FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id
          WHERE m.calendar_id = ? AND m.status = 'simulated'`,
      )
      .bind(calendarId)
      .all();

    const lines: string[] = [];
    let topScore = 0;
    let topMatch = "";
    for (const r of matchRows.results) {
      const hs = r.home_score as number;
      const as_ = r.away_score as number;
      const hn = r.home_name as string;
      const an = r.away_name as string;
      if (hs > as_) lines.push(`${hn} porazil ${an} ${hs}:${as_}`);
      else if (hs < as_) lines.push(`${an} zvítězil nad ${hn} ${as_}:${hs}`);
      else lines.push(`${hn} remizoval s ${an} ${hs}:${as_}`);
      if (hs + as_ > topScore) {
        topScore = hs + as_;
        topMatch = `${hn} vs ${an} ${hs}:${as_}`;
      }
    }
    const headline = `${gameWeek}. kolo: přehled výsledků`;
    const body = lines.join(". ") + "." + (topScore >= 4 ? ` Nejvíce gólů padlo v utkání ${topMatch}.` : "");
    await db
      .prepare(
        "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
      )
      .bind(crypto.randomUUID(), leagueId, headline, body, gameWeek)
      .run();
  } catch (e) {
    logger.error({ module: "league-round" }, "news generation failed", e);
  }
}

/** match_result notifikace pro lidské týmy. */
async function sendMatchResultNotifications(
  env: Bindings,
  db: D1Database,
  results: Array<{ matchId: string; matchType: string }>,
): Promise<void> {
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: env.VAPID_SUBJECT,
      DB: db,
    };
    for (const mr of results) {
      if (mr.matchType === "ai_vs_ai") continue;
      const md = await db
        .prepare(
          "SELECT m.home_score, m.away_score, m.home_team_id, m.away_team_id, t1.name as hn, t2.name as an, t1.user_id as hu, t2.user_id as au FROM matches m JOIN teams t1 ON m.home_team_id=t1.id JOIN teams t2 ON m.away_team_id=t2.id WHERE m.id=?",
        )
        .bind(mr.matchId)
        .first<Record<string, unknown>>();
      if (!md) continue;
      const title = `⚽ Zápas skončil!`;
      const body = `${md.hn} vs ${md.an} — výsledek čeká v aplikaci.`;
      if (md.hu !== "ai") {
        await createNotification(db, md.home_team_id as string, "match_result", title, body, "/dashboard/match", pushEnv).catch((e) =>
          logger.warn({ module: "league-round" }, "match_result notif home", e),
        );
      }
      if (md.au !== "ai") {
        await createNotification(db, md.away_team_id as string, "match_result", title, body, "/dashboard/match", pushEnv).catch((e) =>
          logger.warn({ module: "league-round" }, "match_result notif away", e),
        );
      }
    }
  } catch (e) {
    logger.warn({ module: "league-round" }, "match_result notifications failed", e);
  }
}

/**
 * AI články. Ve frontovém režimu se jen zařadí zpráva (vlastní rozpočet i retry),
 * ve starém režimu se pustí přes ctx.waitUntil jako dosud.
 */
async function dispatchRoundReports(
  env: Bindings,
  leagueId: string,
  calendarId: string,
  gameWeek: number,
  standingsBefore: StandingEntry[],
  opts: LeagueRoundOpts,
): Promise<void> {
  if (!env.GEMINI_API_KEY) return;
  const enqueuedAt = new Date().toISOString();

  if (opts.reportsQueue) {
    await opts.reportsQueue
      .sendBatch([
        { body: { kind: "round_report", leagueId, calendarId, gameWeek, standingsBefore, enqueuedAt } },
        { body: { kind: "ultras_report", calendarId, enqueuedAt } },
      ])
      .catch((e) => logger.error({ module: "league-round" }, "enqueue reports failed", e));
    return;
  }

  // Stará cesta — články jedou uvnitř téže invokace.
  try {
    const { generateAiRoundReport } = await import("../news/ai-reporter");
    const reportPromise = generateAiRoundReport(env.DB, env.GEMINI_API_KEY, leagueId, calendarId, gameWeek, standingsBefore).catch((e) =>
      logger.error({ module: "league-round" }, "AI report failed", e),
    );
    if (opts.ctx) opts.ctx.waitUntil(reportPromise);
    else await reportPromise;
  } catch (e) {
    logger.error({ module: "league-round" }, "AI reporter import failed", e);
  }

  try {
    const { generateUltrasReport } = await import("../news/ultras-report");
    const ultrasPromise = generateUltrasReport(env.DB, env.GEMINI_API_KEY, calendarId).catch((e) =>
      logger.error({ module: "league-round" }, "Ultras report failed", e),
    );
    if (opts.ctx) opts.ctx.waitUntil(ultrasPromise);
    else await ultrasPromise;
  } catch (e) {
    logger.error({ module: "league-round" }, "Ultras reporter import failed", e);
  }
}

/** Události mezi koly pro lidské týmy. */
async function runBetweenRoundEvents(
  db: D1Database,
  results: Array<{ matchId: string; matchType: string; homeScore: number; awayScore: number }>,
  gameWeek: number,
): Promise<void> {
  try {
    const { generateBetweenRoundEvents } = await import("../events/between-rounds");
    const { createRng, cryptoSeed } = await import("../generators/rng");
    const { recordTransaction } = await import("./finance-processor");
    const brRng = createRng(cryptoSeed());

    for (const mr of results) {
      if (mr.matchType === "ai_vs_ai") continue;
      const humanTeamId =
        mr.matchType === "pve_home" || mr.matchType === "pvp"
          ? (await db.prepare("SELECT home_team_id FROM matches WHERE id = ?").bind(mr.matchId).first<{ home_team_id: string }>())?.home_team_id
          : (await db.prepare("SELECT away_team_id FROM matches WHERE id = ?").bind(mr.matchId).first<{ away_team_id: string }>())?.away_team_id;
      if (!humanTeamId) continue;

      const td = await db
        .prepare("SELECT budget, reputation, game_date FROM teams WHERE id = ?")
        .bind(humanTeamId)
        .first<{ budget: number; reputation: number; game_date: string }>();
      const sqRows = await db.prepare("SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')").bind(humanTeamId).all();
      const squad = sqRows.results.map((r: any) => {
        const s = JSON.parse(r.skills);
        const p = JSON.parse(r.personality);
        const lc = JSON.parse(r.life_context);
        return {
          firstName: r.first_name, lastName: r.last_name, age: r.age, position: r.position,
          speed: s.speed ?? 50, technique: s.technique ?? 50, shooting: s.shooting ?? 50, passing: s.passing ?? 50,
          heading: s.heading ?? 50, defense: s.defense ?? 50, goalkeeping: s.goalkeeping ?? 0,
          stamina: s.stamina ?? 50, strength: s.strength ?? 50, discipline: p.discipline ?? 50,
          patriotism: p.patriotism ?? 50, alcohol: p.alcohol ?? 30, temper: p.temper ?? 40,
          injuryProneness: p.injuryProneness ?? 50, occupation: lc.occupation ?? "",
          bodyType: "normal" as const, avatarConfig: {} as any, condition: lc.condition ?? 100, morale: lc.morale ?? 50,
          preferredFoot: "right" as const, preferredSide: "center" as const,
          leadership: p.leadership ?? 30, workRate: p.workRate ?? 50, aggression: p.aggression ?? 40,
          consistency: p.consistency ?? 50, clutch: p.clutch ?? 50,
        };
      });

      const lastWon = mr.matchType === "pve_home" ? mr.homeScore > mr.awayScore : mr.awayScore > mr.homeScore;
      const teamDistrict = await db
        .prepare("SELECT v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.id=?")
        .bind(humanTeamId)
        .first<{ district: string }>()
        .catch((e) => {
          logger.warn({ module: "league-round" }, "Failed to get team district", e);
          return null;
        });
      const brEvents = generateBetweenRoundEvents(brRng, squad, td?.budget ?? 0, td?.reputation ?? 50, lastWon, gameWeek, teamDistrict?.district);

      for (const ev of brEvents) {
        if (ev.effect) {
          const eff = ev.effect;
          if (eff.type === "morale" && eff.value) {
            await db
              .prepare(
                "UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?))) WHERE team_id = ?",
              )
              .bind(eff.value, humanTeamId)
              .run()
              .catch((e) => logger.warn({ module: "league-round" }, "morale effect failed", e));
          }
          if (eff.type === "budget" && eff.value) {
            await recordTransaction(db, humanTeamId, "event", eff.value, ev.title, td?.game_date ?? new Date().toISOString()).catch((e) =>
              logger.warn({ module: "league-round" }, "budget effect failed", e),
            );
          }
          // Pozn.: žádné pravidlo v EVENT_RULES dnes reputační efekt negeneruje
          // (reputace je tam jen vstup). Větev držíme přepojenou na helper, aby
          // případné budoucí pravidlo rovnou zapsalo důvod do auditu.
          if (eff.type === "reputation" && eff.value) {
            const { applyReputationDelta } = await import("../lib/reputation");
            await applyReputationDelta(db, humanTeamId, eff.value, "event", `Událost mezi koly: ${ev.title}`, {
              gameDate: td?.game_date ?? undefined,
            });
          }
          if (eff.type === "player_leave" && eff.playerIndex != null) {
            const leaver = sqRows.results[eff.playerIndex];
            if (leaver) {
              await db
                .prepare("UPDATE players SET status = 'quit' WHERE id = ?")
                .bind(leaver.id)
                .run()
                .catch((e) => logger.warn({ module: "league-round" }, "player_leave effect failed", e));
            }
          }
          if (eff.type === "injury" && eff.playerIndex != null) {
            const injured = sqRows.results[eff.playerIndex];
            if (injured) {
              const days = (eff.duration ?? 1) * 7; // rounds to days
              await db
                .prepare("INSERT OR IGNORE INTO injuries (id, player_id, type, days_remaining) VALUES (?, ?, 'training', ?)")
                .bind(crypto.randomUUID(), injured.id, days)
                .run()
                .catch((e) => logger.warn({ module: "league-round" }, "injury effect failed", e));
            }
          }
          // player_add → creates a free agent offer (shows in transfers)
          if (eff.type === "player_add") {
            try {
              const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
              await maintainFreeAgentPool(db, brRng, new Date());
            } catch (e) {
              logger.warn({ module: "league-round" }, "pool generation for player_add event", e);
            }
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

        const roleConvTitle = sender.title;
        let roleConvId = await db
          .prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
          .bind(humanTeamId, roleConvTitle)
          .first<{ id: string }>()
          .then((r) => r?.id)
          .catch((e) => {
            logger.warn({ module: "league-round" }, "Failed to find role conversation", e);
            return null;
          });
        if (!roleConvId) {
          roleConvId = crypto.randomUUID();
          await db
            .prepare(
              "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
            )
            .bind(roleConvId, humanTeamId, roleConvTitle)
            .run()
            .catch((e) => logger.warn({ module: "league-round" }, "Failed to create role conversation", e));
        }
        await db
          .prepare(
            "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
          )
          .bind(crypto.randomUUID(), roleConvId, sender.name, `${ev.emoji} ${ev.description}`, JSON.stringify({ type: "event", category: ev.category }))
          .run()
          .catch((e) => logger.warn({ module: "league-round" }, "Failed to insert event message", e));
        await db
          .prepare(
            "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
          )
          .bind(`${ev.emoji} ${ev.title}`, roleConvId)
          .run()
          .catch((e) => logger.warn({ module: "league-round" }, "Failed to update conversation unread", e));
      }
    }
  } catch (e) {
    logger.error({ module: "league-round" }, "between-round events failed", e);
  }
}

/** Ad-hoc události pro human týmy. */
async function runAdhocEvents(env: Bindings, db: D1Database, leagueId: string, gameWeek: number): Promise<void> {
  try {
    const { pickRandomAdhocEvent } = await import("./seasonal-events");
    const { createRng: createAdhocRng, cryptoSeed: cryptoSeedAdhoc } = await import("../generators/rng");
    const humanTeams = await db
      .prepare("SELECT t.id, t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.league_id = ? AND t.user_id <> 'ai'")
      .bind(leagueId)
      .all();
    const adhocSeasonRow = await db
      .prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'")
      .first<{ n: number }>()
      .catch((e) => {
        logger.warn({ module: "league-round" }, "adhoc season lookup failed", e);
        return null;
      });
    const adhocSeasonN = adhocSeasonRow?.n ?? null;
    if (adhocSeasonN == null) {
      logger.error({ module: "league-round" }, "adhoc events: žádná aktivní sezóna → přeskočeno (žádný tichý fallback na season 1)");
      return;
    }

    for (const ht of humanTeams.results) {
      const adhocRng = createAdhocRng(cryptoSeedAdhoc());
      const adhocEvent = pickRandomAdhocEvent(adhocRng, gameWeek, ht.district as string);
      if (!adhocEvent) continue;
      await db
        .prepare(
          "INSERT INTO seasonal_events (id, team_id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
        )
        .bind(
          crypto.randomUUID(), ht.id, ht.league_id, adhocEvent.type, adhocEvent.title, adhocEvent.description,
          JSON.stringify(adhocEvent.effects), JSON.stringify(adhocEvent.choices), String(adhocSeasonN), adhocEvent.gameWeek,
        )
        .run()
        .catch((e) => logger.warn({ module: "league-round" }, "adhoc event insert failed", e));

      const { createNotification } = await import("../community/notifications");
      await createNotification(
        db, ht.id as string, "event", `${adhocEvent.title}`, adhocEvent.description ?? "Nová událost v klubu", "/dashboard/events",
        { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db },
      ).catch((e) => logger.warn({ module: "league-round" }, "event notification failed", e));
    }
  } catch (e) {
    logger.error({ module: "league-round" }, "adhoc events failed", e);
  }
}

/** Smaže konverzace k zápasovému dni — posloužily svému účelu. */
async function cleanupMatchDayConversations(db: D1Database, calendarId: string): Promise<void> {
  try {
    const matchConvs = await db
      .prepare(
        "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.team_id IN (SELECT DISTINCT home_team_id FROM matches WHERE calendar_id = ? UNION SELECT DISTINCT away_team_id FROM matches WHERE calendar_id = ?) AND c.type = 'squad_group' AND c.title LIKE '⚽ vs %' AND m.metadata LIKE ?",
      )
      .bind(calendarId, calendarId, `%${calendarId}%`)
      .all()
      .catch((e) => {
        logger.warn({ module: "league-round" }, "Failed to fetch match conversations for cleanup", e);
        return { results: [] };
      });
    for (const conv of matchConvs.results) {
      await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conv.id).run()
        .catch((e) => logger.warn({ module: "league-round" }, "Failed to delete match messages", e));
      await db.prepare("DELETE FROM conversations WHERE id = ?").bind(conv.id).run()
        .catch((e) => logger.warn({ module: "league-round" }, "Failed to delete match conversation", e));
    }
  } catch (e) {
    logger.warn({ module: "league-round" }, "match conversation cleanup failed", e);
  }
}

/**
 * Údržba ligy po zápasovém ticku: spawn celebrity + AI inzeráty na trhu.
 *
 * Dřív běželo jako dvě další globální smyčky ve stejné invokaci jako zápasy
 * (index.ts). Teď je to per liga, takže to škáluje stejně jako zbytek.
 * Běží jen pro ligy s lidským týmem — stejně jako původní dotazy.
 */
export async function processLeagueMaintenance(
  env: Bindings,
  leagueId: string,
): Promise<{ celebritySpawned: boolean; listings: number; durationMs: number; queries: number }> {
  const startedAt = Date.now();
  const counter = { n: 0 };
  const db = countingDb(env.DB, counter);
  let celebritySpawned = false;
  let listings = 0;

  const hasHuman = await db
    .prepare("SELECT 1 FROM teams WHERE league_id = ? AND user_id != 'ai' LIMIT 1")
    .bind(leagueId)
    .first()
    .catch((e) => {
      logger.warn({ module: "league-round" }, "maintenance human check", e);
      return null;
    });
  if (!hasHuman) return { celebritySpawned, listings, durationMs: Date.now() - startedAt, queries: counter.n };

  // ── Celebrity spawn ──
  try {
    const { createRng, cryptoSeed } = await import("../generators/rng");
    const celebRng = createRng(cryptoSeed());
    const existing = await db
      .prepare("SELECT id FROM free_agents WHERE is_celebrity = 1 AND district = (SELECT district FROM leagues WHERE id = ?)")
      .bind(leagueId)
      .first()
      .catch((e) => {
        logger.error({ module: "league-round" }, "celeb check existing", e);
        return null;
      });
    const recent = existing
      ? null
      : await db
          .prepare("SELECT id FROM players WHERE is_celebrity = 1 AND team_id IN (SELECT id FROM teams WHERE league_id = ?)")
          .bind(leagueId)
          .first()
          .catch((e) => {
            logger.error({ module: "league-round" }, "celeb check recent", e);
            return null;
          });
    if (!existing && !recent && celebRng.random() < 0.004) {
      const { spawnCelebrity } = await import("./celebrity-spawn");
      const result = await spawnCelebrity(db, leagueId, celebRng);
      if (result) {
        celebritySpawned = true;
        logger.info({ module: "league-round" }, `celebrity spawned: ${result.name} (${result.type}) in league ${leagueId}`);
      }
    }
  } catch (e) {
    logger.error({ module: "league-round" }, "celebrity spawn failed", e);
  }

  // ── Virtual AI market activity (jen inzeráty — nabídky běží v transfer pressure ticku) ──
  try {
    const { createRng, cryptoSeed } = await import("../generators/rng");
    const marketRng = createRng(cryptoSeed());
    const { generateAiListings } = await import("../transfers/virtual-teams");
    const lg = await db
      .prepare("SELECT district FROM leagues WHERE id = ?")
      .bind(leagueId)
      .first<{ district: string }>()
      .catch((e) => {
        logger.error({ module: "league-round" }, "fetch league district for AI market", e);
        return null;
      });
    if (lg?.district) {
      listings = await generateAiListings(db, lg.district, leagueId, marketRng);
      if (listings > 0) logger.info({ module: "league-round" }, `AI market: ${lg.district} — ${listings} listings`);
    }
  } catch (e) {
    logger.error({ module: "league-round" }, "AI market activity failed", e);
  }

  return { celebritySpawned, listings, durationMs: Date.now() - startedAt, queries: counter.n };
}
