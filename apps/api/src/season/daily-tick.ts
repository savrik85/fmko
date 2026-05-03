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
    .first<{ game_date: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "load game_date failed", e); return null; });
  const effectiveDate = gameDateRow?.game_date ? new Date(gameDateRow.game_date) : now;

  // Idempotency: zabránit dvojitému spuštění pro stejný herní den
  // Klíč je aktuální game_date (před posunem), takže druhé spuštění vidí novou hodnotu a přeskočí.
  const todayKey = effectiveDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const alreadyRan = await env.CACHE_KV.get(`daily-tick:${todayKey}`).catch((e) => { logger.warn({ module: "daily-tick" }, "read tick KV flag failed", e); return null; });
  if (alreadyRan) {
    logger.warn({ module: "daily-tick" }, `SKIP — tick for ${todayKey} already ran`);
    return { date: effectiveDate.toISOString(), dayOfWeek: effectiveDate.getUTCDay(), isTrainingDay: false, events: [] };
  }
  // Uložit příznak s TTL 36h (pokryje případ posunu na další den)
  await env.CACHE_KV.put(`daily-tick:${todayKey}`, "1", { expirationTtl: 60 * 60 * 36 }).catch((e) => logger.warn({ module: "daily-tick" }, "set tick KV flag failed", e));

  const dayOfWeek = effectiveDate.getUTCDay();
  const isTrainingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  const events: DailyTickEvent[] = [];
  const advancedLeagues = new Set<string>();
  const tickStart = Date.now();
  logger.info({ module: "daily-tick" }, `START dayOfWeek=${dayOfWeek} training=${isTrainingDay} date=${now.toISOString()}`);

  // Nový den: vyčistit včerejší absence (jednodenní flag v life_context.absence)
  await env.DB.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.absence') WHERE json_extract(life_context, '$.absence') IS NOT NULL"
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "clear yesterday absences", e));

  // Včerejší kocovina vyprchá — flag se nastavuje v match-runner po výhře, trvá 1 herní den.
  await env.DB.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.hangover') WHERE json_extract(life_context, '$.hangover') IS NOT NULL"
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "clear yesterday hangovers", e));

  // Retention condition_log — udržujeme posledních 60 dní per hráč, jinak by tabulka rostla bez limitu.
  await env.DB.prepare(
    "DELETE FROM condition_log WHERE created_at < datetime('now', '-60 days')",
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "condition_log retention", e));

  // ── Týdenní cyklus obce: vyprší staré brigády a v pondělí se generují nové ──
  try {
    const {
      expireOldBrigades, generateWeeklyBrigades,
      expirePetitions, generateMonthlyPetitions,
      expireInvestments, generateMonthlyInvestments,
      expirePubEncounters, generatePubEncounters,
    } = await import("./village-processor");
    const expired = await expireOldBrigades(env.DB, effectiveDate.toISOString());
    if (expired > 0) {
      logger.info({ module: "daily-tick" }, `${expired} brigád vypršelo`);
    }
    const ignoredPetitions = await expirePetitions(env.DB, effectiveDate.toISOString());
    if (ignoredPetitions > 0) {
      logger.info({ module: "daily-tick" }, `${ignoredPetitions} petic ignorováno`);
    }
    const expiredInv = await expireInvestments(env.DB, effectiveDate.toISOString());
    if (expiredInv > 0) {
      logger.info({ module: "daily-tick" }, `${expiredInv} investic vypršelo`);
    }
    const expiredPub = await expirePubEncounters(env.DB, effectiveDate.toISOString());
    if (expiredPub > 0) {
      logger.info({ module: "daily-tick" }, `${expiredPub} pub encounters vypršelo`);
    }
    if (dayOfWeek === 1) {
      const { generated, skipped } = await generateWeeklyBrigades(env.DB, effectiveDate.toISOString());
      logger.info({ module: "daily-tick" }, `brigády: ${generated} nových, ${skipped} obcí přeskočeno`);
      const petitionRes = await generateMonthlyPetitions(env.DB, effectiveDate.toISOString());
      if (petitionRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `petice: ${petitionRes.generated} nových`);
      }
      const invRes = await generateMonthlyInvestments(env.DB, effectiveDate.toISOString());
      if (invRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `investice: ${invRes.generated} nových`);
      }
      const pubRes = await generatePubEncounters(env.DB, effectiveDate.toISOString());
      if (pubRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `pub encounters: ${pubRes.generated} nových`);
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "village brigade cycle failed", e);
  }

  // ── Training (Mon-Fri, if plan is set) ──
  const teams = await env.DB.prepare(
    "SELECT id, training_type, training_approach, training_sessions FROM teams WHERE user_id != 'ai'"
  ).all();

  for (const team of teams.results) {
    const teamId = team.id as string;

    if (isTrainingDay && team.training_type) {
      try {
        // Vyloučit zraněné — zraněný hráč netrenuje (předtím byl pre-existing bug, šel do simulátoru).
        const playersResult = await env.DB.prepare(
          `SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
             AND id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)
           ORDER BY overall_rating DESC`,
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
            isCelebrity: !!(row.is_celebrity as number), celebrityType: personality.celebrityType,
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
          const eff = calculateEffects(levels, conditions);
          equipMul = eff.trainingMultiplier;
          // Tactics training dostává navíc bonus z bibs + tactics_board (jinak by se nikde neaplikoval)
          if ((team.training_type as string) === "tactics") {
            equipMul *= 1.0 + eff.tacticsTrainingBonus;
          }
        }

        // Load manager attributes for training bonuses
        const mgr = await env.DB.prepare("SELECT coaching, discipline, youth_development FROM managers WHERE team_id = ?")
          .bind(teamId).first<{ coaching: number; discipline: number; youth_development: number }>().catch((e) => { logger.warn({ module: "daily-tick" }, "load manager for training", e); return null; });
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

        // Tactics training → +2 pro aktuálně preferovanou formaci (nejnovější uložená lineup)
        if ((team.training_type as string) === "tactics") {
          try {
            const lastLineup = await env.DB.prepare(
              "SELECT formation FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1"
            ).bind(teamId).first<{ formation: string }>();
            const form = lastLineup?.formation;
            if (form) {
              const { applyTrainingBoost } = await import("../engine/chemistry");
              await applyTrainingBoost(env.DB, teamId, form);
            }
          } catch (e) {
            logger.warn({ module: "daily-tick" }, "tactics training boost", e);
          }
        }

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
        const { logConditionStmt } = await import("../lib/condition-log");
        for (const a of result.attendance) {
          const playerRow = playersResult.results[a.playerIndex];
          const playerId = playerRow.id as string;
          if (a.attended) {
            // Pre-fetch starou condition pro log entry — single round-trip stačí, condDrain je deterministický.
            const oldCondLc = (() => { try { return JSON.parse(playerRow.life_context as string); } catch { return null; } })();
            const oldCond = oldCondLc?.condition ?? 100;
            const newCond = Math.max(5, oldCond - condDrain);
            const stmts: D1PreparedStatement[] = [
              env.DB.prepare(
                `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(5, json_extract(life_context, '$.condition') - ?)) WHERE id = ?`,
              ).bind(condDrain, playerId),
            ];
            if (newCond !== oldCond) {
              stmts.push(logConditionStmt(env.DB, playerId, teamId, oldCond, newCond, "training", `Trénink: ${team.training_type}`));
            }
            await env.DB.batch(stmts).catch((e) => logger.warn({ module: "daily-tick" }, "drain condition after training", e));
          } else if (a.reason) {
            // Neúčast → uložit absence na life_context (vyčistí se následující den)
            const absencePayload = JSON.stringify({ reason: a.reason, category: "training", date: now.toISOString().slice(0, 10) });
            await env.DB.prepare(
              `UPDATE players SET life_context = json_set(life_context, '$.absence', json(?)) WHERE id = ?`
            ).bind(absencePayload, playerId).run().catch((e) => logger.warn({ module: "daily-tick" }, "set training absence", e));
          }
        }

        // Update cumulative training attendance
        try {
          const attRow = await env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?")
            .bind(teamId).first<{ training_attendance: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "load training_attendance", e); return null; });
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
  // newCondSql musí být IDENTICKÝ se SQL v UPDATE — log se počítá ze stejného výrazu.
  const recoveryNewCondSql = `MIN(100, json_extract(life_context, '$.condition') +
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
    END))`;
  // Log před UPDATE (žádné race v rámci jednoho ticku — daily-tick je idempotentní)
  await env.DB.prepare(
    `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
     SELECT id, team_id,
       json_extract(life_context, '$.condition'),
       ${recoveryNewCondSql},
       ${recoveryNewCondSql} - json_extract(life_context, '$.condition'),
       'recovery', 'Denní regenerace'
     FROM players
     WHERE json_extract(life_context, '$.condition') IS NOT NULL
       AND ${recoveryNewCondSql} != json_extract(life_context, '$.condition')`,
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "log recovery", e));
  await env.DB.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.condition', ${recoveryNewCondSql})`,
  ).run();
  events.push({ type: "recovery", description: "Regenerace kondice (dle staminy a věku)" });

  // Shower facility bonus: extra condition recovery per team
  try {
    const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
    const stadiums = await env.DB.prepare(
      "SELECT team_id, changing_rooms, showers, refreshments, stands, parking, fence FROM stadiums"
    ).all();
    for (const row of stadiums.results) {
      const facilities: Record<string, number> = {};
      for (const key of ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence"]) {
        facilities[key] = (row[key] as number) ?? 0;
      }
      const fx = calculateFacilityEffects(facilities);
      if (fx.conditionRegenBonus > 0) {
        await env.DB.prepare(
          `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
           SELECT id, team_id,
             json_extract(life_context, '$.condition'),
             MIN(100, json_extract(life_context, '$.condition') + ?),
             MIN(100, json_extract(life_context, '$.condition') + ?) - json_extract(life_context, '$.condition'),
             'facility', 'Bonus z vybavení (sprchy)'
           FROM players
           WHERE team_id = ?
             AND json_extract(life_context, '$.condition') IS NOT NULL
             AND MIN(100, json_extract(life_context, '$.condition') + ?) != json_extract(life_context, '$.condition')`,
        ).bind(fx.conditionRegenBonus, fx.conditionRegenBonus, row.team_id, fx.conditionRegenBonus)
          .run().catch((e) => logger.warn({ module: "daily-tick" }, "log facility regen", e));
        await env.DB.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition',
            MIN(100, json_extract(life_context, '$.condition') + ?))
          WHERE team_id = ?`,
        ).bind(fx.conditionRegenBonus, row.team_id).run();
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "shower bonus failed", e);
  }

  // ── Random life events ── (vesnické +/-, cooldown 5 dní per hráč, ~2% per hráč/den)
  try {
    const { applyRandomLifeEvents } = await import("./random-events");
    const r = await applyRandomLifeEvents(env.DB);
    if (r.applied > 0) events.push({ type: "recovery", description: `Životní události: ${r.applied} hráčů` });
  } catch (e) {
    logger.error({ module: "daily-tick" }, "random life events", e);
  }

  // (AI player chats mají vlastní cron 0 14 * * * v index.ts — nespouštět tady)

  // ── Hospoda U Pralesa ── generuj večerní session pro lidské týmy (idempotentní per game_date)
  try {
    const { generatePubSessionsForAllTeams } = await import("./pub");
    const r = await generatePubSessionsForAllTeams(env.DB, todayKey);
    if (r.sessionsCreated > 0) events.push({ type: "recovery", description: `Hospoda: ${r.sessionsCreated} session` });
  } catch (e) {
    logger.error({ module: "daily-tick" }, "pub sessions", e);
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

  // Fans satisfaction drift toward loyalty (1 bod denně)
  await env.DB.prepare(
    `UPDATE fans SET satisfaction = CASE
       WHEN satisfaction > loyalty + 1 THEN satisfaction - 1
       WHEN satisfaction < loyalty - 1 THEN satisfaction + 1
       ELSE satisfaction
     END, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "fans satisfaction drift", e));

  // Fans loyalty slowly tracks team reputation (1 bod denně)
  await env.DB.prepare(
    `UPDATE fans SET loyalty = CASE
       WHEN (SELECT reputation FROM teams WHERE teams.id = fans.team_id) > loyalty THEN MIN(100, loyalty + 1)
       WHEN (SELECT reputation FROM teams WHERE teams.id = fans.team_id) < loyalty THEN MAX(0, loyalty - 1)
       ELSE loyalty
     END`,
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "fans loyalty drift", e));

  logger.info({ module: "daily-tick" }, "reached game date advancement section");
  // ── Advance game date for ALL teams (including AI) ──
  const allTeams = await env.DB.prepare(
    "SELECT t.id, t.user_id, t.league_id, t.game_date, t.training_type, t.training_sessions, v.size as village_size, v.district as village_district, v.population as village_population FROM teams t LEFT JOIN villages v ON t.village_id = v.id"
  ).all();
  for (const team of allTeams.results) {
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
    if (gameDate) {
      // Advance the date — bulk update per league to keep all teams in sync
      const gd = new Date(gameDate);
      gd.setDate(gd.getDate() + 1);
      const newDayOfWeek = gd.getUTCDay();
      const newGameDate = gd.toISOString();

      // Skip if this league was already advanced by another team in this tick
      const leagueKey = team.league_id as string | null;
      if (leagueKey && advancedLeagues.has(leagueKey)) {
        // Already advanced — just read the new date for this team's logic below
      } else if (leagueKey) {
        await env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
          .bind(newGameDate, leagueKey).run()
          .catch((e) => logger.warn({ module: "daily-tick" }, "bulk advance league date", e));
        advancedLeagues.add(leagueKey);
      } else {
        await env.DB.prepare("UPDATE teams SET game_date = ? WHERE id = ?")
          .bind(newGameDate, teamId).run()
          .catch((e) => logger.warn({ module: "daily-tick" }, "advance team date", e));
      }

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
                    isCelebrity: !!(r.is_celebrity as number), celebrityType: pers.celebrityType, celebrityTier: pers.celebrityTier };
                });
                const teamDistrict = (team.village_district as string | null) ?? undefined;
                const dayBeforeAbsences = generateAbsences(absRng as any, absSquad, "day_before", teamDistrict);
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
            const tomorrowCalEntry = await env.DB.prepare(
              "SELECT id, game_week FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled' LIMIT 1"
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

        // ── Retry generování článku pro answered rozhovory bez article_news_id ──
        try {
          const pendingArticle = await env.DB.prepare(
            `SELECT ci.id, ci.answers, ci.questions, ci.match_calendar_id, ci.game_week, ci.league_id
             FROM coach_interviews ci
             WHERE ci.team_id = ? AND ci.status = 'answered' AND ci.article_news_id IS NULL
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
                const matchDayAbsences = generateAbsences(mdRng as any, absSquad, "match_day", teamDistrictMd)
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
  }

  // ── Player offer generation (organické nabídky — hospodský, kamarád, dorost, starosta) ──
  try {
    const { generatePlayerOffer } = await import("../events/player-offers");
    const sizeMap: Record<string, string> = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
    const humanTeams = allTeams.results.filter((t) => t.user_id !== "ai" && t.game_date && t.village_district);

    for (const team of humanTeams) {
      const teamId = team.id as string;
      const offerRng = createRng(now.getTime() + teamId.charCodeAt(0) + 22222);
      // ~14% per day ≈ 1 nabídka týdně
      if (offerRng.random() > 0.14) continue;

      const district = team.village_district as string;
      const villageInfo = {
        region_code: district,
        category: (sizeMap[(team.village_size as string)] ?? "obec") as "vesnice" | "obec" | "mestys" | "mesto",
        population: (team.village_population as number) ?? 500,
        district,
      };

      await generatePlayerOffer(
        env.DB, offerRng, teamId, district, villageInfo, team.game_date as string,
      ).catch((e) => logger.warn({ module: "daily-tick" }, `player offer gen failed for ${teamId}`, e));
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "player offer generation failed", e);
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
        .bind(now.toISOString(), playerId, loanTeamId).run().catch((e) => logger.warn({ module: "daily-tick" }, "close loan contract", e));
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
      } catch (e) { logger.warn({ module: "daily-tick" }, "createTransferNews loan_return", e); }
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
    await env.DB.prepare("UPDATE coach_interviews SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .bind(now.toISOString()).run()
      .catch((e) => logger.warn({ module: "daily-tick" }, "expire coach_interviews", e));
    await env.DB.prepare("UPDATE transfer_bids SET status = 'withdrawn' WHERE status = 'pending' AND listing_id IN (SELECT id FROM transfer_listings WHERE status != 'active')")
      .run().catch((e) => logger.warn({ module: "daily-tick" }, "withdraw bids for expired listings", e));
  } catch (e) {
    logger.error({ module: "daily-tick" }, "transfer expiry failed", e);
  }

  // ── Normalize all leagues to max game_date ──
  // Prevents permanent date offset if leagues were initialized at different times.
  try {
    const leagueDates = await env.DB.prepare(
      "SELECT league_id, MAX(game_date) as max_date FROM teams WHERE league_id IS NOT NULL AND game_date IS NOT NULL GROUP BY league_id"
    ).all<{ league_id: string; max_date: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "league dates query", e); return { results: [] }; });
    if (leagueDates.results.length > 1) {
      const maxDate = leagueDates.results.map((r) => r.max_date).reduce((a, b) => (a > b ? a : b));
      for (const row of leagueDates.results) {
        if (row.max_date < maxDate) {
          await env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
            .bind(maxDate, row.league_id).run()
            .catch((e) => logger.warn({ module: "daily-tick" }, "normalize league game_date", e));
          logger.info({ module: "daily-tick" }, `normalized league ${row.league_id} from ${row.max_date} to ${maxDate}`);
        }
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "league game_date normalization failed", e);
  }

  // ── Fanbase snapshots + bus streak break ─────────────────────────────────
  // Per team UPSERT do fanbase_snapshots + decay casual_count u obcí, kde nebyl bus
  // už 3+ home zápasy v řadě.
  try {
    const fbTeams = await env.DB.prepare(
      `SELECT t.id as team_id, t.reputation, t.game_date,
              tf.hardcore_count + COALESCE((SELECT SUM(hardcore_count) FROM bus_satellite_fans WHERE team_id = t.id), 0) as hardcore_count,
              tf.regular_count + COALESCE((SELECT SUM(regular_count) FROM bus_satellite_fans WHERE team_id = t.id), 0) as regular_count,
              tf.casual_count + COALESCE(tf.promo_casual_count, 0) + COALESCE((SELECT SUM(casual_count) FROM bus_satellite_fans WHERE team_id = t.id), 0) as casual_count,
              f.satisfaction
       FROM teams t
       LEFT JOIN team_fanbase tf ON tf.team_id = t.id
       LEFT JOIN fans f ON f.team_id = t.id
       WHERE t.user_id != 'ai' AND tf.team_id IS NOT NULL`,
    )
      .all<{
        team_id: string;
        reputation: number;
        game_date: string | null;
        hardcore_count: number;
        regular_count: number;
        casual_count: number;
        satisfaction: number | null;
      }>()
      .catch((e) => {
        logger.warn({ module: "daily-tick" }, "load fanbase teams for snapshot", e);
        return { results: [] as never[] };
      });

    for (const t of fbTeams.results) {
      const gamedate = t.game_date ?? now.toISOString();
      const totalLoyal = t.hardcore_count + t.regular_count + t.casual_count;
      await env.DB.prepare(
        `INSERT INTO fanbase_snapshots
           (id, team_id, gamedate, hardcore_total, regular_total, casual_total,
            total_loyal, reputation_at_time, satisfaction_at_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_id, gamedate) DO UPDATE SET
           hardcore_total = excluded.hardcore_total,
           regular_total = excluded.regular_total,
           casual_total = excluded.casual_total,
           total_loyal = excluded.total_loyal,
           reputation_at_time = excluded.reputation_at_time,
           satisfaction_at_time = excluded.satisfaction_at_time`,
      )
        .bind(
          crypto.randomUUID(),
          t.team_id,
          gamedate,
          t.hardcore_count,
          t.regular_count,
          t.casual_count,
          totalLoyal,
          t.reputation,
          t.satisfaction,
        )
        .run()
        .catch((e) => {
          logger.warn({ module: "daily-tick" }, "upsert fanbase snapshot", e);
        });
    }

    // Bus streak break: pro obce kde 3+ home zápasy bez busu po dříve aktivní řadě
    const { BUS_CONFIG } = await import("./fanbase-config");
    const staleSatellites = await env.DB.prepare(
      `SELECT bsf.id, bsf.team_id, bsf.village_id, bsf.casual_count, bsf.consecutive_buses, bsf.last_bus_match_id, v.name as village_name
       FROM bus_satellite_fans bsf
       JOIN villages v ON bsf.village_id = v.id
       WHERE bsf.consecutive_buses >= 3`,
    )
      .all<{
        id: string;
        team_id: string;
        village_id: string;
        casual_count: number;
        consecutive_buses: number;
        last_bus_match_id: string | null;
        village_name: string;
      }>()
      .catch((e) => {
        logger.warn({ module: "daily-tick" }, "load stale satellites", e);
        return { results: [] as never[] };
      });

    for (const s of staleSatellites.results) {
      // Zjisti počet home zápasů (status='simulated') daného týmu PO last_bus_match_id
      if (!s.last_bus_match_id) continue;
      const simulatedAfter = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM matches m1
         WHERE m1.home_team_id = ? AND m1.status = 'simulated'
           AND m1.simulated_at > (SELECT simulated_at FROM matches WHERE id = ?)`,
      )
        .bind(s.team_id, s.last_bus_match_id)
        .first<{ cnt: number }>()
        .catch((e) => {
          logger.warn(
            { module: "daily-tick" },
            "count home matches without bus",
            e,
          );
          return null;
        });
      const matchesWithoutBus = simulatedAfter?.cnt ?? 0;
      if (matchesWithoutBus >= BUS_CONFIG.STREAK_BREAK_AFTER && s.casual_count > 0) {
        const lost = Math.floor(s.casual_count * BUS_CONFIG.STREAK_BREAK_DECAY);
        if (lost > 0) {
          await env.DB.prepare(
            `UPDATE bus_satellite_fans
             SET casual_count = MAX(0, casual_count - ?), consecutive_buses = 0,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(lost, s.id)
            .run()
            .catch((e) => {
              logger.warn(
                { module: "daily-tick" },
                "decay satellite casual",
                e,
              );
            });
          logger.info(
            { module: "daily-tick", teamId: s.team_id },
            `bus streak break: ${s.village_name} ztratil ${lost} casual fans (${matchesWithoutBus} home zápasů bez busu)`,
          );
        }
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "fanbase snapshot + streak break failed", e);
  }

  const duration = ((Date.now() - tickStart) / 1000).toFixed(1);
  logger.info({ module: "daily-tick" }, `DONE events=${events.length} duration=${duration}s`);
  return { date: now.toISOString(), dayOfWeek, isTrainingDay, events };
}
