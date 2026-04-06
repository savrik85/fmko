/**
 * Denní tick — logika extrahovaná z index.ts scheduled handleru.
 * Spouští trénink, recovery kondice, injury healing, pitch degradation, morale drift.
 */

import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { simulateTraining } from "./training";
import { logger } from "../lib/logger";

export interface DailyTickEvent {
  type: "training" | "recovery" | "injury_healed" | "pitch" | "morale" | "match" | "day" | "loan_return";
  description: string;
  data?: unknown;
}

export interface DailyTickResult {
  date: string;
  dayOfWeek: number;
  isTrainingDay: boolean;
  events: DailyTickEvent[];
}

/**
 * Execute one day's worth of game simulation.
 */
export async function executeDailyTick(
  env: Bindings,
  gameDate?: Date,
): Promise<DailyTickResult> {
  const now = gameDate ?? new Date();
  // Use GAME DATE for day-of-week, not real date
  // Find any human team's game_date to determine the in-game day
  const gameDateRow = await env.DB.prepare("SELECT game_date FROM teams WHERE user_id != 'ai' AND game_date IS NOT NULL LIMIT 1")
    .first<{ game_date: string }>().catch(() => null);
  const effectiveDate = gameDateRow?.game_date ? new Date(gameDateRow.game_date) : now;
  const dayOfWeek = effectiveDate.getUTCDay();
  const isTrainingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  const events: DailyTickEvent[] = [];
  const tickStart = Date.now();
  logger.info({ module: "daily-tick" }, `START dayOfWeek=${dayOfWeek} training=${isTrainingDay} date=${now.toISOString()}`);

  // ── Training (Mon-Fri, if plan is set) ──
  const teams = await env.DB.prepare(
    "SELECT id, training_type, training_approach, training_sessions FROM teams WHERE user_id != 'ai'"
  ).all();

  for (const team of teams.results) {
    const teamId = team.id as string;

    if (isTrainingDay && team.training_type) {
      try {
        const playersResult = await env.DB.prepare(
          "SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC"
        ).bind(teamId).all();

        const squad = playersResult.results.map((row) => {
          const skills = JSON.parse(row.skills as string);
          const personality = JSON.parse(row.personality as string);
          const lifeContext = JSON.parse(row.life_context as string);
          const physical = row.physical ? JSON.parse(row.physical as string) : {};
          return {
            firstName: row.first_name as string, lastName: row.last_name as string,
            age: row.age as number, position: row.position as "GK" | "DEF" | "MID" | "FWD",
            speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
            passing: skills.passing, heading: skills.heading ?? 0, defense: skills.defense,
            goalkeeping: skills.goalkeeping ?? 0,
            vision: skills.vision ?? 30,
            creativity: skills.creativity ?? 30,
            setPieces: skills.setPieces ?? 30,
            stamina: physical.stamina ?? skills.stamina ?? skills.speed,
            strength: physical.strength ?? skills.strength ?? skills.defense,
            injuryProneness: personality.injuryProneness ?? 50,
            discipline: personality.discipline,
            patriotism: personality.patriotism, alcohol: personality.alcohol,
            temper: personality.temper, occupation: lifeContext.occupation ?? "",
            bodyType: "normal" as const, avatarConfig: {} as any,
            condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
            preferredFoot: "right" as const, preferredSide: "center" as const,
            leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
            aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
            clutch: personality.clutch ?? 50,
          };
        });

        const { calculateEffects } = await import("../equipment/equipment-generator");
        const equip = await env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?")
          .bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "daily-tick" }, "fetch equipment", e); return null; });

        let equipMul = 1.0;
        if (equip) {
          const levels: Record<string, number> = {};
          const conditions: Record<string, number> = {};
          for (const [k, v] of Object.entries(equip)) {
            if (k.endsWith("_condition")) conditions[k] = v as number;
            else if (typeof v === "number" && k !== "id") levels[k] = v;
          }
          equipMul = calculateEffects(levels, conditions).trainingMultiplier;
        }

        // Load manager attributes for training bonuses
        const mgr = await env.DB.prepare("SELECT coaching, discipline, youth_development FROM managers WHERE team_id = ?")
          .bind(teamId).first<{ coaching: number; discipline: number; youth_development: number }>().catch(() => null);
        const mgrBonus = { coaching: mgr?.coaching ?? 40, discipline: mgr?.discipline ?? 40, youthDev: mgr?.youth_development ?? 40 };

        const rng = createRng(now.getTime() + teamId.charCodeAt(0));
        const result = simulateTraining(rng, squad, {
          type: (team.training_type as any) ?? "conditioning",
          approach: (team.training_approach as any) ?? "balanced",
          sessionsPerWeek: (team.training_sessions as number) ?? 2,
        }, undefined, equipMul, mgrBonus);

        const attendanceWithNames = result.attendance.map((a) => ({
          playerId: playersResult.results[a.playerIndex].id as string,
          playerName: `${squad[a.playerIndex].firstName} ${squad[a.playerIndex].lastName}`,
          attended: a.attended,
          reason: a.reason,
        }));
        const improvementsWithNames = result.improvements.map((imp) => ({
          playerId: playersResult.results[imp.playerIndex].id as string,
          playerName: `${squad[imp.playerIndex].firstName} ${squad[imp.playerIndex].lastName}`,
          attribute: imp.attribute,
          change: imp.change,
        }));

        const summary = {
          attendance: attendanceWithNames,
          improvements: improvementsWithNames,
          teamChemistry: result.teamChemistry,
          attendedCount: attendanceWithNames.filter((a) => a.attended).length,
          totalCount: attendanceWithNames.length,
          day: now.toLocaleDateString("cs", { weekday: "long" }),
        };

        await env.DB.prepare(
          "UPDATE teams SET last_training_at = ?, last_training_result = ? WHERE id = ?"
        ).bind(now.toISOString(), JSON.stringify(summary), teamId).run();

        // Persist skill changes to DB + recalculate wages + log training
        for (const imp of result.improvements) {
          const player = squad[imp.playerIndex];
          const playerId = playersResult.results[imp.playerIndex].id as string;
          const currentSkills = JSON.parse(playersResult.results[imp.playerIndex].skills as string);
          const newValue = player[imp.attribute as keyof typeof player] as number;

          // Always write to skills JSON (ensure attribute exists)
          const oldValue = currentSkills[imp.attribute] ?? 0;
          currentSkills[imp.attribute] = newValue;
          await env.DB.prepare("UPDATE players SET skills = ? WHERE id = ?")
            .bind(JSON.stringify(currentSkills), playerId).run();

          // For stamina/strength: also update physical JSON (read path prefers physical)
          if (imp.attribute === "stamina" || imp.attribute === "strength") {
            const currentPhysical = playersResult.results[imp.playerIndex].physical
              ? JSON.parse(playersResult.results[imp.playerIndex].physical as string) : {};
            currentPhysical[imp.attribute] = newValue;
            await env.DB.prepare("UPDATE players SET physical = ? WHERE id = ?")
              .bind(JSON.stringify(currentPhysical), playerId).run();
          }

          // Adjust overall_rating relative to the change (don't recalculate from scratch
          // because initial rating includes hidden_talent bonus that plain skills don't reflect)
          const ratingDelta = imp.change > 0 ? 1 : -1; // +1 or -1 per skill point change
          await env.DB.prepare(
            "UPDATE players SET overall_rating = MAX(1, overall_rating + ?), weekly_wage = ROUND(10 + (MAX(1, overall_rating + ?) / 100.0) * 400) WHERE id = ?"
          ).bind(ratingDelta, ratingDelta, playerId).run();

          // Log to training_log
          await env.DB.prepare(
            "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(playerId, teamId, imp.attribute, oldValue, newValue, imp.change, (team.training_type as string) ?? "conditioning", now.toISOString()).run().catch((e) => logger.warn({ module: "daily-tick" }, "insert training log", e));
        }

        // Training drains condition for attending players
        // Conditioning = light (builds stamina, low drain), tactical = medium, intense drills = heavy
        const drainMap: Record<string, number> = {
          conditioning: 3,
          passing: 4,
          defense: 5,
          shooting: 5,
          technique: 4,
          tactical: 3,
        };
        const condDrain = drainMap[(team.training_type as string)] ?? 4;
        for (const a of result.attendance) {
          if (a.attended) {
            const playerId = playersResult.results[a.playerIndex].id as string;
            await env.DB.prepare(
              `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(5, json_extract(life_context, '$.condition') - ?)) WHERE id = ?`
            ).bind(condDrain, playerId).run().catch((e) => logger.warn({ module: "daily-tick" }, "drain condition after training", e));
          }
        }

        // Update cumulative training attendance
        try {
          const attRow = await env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?")
            .bind(teamId).first<{ training_attendance: string }>().catch(() => null);
          const attData: Record<string, { attended: number; total: number }> = (() => {
            try { return JSON.parse(attRow?.training_attendance ?? "{}"); } catch { return {}; }
          })();
          for (const a of result.attendance) {
            const pid = playersResult.results[a.playerIndex]?.id as string;
            if (!pid) continue;
            if (!attData[pid]) attData[pid] = { attended: 0, total: 0 };
            attData[pid].total++;
            if (a.attended) attData[pid].attended++;
          }
          await env.DB.prepare("UPDATE teams SET training_attendance = ? WHERE id = ?")
            .bind(JSON.stringify(attData), teamId).run();
        } catch (e) {
          logger.warn({ module: "daily-tick" }, "training attendance tracking failed", e);
        }

        events.push({
          type: "training",
          description: `Trénink: ${summary.attendedCount}/${summary.totalCount} hráčů, ${improvementsWithNames.length} zlepšení`,
          data: summary,
        });
      } catch (e) {
        logger.error({ module: "daily-tick" }, `training failed for team ${teamId}`, e);
      }
    }
  }

  // ── Global ticks ──

  // Pitch degradation
  await env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MAX(5, pitch_condition - 1) WHERE pitch_type = 'natural'"
  ).run();
  await env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MAX(10, pitch_condition - 1) WHERE pitch_type = 'hybrid' AND (ABS(RANDOM()) % 2 = 0)"
  ).run();

  // Equipment condition degradation (slow — 1-2 points per day for used items)
  const equipCategories = ["balls", "jerseys", "training_cones", "first_aid", "boots_stock", "bibs", "goalkeeper_gear", "water_bottles", "tactics_board"];
  for (const cat of equipCategories) {
    // Only degrade items with level > 0, by 1 point/day (50% chance)
    await env.DB.prepare(
      `UPDATE equipment SET ${cat}_condition = MAX(5, ${cat}_condition - 1) WHERE ${cat} > 0 AND (ABS(RANDOM()) % 2 = 0)`
    ).run().catch((e) => logger.warn({ module: "daily-tick" }, "equipment condition degradation", e));
  }

  // Injury recovery
  await env.DB.prepare(
    "UPDATE injuries SET days_remaining = days_remaining - 1 WHERE days_remaining > 0"
  ).run();
  const healed = await env.DB.prepare(
    "SELECT p.first_name, p.last_name FROM injuries i JOIN players p ON i.player_id = p.id WHERE i.days_remaining <= 0"
  ).all().catch((e) => { logger.warn({ module: "daily-tick" }, "fetch healed injuries", e); return { results: [] }; });
  await env.DB.prepare("DELETE FROM injuries WHERE days_remaining <= 0").run();

  if (healed.results.length > 0) {
    events.push({
      type: "injury_healed",
      description: `Vyléčeno: ${healed.results.map((r) => `${r.first_name} ${r.last_name}`).join(", ")}`,
    });
  }

  // Condition recovery: stamina-based + age modifier
  // Young players recover faster, older players slower
  await env.DB.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.condition',
      MIN(100, json_extract(life_context, '$.condition') +
        (CASE
          WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 75 THEN 20
          WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 50 THEN 16
          WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 25 THEN 13
          ELSE 10
        END)
        +
        (CASE
          WHEN age <= 21 THEN 3
          WHEN age <= 25 THEN 1
          WHEN age <= 30 THEN 0
          WHEN age <= 35 THEN -1
          ELSE -3
        END)
      ))`
  ).run();
  events.push({ type: "recovery", description: "Regenerace kondice (dle staminy a věku)" });

  // Shower facility bonus: extra condition recovery per team
  try {
    const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
    const stadiums = await env.DB.prepare(
      "SELECT team_id, changing_rooms, showers, refreshments, lighting, stands, parking, fence FROM stadiums"
    ).all();
    for (const row of stadiums.results) {
      const facilities: Record<string, number> = {};
      for (const key of ["changing_rooms", "showers", "refreshments", "lighting", "stands", "parking", "fence"]) {
        facilities[key] = (row[key] as number) ?? 0;
      }
      const fx = calculateFacilityEffects(facilities);
      if (fx.conditionRegenBonus > 0) {
        await env.DB.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition',
            MIN(100, json_extract(life_context, '$.condition') + ?))
          WHERE team_id = ?`
        ).bind(fx.conditionRegenBonus, row.team_id).run();
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "shower bonus failed", e);
  }

  // Morale drift toward 50
  await env.DB.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.morale',
      CASE
        WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
        WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
        ELSE json_extract(life_context, '$.morale')
      END)`
  ).run();
  events.push({ type: "morale", description: "Morálka se stabilizuje" });

  logger.info({ module: "daily-tick" }, "reached game date advancement section");
  // ── Advance game date for ALL teams (including AI) ──
  const allTeams = await env.DB.prepare(
    "SELECT t.id, t.user_id, t.league_id, t.game_date, t.training_type, t.training_sessions, v.size as village_size FROM teams t LEFT JOIN villages v ON t.village_id = v.id"
  ).all();
  for (const team of allTeams.results) {
    const teamId = team.id as string;
    let gameDate = team.game_date as string | null;
    // If game_date is NULL, sync from another team in the same league
    if (!gameDate && team.league_id) {
      const peer = await env.DB.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL LIMIT 1")
        .bind(team.league_id).first<{ game_date: string }>().catch(() => null);
      if (peer?.game_date) {
        gameDate = peer.game_date;
        await env.DB.prepare("UPDATE teams SET game_date = ? WHERE id = ?").bind(gameDate, teamId).run().catch(() => {});
        logger.info({ module: "daily-tick" }, `synced game_date for team ${teamId} from league peer`);
      }
    }
    if (gameDate) {
      // Advance the date FIRST
      const gd = new Date(gameDate);
      gd.setDate(gd.getDate() + 1);
      const newDayOfWeek = gd.getUTCDay();
      const newGameDate = gd.toISOString();

      await env.DB.prepare("UPDATE teams SET game_date = ? WHERE id = ?")
        .bind(newGameDate, teamId).run();

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
              "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled'"
            ).bind(lid, checkDayStart.toISOString(), checkDayEnd.toISOString()).first<{ id: string }>().catch(() => null);
            if (tomorrowMatch) {
              const alreadySent = await env.DB.prepare(
                "SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group') AND metadata LIKE ?"
              ).bind(teamId, `%${tomorrowMatch.id}%`).first().catch(() => null);
              if (!alreadySent) {
                const { seedFromString } = await import("../lib/seed");
                const { generateAbsences } = await import("../events/absence");
                const { generateAttendanceMessage } = await import("../messaging/message-generator");
                const matchRow = await env.DB.prepare(
                  "SELECT m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1"
                ).bind(tomorrowMatch.id, teamId, teamId).first<Record<string, unknown>>().catch(() => null);
                const opponentName = matchRow ? (matchRow.home_team_id === teamId ? matchRow.away_name : matchRow.home_name) as string : "Soupeř";
                const squadRows = await env.DB.prepare(
                  "SELECT id, first_name, last_name, personality, life_context, physical, commute_km FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC"
                ).bind(teamId).all();
                const absRng = createRng(seedFromString(tomorrowMatch.id));
                const absSquad = squadRows.results.map((r) => {
                  const pers = (() => { try { return JSON.parse(r.personality as string); } catch { return {}; } })();
                  const lc = (() => { try { return JSON.parse(r.life_context as string); } catch { return {}; } })();
                  const phys = (() => { try { return JSON.parse(r.physical as string); } catch { return {}; } })();
                  return { firstName: r.first_name as string, lastName: r.last_name as string, age: 25, occupation: lc.occupation ?? "",
                    discipline: pers.discipline ?? 50, patriotism: pers.patriotism ?? 50, alcohol: pers.alcohol ?? 30, temper: pers.temper ?? 40,
                    morale: lc.morale ?? 50, stamina: phys.stamina ?? 50, injuryProneness: pers.injuryProneness ?? 50, commuteKm: (r.commute_km as number) ?? 0 };
                });
                const dayBeforeAbsences = generateAbsences(absRng as any, absSquad, "day_before");
                const absentIds = new Set(dayBeforeAbsences.map((a) => squadRows.results[a.playerIndex]?.id as string));
                const matchConvId = crypto.randomUUID();
                await env.DB.prepare(
                  "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_at, created_at) VALUES (?, ?, 'squad_group', ?, 0, 0, datetime('now'), datetime('now'))"
                ).bind(matchConvId, teamId, `⚽ vs ${opponentName}`).run().catch(() => {});
                await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'user', ?, 'Trenér', ?, ?, datetime('now'))")
                  .bind(crypto.randomUUID(), matchConvId, teamId, `📋 Zítra hrajeme proti ${opponentName}! Kdo může?`, JSON.stringify({ type: "match_announce", calendarId: tomorrowMatch.id }))
                  .run().catch(() => {});
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
                await env.DB.prepare("UPDATE conversations SET unread_count = ?, last_message_text = ?, last_message_at = datetime('now') WHERE id = ?")
                  .bind(msgCount, `📋 ${dayBeforeAbsences.length} omluvených z ${squadRows.results.length}`, matchConvId).run().catch(() => {});
                logger.info({ module: "daily-tick", teamId }, `day_before attendance: ${msgCount} msgs → ⚽ vs ${opponentName}`);
              }
            }
          }
        } catch (e) { logger.warn({ module: "daily-tick" }, "day_before attendance failed", e); }
      }

      // ── Weekly finances (Monday) ──
      if (newDayOfWeek === 1) {
        try {
          const { processWeeklyFinances } = await import("./finance-processor");
          await processWeeklyFinances(env.DB, teamId, newGameDate, (team.village_size as string) ?? "village");
        } catch (e) {
          logger.error({ module: "daily-tick" }, `weekly finances failed for team ${teamId}`, e);
        }
      }

      // ── Training cost (only on actual training days, not every weekday) ──
      if (team.training_type && newDayOfWeek >= 1 && newDayOfWeek <= 5) {
        const sessions = (team.training_sessions as number) ?? 2;
        // Map sessions/week to specific days: 1→Tue, 2→Tue+Thu, 3→Mon+Wed+Fri, 4→Mon+Tue+Thu+Fri, 5→all
        const trainingDayMap: Record<number, number[]> = {
          1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5],
        };
        const trainingDays = trainingDayMap[sessions] ?? trainingDayMap[2];
        if (trainingDays.includes(newDayOfWeek)) {
          try {
            const { processTrainingCost } = await import("./finance-processor");
            await processTrainingCost(env.DB, teamId, newGameDate, (team.village_size as string) ?? "village");
          } catch (e) {
            logger.error({ module: "daily-tick" }, `training cost failed for team ${teamId}`, e);
          }
        }
      }

      // Match simulation is handled by MATCH TICK (separate cron at 18:00)
      // But send match_day absence messages NOW (morning) so user can react before 18:00
      if (team.user_id !== "ai" && team.league_id) {
        try {
          const todayEnd = new Date(gd); todayEnd.setUTCHours(23, 59, 59, 999);
          const todayMatch = await env.DB.prepare(
            "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1"
          ).bind(team.league_id, todayEnd.toISOString()).first<{ id: string }>().catch(() => null);

          if (todayMatch) {
            const alreadySentMatchDay = await env.DB.prepare(
              "SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group') AND metadata LIKE ? AND metadata LIKE '%match_day%'"
            ).bind(teamId, `%${todayMatch.id}%`).first().catch(() => null);

            if (!alreadySentMatchDay) {
              const { seedFromString } = await import("../lib/seed");
              const { generateAbsences } = await import("../events/absence");
              const squadRows = await env.DB.prepare(
                "SELECT id, first_name, last_name, personality, life_context, physical, commute_km FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
              ).bind(teamId).all();

              const mdRng = createRng(seedFromString(todayMatch.id) + 9999);
              const absSquad = squadRows.results.map((r) => {
                const pers = (() => { try { return JSON.parse(r.personality as string); } catch { return {}; } })();
                const lc = (() => { try { return JSON.parse(r.life_context as string); } catch { return {}; } })();
                const phys = (() => { try { return JSON.parse(r.physical as string); } catch { return {}; } })();
                return { firstName: r.first_name as string, lastName: r.last_name as string, age: 25, occupation: lc.occupation ?? "",
                  discipline: pers.discipline ?? 50, patriotism: pers.patriotism ?? 50, alcohol: pers.alcohol ?? 30, temper: pers.temper ?? 40,
                  morale: lc.morale ?? 50, stamina: phys.stamina ?? 50, injuryProneness: pers.injuryProneness ?? 50, commuteKm: (r.commute_km as number) ?? 0 };
              });
              // Find the match conversation created day before
              const matchConvId = await env.DB.prepare(
                "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.team_id = ? AND c.type = 'squad_group' AND m.metadata LIKE ? LIMIT 1"
              ).bind(teamId, `%${todayMatch.id}%`).first<{ id: string }>().then((r) => r?.id).catch(() => null);

              if (matchConvId) {
                // Exclude players who already sent day_before messages
                const alreadyMessaged = await env.DB.prepare(
                  "SELECT sender_id FROM messages WHERE conversation_id = ? AND sender_type = 'player'"
                ).bind(matchConvId).all().catch(() => ({ results: [] }));
                const alreadyIds = new Set(alreadyMessaged.results.map((r) => r.sender_id as string));

                const matchDayAbsences = generateAbsences(mdRng as any, absSquad, "match_day")
                  .filter((a) => {
                    const pid = squadRows.results[a.playerIndex]?.id as string;
                    return pid && !alreadyIds.has(pid);
                  });

                if (matchDayAbsences.length > 0) {
                  await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', 'Systém', ?, ?, datetime('now'))")
                    .bind(crypto.randomUUID(), matchConvId, "⚠️ Nové omluvenky v den zápasu:", JSON.stringify({ type: "match_day_announce", calendarId: todayMatch.id }))
                    .run().catch(() => {});
                  let cnt = 1;
                  for (const a of matchDayAbsences) {
                    const row = squadRows.results[a.playerIndex]; if (!row) continue;
                    await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))")
                      .bind(crypto.randomUUID(), matchConvId, row.id, `${row.first_name} ${row.last_name}`, a.smsText,
                        JSON.stringify({ type: "attendance", response: "no", timing: "match_day", calendarId: todayMatch.id }), cnt * 10,
                      ).run().catch((e) => logger.warn({ module: "daily-tick" }, "match_day absence msg", e));
                    cnt++;
                  }
                  await env.DB.prepare("UPDATE conversations SET unread_count = unread_count + ?, last_message_text = ?, last_message_at = datetime('now') WHERE id = ?")
                    .bind(cnt, `⚠️ ${matchDayAbsences.length} nových omluvenek!`, matchConvId).run().catch(() => {});
                  logger.info({ module: "daily-tick", teamId }, `match_day absences: ${matchDayAbsences.length}`);
                }
              }
            }
          }
        } catch (e) { logger.warn({ module: "daily-tick" }, "match_day absences failed", e); }
      }
    }
  }

  // ── Free agent pool maintenance ──
  try {
    const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
    const faRng = createRng(now.getTime() + 7777);
    const newFa = await maintainFreeAgentPool(env.DB, faRng, now);
    if (newFa > 0) {
      events.push({ type: "day", description: `${newFa} nových volných hráčů v okresu` });
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "free agent pool failed", e);
  }

  // ── Player quitting check ──
  try {
    const quitRng = createRng(now.getTime() + 9999);
    const activePlayers = await env.DB.prepare(
      "SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.life_context, t.name as team_name, t.league_id FROM players p JOIN teams t ON p.team_id = t.id WHERE p.status = 'active' AND t.user_id != 'ai'"
    ).all().catch((e) => { logger.warn({ module: "daily-tick" }, "fetch active players for quit check", e); return { results: [] }; });

    for (const row of activePlayers.results) {
      const personality = (() => { try { return JSON.parse(row.personality as string); } catch { return {}; } })();
      const lifeContext = (() => { try { return JSON.parse(row.life_context as string); } catch { return {}; } })();
      const patriotism = personality.patriotism ?? 50;
      const morale = lifeContext.morale ?? 50;

      if (patriotism < 25 && morale < 20 && quitRng.random() < 0.05) {
        await env.DB.prepare("UPDATE players SET status = 'quit' WHERE id = ?").bind(row.id).run();
        events.push({ type: "day", description: `${row.first_name} ${row.last_name} přestal chodit na tréninky` });

        // News
        const { createTransferNews } = await import("../transfers/transfer-news");
        await createTransferNews(env.DB, row.league_id as string, null, "player_quit", {
          playerName: `${row.first_name} ${row.last_name}`,
          playerAge: row.age as number,
          playerPosition: "",
          teamName: row.team_name as string,
          reason: quitRng.random() < 0.5 ? "Prý ho to nebaví." : "Spoluhráči říkají, že má jiné priority.",
        }).catch((e) => logger.warn({ module: "daily-tick" }, "player quit news", e));
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "player quit check failed", e);
  }

  // ── Loan returns — hráči vracející se z hostování ──
  try {
    const expiredLoans = await env.DB.prepare(
      "SELECT id, first_name, last_name, team_id, loan_from_team_id FROM players WHERE loan_from_team_id IS NOT NULL AND loan_until <= ?"
    ).bind(now.toISOString()).all();
    for (const p of expiredLoans.results) {
      const originalTeamId = p.loan_from_team_id as string;
      const playerId = p.id as string;
      const loanTeamId = p.team_id as string;
      await env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ?")
        .bind(originalTeamId, playerId).run();
      // Close loan contract
      await env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_end' WHERE player_id = ? AND team_id = ? AND join_type = 'loan' AND is_active = 1")
        .bind(now.toISOString(), playerId, loanTeamId).run().catch(() => {});
      logger.info({ module: "daily-tick" }, `loan return: ${p.first_name} ${p.last_name} → team ${originalTeamId}`);
      // News about loan return
      try {
        const { createTransferNews } = await import("../transfers/transfer-news");
        const origTeam = await env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(originalTeamId).first<{ name: string; league_id: string }>();
        const loanTeam = await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(loanTeamId).first<{ name: string }>();
        if (origTeam) {
          await createTransferNews(env.DB, origTeam.league_id ?? "", null, "loan_return", {
            playerName: `${p.first_name} ${p.last_name}`, playerAge: 0,
            playerPosition: "", teamName: origTeam.name, fromTeamName: loanTeam?.name,
          });
        }
      } catch { /* optional */ }
    }
    if (expiredLoans.results.length > 0) {
      events.push({ type: "loan_return", description: `${expiredLoans.results.length} hráčů se vrátilo z hostování` });
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "loan return check failed", e);
  }

  // Celebrity spawn moved to match tick (index.ts) to avoid D1 query limit in daily tick

  // ── Transfer expiry cleanup ──
  try {
    await env.DB.prepare("UPDATE transfer_offers SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .bind(now.toISOString()).run();
    await env.DB.prepare("UPDATE transfer_listings SET status = 'expired' WHERE status = 'active' AND expires_at < ?")
      .bind(now.toISOString()).run();
    await env.DB.prepare("UPDATE player_offers SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .bind(now.toISOString()).run();
    await env.DB.prepare("UPDATE transfer_bids SET status = 'withdrawn' WHERE status = 'pending' AND listing_id IN (SELECT id FROM transfer_listings WHERE status != 'active')")
      .run().catch((e) => logger.warn({ module: "daily-tick" }, "withdraw bids for expired listings", e));
  } catch (e) {
    logger.error({ module: "daily-tick" }, "transfer expiry failed", e);
  }

  const duration = ((Date.now() - tickStart) / 1000).toFixed(1);
  logger.info({ module: "daily-tick" }, `DONE events=${events.length} duration=${duration}s`);
  return { date: now.toISOString(), dayOfWeek, isTrainingDay, events };
}
