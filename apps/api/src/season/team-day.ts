/**
 * Zpracování JEDNOHO herního dne JEDNOHO týmu.
 *
 * Vytaženo z daily-tick.ts, kde to byla smyčka přes VŠECHNY týmy v databázi
 * (včetně AI) v jedné invokaci. Škálovalo to s počtem týmů, ne lig, takže to
 * narazilo na limit workeru dřív než zápasový tick.
 *
 * Volají to dvě cesty:
 *   1. daily tick v režimu "loop" — inline smyčka jako dosud
 *   2. konzumer fronty v režimu "queue" — jedna liga na invokaci
 *
 * IDEMPOTENCE: pondělní finance, trénink ani kabina nemají vlastní pojistku proti
 * dvojímu zaúčtování. V jedné invokaci to řešil KV guard celého ticku; ve frontě
 * (doručení "aspoň jednou") ho musí nahradit nárok per tým a den — tabulka
 * team_day_log s PRIMARY KEY (team_id, game_date).
 */

import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { parseTrainingPlan, type DailyTickEvent } from "./daily-tick";

export type TeamDayStatus = "done" | "skipped";

export interface TeamDayResult {
  status: TeamDayStatus;
  teamId: string;
  events: DailyTickEvent[];
}

export interface TeamDayOpts {
  /**
   * Zapnout nárok na (tým, den) přes team_day_log. Ve frontovém režimu POVINNÉ.
   * V režimu "loop" se nechává vypnutý — tam chrání KV guard celého ticku a
   * zápis navíc by jen zbytečně zatěžoval D1.
   */
  claim?: boolean;
}

/**
 * Atomicky si nárokuje zpracování (tým, den). Vrací false, když už den někdo zpracoval.
 * INSERT OR IGNORE + kontrola changes je stejný princip jako lock kola v league-round.ts.
 */
export async function claimTeamDay(db: D1Database, teamId: string, gameDate: string): Promise<boolean> {
  const res = await db
    .prepare(
      "INSERT OR IGNORE INTO team_day_log (team_id, game_date, processed_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
    )
    .bind(teamId, gameDate)
    .run()
    .catch((e) => {
      logger.error({ module: "team-day", teamId }, "nárok na den selhal", e);
      return null;
    });
  // Při chybě zápisu radši NEZPRACOVAT než riskovat dvojité finance.
  if (!res) return false;
  return res.meta.changes > 0;
}

/** Zpracuje jeden herní den jednoho týmu. */
export async function processTeamDay(
  env: Bindings,
  team: Record<string, unknown>,
  globalGameDate: string | null,
  opts: TeamDayOpts = {},
): Promise<TeamDayResult> {
  const events: DailyTickEvent[] = [];
  const teamId = team.id as string;
  let gameDate = team.game_date as string | null;
  // If game_date is NULL, sync from another team in the same league
  if (!gameDate && team.league_id) {
    const peer = await env.DB.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL LIMIT 1")
      .bind(team.league_id).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "sync game_date peer lookup", e); return null; });
    if (peer?.game_date) {
      gameDate = peer.game_date;
      await env.DB.prepare("UPDATE teams SET game_date = ? WHERE id = ?").bind(gameDate, teamId).run().catch((e) => logger.warn({ module: "daily-tick" }, "sync game_date update", e));
      logger.info({ module: "daily-tick" }, `synced game_date for team ${teamId} from league peer`);
    }
  }
  if (globalGameDate) {
    // ── Nárok na zpracování dne ──
    // Bez tohohle by duplicitně doručená zpráva z fronty zaúčtovala pondělní finance,
    // trénink i kabinu DVAKRÁT (processWeeklyFinances žádnou vlastní pojistku nemá).
    // KV guard v executeDailyTick chrání jen celý tick v jedné invokaci — jakmile se
    // práce rozdělí do fronty, musí mít pojistku každý tým zvlášť.
    if (opts.claim) {
      const claimed = await claimTeamDay(env.DB, teamId, globalGameDate);
      if (!claimed) {
        logger.info({ module: "team-day", teamId }, `den ${globalGameDate} už je zpracovaný — přeskakuji`);
        return { status: "skipped", teamId, events };
      }
    }

    // Datum je nastaveno globálně výše (reálný den + offset). Tady jen odvodíme hodnoty pro navazující per-tým logiku.
    const gd = new Date(globalGameDate);
    const newDayOfWeek = gd.getUTCDay();
    const newGameDate = globalGameDate;
    gameDate = globalGameDate;

    events.push({ type: "day", description: `Herní den: ${gd.toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric" })}` });

    // ── Day-before attendance messages (AFTER advancing date) ──
    // newGameDate = today. Check if TOMORROW (newGameDate+1) has a match.
    // This way the conversation is visible when user sees "zítra" in the header.
    if (team.user_id !== "ai") {
      try {
        const tomorrow = new Date(newGameDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const checkDayStart = new Date(tomorrow); checkDayStart.setUTCHours(0, 0, 0, 0);
        const checkDayEnd = new Date(tomorrow); checkDayEnd.setUTCHours(23, 59, 59, 999);
        const lid = team.league_id as string | null;
        if (lid) {
          const tomorrowMatch = await env.DB.prepare(
            "SELECT id, scheduled_at FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled'"
          ).bind(lid, checkDayStart.toISOString(), checkDayEnd.toISOString()).first<{ id: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "tomorrow match lookup", e); return null; });
          if (tomorrowMatch) {
            const alreadySent = await env.DB.prepare(
              "SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group') AND metadata LIKE ?"
            ).bind(teamId, `%${tomorrowMatch.id}%`).first().catch((e) => { logger.warn({ module: "daily-tick" }, "tomorrow match alreadySent check", e); return null; });
            if (!alreadySent) {
              const { absenceSeedForMatch } = await import("../lib/seed");
              const { generateAbsences } = await import("../events/absence");
              const { generateAttendanceMessage } = await import("../messaging/message-generator");
              const matchRow = await env.DB.prepare(
                "SELECT m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1"
              ).bind(tomorrowMatch.id, teamId, teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "daily-tick" }, "tomorrow match row", e); return null; });
              const opponentName = matchRow ? (matchRow.home_team_id === teamId ? matchRow.away_name : matchRow.home_name) as string : "Soupeř";
              // Vynech zraněné a suspendované — ti nedostanou absence SMS (mají vlastní kanál)
              const squadRows = await env.DB.prepare(
                `SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.life_context, p.physical, p.commute_km, p.is_celebrity
                   FROM players p
                   LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
                   WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
                     AND i.player_id IS NULL AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)
                   ORDER BY p.overall_rating DESC`
              ).bind(teamId).all();
              const absRng = createRng(absenceSeedForMatch({ matchKey: tomorrowMatch.id, teamId, phase: "day_before" }));
              const absSquad = squadRows.results.map((r) => {
                const pers = (() => { try { return JSON.parse(r.personality as string); } catch { return {}; } })();
                const lc = (() => { try { return JSON.parse(r.life_context as string); } catch { return {}; } })();
                const phys = (() => { try { return JSON.parse(r.physical as string); } catch { return {}; } })();
                return { firstName: r.first_name as string, lastName: r.last_name as string, age: (r.age as number) ?? 25, occupation: lc.occupation ?? "",
                  discipline: pers.discipline ?? 50, patriotism: pers.patriotism ?? 50, alcohol: pers.alcohol ?? 30, temper: pers.temper ?? 40,
                  morale: lc.morale ?? 50, stamina: phys.stamina ?? 50, injuryProneness: pers.injuryProneness ?? 50, commuteKm: (r.commute_km as number) ?? 0,
                  transferUnrest: lc.transferUnrest?.level ?? 0,
                  isCelebrity: !!(r.is_celebrity as number), celebrityType: pers.celebrityType, celebrityTier: pers.celebrityTier };
              });
              const teamDistrict = (team.village_district as string | null) ?? undefined;
              const { fetchTeamCommuteMod } = await import("../events/match-absences");
              const { resolveRoundWeather } = await import("./season-weather");
              const dayBeforeAbsences = generateAbsences(absRng as any, absSquad, {
                timing: "day_before", district: teamDistrict,
                commuteMod: await fetchTeamCommuteMod(env.DB, teamId),
                weather: (await resolveRoundWeather(env.DB, tomorrowMatch.id as string))?.weather,
              });
              const absentIds = new Set(dayBeforeAbsences.map((a) => squadRows.results[a.playerIndex]?.id as string));
              const matchConvId = crypto.randomUUID();
              await env.DB.prepare(
                "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_at, created_at) VALUES (?, ?, 'squad_group', ?, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
              ).bind(matchConvId, teamId, `⚽ vs ${opponentName}`).run().catch((e) => logger.warn({ module: "daily-tick" }, "create match conversation", e));
              const totalSquad = squadRows.results.length;
              await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'user', ?, 'Trenér', ?, ?, datetime('now', '+' || ? || ' seconds'))")
                .bind(crypto.randomUUID(), matchConvId, teamId, `📋 Zítra hrajeme proti ${opponentName}! Kdo může?`, JSON.stringify({ type: "match_announce", calendarId: tomorrowMatch.id }), 0)
                .run().catch((e) => logger.warn({ module: "daily-tick" }, "match announce msg", e));
              let msgCount = 1;
              for (const row of squadRows.results) {
                const pid = row.id as string;
                const absence = dayBeforeAbsences.find((a) => squadRows.results[a.playerIndex]?.id === pid);
                const available = !absentIds.has(pid);
                const lc = (() => { try { return JSON.parse(row.life_context as string); } catch { return {}; } })();
                const msg = generateAttendanceMessage(`${row.first_name} ${row.last_name}`, available, lc.condition ?? 100, absRng as any);
                await env.DB.prepare(
                  "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))"
                ).bind(crypto.randomUUID(), matchConvId, pid, msg.senderName, absence ? absence.smsText : msg.body,
                  JSON.stringify({ type: "attendance", response: available ? "yes" : "no", timing: "day_before", calendarId: tomorrowMatch.id }), msgCount * 10,
                ).run().catch((e) => logger.warn({ module: "daily-tick" }, "day_before attendance msg", e));
                msgCount++;
              }
              await env.DB.prepare("UPDATE conversations SET unread_count = ?, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                .bind(msgCount, `📋 ${dayBeforeAbsences.length} omluvených z ${squadRows.results.length}`, matchConvId).run().catch((e) => logger.warn({ module: "daily-tick" }, "day_before conversation update", e));
              logger.info({ module: "daily-tick", teamId }, `day_before attendance: ${msgCount} msgs → ⚽ vs ${opponentName}`);
              // match_reminder push notifikace
              const { createNotification } = await import("../community/notifications");
              await createNotification(env.DB, teamId, "match_reminder", `Zítra hrajeme! Nastav sestavu`, `Zápas proti ${opponentName}`, "/dashboard/match",
                { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB }
              ).catch((e) => logger.warn({ module: "daily-tick" }, "match_reminder notification", e));
            }
          }
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, "day_before attendance failed", e); }

      // ── Interview před zápasem — 2 dny dopředu, každý lidský trenér dostane svůj rozhovor ──
      const interviewLeagueId = team.league_id as string | null;
      if (interviewLeagueId) {
        try {
          const checkDayStart2 = new Date(newGameDate);
          checkDayStart2.setDate(checkDayStart2.getDate() + 2);
          const cs2 = new Date(checkDayStart2); cs2.setUTCHours(0, 0, 0, 0);
          const ce2 = new Date(checkDayStart2); ce2.setUTCHours(23, 59, 59, 999);
          // Pozor: pro tutéž ligu můžou existovat 2 řádky se stejným scheduled_at —
          // aktuální sezóna + osiřelý pozůstatek z minulé sezóny (bez navázaného zápasu).
          // Bereme jen řádek s reálným zápasem (EXISTS) a preferujeme nejnovější sezónu.
          const tomorrowCalEntry = await env.DB.prepare(
            "SELECT sc.id, sc.game_week FROM season_calendar sc WHERE sc.league_id = ? AND sc.scheduled_at BETWEEN ? AND ? AND sc.status = 'scheduled' AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id) ORDER BY sc.season_number DESC LIMIT 1"
          ).bind(interviewLeagueId, cs2.toISOString(), ce2.toISOString()).first<{ id: string; game_week: number }>()
            .catch((e) => { logger.warn({ module: "daily-tick" }, "interview tomorrow cal lookup", e); return null; });
          if (tomorrowCalEntry) {
            const { tryCreateInterviewRequest } = await import("../news/interview-generator");
            await tryCreateInterviewRequest(env.DB, (env as any).GEMINI_API_KEY, {
              leagueId: interviewLeagueId,
              calendarId: tomorrowCalEntry.id,
              gameWeek: tomorrowCalEntry.game_week,
            });
          }
        } catch (e) { logger.warn({ module: "daily-tick" }, "interview creation failed", e); }
      }

      // ── Retry pozápasového článku ──
      // Vlastní větev, protože pozápasový rozhovor má jiný prompt i jiný typ článku.
      // Efekty už jsou zaúčtované z answer endpointu, tady dopisujeme jen text.
      try {
        const pm = await env.DB.prepare(
          `SELECT id, answers, questions, context, league_id, game_week, referee_id
           FROM coach_interviews
           WHERE team_id = ? AND kind = 'post_match' AND status = 'answered' AND article_news_id IS NULL
           ORDER BY created_at DESC LIMIT 1`
        ).bind(teamId).first<{ id: string; answers: string; questions: string; context: string | null; league_id: string; game_week: number; referee_id: string | null }>()
          .catch((e) => { logger.warn({ module: "daily-tick" }, "post-match článek retry lookup", e); return null; });

        const apiKeyPm = (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY;
        if (pm?.answers && pm.context && apiKeyPm) {
          const answers: string[] = JSON.parse(pm.answers);
          const questions: string[] = JSON.parse(pm.questions);
          const ctx = JSON.parse(pm.context);
          const { generatePostMatchArticle } = await import("../news/post-match-interview");
          const { redaktorProRubriku, pokynyProRedaktora, sentimentKeKlubu } = await import("../news/journalists");
          const red = await redaktorProRubriku(env.DB, pm.league_id, "interview", teamId)
            .catch((e) => { logger.warn({ module: "daily-tick" }, "redaktor pro retry", e); return null; });
          const sent = red ? await sentimentKeKlubu(env.DB, red.id, teamId) : 0;
          const art = await generatePostMatchArticle(apiKeyPm, ctx, questions, answers,
            red ? pokynyProRedaktora(red, sent) : "");
          if (art) {
            const mgr = await env.DB.prepare(
              "SELECT m.name AS manager_name, m.avatar AS manager_avatar, t.name AS team_name FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ?"
            ).bind(teamId).first<{ manager_name: string; manager_avatar: string | null; team_name: string }>();
            const nid = crypto.randomUUID();
            // Vztah redaktora se musí posunout i tady. Bez toho by měl tentýž
            // rozhovor jiné důsledky podle toho, jestli článek vyšel hned,
            // nebo až při retry.
            let vztahPM: { popis: string; sentiment: number; dopad?: string } | undefined;
            if (red && art.vztahRedaktor && art.vztahRedaktor.posun !== 0) {
              try {
                const { posunSentiment, popisVztahu, dopadTisku } = await import("../news/journalists");
                const novy = await posunSentiment(env.DB, red.id, teamId,
                  art.vztahRedaktor.posun, art.vztahRedaktor.duvod);
                const dopad = await dopadTisku(env.DB, teamId, novy, `press-${nid}`);
                vztahPM = { popis: `${red.first_name} ${red.last_name}: ${popisVztahu(novy)}`, sentiment: novy, dopad: dopad?.popis };
              } catch (e) { logger.warn({ module: "daily-tick" }, "vztah redaktora při retry", e); }
            }
            await env.DB.prepare(
              "INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, journalist_id, created_at) VALUES (?, ?, ?, 'post_match_interview', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))"
            ).bind(nid, pm.league_id, teamId, art.headline, JSON.stringify({
              managerName: mgr?.manager_name ?? "", teamName: mgr?.team_name ?? "",
              managerAvatar: (() => { try { return mgr?.manager_avatar ? JSON.parse(mgr.manager_avatar) : null; } catch { return null; } })(),
              article: art.article,
              qa: questions.map((q, i) => ({ q, a: answers[i] ?? "" })),
              vztah: vztahPM,
              teamId,
              refereeName: ctx.refereeName ?? null,
              refereeId: pm.referee_id ?? null,
              incidentText: ctx.incident?.text ?? null,
            }), pm.game_week, red?.id ?? null).run();
            await env.DB.prepare("UPDATE coach_interviews SET article_news_id = ? WHERE id = ?")
              .bind(nid, pm.id).run();
            const { notifyPostMatchArticle } = await import("../news/post-match-interview");
            await notifyPostMatchArticle(env.DB, teamId, art.headline);
            logger.info({ module: "daily-tick", teamId }, "pozápasový článek dopsán při retry");
          }
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, "retry pozápasového článku", e); }

      // ── Retry generování článku pro answered rozhovory bez article_news_id ──
      try {
        const pendingArticle = await env.DB.prepare(
          `SELECT ci.id, ci.answers, ci.questions, ci.match_calendar_id, ci.game_week, ci.league_id
           FROM coach_interviews ci
           WHERE ci.team_id = ? AND ci.status = 'answered' AND ci.article_news_id IS NULL
             AND ci.kind = 'pre_match' AND ci.match_calendar_id NOT LIKE 'season-%-wrap'
           ORDER BY ci.created_at DESC LIMIT 1`
        ).bind(teamId).first<{ id: string; answers: string; questions: string; match_calendar_id: string; game_week: number; league_id: string }>()
          .catch((e) => { logger.warn({ module: "daily-tick" }, "interview retry lookup", e); return null; });

        if (pendingArticle?.answers) {
          const answers: string[] = (() => { try { return JSON.parse(pendingArticle.answers); } catch { return []; } })();
          const questions: string[] = (() => { try { return JSON.parse(pendingArticle.questions); } catch { return []; } })();
          if (answers.length > 0 && questions.length > 0) {
            const managerRow = await env.DB.prepare(
              "SELECT m.name as manager_name, m.avatar as manager_avatar, t.name as team_name, t.league_id FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ?"
            ).bind(teamId).first<{ manager_name: string; manager_avatar: string | null; team_name: string; league_id: string }>()
              .catch((e) => { logger.warn({ module: "daily-tick" }, "interview retry load manager", e); return null; });
            const calRow = await env.DB.prepare(
              `SELECT m.home_team_id, m.away_team_id, ht.name as home_name, at.name as away_name
               FROM matches m JOIN teams ht ON m.home_team_id = ht.id JOIN teams at ON m.away_team_id = at.id
               WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1`
            ).bind(pendingArticle.match_calendar_id, teamId, teamId)
              .first<{ home_team_id: string; away_team_id: string; home_name: string; away_name: string }>()
              .catch((e) => { logger.warn({ module: "daily-tick" }, "interview retry load cal", e); return null; });

            if (managerRow) {
              const opponentName = calRow ? (calRow.home_team_id === teamId ? calRow.away_name : calRow.home_name) : "soupeř";
              const qa = questions.map((q, i) => ({ q, a: answers[i] ?? "" }));
              const { generateInterviewArticle } = await import("../news/interview-generator");
              const article = await generateInterviewArticle((env as any).GEMINI_API_KEY, qa, managerRow.manager_name, managerRow.team_name, opponentName);
              if (article) {
                const newsId = crypto.randomUUID();
                const managerAvatar = (() => { try { return managerRow.manager_avatar ? JSON.parse(managerRow.manager_avatar) : null; } catch { return null; } })();
                const newsBody = JSON.stringify({ managerName: managerRow.manager_name, managerAvatar, teamName: managerRow.team_name, article: article.body, qa });
                await env.DB.prepare(
                  "INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, created_at) VALUES (?, ?, ?, 'interview', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
                ).bind(newsId, managerRow.league_id, teamId, article.headline, newsBody, pendingArticle.game_week).run()
                  .catch((e) => { logger.warn({ module: "daily-tick" }, "insert retry interview news", e); });
                await env.DB.prepare("UPDATE coach_interviews SET article_news_id = ? WHERE id = ?")
                  .bind(newsId, pendingArticle.id).run()
                  .catch((e) => { logger.warn({ module: "daily-tick" }, "update retry interview article_news_id", e); });
                logger.info({ module: "daily-tick", teamId }, `interview article retry OK -> ${newsId}`);
              }
            }
          }
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, "interview article retry failed", e); }
    }

    // ── Sezónní události bez voleb (Obecní zpravodaj apod.) ──
    // Dřív dostávaly status 'active' a jejich efekty se NIKDY neaplikovaly, přestože je
    // UI hráči ukazovalo. Teď je vyřeší tick, jakmile jejich herní týden nastane.
    if (team.user_id !== "ai" && team.league_id) {
      try {
        const { resolveDueAutoEvents } = await import("./event-effects");
        const seasonRow = await env.DB.prepare(
          "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1",
        ).first<{ number: number }>();
        if (seasonRow) {
          const weekRow = await env.DB.prepare(
            "SELECT MAX(game_week) as gw FROM season_calendar WHERE league_id = ? AND status = 'simulated' AND season_number = ?",
          ).bind(team.league_id, seasonRow.number).first<{ gw: number | null }>();
          const resolvedEvents = await resolveDueAutoEvents(
            env.DB, teamId, weekRow?.gw ?? 0, newGameDate, String(seasonRow.number),
          );
          for (const ev of resolvedEvents) {
            const summary = ev.effects.map((e) => e.description).filter(Boolean).join(" · ");
            const { createNotification } = await import("../community/notifications");
            await createNotification(env.DB, teamId, "event", ev.title, summary || ev.description, "/dashboard/events",
              { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB },
            ).catch((e) => logger.warn({ module: "daily-tick" }, "auto event notification", e));
          }
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, `auto seasonal events failed for team ${teamId}`, e); }
    }

    // ── Weekly finances (Monday) ──
    if (newDayOfWeek === 1) {
      try {
        const { processWeeklyFinances } = await import("./finance-processor");
        await processWeeklyFinances(env.DB, teamId, newGameDate, (team.village_size as string) ?? "village");

        // Kořaly — finanční milníky
        const budgetRow = await env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
        if (budgetRow) {
          const { checkFinanceAchievements } = await import("../services/achievements");
          await checkFinanceAchievements(env.DB, teamId, budgetRow.budget);
        }
      } catch (e) {
        logger.error({ module: "daily-tick" }, `weekly finances failed for team ${teamId}`, e);
      }
    }

    // ── Klubová reputace: komunita a útlum (pondělí) ──
    // Rodáci v kádru a přízeň obce hýbou reputací obousměrně, útlum sráží kluby,
    // které měsíc nic nedokázaly. Bez záporné složky reputace jen roste — proto
    // dnes většina týmů sedí přesně na výchozí 50.
    if (newDayOfWeek === 1 && team.user_id !== "ai") {
      try {
        const { applyMonthlyCommunityReputation, applyReputationDecay } = await import("./reputation-sources");
        const { mapVillageSize } = await import("./finance-processor");
        await applyMonthlyCommunityReputation(env.DB, teamId, newGameDate);
        await applyReputationDecay(env.DB, teamId, mapVillageSize((team.village_size as string) ?? "village"), newGameDate);
      } catch (e) { logger.warn({ module: "daily-tick" }, `reputation sources failed for team ${teamId}`, e); }
    }

    // ── Kabina & frakce (pondělí) — tahoun/potížista + rivalové/parťáci upraví morálku kádru ──
    if (newDayOfWeek === 1) {
      try {
        const { processKabina } = await import("./kabina");
        const kab = await processKabina(env.DB, teamId);
        // Lidský tým: čas od času zpráva do kabiny, ať je dynamika vidět (ne každý týden — nespamovat).
        if (kab.applied && team.user_id !== "ai" && (kab.tahoun || kab.potizista) && Math.random() < 0.4) {
          const parts: string[] = [];
          if (kab.tahoun) parts.push(`${kab.tahoun.name} drží partu`);
          if (kab.potizista) parts.push(`${kab.potizista.name} dělá v kabině dusno`);
          const { createNotification } = await import("../community/notifications");
          await createNotification(env.DB, teamId, "event", "🧢 Kabina", `${parts.join(" · ")} (nálada ${kab.mood})`, "/dashboard/kadr",
            { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB },
          ).catch((e) => logger.warn({ module: "daily-tick" }, "kabina notification", e));
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, `kabina failed for team ${teamId}`, e); }
    }

    // ── Training cost (only on actual training days that ran — custom training_days
    // override default mapping, smart-skip se kontroluje u top loop a tady musíme
    // replikovat stejné podmínky, aby se náklad netáhl při skipnutém tréninku) ──
    const costPlan = parseTrainingPlan(team.training_plan as string | null, teamId);
    if ((team.training_type || costPlan) && newDayOfWeek >= 1 && newDayOfWeek <= 5) {
      const sessions = (team.training_sessions as number) ?? 2;
      const trainingDayMap: Record<number, number[]> = {
        1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5],
      };
      let customDays: number[] | null = null;
      if (team.training_days) {
        try {
          const parsed = JSON.parse(team.training_days as string);
          if (Array.isArray(parsed) && parsed.every((d) => typeof d === "number" && d >= 0 && d <= 6)) {
            customDays = parsed;
          }
        } catch (e) { logger.warn({ module: "daily-tick", teamId }, "parse training_days for cost", e); }
      }
      // Dny z týdenního plánu mají přednost — stejné pořadí jako u samotného tréninku výše,
      // jinak by se náklad strhl v den, kdy se netrénovalo (nebo naopak chyběl).
      const planDaysForCost = costPlan ? Object.keys(costPlan).map(Number).filter((d) => d >= 0 && d <= 6) : [];
      const trainingDays = planDaysForCost.length > 0
        ? planDaysForCost
        : (customDays && customDays.length > 0) ? customDays : (trainingDayMap[sessions] ?? trainingDayMap[2]);

      if (trainingDays.includes(newDayOfWeek)) {
        // Trénuje se každý nastavený den, takže se za každý i platí (dřív odpadalo
        // spolu s automatickým volnem před zápasem).
        {
          try {
            const { processTrainingCost } = await import("./finance-processor");
            await processTrainingCost(env.DB, teamId, newGameDate, (team.village_size as string) ?? "village");
          } catch (e) {
            logger.error({ module: "daily-tick" }, `training cost failed for team ${teamId}`, e);
          }
        }
      }
    }

    // Match simulation is handled by MATCH TICK (separate cron at 18:00)
    // But send match_day absence messages NOW (morning) so user can react before 18:00
    if (team.user_id !== "ai" && team.league_id) {
      try {
        const todayEnd = new Date(gd); todayEnd.setUTCHours(23, 59, 59, 999);
        const todayMatch = await env.DB.prepare(
          "SELECT id, scheduled_at FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1"
        ).bind(team.league_id, todayEnd.toISOString()).first<{ id: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "today match lookup", e); return null; });

        if (todayMatch) {
          const alreadySentMatchDay = await env.DB.prepare(
            "SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group') AND metadata LIKE ? AND metadata LIKE '%match_day%'"
          ).bind(teamId, `%${todayMatch.id}%`).first().catch((e) => { logger.warn({ module: "daily-tick" }, "today match already sent check", e); return null; });

          if (!alreadySentMatchDay) {
            const { absenceSeedForMatch } = await import("../lib/seed");
            const { generateAbsences } = await import("../events/absence");
            // Vyloučit zraněné a suspendované. ORDER BY MUSÍ být shodné se všemi ostatními místy
            // (match-runner, next-match preview, day-before SMS) — jinak RNG indexuje do různě
            // seřazeného pole a výsledky se liší.
            const squadRows = await env.DB.prepare(
              `SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.life_context, p.physical, p.commute_km, p.is_celebrity
                 FROM players p
                 LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
                 WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
                   AND i.player_id IS NULL AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)
                 ORDER BY p.overall_rating DESC`
            ).bind(teamId).all();

            // match_day phase má vlastní seed (offset), day_before a match_day tedy produkují
            // disjoint RNG streamy → hráč nemůže být označen v obou (jinak by dostal dva omluvné SMS).
            const mdRng = createRng(absenceSeedForMatch({ matchKey: todayMatch.id, teamId, phase: "match_day" }));
            const absSquad = squadRows.results.map((r) => {
              const pers = (() => { try { return JSON.parse(r.personality as string); } catch { return {}; } })();
              const lc = (() => { try { return JSON.parse(r.life_context as string); } catch { return {}; } })();
              const phys = (() => { try { return JSON.parse(r.physical as string); } catch { return {}; } })();
              return { firstName: r.first_name as string, lastName: r.last_name as string, age: (r.age as number) ?? 25, occupation: lc.occupation ?? "",
                discipline: pers.discipline ?? 50, patriotism: pers.patriotism ?? 50, alcohol: pers.alcohol ?? 30, temper: pers.temper ?? 40,
                morale: lc.morale ?? 50, stamina: phys.stamina ?? 50, injuryProneness: pers.injuryProneness ?? 50, commuteKm: (r.commute_km as number) ?? 0,
                transferUnrest: lc.transferUnrest?.level ?? 0,
                isCelebrity: !!(r.is_celebrity as number), celebrityType: pers.celebrityType, celebrityTier: pers.celebrityTier };
            });
            // Find the match conversation created day before
            const matchConvId = await env.DB.prepare(
              "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.team_id = ? AND c.type = 'squad_group' AND m.metadata LIKE ? LIMIT 1"
            ).bind(teamId, `%${todayMatch.id}%`).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "daily-tick" }, "match_day find conversation", e); return null; });

            if (matchConvId) {
              // Exclude players who already sent day_before messages
              const alreadyMessaged = await env.DB.prepare(
                "SELECT sender_id FROM messages WHERE conversation_id = ? AND sender_type = 'player'"
              ).bind(matchConvId).all().catch(() => ({ results: [] }));
              const alreadyIds = new Set(alreadyMessaged.results.map((r) => r.sender_id as string));

              const teamDistrictMd = (team.village_district as string | null) ?? undefined;
              const { fetchTeamCommuteMod: fetchVanModMd } = await import("../events/match-absences");
              const { resolveRoundWeather: resolveMdWeather } = await import("./season-weather");
              const matchDayAbsences = generateAbsences(mdRng as any, absSquad, {
                timing: "match_day", district: teamDistrictMd,
                commuteMod: await fetchVanModMd(env.DB, teamId),
                weather: (await resolveMdWeather(env.DB, todayMatch.id as string))?.weather,
              })
                .filter((a) => {
                  const pid = squadRows.results[a.playerIndex]?.id as string;
                  return pid && !alreadyIds.has(pid);
                });

              if (matchDayAbsences.length > 0) {
                const totalMatchDay = matchDayAbsences.length;
                await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', 'Systém', ?, ?, datetime('now', '+' || ? || ' seconds'))")
                  .bind(crypto.randomUUID(), matchConvId, "⚠️ Nové omluvenky v den zápasu:", JSON.stringify({ type: "match_day_announce", calendarId: todayMatch.id }), (totalMatchDay + 1) * 10)
                  .run().catch((e) => logger.warn({ module: "daily-tick" }, "match_day announce insert", e));
                let cnt = 1;
                for (const a of matchDayAbsences) {
                  const row = squadRows.results[a.playerIndex]; if (!row) continue;
                  await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))")
                    .bind(crypto.randomUUID(), matchConvId, row.id, `${row.first_name} ${row.last_name}`, a.smsText,
                      JSON.stringify({ type: "attendance", response: "no", timing: "match_day", calendarId: todayMatch.id }), cnt * 10,
                    ).run().catch((e) => logger.warn({ module: "daily-tick" }, "match_day absence msg", e));
                  cnt++;
                }
                await env.DB.prepare("UPDATE conversations SET unread_count = unread_count + ?, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
                  .bind(cnt, `⚠️ ${matchDayAbsences.length} nových omluvenek!`, matchConvId).run().catch((e) => logger.warn({ module: "daily-tick" }, "match_day conversation update", e));
                logger.info({ module: "daily-tick", teamId }, `match_day absences: ${matchDayAbsences.length}`);
              }
            }
          }
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, "match_day absences failed", e); }
    }
  }

  return { status: "done", teamId, events };
}

/**
 * Zpracuje herní den pro všechny týmy jedné ligy — jedna zpráva z fronty = jedna liga.
 *
 * Granularita "liga" je zvolená schválně: velikost ligy je konstantní (~14 týmů),
 * takže práce na jednu invokaci je konstantní bez ohledu na to, kolik lig hra má.
 * Per tým by to bylo taky správně, ale zbytečně tisíce zpráv denně.
 */
export async function processLeagueDay(
  env: Bindings,
  leagueId: string,
  globalGameDate: string,
): Promise<{ leagueId: string; teams: number; skipped: number; durationMs: number }> {
  const startedAt = Date.now();
  const rows = await env.DB.prepare(
    "SELECT t.id, t.user_id, t.league_id, t.game_date, t.training_type, t.training_sessions, t.training_days, t.training_plan, v.size as village_size, v.district as village_district, v.population as village_population FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.league_id = ?",
  )
    .bind(leagueId)
    .all<Record<string, unknown>>();

  let processed = 0;
  let skipped = 0;
  for (const team of rows.results) {
    const result = await processTeamDay(env, team, globalGameDate, { claim: true });
    if (result.status === "skipped") skipped++;
    else processed++;
  }

  const durationMs = Date.now() - startedAt;
  logger.info(
    { module: "team-day" },
    `liga ${leagueId}: den zpracován pro ${processed} týmů (${skipped} přeskočeno), ${durationMs} ms`,
  );
  return { leagueId, teams: processed, skipped, durationMs };
}
