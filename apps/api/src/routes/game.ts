/**
 * FMK-62: Game system API routes — tréninky, ekonomika, mládež, nábor.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { createRng, cryptoSeed } from "../generators/rng";
import { generateSponsors } from "../season/economy";
import { executeDailyTick } from "../season/daily-tick";
import { recordTransaction } from "../season/finance-processor";
import { generateBetweenRoundEvents } from "../events/between-rounds";
import { getSeasonalEventsForWeek, type SeasonalEventDef } from "../season/seasonal-events";
import type { GeneratedPlayer } from "../generators/player";
import { logger } from "../lib/logger";
import { getSession, getTokenFromRequest } from "../auth/session";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";

const gameRouter = new Hono<{ Bindings: Bindings }>();

// ── Auth middleware ──────────────────────────────────────────────────────────
// Všechny write operace na týmových routách vyžadují ownership ověření.
gameRouter.use("/teams/:teamId/*", requireTeamOwnership);

// Admin operace vyžadují admin session.
gameRouter.use("/admin/*", requireAdmin);
gameRouter.use("/game/*", requireAdmin);
gameRouter.use("/leagues/:leagueId/generate-schedule", requireAdmin);
// ────────────────────────────────────────────────────────────────────────────

/** Send a system SMS to a team's phone (find-or-create conversation by role title). */
async function sendPhoneSMS(db: D1Database, teamId: string, senderName: string, roleTitle: string, body: string) {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, roleTitle).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, senderName, body).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
}

/** After transfer: recalculate commute distance and reset squad number. */
async function onPlayerTransferred(db: D1Database, playerId: string, newTeamId: string) {
  // Get new team's village info
  const team = await db.prepare("SELECT v.name, v.district, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(newTeamId).first<{ name: string; district: string; lat: number; lng: number }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  // Get player's residence
  const player = await db.prepare("SELECT residence, commute_km FROM players WHERE id = ?")
    .bind(playerId).first<{ residence: string; commute_km: number }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  if (team && player) {
    // If player lives in the new team's village → commute = 0
    // Otherwise estimate based on old commute (we don't have player lat/lng)
    // Simple: if residence matches new village → 0, else random 5-20km
    const sameVillage = player.residence === team.name;
    const newCommute = sameVillage ? 0 : Math.floor(5 + Math.random() * 15);
    await db.prepare("UPDATE players SET commute_km = ?, squad_number = NULL WHERE id = ?")
      .bind(newCommute, playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else {
    // At minimum reset squad number
    await db.prepare("UPDATE players SET squad_number = NULL WHERE id = ?")
      .bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }
}

// GET /api/teams/:id/training — get training plan + simulate a session preview
gameRouter.get("/teams/:teamId/training", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT training_type, training_approach, training_sessions, last_training_at, last_training_result FROM teams WHERE id = ?"
  ).bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch training plan", e); return null; });

  if (!team) return c.json({ error: "Team not found" }, 404);

  const lastResult = team.last_training_result
    ? JSON.parse(team.last_training_result as string)
    : null;

  return c.json({
    type: team.training_type ?? "conditioning",
    approach: team.training_approach ?? "balanced",
    sessionsPerWeek: team.training_sessions ?? 2,
    lastTrainingAt: team.last_training_at,
    lastResult,
  });
});

// POST /api/teams/:id/training — set training plan
gameRouter.post("/teams/:teamId/training", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ type: string; approach: string; sessionsPerWeek: number }>();

  await c.env.DB.prepare(
    "UPDATE teams SET training_type = ?, training_approach = ?, training_sessions = ? WHERE id = ?"
  ).bind(body.type, body.approach, body.sessionsPerWeek, teamId).run().catch((e) => logger.warn({ module: "game" }, "update training plan", e));

  return c.json({ ok: true });
});

// Training simulation removed from manual endpoint — runs only via daily tick (cron)

// GET /api/teams/:teamId/players/:playerId/training-log — tréninkový vývoj hráče
gameRouter.get("/teams/:teamId/players/:playerId/training-log", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const rows = await c.env.DB.prepare(
    "SELECT attribute, old_value, new_value, change, training_type, game_date, created_at FROM training_log WHERE player_id = ? AND team_id = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(playerId, teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch training log", e); return { results: [] }; });

  return c.json({ log: rows.results });
});

// GET /api/teams/:teamId/players/:playerId/profile-extras — personality + relationships
gameRouter.get("/teams/:teamId/players/:playerId/profile-extras", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const [playerRow, relRows] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT personality FROM players WHERE id = ?").bind(playerId),
    c.env.DB.prepare(
      `SELECT r.type, r.strength,
              CASE WHEN r.player_a_id = ? THEN r.player_b_id ELSE r.player_a_id END as related_id
       FROM relationships r
       WHERE r.player_a_id = ? OR r.player_b_id = ?`
    ).bind(playerId, playerId, playerId),
  ]);

  const personalityRaw = (playerRow.results[0] as any)?.personality;
  const personality = (() => {
    try { return typeof personalityRaw === "string" ? JSON.parse(personalityRaw) : (personalityRaw ?? {}); }
    catch (e) { logger.warn({ module: "game" }, "parse player personality", e); return {}; }
  })();

  // Get names + positions for related players
  const relatedIds = (relRows.results as any[]).map((r) => r.related_id as string).filter(Boolean);
  let relatedMap: Record<string, { name: string; position: string }> = {};
  if (relatedIds.length > 0) {
    const placeholders = relatedIds.map(() => "?").join(",");
    const nameRows = await c.env.DB.prepare(
      `SELECT id, first_name, last_name, position FROM players WHERE id IN (${placeholders})`
    ).bind(...relatedIds).all().catch((e) => { logger.warn({ module: "game" }, "fetch related player names", e); return { results: [] }; });
    for (const r of nameRows.results as any[]) {
      relatedMap[r.id] = { name: `${r.first_name} ${r.last_name}`, position: r.position };
    }
  }

  const EFFECT_MAP: Record<string, string> = {
    brothers: "+5 morálka když hrají spolu",
    father_son: "+3 morálka, mentoring efekt",
    in_laws: "Neutrální, občas třecí plochy",
    classmates: "+2 chemie na tréninku",
    coworkers: "+1 morálka, znají se z práce",
    neighbors: "+1 morálka, společná cesta",
    drinking_buddies: "+3 morálka, riziko absence po výhře",
    rivals: "-2 morálka v sestavě, motivace k překonání",
    mentor_pupil: "+5 vývoj mladšího hráče",
  };

  const TYPE_LABELS: Record<string, string> = {
    brothers: "Bratři",
    father_son: "Otec a syn",
    in_laws: "Příbuzní",
    classmates: "Spolužáci",
    coworkers: "Kolegové z práce",
    neighbors: "Sousedi",
    drinking_buddies: "Kamarádi z hospody",
    rivals: "Rivalové",
    mentor_pupil: "Mentor a žák",
  };

  const relationships = (relRows.results as any[])
    .filter((r) => relatedMap[r.related_id])
    .map((r) => ({
      relatedPlayerId: r.related_id as string,
      relatedPlayerName: relatedMap[r.related_id].name,
      relatedPlayerPosition: relatedMap[r.related_id].position,
      type: r.type as string,
      typeLabel: TYPE_LABELS[r.type as string] ?? r.type,
      strength: (r.strength as number) ?? 50,
      effect: EFFECT_MAP[r.type as string] ?? "",
    }))
    .sort((a, b) => b.strength - a.strength);

  return c.json({ personality, relationships });
});

// GET /api/teams/:id/training-stats — aggregated training statistics
gameRouter.get("/teams/:teamId/training-stats", async (c) => {
  const teamId = c.req.param("teamId");

  const [totalsRes, topRes, breakdownRes, teamRow] = await c.env.DB.batch([
    // Total gains/losses
    c.env.DB.prepare(
      `SELECT SUM(CASE WHEN change > 0 THEN 1 ELSE 0 END) as gains,
              SUM(CASE WHEN change < 0 THEN 1 ELSE 0 END) as losses,
              COUNT(DISTINCT game_date) as sessions
       FROM training_log WHERE team_id = ?`
    ).bind(teamId),
    // Top improvers (join with players for name)
    c.env.DB.prepare(
      `SELECT tl.player_id, p.first_name, p.last_name, SUM(tl.change) as total_gains,
              (SELECT tl2.attribute FROM training_log tl2 WHERE tl2.player_id = tl.player_id AND tl2.team_id = ? AND tl2.change > 0 GROUP BY tl2.attribute ORDER BY SUM(tl2.change) DESC LIMIT 1) as top_attr
       FROM training_log tl JOIN players p ON tl.player_id = p.id
       WHERE tl.team_id = ? AND tl.change > 0
       GROUP BY tl.player_id ORDER BY total_gains DESC LIMIT 5`
    ).bind(teamId, teamId),
    // Skill breakdown
    c.env.DB.prepare(
      `SELECT attribute,
              SUM(CASE WHEN change > 0 THEN change ELSE 0 END) as gains,
              SUM(CASE WHEN change < 0 THEN ABS(change) ELSE 0 END) as losses
       FROM training_log WHERE team_id = ?
       GROUP BY attribute ORDER BY gains DESC`
    ).bind(teamId),
    // Attendance data
    c.env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?").bind(teamId),
  ]);

  const totals = (totalsRes.results[0] as any) ?? { gains: 0, losses: 0, sessions: 0 };

  const topImprovers = (topRes.results as any[]).map((r) => ({
    playerId: r.player_id,
    name: `${r.first_name} ${r.last_name}`,
    totalGains: r.total_gains,
    topAttribute: r.top_attr,
  }));

  const skillBreakdown = (breakdownRes.results as any[]).map((r) => ({
    attribute: r.attribute,
    gains: r.gains,
    losses: r.losses,
  }));

  // Attendance top/bottom
  const attRaw = (teamRow.results[0] as any)?.training_attendance;
  const attData: Record<string, { attended: number; total: number }> = (() => {
    try { return JSON.parse(attRaw ?? "{}"); } catch { return {}; }
  })();

  // Get player names for attendance
  const attPlayerIds = Object.keys(attData);
  let attNames: Record<string, string> = {};
  if (attPlayerIds.length > 0) {
    const nameRows = await c.env.DB.prepare(
      `SELECT id, first_name, last_name FROM players WHERE id IN (${attPlayerIds.map(() => "?").join(",")}) AND team_id = ?`
    ).bind(...attPlayerIds, teamId).all().catch(() => ({ results: [] }));
    for (const r of nameRows.results as any[]) {
      attNames[r.id] = `${r.first_name} ${r.last_name}`;
    }
  }

  const attList = Object.entries(attData)
    .filter(([pid]) => attNames[pid]) // only current players
    .map(([pid, d]) => ({
      playerId: pid,
      name: attNames[pid],
      attended: d.attended,
      total: d.total,
      pct: d.total > 0 ? Math.round((d.attended / d.total) * 100) : 0,
    }));

  const attendanceTop = [...attList].sort((a, b) => b.pct - a.pct).slice(0, 5);
  const attendanceBottom = [...attList].sort((a, b) => a.pct - b.pct).slice(0, 5);

  return c.json({
    totalImprovements: totals.gains ?? 0,
    totalDeclines: totals.losses ?? 0,
    trainingSessions: totals.sessions ?? 0,
    topImprovers,
    skillBreakdown,
    attendanceTop,
    attendanceBottom,
  });
});

// GET /api/teams/:id/budget — rozpočet s kompletním přehledem
gameRouter.get("/teams/:teamId/budget", async (c) => {
  const teamId = c.req.param("teamId");
  const { mapVillageSize, countRemainingMatchDays } = await import("../season/finance-processor");

  // Batch: team info + wages + sponsors + top wages in single round-trip
  const [teamResult, wageResult, sponsorContracts, topWages] = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT t.*, v.name as village_name, v.size, v.population, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId),
    c.env.DB.prepare(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(weekly_wage), 0) as weekly_total FROM players WHERE team_id = ?"
    ).bind(teamId),
    c.env.DB.prepare(
      "SELECT sponsor_name, sponsor_type, monthly_amount, win_bonus FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
    ).bind(teamId),
    c.env.DB.prepare(
      "SELECT id, first_name, last_name, position, overall_rating, weekly_wage FROM players WHERE team_id = ? ORDER BY weekly_wage DESC LIMIT 5"
    ).bind(teamId),
  ]);

  const team = teamResult.results[0] as Record<string, unknown> | undefined;
  if (!team) return c.json({ error: "Team not found" }, 404);

  const category = mapVillageSize(team.size as string);

  const wageRow = wageResult.results[0] as { cnt: number; weekly_total: number } | undefined;
  const playerCount = wageRow?.cnt ?? 0;
  const weeklyWages = wageRow?.weekly_total ?? 0;

  const sponsors = (sponsorContracts.results as Record<string, unknown>[]).map((s) => ({
    name: s.sponsor_name as string,
    type: s.sponsor_type as string,
    monthlyAmount: s.monthly_amount as number,
    winBonus: s.win_bonus as number,
  }));

  // Also get generated sponsors if no contracts
  if (sponsors.length === 0) {
    const rng = createRng(teamId.charCodeAt(0));
    const generated = await generateSponsors(rng, team.size as string, team.reputation as number, team.district as string, c.env.DB);
    sponsors.push(...generated);
  }

  const reputation = (team.reputation as number) ?? 50;
  const WEEKS_PER_SEASON = 16;

  // All amounts calculated as WEEKLY (= per 7 game days)
  // Income sources (weekly)
  const weeklySponsorIncome = Math.round(sponsors.reduce((sum, s) => sum + s.monthlyAmount, 0) / 4.3) * 2;
  const weeklyBaseSponsor = Math.round((reputation * 100) / 4.3);
  const weeklySubsidies: Record<string, number> = { vesnice: 1400, obec: 2300, mestys: 3500, mesto: 5800 };
  const weeklySubsidy = weeklySubsidies[category] ?? 2300;
  const weeklyContributions = Math.round((playerCount * 100) / 4.3); // členské příspěvky (100 Kč/hráč/měs)

  const weeklyIncome = weeklySponsorIncome + weeklyBaseSponsor + weeklySubsidy + weeklyContributions;

  // Expense sources (weekly)
  const maintenanceCosts: Record<string, number> = { vesnice: 115, obec: 230, mestys: 465, mesto: 700 };
  const weeklyMaintenance = maintenanceCosts[category] ?? 230;
  const weeklyEquipment = 115; // ~500/4.3
  const trainingPerSession: Record<string, number> = { vesnice: 200, obec: 400, mestys: 600, mesto: 1000 };
  const sessionsPerWeek = (team.training_sessions as number) ?? 2;
  const weeklyTraining = (trainingPerSession[category] ?? 400) * sessionsPerWeek;

  const weeklyExpenses = weeklyWages + weeklyMaintenance + weeklyEquipment + weeklyTraining;
  const weeklyNet = weeklyIncome - weeklyExpenses;

  // Active cash loan + remaining match days
  const activeLoan = await c.env.DB.prepare(
    "SELECT id, principal, total_to_repay, remaining, total_installments, installments_paid, per_match_installment, status FROM cash_loans WHERE team_id = ? AND status = 'active' LIMIT 1"
  ).bind(teamId).first<{
    id: string; principal: number; total_to_repay: number; remaining: number;
    total_installments: number; installments_paid: number; per_match_installment: number; status: string;
  }>().catch((e) => { logger.warn({ module: "game" }, "load active cash loan", e); return null; });

  const remainingInfo = await countRemainingMatchDays(c.env.DB, teamId);

  // Forecast: weekly net pořád, ale nesmíme zapomenout na splátky půjčky
  // Splátky jsou per-match, nikoliv per-week. Odhadneme ~2 zápasy/měsíc → ~0.5/týden
  const weeklyLoanRepayment = activeLoan
    ? Math.round(activeLoan.per_match_installment * 0.5)
    : 0;
  const effectiveWeeklyNet = weeklyNet - weeklyLoanRepayment;
  const weeksUntilBankrupt = effectiveWeeklyNet < 0 ? Math.floor((team.budget as number) / Math.abs(effectiveWeeklyNet)) : null;

  return c.json({
    budget: team.budget,
    sponsors: sponsors.map((s) => ({ ...s, weeklyAmount: Math.round(s.monthlyAmount / 4.3) })),
    playerCount,
    wageBill: {
      weekly: weeklyWages,
      topPlayers: (topWages.results as Record<string, unknown>[]).map((p) => ({
        id: p.id, name: `${p.first_name} ${p.last_name}`,
        position: p.position, rating: p.overall_rating, weeklyWage: p.weekly_wage,
      })),
    },
    weekly: {
      income: {
        sponsors: weeklySponsorIncome, baseSponsor: weeklyBaseSponsor,
        subsidy: weeklySubsidy, playerContributions: weeklyContributions,
        total: weeklyIncome,
      },
      expenses: {
        wages: weeklyWages, maintenance: weeklyMaintenance,
        equipment: weeklyEquipment, training: weeklyTraining,
        loanRepayment: weeklyLoanRepayment,
        total: weeklyExpenses,
      },
      net: weeklyNet,
      netWithLoan: effectiveWeeklyNet,
    },
    forecast: {
      weeklyNet: effectiveWeeklyNet,
      weeksUntilBankrupt,
      in4Weeks: (team.budget as number) + effectiveWeeklyNet * 4,
      inSeason: (team.budget as number) + effectiveWeeklyNet * WEEKS_PER_SEASON,
    },
    loan: activeLoan ? {
      id: activeLoan.id,
      principal: activeLoan.principal,
      totalToRepay: activeLoan.total_to_repay,
      remaining: activeLoan.remaining,
      totalInstallments: activeLoan.total_installments,
      installmentsPaid: activeLoan.installments_paid,
      installmentsRemaining: activeLoan.total_installments - activeLoan.installments_paid,
      perMatchInstallment: activeLoan.per_match_installment,
    } : null,
    remainingMatches: remainingInfo.remainingMatches,
    purchaseBlocked: (team.budget as number) < 0,
  });
});

// GET /api/teams/:teamId/transactions — finanční historie
gameRouter.get("/teams/:teamId/transactions", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");
  const type = c.req.query("type") ?? null;
  const direction = c.req.query("direction") ?? null; // "income" or "expense"

  let query = "SELECT * FROM transactions WHERE team_id = ?";
  const bindings: unknown[] = [teamId];

  if (type) {
    query += " AND type = ?";
    bindings.push(type);
  }
  if (direction === "income") {
    query += " AND amount > 0";
  } else if (direction === "expense") {
    query += " AND amount < 0";
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  bindings.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...bindings).all().catch((e) => { logger.warn({ module: "game" }, "fetch transactions", e); return { results: [] }; });

  const countQuery = type
    ? "SELECT COUNT(*) as cnt FROM transactions WHERE team_id = ? AND type = ?"
    : "SELECT COUNT(*) as cnt FROM transactions WHERE team_id = ?";
  const countBindings = type ? [teamId, type] : [teamId];
  const total = await c.env.DB.prepare(countQuery).bind(...countBindings).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "count transactions", e); return { cnt: 0 }; });

  return c.json({
    transactions: result.results.map((t) => ({
      id: t.id, type: t.type, amount: t.amount,
      balanceAfter: t.balance_after, description: t.description,
      referenceId: t.reference_id, gameDate: t.game_date, createdAt: t.created_at,
    })),
    total: total?.cnt ?? 0,
    limit, offset,
  });
});

// GET /api/teams/:teamId/wages — přehled mezd hráčů
gameRouter.get("/teams/:teamId/wages", async (c) => {
  const teamId = c.req.param("teamId");

  const result = await c.env.DB.prepare(
    "SELECT id, first_name, last_name, position, overall_rating, weekly_wage, age FROM players WHERE team_id = ? ORDER BY weekly_wage DESC"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch player wages", e); return { results: [] }; });

  const totalWeekly = result.results.reduce((s, p) => s + (p.weekly_wage as number), 0);

  return c.json({
    players: result.results.map((p) => ({
      id: p.id, name: `${p.first_name} ${p.last_name}`,
      position: p.position, rating: p.overall_rating,
      age: p.age, weeklyWage: p.weekly_wage,
    })),
    totalWeekly,
    totalMonthly: Math.round(totalWeekly * 4.3),
    playerCount: result.results.length,
  });
});

// GET /api/teams/:id/events — mezikolové události
gameRouter.get("/teams/:teamId/events", async (c) => {
  const teamId = c.req.param("teamId");
  const rng = createRng(cryptoSeed());

  const team = await c.env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const playersResult = await c.env.DB.prepare("SELECT * FROM players WHERE team_id = ?").bind(teamId).all();

  const generatedPlayers: GeneratedPlayer[] = playersResult.results.map((row) => {
    const r = row as Record<string, unknown>;
    const skills = JSON.parse(r.skills as string);
    const personality = JSON.parse(r.personality as string);
    const lifeContext = JSON.parse(r.life_context as string);
    const phys = r.physical ? JSON.parse(r.physical as string) : {};
    return {
      firstName: r.first_name as string, lastName: r.last_name as string,
      age: r.age as number, position: r.position as "GK" | "DEF" | "MID" | "FWD",
      speed: skills.speed ?? 50, technique: skills.technique ?? 50,
      shooting: skills.shooting ?? 50, passing: skills.passing ?? 50,
      heading: skills.heading ?? 50, defense: skills.defense ?? 50,
      goalkeeping: skills.goalkeeping ?? 50,
      stamina: phys.stamina ?? skills.stamina ?? 50,
      strength: phys.strength ?? skills.strength ?? 50,
      injuryProneness: personality.injuryProneness ?? 50, discipline: personality.discipline ?? 50,
      patriotism: personality.patriotism ?? 50, alcohol: personality.alcohol ?? 30,
      temper: personality.temper ?? 40, occupation: lifeContext.occupation ?? "",
      bodyType: "normal" as const, avatarConfig: {} as any,
      condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
      preferredFoot: "right" as const, preferredSide: "center" as const,
      leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
      aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
      clutch: personality.clutch ?? 50,
    };
  });

  const events = generateBetweenRoundEvents(
    rng, generatedPlayers,
    team.budget as number, team.reputation as number,
    null, 1, team.district as string | undefined,
  );

  return c.json(events);
});

// GET /api/teams/:id/seasonal-events — all seasonal events (pending = with choices, resolved = past)
gameRouter.get("/teams/:teamId/seasonal-events", async (c) => {
  const teamId = c.req.param("teamId");

  // Get events from DB
  const team = await c.env.DB.prepare("SELECT t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.id = ?").bind(teamId).first<{ league_id: string; district: string }>();
  if (!team?.league_id) return c.json({ events: [] });

  // Batch: seasonal events + current game week
  const [dbEventsRes, lastCalRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM seasonal_events WHERE league_id = ? ORDER BY game_week").bind(team.league_id),
    c.env.DB.prepare("SELECT MAX(game_week) as gw FROM season_calendar WHERE league_id = ? AND status = 'simulated'").bind(team.league_id),
  ]);
  const dbEvents = { results: dbEventsRes.results };
  const currentGameWeek = (lastCalRes.results[0] as { gw: number | null } | undefined)?.gw ?? 0;

  if (dbEvents.results.length > 0) {
    const events = (dbEvents.results as Record<string, unknown>[]).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      effects: JSON.parse(row.effects as string),
      choices: row.choices ? JSON.parse(row.choices as string) : null,
      gameWeek: row.game_week,
      status: row.status,
    }));
    return c.json({ events, currentGameWeek });
  }

  // No events in DB yet — generate from templates for all weeks and insert
  const rng = createRng(team.league_id.charCodeAt(0));
  const allEvents: Array<SeasonalEventDef & { id: string; status: string }> = [];

  for (let week = 0; week <= 30; week++) {
    const weekEvents = getSeasonalEventsForWeek(rng, week, team.district);
    for (const ev of weekEvents) {
      const id = crypto.randomUUID();
      await c.env.DB.prepare(
        "INSERT INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, '1', ?, ?)"
      ).bind(id, team.league_id, ev.type, ev.title, ev.description,
        JSON.stringify(ev.effects), ev.choices ? JSON.stringify(ev.choices) : null,
        ev.gameWeek, ev.choices ? "pending" : "active",
      ).run().catch((e) => logger.warn({ module: "game" }, "insert seasonal event", e));

      allEvents.push({ ...ev, id, status: ev.choices ? "pending" : "active" });
    }
  }

  return c.json({
    events: allEvents.map((ev) => ({
      id: ev.id, type: ev.type, title: ev.title, description: ev.description,
      effects: ev.effects, choices: ev.choices ?? null,
      gameWeek: ev.gameWeek, status: ev.status,
    })),
    currentGameWeek,
  });
});

// POST /api/teams/:id/seasonal-events/:eventId/choose — make a choice
gameRouter.post("/teams/:teamId/seasonal-events/:eventId/choose", async (c) => {
  const teamId = c.req.param("teamId");
  const eventId = c.req.param("eventId");
  const body = await c.req.json<{ choiceId: string }>();

  const event = await c.env.DB.prepare("SELECT * FROM seasonal_events WHERE id = ?")
    .bind(eventId).first<Record<string, unknown>>();
  if (!event) return c.json({ error: "Event not found" }, 404);
  if (event.status !== "pending") return c.json({ error: "Already resolved" }, 400);

  const choices = JSON.parse(event.choices as string) as Array<{ id: string; effects: Array<{ type: string; value: number }> }>;
  const choice = choices.find((ch) => ch.id === body.choiceId);
  if (!choice) return c.json({ error: "Invalid choice" }, 400);

  // Atomický claim — zabraňuje double-apply při souběžných requestech.
  // WHERE status = 'pending' zajistí že jen první request proběhne.
  const claimed = await c.env.DB.prepare(
    "UPDATE seasonal_events SET status = 'resolved' WHERE id = ? AND status = 'pending'"
  ).bind(eventId).run().catch((e) => { logger.warn({ module: "game" }, "claim seasonal event", e); return { meta: { changes: 0 } }; });
  if (claimed.meta.changes === 0) return c.json({ error: "Already resolved" }, 400);

  // Apply effects
  for (const effect of choice.effects) {
    if (effect.type === "budget") {
      await recordTransaction(c.env.DB, teamId, "event", effect.value as number,
        `Událost: ${(choice as Record<string, unknown>).text ?? "efekt"}`, new Date().toISOString()).catch((e) => logger.warn({ module: "game" }, "record event transaction", e));
    }
    if (effect.type === "reputation") {
      await c.env.DB.prepare("UPDATE teams SET reputation = MIN(100, MAX(0, reputation + ?)) WHERE id = ?")
        .bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "update reputation from event", e));
    }
    if (effect.type === "morale") {
      await c.env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
          MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?)))
        WHERE team_id = ?`
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "update morale from event", e));
    }
    if (effect.type === "stamina_boost") {
      await c.env.DB.prepare(
        `UPDATE players SET skills = json_set(skills, '$.stamina', MIN(100, json_extract(skills, '$.stamina') + ?)) WHERE team_id = ?`
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "apply stamina boost", e));
    }
    if (effect.type === "experience") {
      await c.env.DB.prepare(
        `UPDATE players SET skills = json_set(skills, '$.experience', MIN(100, COALESCE(json_extract(skills, '$.experience'), 0) + ?)) WHERE team_id = ?`
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "apply experience event", e));
    }
    if (effect.type === "alcohol_event") {
      // Increase alcohol-prone players' next absence chance by reducing condition
      await c.env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(10, json_extract(life_context, '$.condition') - 20))
        WHERE team_id = ? AND json_extract(personality, '$.alcohol') > 50`
      ).bind(teamId).run().catch((e) => logger.warn({ module: "game" }, "apply alcohol event", e));
    }
    if (effect.type === "condition") {
      await c.env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition',
          MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)))
        WHERE team_id = ?`
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "update condition from event", e));
    }
    if (effect.type === "pitch_condition") {
      await c.env.DB.prepare(
        "UPDATE stadiums SET pitch_condition = MIN(100, MAX(0, pitch_condition + ?)) WHERE team_id = ?"
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "update pitch condition from event", e));
    }
  }

  return c.json({ ok: true, appliedEffects: choice.effects });
});

// POST /api/teams/:id/pub-visit — vzít kluky do hospody (cooldown 2 herní dny)
gameRouter.post("/teams/:teamId/pub-visit", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ choice: "all" | "one" | "no" }>();

  // Check cooldown — last pub visit
  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const lastVisit = await c.env.DB.prepare(
    "SELECT created_at FROM seasonal_events WHERE league_id = (SELECT league_id FROM teams WHERE id = ?) AND type = 'hospoda_action' ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId).first<{ created_at: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  if (lastVisit) {
    const lastDate = new Date(lastVisit.created_at).getTime();
    const gameDate = new Date(team.game_date).getTime();
    const daysDiff = (gameDate - lastDate) / (1000 * 60 * 60 * 24);
    if (daysDiff < 2) {
      return c.json({ error: "Hospoda je dostupná jednou za 2 dny", cooldown: true }, 400);
    }
  }

  const effects: Array<{ type: string; value: number; description: string }> = [];

  if (body.choice === "all") {
    effects.push(
      { type: "morale", value: 8, description: "+8 morálka" },
      { type: "condition", value: -15, description: "-15 kondice všem" },
      { type: "budget", value: -1500, description: "-1 500 Kč" },
    );
  } else if (body.choice === "one") {
    effects.push(
      { type: "morale", value: 3, description: "+3 morálka" },
      { type: "condition", value: -5, description: "-5 kondice" },
      { type: "budget", value: -500, description: "-500 Kč" },
    );
  } else {
    effects.push({ type: "morale", value: -3, description: "-3 morálka" });
  }

  // Apply effects
  for (const effect of effects) {
    if (effect.type === "budget") {
      await recordTransaction(c.env.DB, teamId, "event", effect.value, "Hospoda", team.game_date).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    }
    if (effect.type === "morale") {
      await c.env.DB.prepare(
        "UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?))) WHERE team_id = ?"
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    }
    if (effect.type === "condition") {
      await c.env.DB.prepare(
        "UPDATE players SET life_context = json_set(life_context, '$.condition', MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?))) WHERE team_id = ?"
      ).bind(effect.value, teamId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    }
  }

  // Record as event for cooldown tracking
  await c.env.DB.prepare(
    "INSERT INTO seasonal_events (id, league_id, type, title, description, effects, season, game_week, status, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'hospoda_action', 'Posezení v hospodě', ?, ?, '1', 0, 'resolved', ?)"
  ).bind(crypto.randomUUID(), teamId,
    body.choice === "all" ? "Celý tým šel do hospody" : body.choice === "one" ? "Jen jedno pivo" : "Trenér zakázal hospodu",
    JSON.stringify(effects), team.game_date
  ).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));

  return c.json({ ok: true, effects });
});

// GET /api/teams/:id/pub-status — cooldown check
gameRouter.get("/teams/:teamId/pub-status", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>();
  if (!team) return c.json({ available: false });

  const lastVisit = await c.env.DB.prepare(
    "SELECT created_at FROM seasonal_events WHERE league_id = (SELECT league_id FROM teams WHERE id = ?) AND type = 'hospoda_action' ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId).first<{ created_at: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  if (!lastVisit) return c.json({ available: true });

  const daysDiff = (new Date(team.game_date).getTime() - new Date(lastVisit.created_at).getTime()) / (1000 * 60 * 60 * 24);
  return c.json({ available: daysDiff >= 2, daysLeft: Math.max(0, Math.ceil(2 - daysDiff)) });
});

// POST /api/teams/:id/youth — nastavit investici do mládeže
gameRouter.post("/teams/:teamId/youth", async (c) => {
  const body = await c.req.json<{ investment: string }>();

  const costs: Record<string, number> = { none: 0, minimal: 500, medium: 2000, high: 5000 };
  const cost = costs[body.investment] ?? 0;

  return c.json({
    ok: true,
    investment: body.investment,
    monthlyCost: cost,
    message: cost === 0
      ? "Mládežnická akademie zrušena."
      : `Investice do mládeže: ${cost} Kč/měsíc.`,
  });
});

// POST /api/teams/:id/recruit — aktivní nábor
gameRouter.post("/teams/:teamId/recruit", async (c) => {
  const body = await c.req.json<{ action: string }>();
  const rng = createRng(cryptoSeed());

  const actions: Record<string, { cost: number; prob: number; desc: string }> = {
    poster: { cost: 200, prob: 0.15, desc: "Plakát na obecní nástěnce" },
    newsletter: { cost: 500, prob: 0.25, desc: "Inzerát v obecním zpravodaji" },
    visit: { cost: 1500, prob: 0.4, desc: "Objíždění sousedních vesnic" },
  };

  const action = actions[body.action];
  if (!action) return c.json({ error: "Unknown action" }, 400);

  const success = rng.random() < action.prob;

  return c.json({
    success,
    cost: action.cost,
    message: success
      ? `${action.desc} — někdo se ozval! Nový hráč chce přijít.`
      : `${action.desc} — bohužel se nikdo neozval.`,
  });
});

// GET /api/teams/:id/news — obecní zpravodaj / news feed
gameRouter.get("/teams/:teamId/news", async (c) => {
  const teamId = c.req.param("teamId");

  // Batch: team info + recent matches
  const [teamRes, matchesRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT t.name, t.league_id, t.reputation FROM teams t WHERE t.id = ?").bind(teamId),
    c.env.DB.prepare(`SELECT m.id, m.home_score, m.away_score, m.simulated_at, m.round,
       ht.name as home_name, at.name as away_name,
       m.home_team_id, m.away_team_id
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
     ORDER BY m.simulated_at DESC LIMIT 5`).bind(teamId, teamId),
  ]);
  const team = teamRes.results[0] as { name: string; league_id: string | null; reputation: number } | undefined;
  if (!team) return c.json({ error: "Team not found" }, 404);
  const matchRows = matchesRes.results as Record<string, unknown>[];

  const articles: Array<{ id: string; type: string; headline: string; body: string; icon: string; date: string }> = [];

  for (const m of matchRows) {
    const isHome = m.home_team_id === teamId;
    const myScore = isHome ? m.home_score as number : m.away_score as number;
    const theirScore = isHome ? m.away_score as number : m.home_score as number;
    const opponent = isHome ? m.away_name as string : m.home_name as string;
    const won = myScore > theirScore;
    const drew = myScore === theirScore;

    let headline: string;
    let icon: string;
    if (won) {
      headline = `${team.name} poráží ${opponent} ${m.home_score}:${m.away_score}!`;
      icon = "\u{1F3C6}";
    } else if (drew) {
      headline = `Remíza ${m.home_score}:${m.away_score} s ${opponent}`;
      icon = "\u{1F91D}";
    } else {
      headline = `${team.name} padl s ${opponent} ${m.home_score}:${m.away_score}`;
      icon = "\u{1F614}";
    }

    articles.push({
      id: m.id as string,
      type: "match",
      headline,
      body: `${m.round ? m.round + ". kolo — " : ""}${isHome ? "Domácí zápas" : "Venku"}. ${won ? "Fanoušci slaví!" : drew ? "Spravedlivá dělba bodů." : "Příště to bude lepší."}`,
      icon,
      date: m.simulated_at as string ?? "",
    });
  }

  // 2. League standings position — uses shared standings utility
  if (team.league_id) {
    const { getTeamPosition } = await import("../stats/standings");
    const pos = await getTeamPosition(c.env.DB, team.league_id, teamId);

    if (pos > 0) {
      articles.push({
        id: "standing",
        type: "standing",
        headline: `${team.name} je na ${pos}. místě v tabulce`,
        body: `Aktuální pozice v okresním přeboru.`,
        icon: "\u{1F4CA}",
        date: new Date().toISOString(),
      });
    }
  }

  // 3. Persistent news articles (zpravodaj, round results, manager arrival)
  if (team.league_id) {
    const newsRows = await c.env.DB.prepare(
      `SELECT n.id, n.type, n.headline, n.body, n.game_week, n.created_at FROM news n
       LEFT JOIN matches m ON n.match_id = m.id AND n.type = 'promotion'
       WHERE (n.league_id = ? OR n.team_id = ?)
         AND (n.type != 'promotion' OR COALESCE(m.status, 'upcoming') != 'simulated')
       ORDER BY n.created_at DESC LIMIT 20`
    ).bind(team.league_id, teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch news articles", e); return { results: [] }; });

    for (const n of newsRows.results) {
      const iconMap: Record<string, string> = {
        manager_arrival: "\u{1F4CB}",
        round_results: "\u26BD",
        seasonal: "\u{1F389}",
        transfer: "\u{1F91D}",
        celebrity_arrival: "\u{1F31F}",
        celebrity_signing: "\u{1F4DD}",
        ai_report: "\u270D\uFE0F",
        promotion: "\u{1F4E2}",
        interview: "\u{1F399}\uFE0F",
      };
      articles.push({
        id: n.id as string,
        type: n.type as string,
        headline: n.headline as string,
        body: n.body as string,
        icon: iconMap[n.type as string] ?? "\u{1F4F0}",
        date: n.created_at as string,
        gameWeek: n.game_week as number | null,
      } as any);
    }
  }

  // Sort by date
  articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return c.json({ articles });
});

// GET /api/teams/:id/transfers — generate transfer offers + departure risks
gameRouter.get("/teams/:teamId/transfers", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.size, v.population, v.region as region_code FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const playersResult = await c.env.DB.prepare(
    "SELECT * FROM players WHERE team_id = ?"
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
      passing: skills.passing, heading: skills.heading, defense: skills.defense,
      goalkeeping: skills.goalkeeping,
      stamina: physical.stamina ?? skills.stamina ?? 50,
      strength: physical.strength ?? skills.strength ?? 50,
      injuryProneness: personality.injuryProneness ?? 50, discipline: personality.discipline,
      patriotism: personality.patriotism, alcohol: personality.alcohol,
      temper: personality.temper, occupation: lifeContext.occupation,
      bodyType: "normal" as const, avatarConfig: {} as any,
      condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
      preferredFoot: "right" as const, preferredSide: "center" as const,
      leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
      aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
      clutch: personality.clutch ?? 50,
    };
  });

  const { generateTransferOffers, checkDepartureRisks } = await import("../transfers/transfer-system");

  // Use a deterministic seed based on team + current week (changes weekly)
  const weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const rng = createRng(weekSeed + teamId.charCodeAt(0));

  const villageInfo = {
    region_code: team.region_code as string,
    category: team.size as "vesnice" | "obec" | "mestys" | "mesto",
    population: team.population as number,
  };

  // We need surname/firstname data for player generation — use minimal fallback
  const surnameData = { surnames: { "Novák": 10, "Dvořák": 8, "Svoboda": 7, "Černý": 6, "Procházka": 5, "Kučera": 5, "Veselý": 4, "Horák": 4, "Němec": 3, "Marek": 3 }, female_forms: {} };
  const firstnameData = { male: { "0-100": { "Jan": 10, "Petr": 8, "Martin": 7, "Tomáš": 6, "David": 5, "Jakub": 5, "Ondřej": 4, "Filip": 4, "Adam": 3, "Lukáš": 3 } }, female: {} };

  const offers = generateTransferOffers(rng, villageInfo, team.reputation as number, squad.length, surnameData, firstnameData, squad);
  const risks = checkDepartureRisks(rng, squad);

  // Enrich risks with player DB IDs
  const enrichedRisks = risks.map((r) => ({
    ...r,
    playerId: playersResult.results[r.playerIndex]?.id,
    playerName: `${squad[r.playerIndex].firstName} ${squad[r.playerIndex].lastName}`,
  }));

  // Enrich offers with position labels
  const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
  const enrichedOffers = offers.map((o) => ({
    channel: o.channel,
    description: o.description,
    cost: o.cost,
    expiresInRounds: o.expiresInRounds,
    player: {
      firstName: o.player.firstName,
      lastName: o.player.lastName,
      age: o.player.age,
      position: o.player.position,
      positionLabel: POS_LABELS[o.player.position] ?? o.player.position,
      occupation: o.player.occupation,
    },
  }));

  return c.json({ offers: enrichedOffers, departureRisks: enrichedRisks });
});

// GET /api/teams/:id/equipment — get equipment (auto-create if missing)
gameRouter.get("/teams/:teamId/equipment", async (c) => {
  const teamId = c.req.param("teamId");
  const { generateEquipment, getUpgradeOptions, getRepairOptions, getLevelDescription, calculateEffects, CATEGORIES, CATEGORY_LABELS } = await import("../equipment/equipment-generator");

  let equip = await c.env.DB.prepare(
    "SELECT * FROM equipment WHERE team_id = ?"
  ).bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch equipment", e); return null; });

  if (!equip) {
    const team = await c.env.DB.prepare(
      "SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<{ size: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch team size for equipment", e); return null; });

    let seed = 0;
    for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
    const rng = createRng(Math.abs(seed) + 99);
    const config = generateEquipment(rng, team?.size ?? "obec");

    const cols = CATEGORIES.map((c) => c).join(", ");
    const condCols = CATEGORIES.map((c) => `${c}_condition`).join(", ");
    const vals = CATEGORIES.map((c) => config[c] ?? 0);
    const condVals = CATEGORIES.map((c) => config[`${c}_condition`] ?? 50);
    const placeholders = [...vals, ...condVals].map(() => "?").join(", ");

    await c.env.DB.prepare(
      `INSERT INTO equipment (id, team_id, ${cols}, ${condCols}) VALUES (?, ?, ${placeholders})`
    ).bind(crypto.randomUUID(), teamId, ...vals, ...condVals).run().catch((e) => logger.warn({ module: "game" }, "insert equipment", e));

    equip = await c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "re-fetch equipment after insert", e); return null; });
    if (!equip) return c.json({ error: "Failed to create equipment" }, 500);
  }

  // Batch: team reputation + matches played + active season
  const [teamRes, matchCountRes, seasonRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' LIMIT 1"),
  ]);
  const team = teamRes.results[0] as { reputation: number } | undefined;
  const matchCount = matchCountRes.results[0] as { cnt: number } | undefined;
  const seasonNum = (seasonRes.results[0] as { number: number } | undefined)?.number ?? 1;

  const levels: Record<string, number> = {};
  const conditions: Record<string, number> = {};
  const categories: Array<{ key: string; label: string; level: number; condition: number; effectiveLevel: number; description: string }> = [];

  for (const cat of CATEGORIES) {
    const lv = (equip[cat] as number) ?? 0;
    const cond = (equip[`${cat}_condition`] as number) ?? 50;
    levels[cat] = lv;
    conditions[`${cat}_condition`] = cond;
    categories.push({
      key: cat,
      label: CATEGORY_LABELS[cat],
      level: lv,
      condition: cond,
      effectiveLevel: Math.round(lv * (cond / 100) * 10) / 10,
      description: getLevelDescription(cat, lv),
    });
  }

  const effects = calculateEffects(levels, conditions);

  return c.json({
    categories,
    upgrades: getUpgradeOptions(levels, team?.reputation ?? 0, matchCount?.cnt ?? 0, seasonNum),
    repairs: getRepairOptions(levels, conditions),
    effects,
  });
});

// POST /api/teams/:id/equipment/upgrade
gameRouter.post("/teams/:teamId/equipment/upgrade", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category: string }>();
  const { getUpgradeOptions, CATEGORIES } = await import("../equipment/equipment-generator");

  const equip = await c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!equip) return c.json({ error: "Equipment not found" }, 404);

  const team = await c.env.DB.prepare("SELECT budget, reputation FROM teams WHERE id = ?").bind(teamId).first<{ budget: number; reputation: number }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const matchCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "count matches for equipment upgrade", e); return null; });

  const levels: Record<string, number> = {};
  for (const cat of CATEGORIES) levels[cat] = (equip[cat] as number) ?? 0;

  const upgrades = getUpgradeOptions(levels, team.reputation, matchCount?.cnt ?? 0);
  const upgrade = upgrades.find((u) => u.category === body.category);
  if (!upgrade) return c.json({ error: "No upgrade available" }, 400);
  if (upgrade.locked) return c.json({ error: upgrade.lockReason ?? "Zamčeno" }, 400);
  if (team.budget < upgrade.cost) return c.json({ error: "Nedostatek peněz" }, 400);

  // Validate category name to prevent SQL injection
  if (!CATEGORIES.includes(body.category as any)) return c.json({ error: "Invalid category" }, 400);

  await recordTransaction(c.env.DB, teamId, "equipment_upgrade", -upgrade.cost,
    `Vylepšení vybavení: ${body.category} → úroveň ${upgrade.nextLevel}`, new Date().toISOString());
  await c.env.DB.prepare(
    `UPDATE equipment SET ${body.category} = ?, ${body.category}_condition = 100 WHERE team_id = ?`
  ).bind(upgrade.nextLevel, teamId).run();

  return c.json({ ok: true, cost: upgrade.cost, newLevel: upgrade.nextLevel });
});

// POST /api/teams/:id/equipment/repair
gameRouter.post("/teams/:teamId/equipment/repair", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category: string }>();
  const { CATEGORIES } = await import("../equipment/equipment-generator");

  if (!CATEGORIES.includes(body.category as any)) return c.json({ error: "Invalid category" }, 400);

  const equip = await c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!equip) return c.json({ error: "Equipment not found" }, 404);

  const level = (equip[body.category] as number) ?? 0;
  if (level === 0) return c.json({ error: "Nothing to repair" }, 400);

  const cost = level * 500;
  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < cost) return c.json({ error: "Nedostatek peněz" }, 400);

  await recordTransaction(c.env.DB, teamId, "equipment_expense", -cost,
    `Oprava vybavení: ${body.category}`, new Date().toISOString());
  await c.env.DB.prepare(
    `UPDATE equipment SET ${body.category}_condition = 100 WHERE team_id = ?`
  ).bind(teamId).run();

  return c.json({ ok: true, cost });
});

// GET /api/teams/:id/stadium — get stadium info (auto-create if missing)
gameRouter.get("/teams/:teamId/stadium", async (c) => {
  const teamId = c.req.param("teamId");

  let stadium = await c.env.DB.prepare(
    "SELECT * FROM stadiums WHERE team_id = ?"
  ).bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch stadium", e); return null; });

  if (!stadium) {
    // Auto-create stadium
    const team = await c.env.DB.prepare(
      "SELECT t.*, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch team for stadium creation", e); return null; });

    if (!team) return c.json({ error: "Team not found" }, 404);

    const { generateStadium } = await import("../stadium/stadium-generator");
    const { createRng } = await import("../generators/rng");
    let seed = 0;
    for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
    const rng = createRng(Math.abs(seed));
    const config = generateStadium(rng, team.size as string);

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, stands, parking, fence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, teamId, config.capacity, config.pitchCondition, config.pitchType,
      config.changingRooms, config.showers, config.refreshments,
      config.stands, config.parking, config.fence,
    ).run().catch((e) => logger.warn({ module: "game" }, "insert stadium", e));

    // Re-read from DB to get proper snake_case column names
    stadium = await c.env.DB.prepare("SELECT * FROM stadiums WHERE team_id = ?")
      .bind(teamId).first<Record<string, unknown>>() ?? { id, team_id: teamId, ...config };
  }

  // Get upgrade options with unlock logic
  const { getUpgradeOptions } = await import("../stadium/stadium-generator");
  const facilities: Record<string, number> = {
    changing_rooms: stadium.changing_rooms as number ?? 0,
    showers: stadium.showers as number ?? 0,
    refreshments: stadium.refreshments as number ?? 0,
    stands: stadium.stands as number ?? 0,
    parking: stadium.parking as number ?? 0,
    fence: stadium.fence as number ?? 0,
  };

  // Batch: team info + match count + active season
  const [teamInfoRes, matchCountRes, currentSeasonRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT reputation, stadium_name FROM teams WHERE id = ?").bind(teamId),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
  ]);
  const teamInfo = (teamInfoRes.results[0] as { reputation: number; stadium_name: string | null } | undefined) ?? null;
  const matchCount = (matchCountRes.results[0] as { cnt: number } | undefined) ?? null;
  const currentSeason = (currentSeasonRes.results[0] as { number: number } | undefined) ?? null;

  // Pitch maintenance options
  // Volume discount: větší údržba = levnější na procento (160/120/100 Kč/%).
  const pitchActions = [
    { level: "basic", label: "Základní údržba", desc: "Posečení, zarovnání", cost: 500, improvement: 10 },
    { level: "thorough", label: "Důkladná údržba", desc: "Přesetí holých míst, hnojení", cost: 1000, improvement: 25 },
    { level: "renovation", label: "Renovace trávníku", desc: "Kompletní obnova povrchu", cost: 1700, improvement: 50 },
  ].filter((a) => (stadium.pitch_condition as number) + a.improvement <= 110); // only show useful actions

  // Pitch type upgrades
  const pitchUpgrades = [];
  if (stadium.pitch_type === "natural") {
    pitchUpgrades.push({ pitchType: "hybrid", label: "Hybridní trávník", desc: "Mix přírodní + umělé vlákno, odolnější", cost: 85000 });
  }
  if (stadium.pitch_type === "hybrid") {
    pitchUpgrades.push({ pitchType: "artificial", label: "Umělý trávník", desc: "Žádná údržba, hratelný za každého počasí", cost: 220000 });
  }

  // Customizace
  const customization = {
    fenceColor: (stadium.fence_color as string | null) ?? null,
    standColor: (stadium.stand_color as string | null) ?? null,
    seatColor: (stadium.seat_color as string | null) ?? null,
    roofColor: (stadium.roof_color as string | null) ?? null,
    accentColor: (stadium.accent_color as string | null) ?? null,
    scoreboardLevel: (stadium.scoreboard_level as number | null) ?? 0,
    flagSize: (stadium.flag_size as number | null) ?? 0,
  };

  // Scoreboard a vlajka upgrady
  const SCOREBOARD_COSTS = [0, 2000, 8000, 25000];
  const SCOREBOARD_LABELS = ["Žádný", "Dřevěná tabule", "LED jednobarevná", "Full-color LED"];
  const FLAG_COSTS = [0, 1500, 5000, 15000];
  const FLAG_LABELS = ["Žádná", "Malá vlajka (3m)", "Střední vlajka (5m)", "Velká vlajka (8m)"];

  const visualUpgrades: Array<{ kind: string; currentLevel: number; nextLevel: number; cost: number; label: string }> = [];
  if (customization.scoreboardLevel < 3) {
    visualUpgrades.push({
      kind: "scoreboard",
      currentLevel: customization.scoreboardLevel,
      nextLevel: customization.scoreboardLevel + 1,
      cost: SCOREBOARD_COSTS[customization.scoreboardLevel + 1],
      label: SCOREBOARD_LABELS[customization.scoreboardLevel + 1],
    });
  }
  if (customization.flagSize < 3) {
    visualUpgrades.push({
      kind: "flag",
      currentLevel: customization.flagSize,
      nextLevel: customization.flagSize + 1,
      cost: FLAG_COSTS[customization.flagSize + 1],
      label: FLAG_LABELS[customization.flagSize + 1],
    });
  }

  return c.json({
    stadiumName: teamInfo?.stadium_name ?? null,
    capacity: stadium.capacity,
    pitchCondition: stadium.pitch_condition,
    pitchType: stadium.pitch_type,
    facilities,
    customization,
    visualUpgrades,
    upgrades: getUpgradeOptions(facilities, teamInfo?.reputation ?? 0, matchCount?.cnt ?? 0, currentSeason?.number ?? 1),
    pitchActions,
    pitchUpgrades,
  });
});

// POST /api/teams/:id/stadium/upgrade — upgrade a facility
gameRouter.post("/teams/:teamId/stadium/upgrade", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ facility: string }>();

  const stadium = await c.env.DB.prepare(
    "SELECT * FROM stadiums WHERE team_id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!stadium) return c.json({ error: "Stadium not found" }, 404);

  const team = await c.env.DB.prepare(
    "SELECT budget, reputation FROM teams WHERE id = ?"
  ).bind(teamId).first<{ budget: number; reputation: number }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const matchCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "count matches for stadium upgrade", e); return null; });

  const seasonRow = await c.env.DB.prepare(
    "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for stadium upgrade", e); return null; });
  const seasonNum = seasonRow?.number ?? 1;

  const { getUpgradeOptions } = await import("../stadium/stadium-generator");
  const facilities: Record<string, number> = {
    changing_rooms: stadium.changing_rooms as number ?? 0,
    showers: stadium.showers as number ?? 0,
    refreshments: stadium.refreshments as number ?? 0,
    stands: stadium.stands as number ?? 0,
    parking: stadium.parking as number ?? 0,
    fence: stadium.fence as number ?? 0,
  };

  const upgrades = getUpgradeOptions(facilities, team.reputation, matchCount?.cnt ?? 0, seasonNum);
  const upgrade = upgrades.find((u) => u.facility === body.facility);
  if (!upgrade) return c.json({ error: "No upgrade available" }, 400);
  if (upgrade.locked) return c.json({ error: upgrade.lockReason ?? "Zamčeno" }, 400);
  if (team.budget < upgrade.cost) return c.json({ error: "Nedostatek peněz" }, 400);

  // Deduct cost + apply upgrade
  await recordTransaction(c.env.DB, teamId, "stadium_upgrade", -upgrade.cost,
    `Vylepšení stadionu: ${body.facility}`, new Date().toISOString());

  await c.env.DB.prepare(
    `UPDATE stadiums SET ${body.facility} = ? WHERE team_id = ?`
  ).bind(upgrade.nextLevel, teamId).run();

  // Stands upgrade: increase capacity
  if (body.facility === "stands") {
    const capacityBonus = [0, 50, 150, 300][upgrade.nextLevel] ?? 0;
    await c.env.DB.prepare(
      "UPDATE stadiums SET capacity = capacity + ? WHERE team_id = ?"
    ).bind(capacityBonus, teamId).run();
  }

  return c.json({ ok: true, cost: upgrade.cost, newLevel: upgrade.nextLevel });
});

// PATCH /api/teams/:id/stadium/customize — set color (zdarma)
gameRouter.patch("/teams/:teamId/stadium/customize", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ field: string; value: string | null }>();
  const allowed = new Set(["fence_color", "stand_color", "seat_color", "roof_color", "accent_color"]);
  if (!allowed.has(body.field)) return c.json({ error: "Invalid field" }, 400);
  // Hex color validation (jednoduchá)
  if (body.value !== null && !/^#[0-9A-Fa-f]{6}$/.test(body.value)) {
    return c.json({ error: "Invalid color (must be hex #RRGGBB or null)" }, 400);
  }
  await c.env.DB.prepare(`UPDATE stadiums SET ${body.field} = ? WHERE team_id = ?`)
    .bind(body.value, teamId).run();
  return c.json({ ok: true });
});

// POST /api/teams/:id/stadium/visual-upgrade — koupit scoreboard nebo vlajku
gameRouter.post("/teams/:teamId/stadium/visual-upgrade", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ kind: "scoreboard" | "flag" }>();

  const SCOREBOARD_COSTS = [0, 2000, 8000, 25000];
  const FLAG_COSTS = [0, 1500, 5000, 15000];

  const stadium = await c.env.DB.prepare(
    "SELECT scoreboard_level, flag_size FROM stadiums WHERE team_id = ?"
  ).bind(teamId).first<{ scoreboard_level: number; flag_size: number }>();
  if (!stadium) return c.json({ error: "Stadium not found" }, 404);

  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const currentLevel = body.kind === "scoreboard" ? stadium.scoreboard_level : stadium.flag_size;
  const nextLevel = currentLevel + 1;
  if (nextLevel > 3) return c.json({ error: "Už je na maxu" }, 400);
  const cost = (body.kind === "scoreboard" ? SCOREBOARD_COSTS : FLAG_COSTS)[nextLevel];
  if (team.budget < cost) return c.json({ error: "Nedostatek peněz" }, 400);

  await recordTransaction(c.env.DB, teamId, "stadium_visual", -cost,
    `Stadion vzhled: ${body.kind === "scoreboard" ? "scoreboard" : "vlajka"} L${nextLevel}`,
    new Date().toISOString());

  const column = body.kind === "scoreboard" ? "scoreboard_level" : "flag_size";
  await c.env.DB.prepare(`UPDATE stadiums SET ${column} = ? WHERE team_id = ?`)
    .bind(nextLevel, teamId).run();

  return c.json({ ok: true, cost, newLevel: nextLevel });
});

// POST /api/teams/:id/stadium/maintain-pitch — improve pitch condition
gameRouter.post("/teams/:teamId/stadium/maintain-pitch", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ level: "basic" | "thorough" | "renovation" }>();

  const costs: Record<string, { cost: number; improvement: number; label: string }> = {
    basic:      { cost: 500, improvement: 10, label: "Základní údržba (+10%)" },
    thorough:   { cost: 1000, improvement: 25, label: "Důkladná údržba (+25%)" },
    renovation: { cost: 1700, improvement: 50, label: "Renovace trávníku (+50%)" },
  };

  const action = costs[body.level];
  if (!action) return c.json({ error: "Invalid level" }, 400);

  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < action.cost) return c.json({ error: "Nedostatek peněz" }, 400);

  await recordTransaction(c.env.DB, teamId, "pitch_repair", -action.cost,
    `Údržba hřiště: +${action.improvement}% kondice`, new Date().toISOString());
  await c.env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MIN(100, pitch_condition + ?) WHERE team_id = ?"
  ).bind(action.improvement, teamId).run();

  return c.json({ ok: true, cost: action.cost, improvement: action.improvement });
});

// POST /api/teams/:id/stadium/upgrade-pitch — change pitch type
gameRouter.post("/teams/:teamId/stadium/upgrade-pitch", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ pitchType: string }>();

  const upgrades: Record<string, { from: string; cost: number }> = {
    hybrid:     { from: "natural", cost: 85000 },
    artificial: { from: "hybrid", cost: 220000 },
  };

  const upgrade = upgrades[body.pitchType];
  if (!upgrade) return c.json({ error: "Invalid pitch type" }, 400);

  const stadium = await c.env.DB.prepare("SELECT pitch_type FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<{ pitch_type: string }>();
  if (!stadium) return c.json({ error: "Stadium not found" }, 404);
  if (stadium.pitch_type !== upgrade.from) return c.json({ error: `Nejdřív potřebuješ ${upgrade.from} povrch` }, 400);

  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < upgrade.cost) return c.json({ error: "Nedostatek peněz" }, 400);

  await recordTransaction(c.env.DB, teamId, "pitch_upgrade", -upgrade.cost,
    `Změna povrchu: ${body.pitchType}`, new Date().toISOString());
  await c.env.DB.prepare(
    "UPDATE stadiums SET pitch_type = ?, pitch_condition = 100 WHERE team_id = ?"
  ).bind(body.pitchType, teamId).run();

  return c.json({ ok: true, cost: upgrade.cost });
});

// GET /api/teams/:id/roles — team roles (captain, penalty, free kick)
gameRouter.get("/teams/:teamId/roles", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare(
    "SELECT captain_id, penalty_taker_id, freekick_taker_id FROM teams WHERE id = ?"
  ).bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch team roles", e); return null; });

  if (!team) return c.json({ error: "Team not found" }, 404);
  return c.json({
    captainId: team.captain_id ?? null,
    penaltyTakerId: team.penalty_taker_id ?? null,
    freekickTakerId: team.freekick_taker_id ?? null,
  });
});

// POST /api/teams/:id/roles — set team roles
gameRouter.post("/teams/:teamId/roles", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ captainId?: string; penaltyTakerId?: string; freekickTakerId?: string }>();

  const updates: string[] = [];
  const binds: unknown[] = [];

  // Ověřit že přiřazované hráče ID patří do týmu (nenastavit cizího hráče jako kapitána)
  const idsToCheck = [body.captainId, body.penaltyTakerId, body.freekickTakerId].filter((id): id is string => !!id);
  if (idsToCheck.length > 0) {
    const placeholders = idsToCheck.map(() => "?").join(",");
    const validCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM players WHERE team_id = ? AND id IN (${placeholders})`
    ).bind(teamId, ...idsToCheck).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "validate role player ids", e); return null; });
    if (!validCount || validCount.cnt !== idsToCheck.length) {
      return c.json({ error: "Hráč nenáleží do týmu" }, 400);
    }
  }

  if (body.captainId !== undefined) { updates.push("captain_id = ?"); binds.push(body.captainId || null); }
  if (body.penaltyTakerId !== undefined) { updates.push("penalty_taker_id = ?"); binds.push(body.penaltyTakerId || null); }
  if (body.freekickTakerId !== undefined) { updates.push("freekick_taker_id = ?"); binds.push(body.freekickTakerId || null); }

  if (updates.length > 0) {
    binds.push(teamId);
    await c.env.DB.prepare(`UPDATE teams SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds).run().catch((e) => logger.warn({ module: "game" }, "update team roles", e));
  }

  return c.json({ ok: true });
});

// GET /api/teams/:id/injuries — active injuries
gameRouter.get("/teams/:teamId/injuries", async (c) => {
  const teamId = c.req.param("teamId");

  const result = await c.env.DB.prepare(
    `SELECT i.*, p.first_name, p.last_name, p.nickname, p.position, p.avatar
     FROM injuries i JOIN players p ON i.player_id = p.id
     WHERE i.team_id = ? AND i.days_remaining > 0
     ORDER BY i.days_remaining ASC`
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch injuries", e); return { results: [] }; });

  return c.json(result.results.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    position: row.position,
    avatar: row.avatar ? JSON.parse(row.avatar as string) : null,
    type: row.type,
    description: row.description,
    severity: row.severity,
    daysRemaining: row.days_remaining,
    daysTotal: row.days_total,
    createdAt: row.created_at,
  })));
});

// ═══ SPONSOR CONTRACTS ═══

// GET /api/teams/:id/sponsors — active contracts (main + stadium) + available offers
gameRouter.get("/teams/:teamId/sponsors", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.reputation, t.stadium_name, v.district, v.size, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ reputation: number; district: string; size: string; village_name: string; stadium_name: string | null }>().catch((e) => { logger.warn({ module: "game" }, "fetch team info for sponsors", e); return null; });
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Active contracts — one per category
  const activeRows = await c.env.DB.prepare(
    "SELECT * FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch active sponsor contracts", e); return { results: [] }; });

  const mapContract = (row: Record<string, unknown>) => ({
    id: row.id as string,
    category: (row.category as string) || "main",
    sponsorName: row.sponsor_name as string,
    sponsorType: row.sponsor_type as string,
    monthlyAmount: row.monthly_amount as number,
    winBonus: row.win_bonus as number,
    seasonsTotal: row.seasons_total as number,
    seasonsRemaining: row.seasons_remaining as number,
    earlyTerminationFee: row.early_termination_fee as number,
    isNamingRights: row.is_naming_rights === 1,
    signedAt: row.signed_at as string,
  });

  const mainContract = activeRows.results.find((r) => (r.category || "main") === "main");
  const stadiumContract = activeRows.results.find((r) => r.category === "stadium");
  const bannerContracts = activeRows.results.filter((r) => r.category === "banner");

  // Load district sponsors — stable ordering (no RANDOM)
  const sponsorRows = await c.env.DB.prepare(
    "SELECT * FROM district_sponsors WHERE district = ? ORDER BY name"
  ).bind(team.district).all().catch((e) => { logger.warn({ module: "game" }, "fetch district sponsors", e); return { results: [] }; });

  // Get current season for stable seed
  const seasonForSeed = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>().catch((e) => { logger.warn({ module: "sponsors" }, "fetch season for seed", e); return null; });
  const seedSeason = seasonForSeed?.number ?? 1;

  const repMod = team.reputation / 50;
  const sizeMod = team.size === "mesto" ? 1.3 : team.size === "mestys" ? 1.1 : team.size === "obec" ? 1.0 : 0.8;
  // Stable seed: same team + same season = same offers
  const { seedFromString } = await import("../lib/seed");
  const rng = createRng(seedFromString(teamId + "sponsors" + seedSeason));

  type Offer = {
    sponsorName: string; sponsorType: string;
    monthlyAmount: number; winBonus: number;
    seasons: number; earlyTerminationFee: number;
    requirement?: string;
  };

  // Generate main sponsor offers
  let mainOffers: Offer[] = [];
  if (!mainContract) {
    const offerCount = team.reputation >= 60 ? 5 : team.reputation >= 40 ? 4 : 3;
    const pool = sponsorRows.results.slice(0, offerCount * 2);
    for (let i = 0; i < Math.min(offerCount, pool.length); i++) {
      const s = pool[i];
      const monthly = Math.round(rng.int(s.monthly_min as number, s.monthly_max as number) * repMod * sizeMod * 3);
      const winB = Math.round(rng.int(s.win_bonus_min as number, s.win_bonus_max as number) * repMod * 2);
      const seasons = rng.int(1, 3);
      const terminationFee = Math.round(monthly * seasons * 2);
      let requirement: string | undefined;
      if (monthly > 2000) requirement = `Reputace ${Math.round(30 + monthly / 100)}+`;
      mainOffers.push({
        sponsorName: s.name as string, sponsorType: s.type as string,
        monthlyAmount: monthly, winBonus: winB, seasons, earlyTerminationFee: terminationFee, requirement,
      });
    }
    mainOffers.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  }

  // Generate stadium naming offers (lower amounts, no win bonus)
  let stadiumOffers: Offer[] = [];
  if (!stadiumContract) {
    const pool = sponsorRows.results.slice(sponsorRows.results.length > 4 ? 2 : 0);
    for (let i = 0; i < Math.min(3, pool.length); i++) {
      const s = pool[i];
      const monthly = Math.round(rng.int(s.monthly_min as number, s.monthly_max as number) * repMod * sizeMod * 1.5);
      const seasons = rng.int(1, 3);
      const terminationFee = Math.round(monthly * seasons * 2);
      const cleanName = (s.name as string).replace(/\s*s\.r\.o\.?\s*/gi, "").trim();
      stadiumOffers.push({
        sponsorName: `${cleanName} Arena`, sponsorType: s.type as string,
        monthlyAmount: monthly, winBonus: 0, seasons, earlyTerminationFee: terminationFee,
      });
    }
    stadiumOffers.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  }

  // Banner offers — vždy 12 možných, malé částky, bez naming/win bonus
  const MAX_BANNERS = 6;
  const bannerOffers: Offer[] = [];
  const usedNames = new Set<string>(bannerContracts.map((c) => c.sponsor_name as string));
  const bannerPool = sponsorRows.results.filter((s) => !usedNames.has(s.name as string));
  for (let i = 0; i < Math.min(12, bannerPool.length); i++) {
    const s = bannerPool[i];
    const monthly = Math.round(rng.int(s.monthly_min as number, s.monthly_max as number) * repMod * sizeMod * 0.8);
    const seasons = rng.int(1, 2);
    const terminationFee = Math.round(monthly * seasons * 1.5);
    bannerOffers.push({
      sponsorName: s.name as string, sponsorType: s.type as string,
      monthlyAmount: monthly, winBonus: 0, seasons, earlyTerminationFee: terminationFee,
    });
  }
  bannerOffers.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  // Batch: current season + team sponsor change info
  const [currentSeasonRes, teamFullRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
    c.env.DB.prepare("SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?").bind(teamId),
  ]);
  const seasonNum = (currentSeasonRes.results[0] as { number: number } | undefined)?.number ?? 1;
  const teamFull = (teamFullRes.results[0] as { name: string; last_main_sponsor_change_season: number | null } | undefined) ?? null;

  const changedThisSeason = (teamFull?.last_main_sponsor_change_season ?? 0) >= seasonNum;

  return c.json({
    mainContract: mainContract ? mapContract(mainContract) : null,
    stadiumContract: stadiumContract ? mapContract(stadiumContract) : null,
    bannerContracts: bannerContracts.map(mapContract),
    stadiumName: team.stadium_name,
    teamName: teamFull?.name ?? "",
    mainOffers: changedThisSeason ? [] : mainOffers,
    stadiumOffers,
    bannerOffers: bannerContracts.length >= MAX_BANNERS ? [] : bannerOffers,
    maxBanners: MAX_BANNERS,
    canChangeMainSponsor: !changedThisSeason,
    season: seasonNum,
  });
});

// POST /api/teams/:id/sponsors/sign — sign a new sponsor contract
gameRouter.post("/teams/:teamId/sponsors/sign", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{
    category: "main" | "stadium" | "banner";
    sponsorName: string; sponsorType: string;
    monthlyAmount: number; winBonus: number;
    seasons: number; earlyTerminationFee: number;
    isNamingRights?: boolean;
  }>();

  const category = body.category || "main";
  const MAX_BANNERS = 6;

  // Check no active contract in this category (banner: max 8 současně)
  const allActive = await c.env.DB.prepare(
    "SELECT id, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch active contracts for signing", e); return { results: [] }; });

  if (category === "banner") {
    const bannerCount = allActive.results.filter((r) => r.category === "banner").length;
    if (bannerCount >= MAX_BANNERS) {
      return c.json({ error: `Maximální počet bannerů (${MAX_BANNERS}) je dosažen` }, 400);
    }
  } else {
    const existing = allActive.results.find((r) => (r.category || "main") === category);
    if (existing) return c.json({ error: `Už máš aktivní smlouvu pro ${category === "main" ? "hlavního sponzora" : "stadion"}` }, 400);
  }

  // Season limit for main sponsor
  if (category === "main") {
    const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
      .first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for sponsor signing", e); return null; });
    const sn = season?.number ?? 1;
    const team = await c.env.DB.prepare("SELECT last_main_sponsor_change_season FROM teams WHERE id = ?")
      .bind(teamId).first<{ last_main_sponsor_change_season: number | null }>().catch((e) => { logger.warn({ module: "game" }, "fetch sponsor change limit", e); return null; });
    if ((team?.last_main_sponsor_change_season ?? 0) >= sn) {
      return c.json({ error: "Hlavního sponzora lze změnit pouze jednou za sezónu" }, 400);
    }
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus,
      seasons_total, seasons_remaining, early_termination_fee, is_naming_rights, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, teamId, body.sponsorName, body.sponsorType, body.monthlyAmount, body.winBonus,
    body.seasons, body.seasons, body.earlyTerminationFee, body.isNamingRights ? 1 : 0, category,
  ).run();

  if (category === "main") {
    // Update team name to sponsor name + village
    const teamInfo = await c.env.DB.prepare("SELECT name, village_id FROM teams WHERE id = ?")
      .bind(teamId).first<{ name: string; village_id: string }>();
    const village = await c.env.DB.prepare("SELECT name FROM villages WHERE id = ?")
      .bind(teamInfo!.village_id).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch village for sponsor rename", e); return null; });
    const oldName = teamInfo!.name;
    const newName = `FK ${body.sponsorName} ${village?.name ?? ""}`.trim();
    const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
      .first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for sponsor rename", e); return null; });
    // Reputation penalty for name change (-3)
    await c.env.DB.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ?, reputation = MAX(0, reputation - 3) WHERE id = ?")
      .bind(newName, season?.number ?? 1, teamId).run();

    // News for entire league
    await c.env.DB.prepare(
      "INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(crypto.randomUUID(), teamId,
      `${oldName} mění název na ${newName}`,
      `Klub ${oldName} podepsal sponzorskou smlouvu s ${body.sponsorName} a mění svůj název na ${newName}. Fanoušci nejsou nadšení (-3 reputace).`,
    ).run().catch((e) => logger.warn({ module: "game" }, "insert sponsor rename news", e));

    return c.json({ ok: true, contractId: id, newTeamName: newName, reputationPenalty: 3 });
  }

  // Stadium sponsor
  if (category === "stadium") {
    await c.env.DB.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?")
      .bind(body.sponsorName, teamId).run();
  }

  return c.json({ ok: true, contractId: id });
});

// POST /api/teams/:id/sponsors/terminate — early termination (with fee)
gameRouter.post("/teams/:teamId/sponsors/terminate", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category?: "main" | "stadium" | "banner"; contractId?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse terminate body", e); return { category: "main" as const, contractId: undefined as string | undefined }; });
  const category = body.category || "main";

  const allActiveT = await c.env.DB.prepare(
    "SELECT id, early_termination_fee, seasons_remaining, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch contracts for termination", e); return { results: [] }; });

  // Pro banner — vyžaduje contractId (může jich být víc)
  const contractRow = category === "banner"
    ? allActiveT.results.find((r) => r.id === body.contractId && r.category === "banner")
    : allActiveT.results.find((r) => (r.category || "main") === category);
  const contract = contractRow ? {
    id: contractRow.id as string,
    early_termination_fee: contractRow.early_termination_fee as number,
    seasons_remaining: contractRow.seasons_remaining as number,
  } : null;

  if (!contract) return c.json({ error: "Žádná aktivní smlouva" }, 400);

  // Calculate pro-rated fee
  const fee = Math.round(contract.early_termination_fee * (contract.seasons_remaining / 3));

  const team = await c.env.DB.prepare("SELECT budget, village_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number; village_id: string }>();
  if (!team || team.budget < fee) return c.json({ error: `Nedostatek peněz (sankce ${fee} Kč)` }, 400);

  // Deduct fee + terminate
  await recordTransaction(c.env.DB, teamId, "sponsor_termination", -fee,
    `Ukončení sponzorské smlouvy (sankce)`, new Date().toISOString());
  await c.env.DB.prepare("UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ?").bind(contract.id).run();

  const village = await c.env.DB.prepare("SELECT name FROM villages WHERE id = ?")
    .bind(team.village_id).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch village for termination", e); return null; });

  if (category === "main") {
    // Revert to default name + reputation penalty (-2)
    const oldName = (await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>())?.name ?? "";
    const defaultName = `SK ${village?.name ?? ""}`.trim();
    await c.env.DB.prepare("UPDATE teams SET name = ?, reputation = MAX(0, reputation - 2) WHERE id = ?")
      .bind(defaultName, teamId).run();

    // News for entire league
    await c.env.DB.prepare(
      "INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(crypto.randomUUID(), teamId,
      `${oldName} se přejmenovává na ${defaultName}`,
      `Klub ${oldName} ukončil sponzorskou smlouvu a vrací se k názvu ${defaultName}. Fanoušci zmatení (-2 reputace).`,
    ).run().catch((e) => logger.warn({ module: "game" }, "insert termination rename news", e));

    return c.json({ ok: true, fee, newTeamName: defaultName, reputationPenalty: 2 });
  }

  if (category === "stadium") {
    if (village) {
      await c.env.DB.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?")
        .bind(`Sportovní areál ${village.name}`, teamId).run();
    }
  }

  // Banner — žádné rename ani penalty na reputaci
  return c.json({ ok: true, fee });
});

// POST /api/teams/:id/rename — custom rename (after sponsor termination, once per season)
gameRouter.post("/teams/:teamId/rename", async (c) => {
  const teamId = c.req.param("teamId");
  const { name } = await c.req.json<{ name: string }>();

  if (!name || name.trim().length < 2 || name.trim().length > 50) {
    return c.json({ error: "Název musí mít 2-50 znaků" }, 400);
  }

  // Check season limit
  const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for rename", e); return null; });
  const sn = season?.number ?? 1;
  const team = await c.env.DB.prepare("SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; last_main_sponsor_change_season: number | null }>().catch((e) => { logger.warn({ module: "game" }, "fetch team for rename", e); return null; });

  if (!team) return c.json({ error: "Team not found" }, 404);
  if ((team.last_main_sponsor_change_season ?? 0) >= sn) {
    return c.json({ error: "Název lze změnit pouze jednou za sezónu" }, 400);
  }

  // Check no active main sponsor (can't rename while sponsored)
  const activeSponsor = await c.env.DB.prepare(
    "SELECT id FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'main' OR category IS NULL)"
  ).bind(teamId).first().catch((e) => { logger.warn({ module: "game" }, "check active sponsor for rename", e); return null; });
  if (activeSponsor) return c.json({ error: "Nelze přejmenovat při aktivní sponzorské smlouvě" }, 400);

  const oldName = team.name;
  const newName = name.trim();
  // Reputation penalty (-3)
  await c.env.DB.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ?, reputation = MAX(0, reputation - 3) WHERE id = ?")
    .bind(newName, sn, teamId).run();

  // News for entire league
  await c.env.DB.prepare(
    "INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(crypto.randomUUID(), teamId,
    `${oldName} se přejmenovává na ${newName}`,
    `Klub ${oldName} mění svůj název na ${newName}. Fanoušci reagují rozpačitě (-3 reputace).`,
  ).run().catch((e) => logger.warn({ module: "game" }, "insert rename news", e));

  return c.json({ ok: true, newName, reputationPenalty: 3 });
});

// POST /api/leagues/:leagueId/generate-schedule — generate schedule if missing
gameRouter.post("/leagues/:leagueId/generate-schedule", async (c) => {
  const leagueId = c.req.param("leagueId");

  const league = await c.env.DB.prepare(
    "SELECT l.id, l.season_id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(leagueId).first<{ id: string; season_id: string; season_number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch league for schedule", e); return null; });
  if (!league) return c.json({ error: "League not found" }, 404);

  // Check if schedule already exists
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE league_id = ?"
  ).bind(leagueId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "count existing schedule", e); return { cnt: 0 }; });
  if (existing && existing.cnt > 0) return c.json({ error: "Schedule already exists", matchCount: existing.cnt }, 400);

  const teamRows = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE league_id = ? ORDER BY name"
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "game" }, "fetch teams for schedule", e); return { results: [] }; });

  const teamIds = teamRows.results.map((r) => r.id as string);
  if (teamIds.length < 2) return c.json({ error: "Not enough teams" }, 400);

  const { generateSchedule } = await import("../league/schedule");
  const { generateSeasonCalendar } = await import("../season/calendar");

  const rng = createRng(cryptoSeed());
  const schedule = generateSchedule(rng, teamIds.length);
  const calendar = generateSeasonCalendar(leagueId, league.season_number, new Date());

  for (const entry of calendar.entries) {
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
    ).bind(entry.id, leagueId, league.season_number, entry.gameWeek, entry.matchDay, entry.scheduledAt).run().catch((e) => logger.warn({ module: "game" }, "insert calendar entry", e));
  }

  const calendarByWeek = new Map<number, string>();
  for (const entry of calendar.entries) {
    if (!calendarByWeek.has(entry.gameWeek)) {
      calendarByWeek.set(entry.gameWeek, entry.id);
    }
  }

  let inserted = 0;
  for (const match of schedule) {
    if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length) continue;
    const calId = calendarByWeek.get(match.round) ?? null;
    await c.env.DB.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
    ).bind(crypto.randomUUID(), leagueId, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex]).run().catch((e) => logger.warn({ module: "game" }, "insert match", e));
    inserted++;
  }

  return c.json({ ok: true, matchesCreated: inserted, calendarEntries: calendar.entries.length, teams: teamIds.length });
});

// GET /api/teams/:id/season-info — season number, current day, total days, upcoming events
gameRouter.get("/teams/:teamId/season-info", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id, training_type, training_sessions, training_approach, season_start, season_end, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; training_type: string | null; training_sessions: number | null; training_approach: string | null; season_start: string | null; season_end: string | null; game_date: string | null }>();
  if (!team?.league_id) return c.json({ season: 1, currentDay: 1, totalDays: 1, upcoming: [] });

  // Batch: league info + calendar entries
  const [leagueRes, calRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT l.id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(team.league_id),
    c.env.DB.prepare("SELECT sc.*, m.home_team_id, m.away_team_id, m.status as match_status, m.home_score, m.away_score, ht.name as home_name, at.name as away_name FROM season_calendar sc LEFT JOIN matches m ON m.calendar_id = sc.id AND (m.home_team_id = ? OR m.away_team_id = ?) LEFT JOIN teams ht ON m.home_team_id = ht.id LEFT JOIN teams at ON m.away_team_id = at.id WHERE sc.league_id = ? ORDER BY sc.scheduled_at ASC").bind(teamId, teamId, team.league_id),
  ]);
  const league = (leagueRes.results[0] as { id: string; season_number: number } | undefined) ?? null;
  const calEntries = calRes.results as Record<string, unknown>[];

  if (calEntries.length === 0) return c.json({ season: league?.season_number ?? 1, currentDay: 1, totalDays: 1, upcoming: [] });

  // Calculate season day
  const firstEntry = calEntries[0];
  const lastEntry = calEntries[calEntries.length - 1];
  const seasonStart = team.season_start ? new Date(team.season_start) : new Date(firstEntry.scheduled_at as string);
  const seasonEnd = team.season_end ? new Date(team.season_end) : new Date(lastEntry.scheduled_at as string);
  const now = team.game_date ? new Date(team.game_date) : new Date();
  const totalDays = Math.max(1, Math.ceil((seasonEnd.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000)));
  const currentDay = Math.max(1, Math.min(totalDays, Math.ceil((now.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000))));

  // Build upcoming events (next 10)
  const upcoming: Array<{
    type: "match" | "training" | "seasonal";
    date: string;
    title: string;
    subtitle?: string;
    status?: string;
    isHome?: boolean;
  }> = [];

  // My matches
  for (const entry of calEntries) {
    if (!entry.home_team_id) continue; // no match for this team in this slot
    const isHome = entry.home_team_id === teamId;
    const opponent = isHome ? entry.away_name : entry.home_name;
    const matchStatus = entry.match_status as string;

    upcoming.push({
      type: "match",
      date: entry.scheduled_at as string,
      title: `${entry.game_week}. kolo — ${opponent ?? "Soupeř"}`,
      subtitle: isHome ? "Doma" : "Venku",
      status: matchStatus === "simulated"
        ? `${entry.home_score}:${entry.away_score}`
        : "Naplánováno",
      isHome,
    });
  }

  // Friendly matches (challenges)
  const friendlyMatches = await c.env.DB.prepare(
    `SELECT m.id, m.status, m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.created_at, m.simulated_at,
       t1.name as home_name, t2.name as away_name
     FROM matches m
     JOIN teams t1 ON m.home_team_id = t1.id
     JOIN teams t2 ON m.away_team_id = t2.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.calendar_id IS NULL
     ORDER BY m.created_at DESC LIMIT 10`
  ).bind(teamId, teamId).all().catch(() => ({ results: [] }));

  for (const fm of friendlyMatches.results as Record<string, unknown>[]) {
    const isHome = fm.home_team_id === teamId;
    const opponent = isHome ? fm.away_name as string : fm.home_name as string;
    const fmStatus = fm.status as string;
    upcoming.push({
      type: "match",
      date: (fm.simulated_at ?? fm.created_at) as string,
      title: `Přátelák — ${opponent}`,
      subtitle: isHome ? "Doma" : "Venku",
      status: fmStatus === "simulated"
        ? `${fm.home_score}:${fm.away_score}`
        : fmStatus === "lineups_open" ? "Nastav sestavu!" : "Naplánováno",
      isHome,
    });
  }

  // Training days — based on sessions per week setting
  if (team.training_type) {
    const sessions = team.training_sessions ?? 2;
    // Zápasy jsou St(3) + So(6) — tréninky nesmí kolidovat
    const trainingDays: number[] = sessions >= 3 ? [1, 2, 4] : sessions >= 2 ? [2, 4] : [1];
    const typeLabels: Record<string, string> = { conditioning: "Kondice", technique: "Technika", tactics: "Taktika", match_practice: "Zápasový" };
    const approachLabels: Record<string, string> = { strict: "přísný", balanced: "vyrovnaný", relaxed: "volný" };
    const label = typeLabels[team.training_type] ?? team.training_type;
    const approach = team.training_approach ? approachLabels[team.training_approach] ?? "" : "";

    const today = new Date(now);
    const daysToGenerate = Math.max(14, totalDays - currentDay + 1);
    for (let d = 0; d < daysToGenerate; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() + d);
      const dow = day.getDay();
      if (trainingDays.includes(dow)) {
        upcoming.push({
          type: "training",
          date: day.toISOString(),
          title: `Trénink — ${label}`,
          subtitle: approach ? `${sessions}×/týden · ${approach}` : `${sessions}×/týden`,
        });
      }
    }
  }

  // Sort by date and take next events
  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gameNow = new Date(now); gameNow.setUTCHours(0, 0, 0, 0);
  const futureEvents = upcoming.filter((e) => new Date(e.date) >= gameNow || e.status === "Naplánováno");

  return c.json({
    season: league?.season_number ?? 1,
    currentDay,
    totalDays,
    gameDate: now.toISOString(),
    upcoming,
  });
});

// POST /api/game/ai-market — force AI market activity for testing
gameRouter.post("/game/ai-market", async (c) => {
  const body = await c.req.json<{ leagueId: string }>().catch((e) => { logger.warn({ module: "game" }, "parse ai-market body", e); return null; });
  if (!body?.leagueId) return c.json({ error: "Missing leagueId" }, 400);
  const league = await c.env.DB.prepare("SELECT district FROM leagues WHERE id = ?").bind(body.leagueId).first<{ district: string }>();
  if (!league) return c.json({ error: "League not found" }, 404);
  const { generateAiListings, generateAiOffers } = await import("../transfers/virtual-teams");
  const rng = createRng(cryptoSeed());
  // Force: override 30%/10% chance by calling multiple times
  let listings = 0, offers = 0;
  for (let i = 0; i < 5; i++) {
    listings += await generateAiListings(c.env.DB, league.district, body.leagueId, rng);
    offers += await generateAiOffers(c.env.DB, league.district, body.leagueId, rng);
  }
  return c.json({ ok: true, listings, offers, district: league.district });
});

// POST /api/game/spawn-celebrity — force spawn celebrity for testing
gameRouter.post("/game/spawn-celebrity", async (c) => {
  const body = await c.req.json<{ leagueId: string; type?: string; tier?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse spawn-celebrity body", e); return null; });
  if (!body?.leagueId) return c.json({ error: "Missing leagueId" }, 400);
  const { spawnCelebrity } = await import("../season/celebrity-spawn");
  const rng = createRng(cryptoSeed());
  const result = await spawnCelebrity(c.env.DB, body.leagueId, rng, body.type as any, body.tier as any);
  return c.json({ ok: true, result });
});

// POST /api/game/set-admin — nastavit admin roli (vyžaduje admin session přes middleware výše)
// Prvního admina je nutné nastavit přímo přes: npx wrangler d1 execute <db> --remote --command
// 'UPDATE users SET is_admin = 1 WHERE email = "admin@example.com"'
gameRouter.post("/game/set-admin", async (c) => {
  const body = await c.req.json<{ email: string; isAdmin: boolean }>().catch((e) => { logger.warn({ module: "game" }, "parse set-admin body", e); return null; });
  if (!body?.email) return c.json({ error: "Missing email" }, 400);

  await c.env.DB.prepare("UPDATE users SET is_admin = ? WHERE email = ?").bind(body.isAdmin ? 1 : 0, body.email).run();
  return c.json({ ok: true, email: body.email, isAdmin: body.isAdmin });
});

// POST /api/game/bootstrap-league — vyplní existující prázdnou ligu AI týmy + rozpis
gameRouter.post("/game/bootstrap-league", async (c) => {
  const body = await c.req.json<{ leagueId: string; simulateRounds?: number }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (!body?.leagueId) return c.json({ error: "Missing leagueId" }, 400);

  const db = c.env.DB;
  const league = await db.prepare("SELECT id, district, name, level, season_id, status FROM leagues WHERE id = ?")
    .bind(body.leagueId).first<{ id: string; district: string; name: string; level: string; season_id: string; status: string }>();
  if (!league) return c.json({ error: "League not found" }, 404);
  if (league.status !== "active") return c.json({ error: "League not active" }, 400);

  // Check existing teams
  const existingTeams = await db.prepare("SELECT id, name, user_id, village_id FROM teams WHERE league_id = ?").bind(league.id).all();
  const humanTeam = existingTeams.results.find(t => t.user_id !== "ai");
  const aiTeamCount = existingTeams.results.filter(t => t.user_id === "ai").length;
  const targetAI = 14 - (humanTeam ? 1 : 0) - aiTeamCount;

  if (targetAI <= 0) return c.json({ error: "League already has enough teams", teams: existingTeams.results.length }, 400);

  // Get district villages (exclude already used)
  const usedVillageIds = new Set(existingTeams.results.map(t => t.village_id as string));
  const districtVillages = await db.prepare(
    "SELECT id as code, name, district, region as region_code, population, size as category FROM villages WHERE district = ?"
  ).bind(league.district).all();

  const availableVillages = districtVillages.results
    .filter(v => !usedVillageIds.has(v.code as string))
    .map(v => ({
      name: v.name as string, code: v.code as string,
      region_code: v.region_code as string || "CZ010",
      category: (v.category as string) === "hamlet" ? "vesnice" : (v.category as string) === "village" ? "obec" : (v.category as string) === "town" ? "mestys" : "mesto",
      population: v.population as number,
    }));

  if (availableVillages.length < targetAI) {
    return c.json({ error: `Not enough villages: need ${targetAI}, have ${availableVillages.length}` }, 400);
  }

  // Load district data
  const { getDistrictDataFromDB } = await import("../data/districts/index");
  const districtData = await getDistrictDataFromDB(db, league.district);
  const { createRng } = await import("../generators/rng");
  const rng = createRng(cryptoSeed());
  const usedNames = new Set(existingTeams.results.map(t => t.name as string));

  // Determine village size for skill generation (use first available village's category)
  const villageSize = (districtVillages.results[0]?.category as string) ?? "village";

  // Generate AI teams
  const { generateAITeams } = await import("../league/ai-teams");
  const firstnameData = {
    male: {
      "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05, "Zdeněk": 0.04 },
      "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.04, "Roman": 0.03 },
      "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
      "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
      "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
      "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05, "Šimon": 0.04 },
    },
  };

  const aiTeams = generateAITeams(rng, availableVillages, targetAI, districtData.surnames, firstnameData, usedNames);

  // Insert AI teams into DB
  const { insertAITeamsIntoDB } = await import("../league/insert-ai-teams");
  const leagueSetup = {
    name: league.name, district: league.district, season: "2024/2025", level: 1, totalRounds: 26,
    teams: aiTeams.map(ai => ({
      teamName: ai.teamName, villageName: ai.villageName, villageCode: ai.villageCode,
      primaryColor: ai.primaryColor, secondaryColor: ai.secondaryColor, isPlayer: false, aiTeam: ai,
    })),
    schedule: [],
  };
  await insertAITeamsIntoDB(db, league.id, leagueSetup, districtVillages.results as any, rng, villageSize, league.district);

  // Generate schedule + calendar
  const { generateSchedule, totalRounds } = await import("../league/schedule");
  const { generateSeasonCalendar } = await import("../season/calendar");

  const allTeams = await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(league.id).all();
  const teamIds = allTeams.results.map(r => r.id as string);

  const seasonRow = await db.prepare("SELECT number FROM seasons WHERE id = ?").bind(league.season_id).first<{ number: number }>();
  const seasonNumber = seasonRow?.number ?? 1;

  const schedule = generateSchedule(rng, teamIds.length);
  const calendar = generateSeasonCalendar(league.id, seasonNumber, new Date());
  const rounds = totalRounds(teamIds.length);

  // Insert calendar entries
  for (const entry of calendar.entries) {
    await db.prepare(
      "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
    ).bind(entry.id, league.id, seasonNumber, entry.gameWeek, entry.matchDay, entry.scheduledAt)
      .run().catch((e: any) => logger.warn({ module: "bootstrap" }, "calendar insert", e));
  }

  // Map calendar entries by week
  const calByWeek = new Map<number, string>();
  for (const entry of calendar.entries) {
    if (!calByWeek.has(entry.gameWeek)) calByWeek.set(entry.gameWeek, entry.id);
  }

  // Insert matches
  for (const match of schedule) {
    if (match.homeTeamIndex >= teamIds.length || match.awayTeamIndex >= teamIds.length) continue;
    const calId = calByWeek.get(match.round) ?? null;
    await db.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
    ).bind(crypto.randomUUID(), league.id, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex])
      .run().catch((e: any) => logger.warn({ module: "bootstrap" }, "match insert", e));
  }

  // Set game_date — sync to the global max game_date across all leagues (prevents permanent offset)
  if (calendar.entries.length > 0) {
    const globalDate = await db.prepare(
      "SELECT MAX(game_date) as max_date FROM teams WHERE game_date IS NOT NULL AND league_id != ?"
    ).bind(league.id).first<{ max_date: string }>().catch((e) => { logger.warn({ module: "bootstrap" }, "load global game_date for init", e); return null; });
    const firstMatch = new Date(calendar.entries[0].scheduledAt);
    firstMatch.setDate(firstMatch.getDate() - 1);
    const initDate = globalDate?.max_date && globalDate.max_date > firstMatch.toISOString()
      ? globalDate.max_date
      : firstMatch.toISOString();
    await db.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
      .bind(initDate, league.id).run();
  }

  // Simulate past rounds if requested
  let simulatedRounds = 0;
  if (body.simulateRounds && body.simulateRounds > 0) {
    const { runScheduledMatches } = await import("../multiplayer/match-runner");
    // Set game_date far ahead so all rounds are eligible
    await db.prepare("UPDATE teams SET game_date = '2030-01-01T00:00:00.000Z' WHERE league_id = ?").bind(league.id).run();

    for (let r = 0; r < body.simulateRounds; r++) {
      const cal = await db.prepare(
        "SELECT id FROM season_calendar WHERE league_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1"
      ).bind(league.id).first<{ id: string }>();
      if (!cal) break;

      await db.prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'")
        .bind(cal.id).run();
      await runScheduledMatches(db, cal.id);
      await db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?").bind(cal.id).run();
      simulatedRounds++;
    }

    // Sync game_date with reference league (Prachatice or similar)
    const refTeam = await db.prepare(
      "SELECT t.game_date FROM teams t JOIN leagues l ON t.league_id = l.id WHERE l.district != ? AND t.game_date IS NOT NULL LIMIT 1"
    ).bind(league.district).first<{ game_date: string }>();
    if (refTeam?.game_date) {
      await db.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?").bind(refTeam.game_date, league.id).run();
    }
  }

  return c.json({
    ok: true,
    league: league.name,
    teams: teamIds.length,
    matches: schedule.length,
    calendarEntries: calendar.entries.length,
    simulatedRounds,
  });
});

// POST /api/game/advance-day — denní tick (posun dne, tréninky, finance, zprávy)
// Zápasy a zpravodaj řeší VÝHRADNĚ run-matches cron (18:00 CET)
gameRouter.post("/game/advance-day", async (c) => {
  const result = await executeDailyTick(c.env);
  return c.json({ ok: true, type: "daily", result });
});

// POST /api/game/run-matches — simulace zápasů, max 1 liga za invokaci
gameRouter.post("/game/run-matches", async (c) => {
  const { runScheduledMatches } = await import("../multiplayer/match-runner");
  const targetLeagueId = c.req.query("leagueId");

  const leagueRows = await c.env.DB.prepare(
    "SELECT DISTINCT t.league_id, MIN(t.game_date) as game_date FROM teams t WHERE t.league_id IS NOT NULL AND t.game_date IS NOT NULL GROUP BY t.league_id"
  ).all();

  let totalMatches = 0;
  let processedLeague: string | null = null;

  for (const row of leagueRows.results) {
    const gameDate = row.game_date as string | null;
    const leagueId = row.league_id as string | null;
    if (!gameDate || !leagueId) continue;
    if (targetLeagueId && leagueId !== targetLeagueId) continue;

    const gd = new Date(gameDate);
    const dayEnd = new Date(gd); dayEnd.setUTCHours(23, 59, 59, 999);

    const matchCal = await c.env.DB.prepare(
      "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at <= ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1"
    ).bind(leagueId, dayEnd.toISOString()).first<{ id: string }>();

    if (matchCal) {
      if (processedLeague && !targetLeagueId) break;

      const { calculateStandings } = await import("../stats/standings");
      const standingsBefore = await calculateStandings(c.env.DB, leagueId);

      await c.env.DB.prepare("UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'")
        .bind(matchCal.id).run();
      const results = await runScheduledMatches(c.env.DB, matchCal.id);
      await c.env.DB.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?")
        .bind(matchCal.id).run();
      totalMatches += results.length;

      if (results.length > 0) {
        try {
          const calRow = await c.env.DB.prepare("SELECT game_week FROM season_calendar WHERE id = ?")
            .bind(matchCal.id).first<{ game_week: number }>();
          const gameWeek = calRow?.game_week ?? 0;
          const matchRows = await c.env.DB.prepare(
            "SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND m.status = 'simulated'"
          ).bind(matchCal.id).all();
          const lines: string[] = [];
          for (const r of matchRows.results) {
            const hs = r.home_score as number; const as_ = r.away_score as number;
            const hn = r.home_name as string; const an = r.away_name as string;
            if (hs > as_) lines.push(`${hn} porazil ${an} ${hs}:${as_}`);
            else if (hs < as_) lines.push(`${an} zvítězil nad ${hn} ${as_}:${hs}`);
            else lines.push(`${hn} remizoval s ${an} ${hs}:${as_}`);
          }
          await c.env.DB.prepare("INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
            .bind(crypto.randomUUID(), leagueId, `${gameWeek}. kolo: přehled výsledků`, lines.join(". ") + ".", gameWeek).run();

          if (c.env.GEMINI_API_KEY) {
            try {
              const { generateAiRoundReport } = await import("../news/ai-reporter");
              await generateAiRoundReport(c.env.DB, c.env.GEMINI_API_KEY, leagueId, matchCal.id, gameWeek, standingsBefore);
            } catch (e: any) {
              logger.warn({ module: "game" }, `AI reporter error: ${e.message}`);
            }
          }
          try {
            const { pickRandomAdhocEvent } = await import("../season/seasonal-events");
            const { createRng } = await import("../generators/rng");
            const humanTeams = await c.env.DB.prepare(
              "SELECT t.id, t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.league_id = ? AND t.user_id <> 'ai'"
            ).bind(leagueId).all();
            for (const ht of humanTeams.results) {
              const adhocRng = createRng(cryptoSeed());
              const adhocEvent = pickRandomAdhocEvent(adhocRng, gameWeek, ht.district as string);
              if (adhocEvent) {
                await c.env.DB.prepare(
                  "INSERT INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, '1', ?, 'pending')"
                ).bind(crypto.randomUUID(), ht.league_id, adhocEvent.type, adhocEvent.title, adhocEvent.description,
                  JSON.stringify(adhocEvent.effects), JSON.stringify(adhocEvent.choices), adhocEvent.gameWeek
                ).run().catch((e: any) => logger.warn({ module: "game" }, `ad-hoc event insert: ${e.message}`));
              }
            }
          } catch (e: any) { logger.warn({ module: "game" }, `ad-hoc events: ${e.message}`); }
        } catch (e: any) { logger.warn({ module: "game" }, `news generation: ${e.message}`); }
      }
      processedLeague = leagueId;
    }
  }

  // Přáteláky
  try {
    const { simulateFriendlyMatches } = await import("../multiplayer/friendly-runner");
    const friendlyCount = await simulateFriendlyMatches(c.env.DB);
    totalMatches += friendlyCount;
  } catch (e: any) { logger.warn({ module: "game" }, `friendlies: ${e.message}`); }

  // Collect debug from global
  const debugLogs = (globalThis as any).__lineupDebug ?? [];
  return c.json({ ok: true, type: "matches", totalMatches, processedLeague, debug: debugLogs });
});

// ═══ Classifieds (Placená inzerce) ═══

const CLASSIFIED_CATEGORIES: Record<string, { label: string; icon: string }> = {
  player_wanted: { label: "Hledáme hráče", icon: "\u{1F50D}" },
  player_offering: { label: "Hráč k dispozici", icon: "\u{1F91A}" },
  equipment: { label: "Vybavení", icon: "\u{1F3BD}" },
  match: { label: "Přátelský zápas", icon: "\u26BD" },
  general: { label: "Různé", icon: "\u{1F4CB}" },
};

const CLASSIFIED_COST = 500; // Kč per ad
const CLASSIFIED_DURATION_DAYS = 14;

// GET /api/teams/:teamId/classifieds — all active classifieds visible to this team's league
gameRouter.get("/teams/:teamId/classifieds", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>();

  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    `SELECT * FROM classifieds
     WHERE (league_id = ? OR league_id IS NULL)
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at DESC`
  ).bind(team?.league_id ?? "", now).all().catch((e) => { logger.warn({ module: "game" }, "fetch classifieds", e); return { results: [] }; });

  return c.json({
    classifieds: result.results.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_name,
      category: row.category,
      categoryLabel: CLASSIFIED_CATEGORIES[row.category as string]?.label ?? "Různé",
      categoryIcon: CLASSIFIED_CATEGORIES[row.category as string]?.icon ?? "\u{1F4CB}",
      message: row.message,
      cost: row.cost,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      isOwn: row.team_id === teamId,
    })),
    categories: Object.entries(CLASSIFIED_CATEGORIES).map(([key, val]) => ({
      key, label: val.label, icon: val.icon,
    })),
    cost: CLASSIFIED_COST,
  });
});

// POST /api/teams/:teamId/classifieds — create a new classified ad (deducts from budget)
gameRouter.post("/teams/:teamId/classifieds", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category?: string; message?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse classified body", e); return { category: undefined, message: undefined }; });

  if (!body.message || body.message.trim().length < 5) {
    return c.json({ error: "Zpráva musí mít alespoň 5 znaků" }, 400);
  }
  if (body.message.length > 200) {
    return c.json({ error: "Zpráva může mít max 200 znaků" }, 400);
  }

  const category = body.category && CLASSIFIED_CATEGORIES[body.category] ? body.category : "general";

  // Get team info + budget
  const team = await c.env.DB.prepare("SELECT name, budget, league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; budget: number; league_id: string | null }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  if (team.budget < CLASSIFIED_COST) {
    return c.json({ error: `Nedostatečný rozpočet. Potřebujete ${CLASSIFIED_COST} Kč, máte ${team.budget} Kč.` }, 400);
  }

  // Deduct cost
  await recordTransaction(c.env.DB, teamId, "classified_ad", -CLASSIFIED_COST,
    `Inzerát ve zpravodaji`, new Date().toISOString());

  // Create classified
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CLASSIFIED_DURATION_DAYS * 86400000).toISOString();

  await c.env.DB.prepare(
    "INSERT INTO classifieds (id, team_id, team_name, league_id, category, message, cost, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, teamId, team.name, team.league_id, category, body.message.trim(), CLASSIFIED_COST, expiresAt).run();

  return c.json({ ok: true, id, newBudget: team.budget - CLASSIFIED_COST });
});

// DELETE /api/teams/:teamId/classifieds/:id — remove own classified
gameRouter.delete("/teams/:teamId/classifieds/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const id = c.req.param("id");

  const ad = await c.env.DB.prepare("SELECT team_id FROM classifieds WHERE id = ?")
    .bind(id).first<{ team_id: string }>();
  if (!ad || ad.team_id !== teamId) return c.json({ error: "Inzerát nenalezen" }, 404);

  await c.env.DB.prepare("DELETE FROM classifieds WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ═══ LINEUP / NEXT MATCH ═══

// GET next match info + current lineup
// Optional ?calendarId=X — vrátí konkrétní zápas (calendar entry NEBO friendly match.id), jinak nejbližší
gameRouter.get("/teams/:teamId/next-match", async (c) => {
  const teamId = c.req.param("teamId");
  const requestedCalId = c.req.query("calendarId");

  const team = await c.env.DB.prepare("SELECT league_id, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; game_date: string | null }>();
  if (!team) return c.json({ nextMatch: null });

  const gameDate = team.game_date ? new Date(team.game_date) : new Date();

  let match: Record<string, unknown> | null = null;
  let calendarId: string | null = null;
  let gameWeek: number | null = null;
  let scheduledAt: string | null = null;
  let isFriendly = false;

  // Pokud klient požaduje konkrétní calendarId/matchId, najdi přesně ten zápas
  if (requestedCalId) {
    // Zkus calendar entry (ligový)
    const reqCal = await c.env.DB.prepare(
      "SELECT id, scheduled_at, game_week FROM season_calendar WHERE id = ?"
    ).bind(requestedCalId).first<{ id: string; scheduled_at: string; game_week: number }>();
    if (reqCal) {
      calendarId = reqCal.id;
      gameWeek = reqCal.game_week;
      scheduledAt = reqCal.scheduled_at;
      match = await c.env.DB.prepare(
        "SELECT m.id, m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name, t1.primary_color as home_color, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)"
      ).bind(reqCal.id, teamId, teamId).first<Record<string, unknown>>();
    } else {
      // Možná je to friendly match.id
      const friend = await c.env.DB.prepare(
        `SELECT m.id, m.home_team_id, m.away_team_id, m.created_at,
           t1.name as home_name, t2.name as away_name,
           t1.primary_color as home_color, t2.primary_color as away_color
         FROM matches m
         JOIN teams t1 ON m.home_team_id = t1.id
         JOIN teams t2 ON m.away_team_id = t2.id
         WHERE m.id = ? AND m.calendar_id IS NULL AND (m.home_team_id = ? OR m.away_team_id = ?)`
      ).bind(requestedCalId, teamId, teamId).first<Record<string, unknown>>();
      if (friend) {
        match = friend;
        isFriendly = true;
        scheduledAt = friend.created_at as string;
      }
    }
  }

  // Pokud requestedCalId nedohledán nebo nebyl, fallback na default flow:
  // Priority: friendly match with lineups_open (needs immediate lineup)
  if (!match) {
    const friendlyMatch = await c.env.DB.prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, m.created_at,
         t1.name as home_name, t2.name as away_name,
         t1.primary_color as home_color, t2.primary_color as away_color
       FROM matches m
       JOIN teams t1 ON m.home_team_id = t1.id
       JOIN teams t2 ON m.away_team_id = t2.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'lineups_open' AND m.calendar_id IS NULL
       ORDER BY m.created_at ASC LIMIT 1`
    ).bind(teamId, teamId).first<Record<string, unknown>>();

    if (friendlyMatch) {
      match = friendlyMatch;
      isFriendly = true;
      scheduledAt = friendlyMatch.created_at as string;
    } else if (team.league_id) {
      // Fallback: next league match from calendar
      const nextCal = await c.env.DB.prepare(
        "SELECT sc.id, sc.scheduled_at, sc.game_week FROM season_calendar sc WHERE sc.league_id = ? AND sc.scheduled_at >= ? AND sc.status = 'scheduled' ORDER BY sc.scheduled_at ASC LIMIT 1"
      ).bind(team.league_id, gameDate.toISOString()).first<{ id: string; scheduled_at: string; game_week: number }>();
      if (!nextCal) return c.json({ nextMatch: null });

      calendarId = nextCal.id;
      gameWeek = nextCal.game_week;
      scheduledAt = nextCal.scheduled_at;

      match = await c.env.DB.prepare(
        "SELECT m.id, m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name, t1.primary_color as home_color, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)"
      ).bind(nextCal.id, teamId, teamId).first<Record<string, unknown>>();
    }
  }

  if (!match) return c.json({ nextMatch: null });

  // For friendlies, lookup lineup by match_id; for league by calendar_id
  const lineupQuery = isFriendly
    ? c.env.DB.prepare("SELECT formation, tactic, players_data, is_auto, captain_id, preset_slot FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, match.id as string)
    : c.env.DB.prepare("SELECT formation, tactic, players_data, is_auto, captain_id, preset_slot FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, calendarId!);

  // Batch: existing lineup + all players (including injured)
  const [lineupRes, playersRes] = await c.env.DB.batch([
    lineupQuery,
    c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.weekly_wage, p.skills, p.life_context, p.personality, p.physical, p.squad_number, p.commute_km, p.suspended_matches, p.is_celebrity, ps.avg_rating, i.days_remaining as injury_days, i.type as injury_type FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0 LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id AND ps.season_id = (SELECT id FROM seasons WHERE status = 'active' LIMIT 1) WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.overall_rating DESC").bind(teamId),
  ]);
  let lineup = (lineupRes.results[0] as { formation: string; tactic: string; players_data: string; is_auto: number; captain_id: string | null; preset_slot: string | null } | undefined) ?? null;
  let lineupSource: "explicit" | "default" | null = lineup ? "explicit" : null;

  // If no lineup for this specific match, use the last saved lineup as default
  if (!lineup) {
    lineup = await c.env.DB.prepare(
      "SELECT formation, tactic, players_data, is_auto, captain_id, preset_slot FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1"
    ).bind(teamId).first<{ formation: string; tactic: string; players_data: string; is_auto: number; captain_id: string | null; preset_slot: string | null }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
    if (lineup) lineupSource = "default";
  }
  const players = { results: playersRes.results as Record<string, unknown>[] };

  // Generate absences only day_before or match_day (not 2+ days before) — friendlies always match_day
  const matchDate = new Date(scheduledAt!);
  const daysUntilMatch = isFriendly ? 0 : Math.max(0, Math.round((matchDate.getTime() - gameDate.getTime()) / 86400000));

  const { absenceSeedForMatch } = await import("../lib/seed");
  const { generateAbsences } = await import("../events/absence");
  const matchKey = isFriendly ? (match.id as string) : calendarId!;

  // Healthy squad — shoda s match-runner/SMS filtrem. Zraněné a suspendované vynecháme,
  // ti nedostávají absence (mají vlastní kanál).
  const injuredPreviewIds = new Set<string>();
  const suspendedPreviewIds = new Set<string>();
  const injRows = await c.env.DB.prepare(
    "SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (SELECT id FROM players WHERE team_id = ?)"
  ).bind(teamId).all().catch(() => ({ results: [] }));
  for (const ir of injRows.results) injuredPreviewIds.add(ir.player_id as string);
  for (const r of players.results) {
    if ((r.suspended_matches as number) > 0) suspendedPreviewIds.add(r.id as string);
  }
  const healthyPlayers = players.results.filter((r) => !injuredPreviewIds.has(r.id as string) && !suspendedPreviewIds.has(r.id as string));

  const absenceSquad = healthyPlayers.map((row) => {
    const pers = (() => { try { return JSON.parse(row.personality as string); } catch { return {}; } })();
    const lc = (() => { try { return JSON.parse(row.life_context as string); } catch { return {}; } })();
    const phys = (() => { try { return JSON.parse(row.physical as string); } catch { return {}; } })();
    return {
      firstName: row.first_name as string, lastName: row.last_name as string,
      age: row.age as number, occupation: lc.occupation ?? "",
      discipline: pers.discipline ?? 50, patriotism: pers.patriotism ?? 50,
      alcohol: pers.alcohol ?? 30, temper: pers.temper ?? 40,
      morale: lc.morale ?? 50, stamina: phys.stamina ?? 50,
      injuryProneness: pers.injuryProneness ?? 50,
      commuteKm: (row.commute_km as number) ?? 0,
      isCelebrity: !!(row.is_celebrity as number),
      celebrityType: pers.celebrityType,
      celebrityTier: pers.celebrityTier,
    };
  });
  const absenceDistrictRow = await c.env.DB.prepare("SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ district: string }>().catch((e) => { logger.warn({ module: "game" }, "district query failed", e); return null; });
  // Preview spouští obě fáze se stejnými seedy jako SMS + simulace, pak deduplikuje dle playerIndex.
  // Absence zobrazujeme jen day-before nebo match-day (ne 2+ dny předem). Přátelák = vyšší šance.
  const friendlyMultiplier = isFriendly ? 1.8 : undefined;
  let absences: ReturnType<typeof generateAbsences> = [];
  if (daysUntilMatch <= 1) {
    const dayBeforeRng = createRng(absenceSeedForMatch({ matchKey, teamId, phase: "day_before" }));
    const matchDayRng = createRng(absenceSeedForMatch({ matchKey, teamId, phase: "match_day" }));
    const dayBeforeAbs = generateAbsences(dayBeforeRng as any, absenceSquad, "day_before", absenceDistrictRow?.district, friendlyMultiplier);
    const matchDayAbs = generateAbsences(matchDayRng as any, absenceSquad, "match_day", absenceDistrictRow?.district, friendlyMultiplier);
    const seen = new Set<number>();
    absences = [...dayBeforeAbs, ...matchDayAbs].filter((a) => {
      if (seen.has(a.playerIndex)) return false;
      seen.add(a.playerIndex);
      return true;
    });
  }
  const absentPlayerIds = new Set(absences.map((a) => healthyPlayers[a.playerIndex]?.id as string).filter(Boolean));

  // Load relationships for lineup visualization
  const playerIds = players.results.map((p) => p.id as string);
  let relMap: Record<string, Array<{ otherPlayerId: string; type: string }>> = {};
  if (playerIds.length > 1) {
    try {
      const placeholders = playerIds.map(() => "?").join(",");
      const relRows = await c.env.DB.prepare(
        `SELECT player_a_id, player_b_id, type FROM relationships WHERE player_a_id IN (${placeholders}) OR player_b_id IN (${placeholders})`
      ).bind(...playerIds, ...playerIds).all();
      for (const r of relRows.results as Array<{ player_a_id: string; player_b_id: string; type: string }>) {
        if (!relMap[r.player_a_id]) relMap[r.player_a_id] = [];
        if (!relMap[r.player_b_id]) relMap[r.player_b_id] = [];
        relMap[r.player_a_id].push({ otherPlayerId: r.player_b_id, type: r.type });
        relMap[r.player_b_id].push({ otherPlayerId: r.player_a_id, type: r.type });
      }
    } catch (e) {
      logger.warn({ module: "game" }, "relationships query for lineup", e);
    }
  }

  const available = players.results.map((p) => {
    const skills = (() => { try { return JSON.parse(p.skills as string); } catch (e) { logger.warn({ module: "game" }, "parse player skills for lineup", e); return {}; } })();
    const lc = (() => { try { return JSON.parse(p.life_context as string); } catch (e) { logger.warn({ module: "game" }, "parse player life_context for lineup", e); return {}; } })();
    const injured = (p.injury_days as number) > 0;
    const suspended = ((p.suspended_matches as number) ?? 0) > 0;
    const absent = absentPlayerIds.has(p.id as string) || injured || suspended;
    const absenceInfo = !injured && !suspended ? absences.find((a) => healthyPlayers[a.playerIndex]?.id === p.id) : null;
    return {
      id: p.id, firstName: p.first_name, lastName: p.last_name, position: p.position,
      overallRating: p.overall_rating, age: p.age, condition: lc.condition ?? 100, morale: lc.morale ?? 50, squadNumber: p.squad_number ?? null,
      speed: skills.speed ?? 50, technique: skills.technique ?? 50, shooting: skills.shooting ?? 50,
      passing: skills.passing ?? 50, heading: skills.heading ?? 50, defense: skills.defense ?? 50,
      goalkeeping: skills.goalkeeping ?? 50, stamina: skills.stamina ?? 50,
      avgRating: p.avg_rating ?? null,
      absent,
      injured,
      suspended,
      suspendedMatches: suspended ? (p.suspended_matches as number) : null,
      injuryDays: injured ? (p.injury_days as number) : null,
      injuryType: injured ? (p.injury_type as string) : null,
      absenceReason: suspended ? "Stopka" : injured ? "Zranění" : (absenceInfo?.reason ?? null),
      absenceSms: suspended ? `Mám stopku, ${p.suspended_matches} zápas(ů) nesmím hrát.` : injured ? `Jsem zraněný (${p.injury_type ?? "zranění"}), ještě ${p.injury_days} dní.` : (absenceInfo?.smsText ?? null),
      absenceEmoji: suspended ? "🟥" : injured ? "🩹" : (absenceInfo?.emoji ?? null),
      relationships: relMap[p.id as string] ?? [],
    };
  });

  // Upcoming matches strip — ligové i přátelské, sloučené chronologicky
  let upcomingMatches: Array<{ calendarId: string; gameWeek: number | null; scheduledAt: string; opponentName: string; isHome: boolean; hasLineup: boolean; isFriendly: boolean }> = [];
  try {
    // Ligové zápasy z kalendáře
    if (team.league_id) {
      // Bez date filtru — match strip ukáže všechny scheduled (i ty co cron ještě
      // nezpracoval), aby šipky odpovídaly tomu, co user vidí v Rozpisu.
      const upcomingLeague = await c.env.DB.prepare(
        `SELECT sc.id as cal_id, sc.game_week, sc.scheduled_at,
          m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name,
          (SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = sc.id) as has_lineup
        FROM season_calendar sc
        JOIN matches m ON m.calendar_id = sc.id
        JOIN teams t1 ON m.home_team_id = t1.id
        JOIN teams t2 ON m.away_team_id = t2.id
        WHERE sc.league_id = ? AND sc.status = 'scheduled'
          AND (m.home_team_id = ? OR m.away_team_id = ?)
        ORDER BY sc.scheduled_at ASC LIMIT 30`
      ).bind(teamId, team.league_id, teamId, teamId).all();
      for (const u of upcomingLeague.results) {
        upcomingMatches.push({
          calendarId: u.cal_id as string,
          gameWeek: u.game_week as number,
          scheduledAt: u.scheduled_at as string,
          opponentName: (u.home_team_id === teamId ? u.away_name : u.home_name) as string,
          isHome: u.home_team_id === teamId,
          hasLineup: (u.has_lineup as number) > 0,
          isFriendly: false,
        });
      }
    }
    // Přátelské zápasy (calendar_id IS NULL, status lineups_open)
    const upcomingFriendly = await c.env.DB.prepare(
      `SELECT m.id as match_id, m.created_at, m.home_team_id, m.away_team_id,
        t1.name as home_name, t2.name as away_name,
        (SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = m.id) as has_lineup
       FROM matches m
       JOIN teams t1 ON m.home_team_id = t1.id
       JOIN teams t2 ON m.away_team_id = t2.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'lineups_open' AND m.calendar_id IS NULL
       ORDER BY m.created_at ASC LIMIT 10`
    ).bind(teamId, teamId, teamId).all();
    for (const u of upcomingFriendly.results) {
      upcomingMatches.push({
        calendarId: u.match_id as string, // pro přátelák používáme match.id (FE switch logika tomu rozumí)
        gameWeek: null,
        scheduledAt: u.created_at as string,
        opponentName: (u.home_team_id === teamId ? u.away_name : u.home_name) as string,
        isHome: u.home_team_id === teamId,
        hasLineup: (u.has_lineup as number) > 0,
        isFriendly: true,
      });
    }
    // Sloučit chronologicky
    upcomingMatches.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  } catch (e) { logger.warn({ module: "game" }, "fetch upcoming matches", e); }

  return c.json({
    nextMatch: {
      matchId: match.id,
      calendarId: isFriendly ? (match.id as string) : calendarId,
      gameWeek: gameWeek,
      scheduledAt: scheduledAt,
      isHome: match.home_team_id === teamId,
      homeName: match.home_name, awayName: match.away_name,
      homeColor: match.home_color, awayColor: match.away_color,
      isFriendly,
    },
    lineup: lineup ? {
      formation: lineup.formation, tactic: lineup.tactic, isAuto: lineup.is_auto === 1,
      captainId: lineup.captain_id ?? null,
      presetSlot: lineup.preset_slot ?? null,
      source: lineupSource, // "explicit" = pro tento zápas, "default" = fallback z poslední uložené
      players: (() => { try { return JSON.parse(lineup.players_data); } catch (e) { logger.warn({ module: "game" }, "parse lineup players_data", e); return []; } })(),
    } : null,
    availablePlayers: available,
    upcomingMatches,
  });
});

// GET lineup for specific calendar entry
gameRouter.get("/teams/:teamId/lineup/:calendarId", async (c) => {
  const teamId = c.req.param("teamId");
  const calendarId = c.req.param("calendarId");
  const row = await c.env.DB.prepare(
    "SELECT formation, tactic, players_data, captain_id, preset_slot FROM lineups WHERE team_id = ? AND calendar_id = ?"
  ).bind(teamId, calendarId).first<{ formation: string; tactic: string; players_data: string; captain_id: string | null; preset_slot: string | null }>();
  if (!row) return c.json({ lineup: null });
  return c.json({
    lineup: {
      formation: row.formation, tactic: row.tactic,
      captainId: row.captain_id ?? null,
      presetSlot: row.preset_slot ?? null,
      players: (() => { try { return JSON.parse(row.players_data); } catch { return []; } })(),
    },
  });
});

// Whitelist taktik a formací — drží sync se shared/engine. Neplatné hodnoty by jinak crashly engine.
const VALID_TACTICS = ["offensive", "balanced", "defensive", "long_ball", "possession", "pressing"] as const;
const VALID_FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"] as const;

// POST save lineup for next match
gameRouter.post("/teams/:teamId/lineup", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ calendarId: string; formation: string; tactic: string; captainId?: string; presetSlot?: "A" | "B" | "C" | null; players: Array<{ playerId: string; matchPosition: string }> }>();

  if (!body.players || body.players.length !== 11) return c.json({ error: "Sestava musí mít přesně 11 hráčů" }, 400);
  const gkCount = body.players.filter((p) => p.matchPosition === "GK").length;
  if (gkCount !== 1) return c.json({ error: "Sestava musí mít přesně 1 brankáře" }, 400);
  if (!VALID_TACTICS.includes(body.tactic as typeof VALID_TACTICS[number])) {
    return c.json({ error: `Neplatná taktika "${body.tactic}"` }, 400);
  }
  if (!VALID_FORMATIONS.includes(body.formation as typeof VALID_FORMATIONS[number])) {
    return c.json({ error: `Neplatná formace "${body.formation}"` }, 400);
  }

  // Validate players belong to team and are available
  const playerIds = body.players.map((p) => p.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    return c.json({ error: "Sestava obsahuje duplicitního hráče" }, 400);
  }
  const placeholders = playerIds.map(() => "?").join(",");
  const validPlayers = await c.env.DB.prepare(
    `SELECT p.id FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
     WHERE p.id IN (${placeholders}) AND p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
     AND i.id IS NULL AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)`
  ).bind(...playerIds, teamId).all().catch((e) => { logger.warn({ module: "game" }, "validate lineup players", e); return { results: [] }; });

  const validIds = new Set(validPlayers.results.map((r) => r.id as string));
  const invalid = playerIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return c.json({ error: `${invalid.length} hráč(ů) není dostupných (zranění, suspendace nebo nepatří do týmu)` }, 400);
  }

  // Generátorové absence (Práce/Osobní/Zdraví/Jiné) — sdílený helper, stejný seed jako /next-match a simulace.
  const { resolveMatchContext, getAbsentPlayerIds } = await import("../events/match-absences");
  const absenceCtx = await resolveMatchContext(c.env.DB, teamId, body.calendarId);
  if (absenceCtx) {
    const absentIds = await getAbsentPlayerIds(c.env.DB, teamId, absenceCtx);
    const absentInLineup = playerIds.filter((id) => absentIds.has(id));
    if (absentInLineup.length > 0) {
      return c.json({ error: `${absentInLineup.length} hráč(ů) má omluvu pro tento zápas a nemůže hrát` }, 400);
    }
  }

  // Captain musí být v lineupu (pokud je vyplněn). Jinak nullify.
  const captainId = body.captainId && playerIds.includes(body.captainId) ? body.captainId : null;

  // Upsert lineup
  const existing = await c.env.DB.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
    .bind(teamId, body.calendarId).first<{ id: string }>();

  // Preset slot validace: musí být A/B/C A preset opravdu existuje (jinak nullify)
  let presetSlot: string | null = null;
  if (body.presetSlot && ["A","B","C"].includes(body.presetSlot)) {
    const presetExists = await c.env.DB.prepare(
      "SELECT 1 FROM lineup_presets WHERE team_id = ? AND slot = ?"
    ).bind(teamId, body.presetSlot).first()
      .catch((e) => { logger.warn({ module: "game" }, "check preset exists", e); return null; });
    if (presetExists) presetSlot = body.presetSlot;
  }
  if (existing) {
    await c.env.DB.prepare("UPDATE lineups SET formation = ?, tactic = ?, players_data = ?, captain_id = ?, preset_slot = ?, is_auto = 0, submitted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
      .bind(body.formation, body.tactic, JSON.stringify(body.players), captainId, presetSlot, existing.id).run();
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, captain_id, preset_slot, is_auto, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(id, teamId, body.calendarId, body.formation, body.tactic, JSON.stringify(body.players), captainId, presetSlot).run();
  }

  return c.json({ ok: true });
});

// ═══ LINEUP PRESETS — fixní sloty A/B/C ═══

const PRESET_SLOTS = ["A", "B", "C"] as const;
type PresetSlot = typeof PRESET_SLOTS[number];

gameRouter.get("/teams/:teamId/lineup-presets", async (c) => {
  const teamId = c.req.param("teamId");
  const rows = await c.env.DB.prepare(
    "SELECT slot, formation, tactic, captain_id, players_data, updated_at FROM lineup_presets WHERE team_id = ?"
  ).bind(teamId).all<{ slot: string; formation: string; tactic: string; captain_id: string | null; players_data: string; updated_at: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "load presets", e); return { results: [] }; });

  const presets: Record<string, { formation: string; tactic: string; captainId: string | null; players: Array<{ playerId: string; matchPosition: string }>; updatedAt: string } | null> = { A: null, B: null, C: null };
  for (const r of rows.results) {
    presets[r.slot] = {
      formation: r.formation,
      tactic: r.tactic,
      captainId: r.captain_id,
      players: (() => { try { return JSON.parse(r.players_data); } catch { return []; } })(),
      updatedAt: r.updated_at,
    };
  }
  return c.json({ presets });
});

gameRouter.put("/teams/:teamId/lineup-presets/:slot", async (c) => {
  const teamId = c.req.param("teamId");
  const slot = c.req.param("slot") as PresetSlot;
  if (!PRESET_SLOTS.includes(slot)) return c.json({ error: "Neplatný slot (A/B/C)" }, 400);

  const body = await c.req.json<{ formation: string; tactic: string; captainId?: string; players: Array<{ playerId: string; matchPosition: string }> }>();
  if (!body.players || body.players.length !== 11) return c.json({ error: "Sestava musí mít 11 hráčů" }, 400);
  if (!VALID_TACTICS.includes(body.tactic as typeof VALID_TACTICS[number])) {
    return c.json({ error: `Neplatná taktika "${body.tactic}"` }, 400);
  }
  if (!VALID_FORMATIONS.includes(body.formation as typeof VALID_FORMATIONS[number])) {
    return c.json({ error: `Neplatná formace "${body.formation}"` }, 400);
  }
  // Captain musí být v lineupu (pokud je vyplněn)
  const playerIds = body.players.map((p) => p.playerId);
  const captainId = body.captainId && playerIds.includes(body.captainId) ? body.captainId : null;

  await c.env.DB.prepare(
    `INSERT INTO lineup_presets (team_id, slot, formation, tactic, captain_id, players_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(team_id, slot) DO UPDATE SET
       formation = excluded.formation,
       tactic = excluded.tactic,
       captain_id = excluded.captain_id,
       players_data = excluded.players_data,
       updated_at = excluded.updated_at`
  ).bind(teamId, slot, body.formation, body.tactic, captainId, JSON.stringify(body.players)).run();

  return c.json({ ok: true });
});

gameRouter.delete("/teams/:teamId/lineup-presets/:slot", async (c) => {
  const teamId = c.req.param("teamId");
  const slot = c.req.param("slot") as PresetSlot;
  if (!PRESET_SLOTS.includes(slot)) return c.json({ error: "Neplatný slot" }, 400);
  await c.env.DB.prepare("DELETE FROM lineup_presets WHERE team_id = ? AND slot = ?").bind(teamId, slot).run();
  return c.json({ ok: true });
});

gameRouter.post("/teams/:teamId/lineup-presets/:slot/apply", async (c) => {
  const teamId = c.req.param("teamId");
  const slot = c.req.param("slot") as PresetSlot;
  if (!PRESET_SLOTS.includes(slot)) return c.json({ error: "Neplatný slot" }, 400);

  // Optional calendarId — pokud je zadán, absentní hráče pro daný zápas auto-substituujeme.
  // Bez calendarId funguje endpoint jako dřív (jen injury/suspension substituce).
  const body = await c.req.json<{ calendarId?: string }>().catch(() => ({} as { calendarId?: string }));
  const calendarId = body.calendarId;

  const preset = await c.env.DB.prepare(
    "SELECT formation, tactic, captain_id, players_data FROM lineup_presets WHERE team_id = ? AND slot = ?"
  ).bind(teamId, slot).first<{ formation: string; tactic: string; captain_id: string | null; players_data: string }>();
  if (!preset) return c.json({ error: "Preset je prázdný" }, 404);

  const presetPlayers: Array<{ playerId: string; matchPosition: string }> = (() => { try { return JSON.parse(preset.players_data); } catch { return []; } })();

  // Generátorové absence pro konkrétní zápas (pokud calendarId) — sdílený helper.
  let absentIds = new Set<string>();
  if (calendarId) {
    const { resolveMatchContext, getAbsentPlayerIds } = await import("../events/match-absences");
    const ctx = await resolveMatchContext(c.env.DB, teamId, calendarId);
    if (ctx) absentIds = await getAbsentPlayerIds(c.env.DB, teamId, ctx);
  }

  // Auto-substitute: hráči co už nejsou v týmu / jsou zranění/suspendovaní / absentní pro daný zápas
  const allPlayers = await c.env.DB.prepare(
    `SELECT p.id, p.position, p.overall_rating,
       (CASE WHEN i.days_remaining > 0 OR (p.suspended_matches IS NOT NULL AND p.suspended_matches > 0) OR p.status != 'active' THEN 1 ELSE 0 END) as unavailable
     FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
     WHERE p.team_id = ?`
  ).bind(teamId).all<{ id: string; position: string; overall_rating: number; unavailable: number }>();

  const isUnavailable = (p: { id: string; unavailable: number }) => p.unavailable === 1 || absentIds.has(p.id);
  const playerMap = new Map(allPlayers.results.map((p) => [p.id, p]));
  const used = new Set<string>();
  const warnings: string[] = [];

  // Helper na slot s undefined-safe substitucí
  const finalPlayersRaw: Array<{ playerId: string; matchPosition: string } | null> = presetPlayers.map((slot) => {
    const stored = playerMap.get(slot.playerId);
    if (stored && !isUnavailable(stored) && !used.has(slot.playerId)) {
      used.add(slot.playerId);
      return slot;
    }
    // substitute — preferuj stejnou pozici, pak cokoliv dostupné
    const repl = allPlayers.results.filter((x) => !isUnavailable(x) && !used.has(x.id) && x.position === slot.matchPosition)
      .sort((a, b) => b.overall_rating - a.overall_rating)[0]
      ?? allPlayers.results.filter((x) => !isUnavailable(x) && !used.has(x.id))
        .sort((a, b) => b.overall_rating - a.overall_rating)[0];
    if (repl) {
      used.add(repl.id);
      warnings.push(`Hráč nahrazen na pozici ${slot.matchPosition}`);
      return { playerId: repl.id, matchPosition: slot.matchPosition };
    }
    // Žádná náhrada — slot zůstane prázdný (vrátí null)
    warnings.push(`Slot ${slot.matchPosition} nemá náhradu (málo dostupných hráčů)`);
    return null;
  });

  const finalPlayers = finalPlayersRaw.filter((p): p is { playerId: string; matchPosition: string } => p !== null);

  // Validace: musí být 11 hráčů, právě 1 GK
  if (finalPlayers.length < 11) {
    return c.json({ error: `Tým nemá dost dostupných hráčů (${finalPlayers.length}/11). Některé sloty jsou prázdné.`, warnings }, 400);
  }
  const gkCount = finalPlayers.filter((p) => p.matchPosition === "GK").length;
  if (gkCount !== 1) {
    return c.json({ error: `Sestava musí mít právě 1 brankáře (má ${gkCount}).`, warnings }, 400);
  }

  // Validate captain still in lineup
  const captainStillIn = preset.captain_id && finalPlayers.some((p) => p.playerId === preset.captain_id);

  return c.json({
    formation: preset.formation,
    tactic: preset.tactic,
    captainId: captainStillIn ? preset.captain_id : null,
    players: finalPlayers,
    warnings,
  });
});

// ═══ TACTIC FAMILIARITY (chemistry) ═══

gameRouter.get("/teams/:teamId/tactic-chemistry", async (c) => {
  const teamId = c.req.param("teamId");
  const { readFamiliarity } = await import("../engine/chemistry");
  const fam = await readFamiliarity(c.env.DB, teamId);
  return c.json(fam);
});

// ═══ ADMIN: backfill familiarity z historie ═══

gameRouter.post("/admin/backfill-chemistry", async (c) => {
  const { backfillFromHistory } = await import("../engine/chemistry");
  const result = await backfillFromHistory(c.env.DB);
  return c.json({ ok: true, ...result });
});

// ═══ TRANSFER SYSTEM ═══

// Release player → free agent
gameRouter.post("/teams/:teamId/players/:playerId/release", async (c) => {
  try {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const player = await c.env.DB.prepare(
    "SELECT p.*, t.name as team_name, t.league_id, v.district FROM players p JOIN teams t ON p.team_id = t.id JOIN villages v ON t.village_id = v.id WHERE p.id = ? AND p.team_id = ?"
  ).bind(playerId, teamId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  // Idempotency: zamezit duplicitám při double-click
  const existingFa = await c.env.DB.prepare(
    "SELECT id FROM free_agents WHERE released_from_team_id = ? AND first_name = ? AND last_name = ? AND created_at > datetime('now', '-5 minutes')"
  ).bind(teamId, player.first_name, player.last_name).first().catch((e) => { logger.warn({ module: "game" }, "check duplicate free agent", e); return null; });
  if (existingFa) return c.json({ ok: true });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const faId = crypto.randomUUID();

  // Cleanup references first (can fail independently, non-critical)
  await c.env.DB.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE player_id = ? AND status = 'active'").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "withdraw listings on release", e));
  await c.env.DB.prepare("UPDATE transfer_offers SET status = 'withdrawn' WHERE player_id = ? AND status IN ('pending','countered')").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "withdraw offers on release", e));
  await c.env.DB.prepare("UPDATE teams SET captain_id = NULL WHERE captain_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "clear captain on release", e));
  await c.env.DB.prepare("UPDATE teams SET penalty_taker_id = NULL WHERE penalty_taker_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "clear penalty taker on release", e));
  await c.env.DB.prepare("UPDATE teams SET freekick_taker_id = NULL WHERE freekick_taker_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "clear freekick taker on release", e));
  await c.env.DB.prepare("DELETE FROM player_stats WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "delete player_stats on release", e));
  await c.env.DB.prepare("DELETE FROM injuries WHERE player_id = ?").bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "delete injuries on release", e));
  // Smazat vazby — FK constraint na players(id) by blokoval DELETE FROM players
  await c.env.DB.prepare("DELETE FROM relationships WHERE player_a_id = ? OR player_b_id = ?").bind(playerId, playerId).run().catch((e) => logger.warn({ module: "game" }, "delete relationships on release", e));

  // Atomic batch: INSERT free_agent + UPDATE contract + DELETE player
  // If any step fails, none of them commit — player won't silently disappear
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO free_agents (id, district, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, source, released_from_team_id, village_id, expires_at, is_celebrity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, (SELECT village_id FROM teams WHERE id = ?), ?, ?)`
    ).bind(
      faId, player.district, player.first_name, player.last_name, player.nickname ?? null,
      player.age, player.position, player.overall_rating,
      player.skills, player.physical ?? "{}", player.personality ?? "{}", player.life_context ?? "{}",
      player.avatar ?? "{}", player.hidden_talent ?? 0, player.weekly_wage ?? 0,
      teamId, teamId, expiresAt.toISOString(),
      (player.is_celebrity as number) ?? 0,
    ),
    c.env.DB.prepare(
      "UPDATE player_contracts SET leave_type = 'released', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1"
    ).bind(playerId, teamId),
    c.env.DB.prepare("DELETE FROM players WHERE id = ?").bind(playerId),
  ]);

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(c.env.DB, player.league_id as string, teamId, "player_released", {
    playerName: `${player.first_name} ${player.last_name}`, playerAge: player.age as number,
    playerPosition: player.position as string, teamName: player.team_name as string,
  }).catch((e) => logger.warn({ module: "game" }, "create release news", e));

  return c.json({ ok: true });
  } catch (e) { logger.error({ module: "game" }, "release player failed", e); return c.json({ error: String(e) }, 500); }
});

// List free agents
gameRouter.get("/teams/:teamId/free-agents", async (c) => {
  try {
    const teamId = c.req.param("teamId");
    const team = await c.env.DB.prepare(
      "SELECT t.reputation, v.district, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<{ reputation: number; district: string; lat: number; lng: number }>();
    if (!team) return c.json({ error: "Tým nenalezen" }, 404);

    const agents = await c.env.DB.prepare(
      "SELECT fa.*, v.lat as v_lat, v.lng as v_lon, v.name as village_name FROM free_agents fa LEFT JOIN villages v ON fa.village_id = v.id WHERE fa.district = ? AND fa.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY fa.overall_rating DESC"
    ).bind(team.district).all();

    // Filter out agents who rejected this team
    const filtered = agents.results.filter((fa) => {
      try { const rej = JSON.parse((fa.rejected_by as string) ?? "[]"); return !rej.includes(teamId); } catch (e) { logger.warn({ module: "game" }, "parse rejected_by", e); return true; }
    });

    const result = filtered.map((fa) => {
      let distKm: number | null = null;
      if (fa.v_lat && fa.v_lon && team.lat && team.lng) {
        const R = 6371;
        const dLat = ((fa.v_lat as number) - team.lat) * Math.PI / 180;
        const dLon = ((fa.v_lon as number) - team.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(team.lat*Math.PI/180)*Math.cos((fa.v_lat as number)*Math.PI/180)*Math.sin(dLon/2)**2;
        distKm = Math.round(R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      }
      return {
        id: fa.id, firstName: fa.first_name, lastName: fa.last_name, nickname: fa.nickname,
        age: fa.age, position: fa.position, overallRating: fa.overall_rating, weeklyWage: fa.weekly_wage,
        occupation: (() => { try { return JSON.parse(fa.life_context as string)?.occupation ?? ""; } catch (e) { logger.warn({ module: "game" }, "parse free agent life_context", e); return ""; } })(),
        source: fa.source, villageName: fa.village_name ?? null, distanceKm: distKm, expiresAt: fa.expires_at,
        avatar: (() => { try { return JSON.parse(fa.avatar as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent avatar", e); return {}; } })(),
        skills: (() => { try { return JSON.parse(fa.skills as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent skills", e); return {}; } })(),
        physical: (() => { try { return JSON.parse(fa.physical as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent physical", e); return {}; } })(),
        personality: (() => { try { return JSON.parse(fa.personality as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent personality", e); return {}; } })(),
        isCelebrity: !!(fa.is_celebrity as number),
      };
    });
    return c.json({ freeAgents: result });
  } catch (e) {
    logger.error({ module: "game" }, "fetch free agents failed", e);
    return c.json({ error: String(e), freeAgents: [] }, 500);
  }
});

// Search all players across all teams in the league
gameRouter.get("/teams/:teamId/search-players", async (c) => {
  try {
    const teamId = c.req.param("teamId");
    const searchLeagueId = c.req.query("leagueId");
    const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
      .bind(teamId).first<{ league_id: string | null }>();
    if (!team?.league_id) return c.json({ players: [] });

    const targetLeague = searchLeagueId ?? team.league_id;

    const rows = await c.env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.nickname, p.age, p.position, p.overall_rating, p.weekly_wage,
       p.skills, p.physical, p.personality, p.life_context, p.avatar, p.squad_number,
       t.id as team_id, t.name as team_name
       FROM players p JOIN teams t ON p.team_id = t.id
       WHERE t.league_id = ? AND t.id != ? AND t.user_id != 'ai' AND (p.status IS NULL OR p.status = 'active')
       ORDER BY p.overall_rating DESC LIMIT 200`
    ).bind(targetLeague, teamId).all();

    const blur = (v: number) => Math.round(v / 5) * 5;
    const players = rows.results.map((r) => {
      const isOwn = r.team_id === teamId;
      let skills: Record<string, unknown> = {};
      let physical: Record<string, unknown> = {};
      try { skills = JSON.parse(r.skills as string); } catch (e) { logger.warn({ module: "game" }, "parse player skills", e); }
      try { physical = JSON.parse(r.physical as string); } catch (e) { logger.warn({ module: "game" }, "parse player physical", e); }

      // Foreign players: blur attributes (round to nearest 5)
      if (!isOwn) {
        for (const k of Object.keys(skills)) { if (typeof skills[k] === "number") skills[k] = blur(skills[k] as number); }
        for (const k of Object.keys(physical)) { if (typeof physical[k] === "number") physical[k] = blur(physical[k] as number); }
      }

      return {
        id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname,
        age: r.age, position: r.position, overallRating: r.overall_rating, weeklyWage: r.weekly_wage,
        squadNumber: r.squad_number,
        teamId: r.team_id, teamName: r.team_name, isOwnTeam: isOwn,
        skills, physical,
        avatar: (() => { try { return JSON.parse(r.avatar as string); } catch (e) { logger.warn({ module: "game" }, "parse player avatar", e); return {}; } })(),
      };
    });
    return c.json({ players });
  } catch (e) {
    logger.error({ module: "game" }, "search players failed", e);
    return c.json({ error: String(e), players: [] }, 500);
  }
});

// Sign free agent
gameRouter.post("/teams/:teamId/free-agents/:faId/sign", async (c) => {
  const teamId = c.req.param("teamId");
  const faId = c.req.param("faId");
  const body = await c.req.json<{ offeredWage: number }>();

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const fa = await c.env.DB.prepare("SELECT * FROM free_agents WHERE id = ?").bind(faId).first<Record<string, unknown>>();
  if (!fa) return c.json({ error: "Volný hráč nenalezen" }, 404);

  let agentVillage: { lat: number; lng: number } | null = null;
  if (fa.village_id) {
    agentVillage = await c.env.DB.prepare("SELECT lat, lng FROM villages WHERE id = ?")
      .bind(fa.village_id).first<{ lat: number; lng: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch agent village coords", e); return null; });
  }

  const squadCount = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?")
    .bind(teamId).first<{ cnt: number }>();
  if ((squadCount?.cnt ?? 0) >= 30) return c.json({ error: "Kádr je plný (max. 30 hráčů)" }, 400);

  const personality = (() => { try { return JSON.parse(fa.personality as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent personality", e); return {}; } })();

  const { evaluateSigningChance } = await import("../transfers/player-agency");
  const rng = createRng(cryptoSeed());
  const decision = evaluateSigningChance(
    { weekly_wage: fa.weekly_wage as number, personality, village_id: fa.village_id as string | null, district: fa.district as string | null },
    { reputation: team.reputation as number, villageLat: team.lat as number, villageLon: team.lng as number, squadSize: squadCount?.cnt ?? 15, district: team.district as string | null },
    agentVillage, body.offeredWage, rng,
  );

  if (!decision.accepted) {
    // Odmítl tento tým — přidat do rejected_by (JSON pole), nelze zkoušet znovu
    const currentRejected = (() => { try { return JSON.parse((fa.rejected_by as string) ?? "[]"); } catch (e) { logger.warn({ module: "game" }, "parse rejected_by for update", e); return []; } })();
    currentRejected.push(teamId);
    await c.env.DB.prepare("UPDATE free_agents SET rejected_by = ? WHERE id = ?")
      .bind(JSON.stringify(currentRejected), faId).run().catch((e) => logger.warn({ module: "game" }, "update rejected_by", e));
    return c.json({ success: false, decision });
  }

  const playerId = crypto.randomUUID();
  const isCelebrity = (fa.is_celebrity as number) ?? 0;
  // Extract skillsMax from life_context (fallen_star celebrities have it stored there)
  const faLifeCtx = (() => { try { return JSON.parse(fa.life_context as string); } catch { return {}; } })();
  // celebrities (fallen_star) have skillsMax stored in life_context; regular FAs use current skills as max
  const faSkillsMax = faLifeCtx.skillsMax ? JSON.stringify(faLifeCtx.skillsMax) : fa.skills as string;
  await c.env.DB.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, status, is_celebrity, skills_max)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).bind(playerId, teamId, fa.first_name, fa.last_name, (fa.nickname as string) ?? "", fa.age, fa.position, fa.overall_rating,
    fa.skills, fa.physical, fa.personality, fa.life_context, fa.avatar, fa.hidden_talent ?? 0, body.offeredWage, isCelebrity, faSkillsMax).run();

  // Set residence & commute for new signing
  const { generateResidence } = await import("../generators/residence");
  const teamVillage = await c.env.DB.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ name: string; size: string; district: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (teamVillage) {
    const resRng = createRng(cryptoSeed());
    const res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
    await c.env.DB.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
      .bind(res.residence, res.commuteKm, playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for signing contract", e); return null; });
  await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'free_agent', 0, 1)")
    .bind(crypto.randomUUID(), playerId, teamId, season?.id ?? "unknown").run().catch((e) => logger.warn({ module: "game" }, "insert signing contract", e));

  // Atomický DELETE — pokud FA mezitím podepsal jiný tým, RETURNING vrátí 0 řádků.
  const deleted = await c.env.DB.prepare("DELETE FROM free_agents WHERE id = ? RETURNING id").bind(faId).first<{ id: string }>();
  if (!deleted) {
    // Jiný tým ho stihl dřív — rollback: smazat hráče co jsme právě insertli
    await c.env.DB.prepare("DELETE FROM players WHERE id = ?").bind(playerId).run()
      .catch((e) => logger.warn({ module: "game" }, "rollback player after FA race condition", e));
    return c.json({ error: "Hráč již byl podepsán jiným týmem" }, 409);
  }

  const gameDate = (team.game_date as string) ?? new Date().toISOString();
  await recordTransaction(c.env.DB, teamId, "signing_fee", -500, `Registrace: ${fa.first_name} ${fa.last_name}`, gameDate);

  const { createTransferNews } = await import("../transfers/transfer-news");
  if (isCelebrity) {
    // Celebrity signing — bombastic league-wide news + broadcast
    const celebPers = (() => { try { return JSON.parse(fa.personality as string); } catch { return {}; } })();
    const celebTier = celebPers.celebrityTier as string | undefined;
    const celebTypeStr = celebPers.celebrityType as string ?? "legend";
    const tierDesc = celebTypeStr === "legend"
      ? { S: "bývalý reprezentant", A: "ex-ligista z 1. ligy", B: "hráč 2. ligy", C: "krajský přeborník" }[celebTier ?? "C"]
      : celebTypeStr === "fallen_star" ? "zkrachovalý talent" : "věčně zraněný profík";
    const headline = `HOTOVO: ${fa.first_name} ${fa.last_name} podepsal za ${team.name}!`;
    const bodyText = celebTier === "S"
      ? `Je to oficiální! ${fa.first_name} ${fa.last_name} bude hrát za ${team.name} v okresním přeboru. Celý okres je vzhůru nohama.`
      : `${fa.first_name} ${fa.last_name}, ${tierDesc}, se dohodl s ${team.name}. Posílí kádr pro zbytek sezóny.`;
    await c.env.DB.prepare("INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'celebrity_signing', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(crypto.randomUUID(), team.league_id, headline, bodyText).run()
      .catch((e) => logger.warn({ module: "game" }, "celebrity signing news", e));
    // Broadcast to all teams
    const leagueTeams = await c.env.DB.prepare(
      "SELECT c.id as conv_id FROM teams t JOIN conversations c ON c.team_id = t.id AND c.type = 'chairman' WHERE t.league_id = ? AND t.user_id != 'ai'"
    ).bind(team.league_id).all().catch((e) => { logger.warn({ module: "game" }, "fetch league teams for celeb broadcast", e); return { results: [] }; });
    for (const lt of leagueTeams.results) {
      await c.env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Předseda Přeboru', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
        .bind(crypto.randomUUID(), lt.conv_id, `⭐ ${fa.first_name} ${fa.last_name} podepsal smlouvu s ${team.name}!`)
        .run().catch((e) => logger.warn({ module: "game" }, "celeb signing broadcast", e));
    }
    // Reputation + morale boost
    const repBonus = { S: 15, A: 10, B: 7, C: 4 }[celebTier ?? "C"] ?? 5;
    await c.env.DB.prepare("UPDATE teams SET reputation = MIN(100, reputation + ?) WHERE id = ?")
      .bind(repBonus, teamId).run().catch((e) => logger.warn({ module: "game" }, "celeb rep boost", e));
    await c.env.DB.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, json_extract(life_context, '$.morale') + 3)) WHERE team_id = ?")
      .bind(teamId).run().catch((e) => logger.warn({ module: "game" }, "celeb morale boost", e));
  } else {
    await createTransferNews(c.env.DB, team.league_id as string, teamId, "player_signed", {
      playerName: `${fa.first_name} ${fa.last_name}`, playerAge: fa.age as number,
      playerPosition: fa.position as string, teamName: team.name as string,
    }).catch((e) => logger.warn({ module: "game" }, "create signing news", e));
  }

  // Return full player data for reveal card
  const newPlayer = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch new player after signing", e); return null; });
  const playerData = newPlayer ? {
    ...newPlayer,
    skills: JSON.parse((newPlayer.skills as string) ?? "{}"),
    physical: JSON.parse((newPlayer.physical as string) ?? "{}"),
    personality: JSON.parse((newPlayer.personality as string) ?? "{}"),
    lifeContext: JSON.parse((newPlayer.life_context as string) ?? "{}"),
    avatar: JSON.parse((newPlayer.avatar as string) ?? "{}"),
  } : null;

  return c.json({ success: true, decision, playerId, player: playerData });
});

// List player on transfer market
gameRouter.post("/teams/:teamId/players/:playerId/list", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const body = await c.req.json<{ askingPrice: number }>();

  const player = await c.env.DB.prepare(
    "SELECT p.first_name, p.last_name, p.age, p.position, p.loan_from_team_id, t.league_id, t.name as team_name FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ? AND p.team_id = ?"
  ).bind(playerId, teamId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (player.loan_from_team_id) return c.json({ error: "Hostující hráč nemůže být vylistován na trh" }, 400);

  // Check if already listed
  const existing = await c.env.DB.prepare(
    "SELECT id FROM transfer_listings WHERE player_id = ? AND status = 'active'"
  ).bind(playerId).first();
  if (existing) return c.json({ error: "Hráč je už na trhu" }, 400);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, playerId, teamId, body.askingPrice, player.league_id, expiresAt.toISOString()).run();

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(c.env.DB, player.league_id as string, teamId, "player_listed", {
    playerName: `${player.first_name} ${player.last_name}`, playerAge: player.age as number,
    playerPosition: player.position as string, teamName: player.team_name as string, fee: body.askingPrice,
  }).catch((e) => logger.warn({ module: "game" }, "create listing news", e));

  return c.json({ ok: true, listingId: id });
});

// ═══ WATCHLIST (scouted players) ═══

// Add player to watchlist
gameRouter.post("/teams/:teamId/watchlist/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const playerExists = await c.env.DB.prepare("SELECT id FROM players WHERE id = ?")
    .bind(playerId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "check player exists for watchlist", e); return null; });
  if (!playerExists) return c.json({ error: "Hráč nenalezen" }, 404);

  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO player_watchlist (id, team_id, player_id) VALUES (?, ?, ?)"
  ).bind(crypto.randomUUID(), teamId, playerId).run()
    .catch((e) => logger.warn({ module: "game" }, "insert watchlist", e));

  return c.json({ ok: true });
});

// Remove player from watchlist
gameRouter.delete("/teams/:teamId/watchlist/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  await c.env.DB.prepare("DELETE FROM player_watchlist WHERE team_id = ? AND player_id = ?")
    .bind(teamId, playerId).run()
    .catch((e) => logger.warn({ module: "game" }, "delete watchlist", e));

  return c.json({ ok: true });
});

// List watched players with enriched data (known attrs, last matches, transfers)
gameRouter.get("/teams/:teamId/watchlist", async (c) => {
  const teamId = c.req.param("teamId");

  const rows = await c.env.DB.prepare(
    `SELECT w.player_id, w.created_at as watched_since,
       p.id, p.first_name, p.last_name, p.nickname, p.age, p.position, p.overall_rating,
       p.skills, p.avatar, p.team_id,
       t.name as team_name, t.primary_color as team_color, t.secondary_color as team_secondary,
       t.badge_pattern as team_badge, t.user_id as team_user_id,
       v.name as village_name, v.district,
       i.days_remaining as injury_days, i.type as injury_type
     FROM player_watchlist w
     JOIN players p ON p.id = w.player_id
     LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN villages v ON v.id = t.village_id
     LEFT JOIN injuries i ON i.player_id = p.id AND i.days_remaining > 0
     WHERE w.team_id = ? AND (p.status IS NULL OR p.status != 'released')
     ORDER BY w.created_at DESC`
  ).bind(teamId).all()
    .catch((e) => { logger.warn({ module: "game" }, "fetch watchlist", e); return { results: [] }; });

  const playerIds = rows.results.map((r) => r.id as string);
  // Fetch recent match stats per player (last 5 simulated matches)
  const matchStats = new Map<string, { goals: number; assists: number; avgRating: number; matches: number }>();
  if (playerIds.length > 0) {
    try {
      const placeholders = playerIds.map(() => "?").join(",");
      const statsRows = await c.env.DB.prepare(
        `SELECT player_id,
           COUNT(*) as matches,
           SUM(goals) as goals,
           SUM(assists) as assists,
           AVG(rating) as avg_rating
         FROM (
           SELECT player_id, goals, assists, rating
           FROM match_player_stats
           WHERE player_id IN (${placeholders})
           ORDER BY created_at DESC
           LIMIT 50
         )
         GROUP BY player_id`
      ).bind(...playerIds).all<{ player_id: string; matches: number; goals: number; assists: number; avg_rating: number }>();
      for (const s of statsRows.results) {
        matchStats.set(s.player_id, {
          goals: s.goals ?? 0,
          assists: s.assists ?? 0,
          avgRating: s.avg_rating ?? 0,
          matches: s.matches ?? 0,
        });
      }
    } catch (e) { logger.warn({ module: "game" }, "fetch watchlist match stats", e); }
  }

  // Fetch last accepted transfer offers for watched players.
  // transfer_offers semantics: from_team_id = buyer, to_team_id = seller.
  const transfers = new Map<string, Array<{ date: string; fromTeam: string | null; toTeam: string | null; fee: number }>>();
  if (playerIds.length > 0) {
    try {
      const placeholders = playerIds.map(() => "?").join(",");
      const trRows = await c.env.DB.prepare(
        `SELECT o.player_id, COALESCE(o.resolved_at, o.created_at) as date,
           COALESCE(o.counter_amount, o.offer_amount) as fee,
           seller.name as seller_name,
           buyer.name as buyer_name
         FROM transfer_offers o
         LEFT JOIN teams seller ON seller.id = o.to_team_id
         LEFT JOIN teams buyer ON buyer.id = o.from_team_id
         WHERE o.player_id IN (${placeholders}) AND o.status = 'accepted'
         ORDER BY date DESC
         LIMIT 50`
      ).bind(...playerIds).all<{ player_id: string; date: string; fee: number; seller_name: string | null; buyer_name: string | null }>();
      for (const t of trRows.results) {
        const arr = transfers.get(t.player_id) ?? [];
        if (arr.length < 3) arr.push({ date: t.date, fromTeam: t.seller_name, toTeam: t.buyer_name, fee: t.fee });
        transfers.set(t.player_id, arr);
      }
    } catch (e) { logger.warn({ module: "game" }, "fetch watchlist transfers", e); }
  }

  // Round helper for foreign attributes
  const roundTo5 = (v: number) => Math.round(v / 5) * 5;

  const players = rows.results.map((r) => {
    const skills = (() => { try { return JSON.parse(r.skills as string); } catch { return {}; } })();
    const avatar = (() => { try { return JSON.parse(r.avatar as string); } catch { return {}; } })();
    const blurredSkills: Record<string, number> = {};
    for (const k of Object.keys(skills)) {
      if (typeof skills[k] === "number") blurredSkills[k] = roundTo5(skills[k]);
    }
    const stats = matchStats.get(r.id as string) ?? { goals: 0, assists: 0, avgRating: 0, matches: 0 };
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      nickname: r.nickname,
      age: r.age,
      position: r.position,
      overallRating: r.overall_rating,
      skills: blurredSkills,
      avatar,
      teamId: r.team_id,
      teamName: r.team_name,
      teamColor: r.team_color,
      teamSecondary: r.team_secondary,
      teamBadge: r.team_badge,
      teamIsAI: r.team_user_id === "ai",
      villageName: r.village_name,
      district: r.district,
      injury: r.injury_days ? { daysRemaining: r.injury_days, type: r.injury_type } : null,
      watchedSince: r.watched_since,
      recentStats: {
        matches: stats.matches,
        goals: stats.goals,
        assists: stats.assists,
        avgRating: Math.round(stats.avgRating * 10) / 10,
      },
      transfers: transfers.get(r.id as string) ?? [],
    };
  });

  return c.json({ players });
});

// Withdraw listing
gameRouter.delete("/teams/:teamId/listings/:listingId", async (c) => {
  const teamId = c.req.param("teamId");
  const listingId = c.req.param("listingId");
  await c.env.DB.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE id = ? AND team_id = ?").bind(listingId, teamId).run();
  await c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND status = 'pending'").bind(listingId).run().catch((e) => logger.warn({ module: "game" }, "reject bids on listing withdrawal", e));
  return c.json({ ok: true });
});

// Browse transfer market
gameRouter.get("/teams/:teamId/market", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const listings = await c.env.DB.prepare(
    `SELECT tl.id, tl.player_id, tl.asking_price, tl.expires_at, tl.is_ai_listing, tl.ai_player_data, tl.rejected_by,
     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar, p.skills,
     t.name as team_name, i.days_remaining as injury_days
     FROM transfer_listings tl
     LEFT JOIN players p ON tl.player_id = p.id AND tl.is_ai_listing = 0
     LEFT JOIN teams t ON tl.team_id = t.id AND tl.is_ai_listing = 0
     LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0 AND tl.is_ai_listing = 0
     WHERE tl.league_id = ? AND tl.status = 'active' AND tl.team_id != ? ORDER BY tl.created_at DESC`
  ).bind(team.league_id, teamId).all();

  // Filter out listings where this team was rejected (same as free agents)
  listings.results = listings.results.filter((l) => {
    try { const rej = JSON.parse((l.rejected_by as string) ?? "[]"); return !rej.includes(teamId); } catch (e) { logger.warn({ module: "game" }, "parse rejected_by in market filter", e); return true; }
  });

  const myListings = await c.env.DB.prepare(
    `SELECT tl.id, tl.player_id, tl.asking_price, tl.expires_at,
     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar
     FROM transfer_listings tl JOIN players p ON tl.player_id = p.id WHERE tl.team_id = ? AND tl.status = 'active'`
  ).bind(teamId).all();

  const myListingIds = myListings.results.map((l) => l.id as string);
  let bids: Record<string, unknown>[] = [];
  if (myListingIds.length > 0) {
    const bidsResult = await c.env.DB.prepare(
      `SELECT tb.*, t.name as bidder_name FROM transfer_bids tb JOIN teams t ON tb.team_id = t.id
       WHERE tb.listing_id IN (${myListingIds.map(() => "?").join(",")}) AND tb.status = 'pending'`
    ).bind(...myListingIds).all().catch((e) => { logger.warn({ module: "game" }, "fetch bids for my listings", e); return { results: [] }; });
    bids = bidsResult.results;
  }

  // Check if user has pending bids on any listing
  const listingIds = listings.results.map((l) => l.id as string);
  let myBids: Record<string, number> = {};
  if (listingIds.length > 0) {
    const myBidsResult = await c.env.DB.prepare(
      `SELECT listing_id, amount FROM transfer_bids WHERE team_id = ? AND status = 'pending' AND listing_id IN (${listingIds.map(() => "?").join(",")})`
    ).bind(teamId, ...listingIds).all().catch(() => ({ results: [] }));
    for (const b of myBidsResult.results) {
      myBids[b.listing_id as string] = b.amount as number;
    }
  }

  return c.json({
    listings: listings.results.map((l) => {
      const isAi = !!(l.is_ai_listing as number);
      if (isAi) {
        const ai = (() => { try { return JSON.parse(l.ai_player_data as string); } catch { return {}; } })();
        const blur = (v: number) => Math.round(v / 5) * 5;
        return {
          id: l.id, playerId: "virtual_ai", askingPrice: l.asking_price, isAiListing: true,
          playerName: `${ai.firstName ?? "?"} ${ai.lastName ?? "?"}`, playerAge: ai.age, position: ai.position,
          overallRating: ai.overallRating, teamName: ai.fromTeam ?? "Neznámý tým", expiresAt: l.expires_at,
          avatar: ai.avatar ?? {},
          skills: ai.skills ? Object.fromEntries(Object.entries(ai.skills).map(([k, v]) => [k, typeof v === "number" ? blur(v as number) : v])) : {},
          myBidAmount: myBids[l.id as string] ?? null,
        };
      }
      return {
        id: l.id, playerId: l.player_id, askingPrice: l.asking_price, isAiListing: false,
        playerName: `${l.first_name} ${l.last_name}`, playerAge: l.age, position: l.position,
        overallRating: l.overall_rating, teamName: l.team_name, expiresAt: l.expires_at,
        injuryDays: (l.injury_days as number) ?? null,
        avatar: (() => { try { return JSON.parse(l.player_avatar as string); } catch (e) { logger.warn({ module: "game" }, `parse market avatar: ${e}`); return {}; } })(),
        skills: (() => { try { const s = JSON.parse(l.skills as string); const blur = (v: number) => Math.round(v / 5) * 5; return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? blur(v) : v])); } catch { return {}; } })(),
        myBidAmount: myBids[l.id as string] ?? null,
      };
    }),
    myListings: myListings.results.map((l) => ({
      id: l.id, playerId: l.player_id, askingPrice: l.asking_price,
      playerName: `${l.first_name} ${l.last_name}`, playerAge: l.age, position: l.position,
      overallRating: l.overall_rating, expiresAt: l.expires_at,
      avatar: (() => { try { return JSON.parse(l.player_avatar as string); } catch (e) { logger.warn({ module: "game" }, `parse myListing avatar: ${e}`); return {}; } })(),
      bids: bids.filter((b) => b.listing_id === l.id).map((b) => ({
        id: b.id, amount: b.amount, bidderName: b.bidder_name, teamId: b.team_id,
      })),
    })),
  });
});

// Place bid
gameRouter.post("/teams/:teamId/market/:listingId/bid", async (c) => {
  const teamId = c.req.param("teamId");
  const listingId = c.req.param("listingId");
  const body = await c.req.json<{ amount: number }>();
  if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) {
    return c.json({ error: "Nabídka musí být kladné celé číslo" }, 400);
  }

  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
  if (!team || team.budget < body.amount) return c.json({ error: `Nedostatek peněz. Máte ${team?.budget?.toLocaleString("cs") ?? 0} Kč, nabízíte ${body.amount.toLocaleString("cs")} Kč.` }, 400);

  // Check if this is an AI listing — auto-accept immediately
  const listing = await c.env.DB.prepare("SELECT is_ai_listing, ai_player_data, asking_price, rejected_by FROM transfer_listings WHERE id = ? AND status = 'active'")
    .bind(listingId).first<{ is_ai_listing: number; ai_player_data: string; asking_price: number; rejected_by: string }>();
  if (!listing) return c.json({ error: "Listing nenalezen" }, 404);

  if (listing.is_ai_listing) {
    // AI listing — check price, then player agency decision, then transfer
    if (body.amount < listing.asking_price) {
      return c.json({ error: `Nabídka je příliš nízká. Požadovaná cena: ${listing.asking_price.toLocaleString("cs")} Kč.` }, 400);
    }
    const aiData = JSON.parse(listing.ai_player_data);

    // Cooldown check — same pattern as free agents rejected_by
    const rejectedByStr = listing.rejected_by as string ?? "[]";
    const rejectedBy: string[] = (() => { try { return JSON.parse(rejectedByStr); } catch { return []; } })();
    if (rejectedBy.includes(teamId)) {
      return c.json({ ok: false, rejected: true, explanation: "Hráč vás už jednou odmítl. Momentálně nemá zájem." });
    }

    // Player agency decision — will the player agree to move here?
    const teamInfo = await c.env.DB.prepare(
      "SELECT t.reputation, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<{ reputation: number; lat: number; lng: number; district: string }>();
    const squadCount = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?")
      .bind(teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "count squad for AI bid", e); return { cnt: 15 }; });

    // Get approximate coordinates for the AI team's city from village table
    const aiVillage = await c.env.DB.prepare(
      "SELECT lat, lng FROM villages WHERE name = ? OR name LIKE ? LIMIT 1"
    ).bind(aiData.fromCity ?? "", `${aiData.fromCity ?? ""}%`).first<{ lat: number; lng: number }>()
      .catch((e) => { logger.warn({ module: "game" }, "fetch AI city coords", e); return null; });

    if (teamInfo) {
      const { evaluateSigningChance } = await import("../transfers/player-agency");
      const agencyRng = createRng(cryptoSeed());
      // AI players have patriotism to their home district — cross-district transfer is harder
      const pers = { ...(aiData.personality ?? {}), patriotism: 65 };
      const decision = evaluateSigningChance(
        { weekly_wage: aiData.weeklyWage ?? 200, personality: pers, district: aiData.fromDistrict ?? null },
        { reputation: teamInfo.reputation, villageLat: teamInfo.lat, villageLon: teamInfo.lng, squadSize: squadCount?.cnt ?? 15, district: teamInfo.district },
        aiVillage, aiData.weeklyWage ?? 200,
        agencyRng,
      );
      if (!decision.accepted) {
        // Save rejection — same pattern as free agents rejected_by
        rejectedBy.push(teamId);
        await c.env.DB.prepare("UPDATE transfer_listings SET rejected_by = ? WHERE id = ?")
          .bind(JSON.stringify(rejectedBy), listingId).run()
          .catch((e) => logger.warn({ module: "game" }, "save AI rejection", e));
        return c.json({ ok: false, rejected: true, explanation: decision.explanation, factors: decision.factors });
      }
    }

    const playerId = crypto.randomUUID();
    const skills = JSON.stringify(aiData.skills ?? {});
    const physical = JSON.stringify(aiData.physical ?? {});
    const personality = JSON.stringify(aiData.personality ?? {});
    const lifeContext = JSON.stringify({ occupation: "Fotbalista", condition: 80, morale: 55 });
    const avatar = JSON.stringify(aiData.avatar ?? {});
    const weeklyWage = aiData.weeklyWage ?? Math.round(10 + ((aiData.overallRating ?? 40) / 100) * 400);

    await c.env.DB.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
    ).bind(playerId, teamId, aiData.firstName, aiData.lastName, aiData.age, aiData.position, aiData.overallRating,
      skills, physical, personality, lifeContext, avatar, weeklyWage).run();

    // Deduct budget (recordTransaction handles both budget update + logging)
    const { recordTransaction } = await import("../season/finance-processor");
    const gameDate = (await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; }))?.game_date ?? new Date().toISOString();
    await recordTransaction(c.env.DB, teamId, "transfer_fee", -body.amount, `Přestup: ${aiData.firstName} ${aiData.lastName} z ${aiData.fromTeam}`, gameDate);

    // Residence + commute
    const { generateResidence } = await import("../generators/residence");
    const teamVillage = await c.env.DB.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
      .bind(teamId).first<{ name: string; size: string; district: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch village for AI transfer", e); return null; });
    if (teamVillage) {
      const resRng = createRng(cryptoSeed());
      const res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
      await c.env.DB.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
        .bind(res.residence, res.commuteKm, playerId).run().catch((e) => logger.warn({ module: "game" }, "set residence AI transfer", e));
    }

    // Contract
    const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for AI transfer", e); return null; });
    await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
      .bind(crypto.randomUUID(), playerId, teamId, season?.id ?? "unknown", body.amount).run().catch((e) => logger.warn({ module: "game" }, "AI transfer contract", e));

    // Mark listing sold
    await c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ?").bind(listingId).run();

    // News
    const teamRow = await c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(teamId).first<{ name: string; league_id: string }>();
    if (teamRow) {
      const { createTransferNews } = await import("../transfers/transfer-news");
      await createTransferNews(c.env.DB, teamRow.league_id, teamId, "transfer_completed", {
        playerName: `${aiData.firstName} ${aiData.lastName}`, playerAge: aiData.age,
        playerPosition: aiData.position, teamName: teamRow.name, toTeamName: teamRow.name, fromTeamName: aiData.fromTeam ?? "Neznámý tým",
        fee: body.amount, isCrossDistrict: true,
      }).catch((e) => logger.warn({ module: "game" }, "AI transfer news", e));
    }

    // Return new player for reveal card
    const newPlayer = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch new AI transfer player", e); return null; });
    const playerData = newPlayer ? {
      ...newPlayer,
      skills: JSON.parse((newPlayer.skills as string) ?? "{}"),
      physical: JSON.parse((newPlayer.physical as string) ?? "{}"),
      personality: JSON.parse((newPlayer.personality as string) ?? "{}"),
      lifeContext: JSON.parse((newPlayer.life_context as string) ?? "{}"),
      avatar: JSON.parse((newPlayer.avatar as string) ?? "{}"),
    } : null;

    return c.json({ ok: true, autoAccepted: true, playerId, player: playerData });
  }

  // Normal (human) listing — just place bid
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO transfer_bids (id, listing_id, team_id, amount) VALUES (?, ?, ?, ?)")
    .bind(id, listingId, teamId, body.amount).run();
  return c.json({ ok: true, bidId: id });
});

// Accept/reject bid
gameRouter.post("/teams/:teamId/bids/:bidId/accept", async (c) => {
  const teamId = c.req.param("teamId");
  const bidId = c.req.param("bidId");

  const bid = await c.env.DB.prepare(
    "SELECT tb.*, tl.player_id, tl.team_id as seller_team_id FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id WHERE tb.id = ? AND tl.team_id = ? AND tb.status = 'pending'"
  ).bind(bidId, teamId).first<Record<string, unknown>>();
  if (!bid) return c.json({ error: "Nabídka nenalezena" }, 404);

  const buyerTeamId = bid.team_id as string;
  const playerId = bid.player_id as string;
  const amount = bid.amount as number;

  const buyer = await c.env.DB.prepare("SELECT budget, name, game_date FROM teams WHERE id = ?").bind(buyerTeamId).first<{ budget: number; name: string; game_date: string }>();
  if (!buyer) return c.json({ error: "Kupující nenalezen" }, 400);

  const seller = await c.env.DB.prepare("SELECT name, league_id, budget FROM teams WHERE id = ?").bind(teamId).first<{ name: string; league_id: string; budget: number }>();
  const player = await c.env.DB.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const gameDate = buyer.game_date ?? new Date().toISOString();
  const playerName = `${player?.first_name} ${player?.last_name}`;

  // Atomický budget check + odečtení — zabraňuje race condition.
  const bidDeductResult = await c.env.DB.prepare(
    "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?"
  ).bind(amount, buyerTeamId, amount).run();
  if (bidDeductResult.meta.changes === 0) {
    return c.json({ error: "Kupující nemá dostatek prostředků" }, 400);
  }

  // Přičíst prodávajícímu + přesunout hráče + uzavřít inzerát/bidy atomicky.
  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1")
    .first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for transfer contract", e); return null; });

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, teamId),
    c.env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ?").bind(buyerTeamId, playerId),
    c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ?").bind(bid.listing_id),
    c.env.DB.prepare("UPDATE transfer_bids SET status = 'accepted' WHERE id = ?").bind(bidId),
  ]);

  await c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND id != ? AND status = 'pending'")
    .bind(bid.listing_id, bidId).run().catch((e) => logger.warn({ module: "game" }, "reject other bids on accept", e));

  // Transaction log (budget již upraven výše)
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, `Přestup: ${playerName}`, gameDate),
    c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), teamId, amount, (seller?.budget ?? 0) + amount, `Prodej: ${playerName}`, gameDate),
  ]).catch((e) => logger.warn({ module: "game" }, "log bid-accept transactions", e));

  await onPlayerTransferred(c.env.DB, playerId, buyerTeamId);

  await c.env.DB.prepare("UPDATE player_contracts SET leave_type = 'transfer', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1")
    .bind(playerId, teamId).run().catch((e) => logger.warn({ module: "game" }, "deactivate contract on transfer", e));
  await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
    .bind(crypto.randomUUID(), playerId, buyerTeamId, season?.id ?? "unknown", amount).run().catch((e) => logger.warn({ module: "game" }, "insert transfer contract", e));

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(c.env.DB, seller?.league_id ?? "", null, "transfer_completed", {
    playerName: `${player?.first_name} ${player?.last_name}`, playerAge: player?.age as number,
    playerPosition: player?.position as string, teamName: seller?.name ?? "",
    fromTeamName: seller?.name, toTeamName: buyer.name, fee: amount,
  }).catch((e) => logger.warn({ module: "game" }, "create transfer completed news", e));

  return c.json({ ok: true });
});

gameRouter.post("/teams/:teamId/bids/:bidId/reject", async (c) => {
  const teamId = c.req.param("teamId");
  const bidId = c.req.param("bidId");
  await c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE id = ? AND listing_id IN (SELECT id FROM transfer_listings WHERE team_id = ?)").bind(bidId, teamId).run();
  return c.json({ ok: true });
});

// Transfer offers between teams (transfer or loan)
gameRouter.post("/teams/:teamId/offers", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ playerId: string; amount: number; message?: string; offerType?: "transfer" | "loan"; loanDuration?: number }>();
  const player = await c.env.DB.prepare("SELECT p.*, t.user_id FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ?").bind(body.playerId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  // Buyout případ: hráč je u nás na hostování a chceme ho odkoupit od původního klubu
  const isBuyout = player.team_id === teamId && !!player.loan_from_team_id;
  let targetOwnerId = player.team_id as string;
  if (isBuyout) {
    targetOwnerId = player.loan_from_team_id as string;
    if (body.offerType === "loan") return c.json({ error: "Na hostujícího hráče lze poslat jen trvalý odkup" }, 400);
  } else {
    if (player.team_id === teamId) return c.json({ error: "Nemůžeš nabídnout na vlastního hráče" }, 400);
    if (player.loan_from_team_id) return c.json({ error: "Hráč je již na hostování" }, 400);
  }

  // Owner user check — only human teams can receive offers
  const ownerTeam = await c.env.DB.prepare("SELECT user_id FROM teams WHERE id = ?").bind(targetOwnerId).first<{ user_id: string }>();
  if (!ownerTeam || ownerTeam.user_id === "ai") return c.json({ error: "Nabídky lze posílat jen lidským týmům" }, 400);

  const offerType = body.offerType ?? "transfer";
  const loanDuration = offerType === "loan" ? (body.loanDuration ?? 30) : null;

  // Validace částky: loan povoluje 0 (bezplatné hostování), transfer vyžaduje kladné celé číslo
  if (!Number.isInteger(body.amount) || body.amount < 0 || (offerType !== "loan" && body.amount === 0)) {
    return c.json({ error: "Nabídka musí být kladné celé číslo (0 povolena jen pro hostování)" }, 400);
  }
  if (body.amount > 0) {
    const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
    if (!team || team.budget < body.amount) return c.json({ error: `Nedostatek peněz. Máte ${team?.budget?.toLocaleString("cs") ?? 0} Kč, nabízíte ${body.amount.toLocaleString("cs")} Kč.` }, 400);
  }

  if (offerType === "loan" && (!loanDuration || loanDuration < 7 || loanDuration > 180)) {
    return c.json({ error: "Délka hostování musí být 7–180 dní" }, 400);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, message, expires_at, offer_type, loan_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, body.playerId, teamId, targetOwnerId, body.amount, body.message ?? null, expiresAt.toISOString(), offerType, loanDuration).run();

  // SMS to the owner team about the incoming offer
  const buyerTeam = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  const pName = `${player.first_name} ${player.last_name}`;
  if (isBuyout) {
    await sendPhoneSMS(c.env.DB, targetOwnerId, "Sportovní ředitel", "Sportovní ředitel",
      `📩 ${buyerTeam?.name ?? "Neznámý klub"} chce odkoupit ${pName} (aktuálně u nich na hostování) za ${body.amount.toLocaleString("cs")} Kč.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else if (offerType === "loan") {
    await sendPhoneSMS(c.env.DB, targetOwnerId, "Sportovní ředitel", "Sportovní ředitel",
      `📩 ${buyerTeam?.name ?? "Neznámý klub"} má zájem o hostování ${pName}.${body.amount > 0 ? ` Nabízí poplatek ${body.amount.toLocaleString("cs")} Kč.` : ""} Podívejte se na to v přestupech.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else {
    await sendPhoneSMS(c.env.DB, targetOwnerId, "Sportovní ředitel", "Sportovní ředitel",
      `📩 Přišla nabídka na ${pName} od ${buyerTeam?.name ?? "neznámého klubu"} za ${body.amount.toLocaleString("cs")} Kč. Podívejte se na to v přestupech.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
    const offerLabel = offerType === "loan" ? "hostování" : "přestup";
    await createNotification(c.env.DB, targetOwnerId, "transfer",
      `💰 Nová nabídka za ${pName}`,
      `${buyerTeam?.name ?? "Neznámý klub"} nabízí ${offerLabel} za ${body.amount.toLocaleString("cs-CZ")} Kč.`,
      "/dashboard/transfers", pushEnv);
  } catch (e) { logger.warn({ module: "game" }, "new offer notification", e); }

  return c.json({ ok: true, offerId: id });
});

gameRouter.get("/teams/:teamId/offers", async (c) => {
  const teamId = c.req.param("teamId");
  const incoming = await c.env.DB.prepare(
    `SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar, p.skills as player_skills,
     t.name as from_team_name, t.league_id as from_league_id
     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id JOIN teams t ON to2.from_team_id = t.id
     WHERE to2.to_team_id = ? AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC`
  ).bind(teamId).all();
  const myTeam = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string }>();
  const outgoing = await c.env.DB.prepare(
    `SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.avatar as player_avatar, p.skills as player_skills,
     t.name as to_team_name, t.league_id as to_league_id
     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id JOIN teams t ON to2.to_team_id = t.id
     WHERE to2.from_team_id = ? AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC`
  ).bind(teamId).all();
  // Include loaned-out players
  const loanedOut = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.loan_until, t.name as loan_team_name
     FROM players p JOIN teams t ON p.team_id = t.id WHERE p.loan_from_team_id = ?`
  ).bind(teamId).all().catch(() => ({ results: [] }));
  // Include loaned-in players
  const loanedIn = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.loan_until, t.name as owner_team_name
     FROM players p JOIN teams t ON p.loan_from_team_id = t.id WHERE p.team_id = ? AND p.loan_from_team_id IS NOT NULL`
  ).bind(teamId).all().catch(() => ({ results: [] }));
  return c.json({ incoming: incoming.results, outgoing: outgoing.results, loanedOut: loanedOut.results, loanedIn: loanedIn.results, myLeagueId: myTeam?.league_id ?? null });
});

gameRouter.post("/teams/:teamId/offers/:offerId/accept", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  const offer = await c.env.DB.prepare("SELECT * FROM transfer_offers WHERE id = ? AND to_team_id = ? AND status IN ('pending','countered')").bind(offerId, teamId).first<Record<string, unknown>>();
  if (!offer) return c.json({ error: "Nabídka nenalezena" }, 404);

  // ?? přeskakuje jen null/undefined, ne 0 — proto explicitní kontrola.
  const amount = (offer.counter_amount != null ? (offer.counter_amount as number) : (offer.offer_amount as number));
  if (amount <= 0) return c.json({ error: "Neplatná částka přestupu" }, 400);
  const buyerTeamId = offer.from_team_id as string;
  const playerId = offer.player_id as string;
  const offerType = (offer.offer_type as string) ?? "transfer";
  const loanDuration = offer.loan_duration as number | null;

  const buyer = await c.env.DB.prepare("SELECT budget, name, game_date FROM teams WHERE id = ?").bind(buyerTeamId).first<{ budget: number; name: string; game_date: string }>();
  if (!buyer) return c.json({ error: "Kupující nenalezen" }, 400);
  const seller = await c.env.DB.prepare("SELECT name, league_id, budget FROM teams WHERE id = ?").bind(teamId).first<{ name: string; league_id: string; budget: number }>();
  const player = await c.env.DB.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const gameDate = buyer.game_date ?? new Date().toISOString();
  const offerPlayerName = `${player?.first_name} ${player?.last_name}`;

  // Get current season for contract records
  const currentSeason = await c.env.DB.prepare("SELECT id FROM seasons ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for offer accept", e); return null; });
  const seasonId = currentSeason?.id ?? "season-1";

  if (offerType === "loan" && loanDuration) {
    // Hostování — atomický budget check (pouze pokud je nenulový poplatek)
    if (amount > 0) {
      const loanDeductResult = await c.env.DB.prepare(
        "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?"
      ).bind(amount, buyerTeamId, amount).run();
      if (loanDeductResult.meta.changes === 0) {
        return c.json({ error: "Kupující nemá dostatek prostředků" }, 400);
      }
    }

    const loanUntil = new Date(gameDate);
    loanUntil.setDate(loanUntil.getDate() + loanDuration);

    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = ? WHERE id = ?")
        .bind(buyerTeamId, teamId, loanUntil.toISOString(), playerId),
      c.env.DB.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
    ]);

    // Contract + transaction log (non-critical)
    await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'loan', ?, 1)")
      .bind(crypto.randomUUID(), playerId, buyerTeamId, seasonId, gameDate, amount).run().catch((e) => logger.warn({ module: "game" }, "insert loan contract", e));
    if (amount > 0) {
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_fee', ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, `Hostování: ${offerPlayerName}`, gameDate),
        c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, teamId),
        c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_income', ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), teamId, amount, (seller?.budget ?? 0) + amount, `Hostování (příjem): ${offerPlayerName}`, gameDate),
      ]).catch((e) => logger.warn({ module: "game" }, "log loan transactions", e));
    }

    const { createTransferNews } = await import("../transfers/transfer-news");
    await createTransferNews(c.env.DB, seller?.league_id ?? "", null, "loan_completed", {
      playerName: offerPlayerName, playerAge: player?.age as number,
      playerPosition: player?.position as string, teamName: seller?.name ?? "",
      fromTeamName: seller?.name, toTeamName: buyer.name, fee: amount,
    }).catch((e) => logger.warn({ module: "game" }, "create loan news", e));
  } else {
    // Trvalý přestup — atomický budget check + odečtení.
    const transferDeductResult = await c.env.DB.prepare(
      "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?"
    ).bind(amount, buyerTeamId, amount).run();
    if (transferDeductResult.meta.changes === 0) {
      return c.json({ error: "Kupující nemá dostatek prostředků" }, 400);
    }

    const currentPlayer = await c.env.DB.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = ?")
      .bind(playerId).first<{ team_id: string; loan_from_team_id: string | null }>();
    const isBuyoutAccept = !!currentPlayer?.loan_from_team_id && currentPlayer.loan_from_team_id === teamId && currentPlayer.team_id === buyerTeamId;

    // Přičíst prodávajícímu + přesunout hráče + uzavřít nabídku atomicky.
    const playerUpdateStmt = isBuyoutAccept
      ? c.env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ?").bind(buyerTeamId, playerId)
      : c.env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ?").bind(buyerTeamId, playerId);

    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, teamId),
      playerUpdateStmt,
      c.env.DB.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
    ]);

    // Transaction log + contracts (non-critical)
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, `Přestup: ${offerPlayerName}`, gameDate),
      c.env.DB.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), teamId, amount, (seller?.budget ?? 0) + amount, `Prodej: ${offerPlayerName}`, gameDate),
    ]).catch((e) => logger.warn({ module: "game" }, "log offer-accept transactions", e));

    const contractCloseTeam = isBuyoutAccept ? buyerTeamId : teamId;
    const contractLeaveType = isBuyoutAccept ? "loan_bought" : "transfer";
    await c.env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = ? WHERE player_id = ? AND team_id = ? AND is_active = 1")
      .bind(gameDate, contractLeaveType, playerId, contractCloseTeam).run().catch((e) => logger.warn({ module: "game" }, "deactivate contract on offer accept", e));
    await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1)")
      .bind(crypto.randomUUID(), playerId, buyerTeamId, seasonId, gameDate, amount).run().catch((e) => logger.warn({ module: "game" }, "insert transfer contract on offer accept", e));

    const { createTransferNews } = await import("../transfers/transfer-news");
    await createTransferNews(c.env.DB, seller?.league_id ?? "", null, "transfer_completed", {
      playerName: offerPlayerName, playerAge: player?.age as number,
      playerPosition: player?.position as string, teamName: seller?.name ?? "",
      fromTeamName: seller?.name, toTeamName: buyer.name, fee: amount,
    }).catch((e) => logger.warn({ module: "game" }, "create offer accepted news", e));
  }

  // Update commute + reset squad number
  await onPlayerTransferred(c.env.DB, playerId, buyerTeamId);

  // SMS notifications
  const playerName = offerPlayerName;
  const role = "Sportovní ředitel";
  if (offerType === "loan") {
    await sendPhoneSMS(c.env.DB, buyerTeamId, role, role, `🤝 Hostování schváleno! ${playerName} přichází z ${seller?.name ?? "neznámého klubu"} na ${loanDuration} dní.`).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    await sendPhoneSMS(c.env.DB, teamId, role, role, `📤 Hostování potvrzeno. ${playerName} odchází do ${buyer.name} na ${loanDuration} dní.${amount > 0 ? ` Poplatek: ${amount.toLocaleString("cs")} Kč.` : ""}`).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else {
    await sendPhoneSMS(c.env.DB, buyerTeamId, role, role, `🤝 Přestup potvrzen! ${playerName} přichází z ${seller?.name ?? "neznámého klubu"} za ${amount.toLocaleString("cs")} Kč.`).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    await sendPhoneSMS(c.env.DB, teamId, role, role, `📤 Přestup potvrzen. ${playerName} odchází do ${buyer.name} za ${amount.toLocaleString("cs")} Kč.`).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  return c.json({ ok: true });
});

gameRouter.post("/teams/:teamId/offers/:offerId/reject", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  const body = await c.req.json<{ message?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse reject offer body", e); return {}; });

  // Get offer info before rejecting
  const offer = await c.env.DB.prepare("SELECT player_id, from_team_id, offer_type FROM transfer_offers WHERE id = ? AND to_team_id = ?")
    .bind(offerId, teamId).first<{ player_id: string; from_team_id: string; offer_type: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  await c.env.DB.prepare("UPDATE transfer_offers SET status = 'rejected', reject_message = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND to_team_id = ?")
    .bind((body as { message?: string }).message ?? null, offerId, teamId).run();

  // SMS to the offering team
  if (offer) {
    const player = await c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
      .bind(offer.player_id).first<{ first_name: string; last_name: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
    const sellerTeam = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
      .bind(teamId).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
    const playerName = player ? `${player.first_name} ${player.last_name}` : "hráče";
    const isLoan = offer.offer_type === "loan";
    const rejectMsg = (body as { message?: string }).message;
    await sendPhoneSMS(c.env.DB, offer.from_team_id, "Sportovní ředitel", "Sportovní ředitel",
      `❌ ${sellerTeam?.name ?? "Klub"} odmítl vaši nabídku na ${isLoan ? "hostování" : "přestup"} ${playerName}.${rejectMsg ? ` Vzkaz: "${rejectMsg}"` : ""}`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    try {
      const { createNotification } = await import("../community/notifications");
      const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
      await createNotification(c.env.DB, offer.from_team_id, "transfer",
        `❌ Nabídka za ${playerName} zamítnuta`,
        `${sellerTeam?.name ?? "Klub"} odmítl nabídku.`,
        "/dashboard/transfers", pushEnv);
    } catch (e) { logger.warn({ module: "game" }, "reject offer notification", e); }
  }

  return c.json({ ok: true });
});

gameRouter.post("/teams/:teamId/offers/:offerId/counter", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  const body = await c.req.json<{ amount: number }>();
  if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) {
    return c.json({ error: "Protinabídka musí být kladné celé číslo" }, 400);
  }
  await c.env.DB.prepare("UPDATE transfer_offers SET status = 'countered', counter_amount = ? WHERE id = ? AND to_team_id = ?")
    .bind(body.amount, offerId, teamId).run();

  // SMS to the buyer team
  const offer = await c.env.DB.prepare("SELECT player_id, from_team_id FROM transfer_offers WHERE id = ?")
    .bind(offerId).first<{ player_id: string; from_team_id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (offer) {
    const player = await c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
      .bind(offer.player_id).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
    const sellerTeam = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?")
      .bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
    const pName = player ? `${player.first_name} ${player.last_name}` : "hráče";
    await sendPhoneSMS(c.env.DB, offer.from_team_id, "Sportovní ředitel", "Sportovní ředitel",
      `💰 ${sellerTeam?.name ?? "Klub"} poslal protinabídku na ${pName}: ${body.amount.toLocaleString("cs")} Kč. Podívej se na ni v přestupech.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
    try {
      const { createNotification } = await import("../community/notifications");
      const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
      await createNotification(c.env.DB, offer.from_team_id, "transfer",
        `🔄 Protinabídka za ${pName}`,
        `${sellerTeam?.name ?? "Klub"} poslal protinabídku ${body.amount.toLocaleString("cs-CZ")} Kč.`,
        "/dashboard/transfers", pushEnv);
    } catch (e) { logger.warn({ module: "game" }, "counter offer notification", e); }
  }

  return c.json({ ok: true });
});

// Předčasné ukončení hostování — hráč se ihned vrací do původního klubu
gameRouter.post("/teams/:teamId/loans/:playerId/terminate", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const player = await c.env.DB.prepare(
    "SELECT id, first_name, last_name, age, position, team_id, loan_from_team_id FROM players WHERE id = ?"
  ).bind(playerId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (player.team_id !== teamId) return c.json({ error: "Hráč není ve tvém klubu" }, 403);
  if (!player.loan_from_team_id) return c.json({ error: "Hráč není na hostování" }, 400);

  const ownerTeamId = player.loan_from_team_id as string;
  const gameDate = (await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>())?.game_date ?? new Date().toISOString();

  // Vrátit hráče do původního týmu
  await c.env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ?")
    .bind(ownerTeamId, playerId).run();

  // Uzavřít loan kontrakt
  await c.env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_terminated' WHERE player_id = ? AND team_id = ? AND is_active = 1")
    .bind(gameDate, playerId, teamId).run()
    .catch((e) => logger.warn({ module: "game" }, "close loan contract failed", e));

  // Update commute + reset squad number
  await onPlayerTransferred(c.env.DB, playerId, ownerTeamId);

  const borrower = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>();
  const owner = await c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(ownerTeamId).first<{ name: string; league_id: string }>();
  const pName = `${player.first_name} ${player.last_name}`;

  // News event
  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(c.env.DB, owner?.league_id ?? "", null, "loan_return", {
    playerName: pName, playerAge: player.age as number,
    playerPosition: player.position as string, teamName: owner?.name ?? "",
    fromTeamName: borrower?.name, toTeamName: owner?.name, fee: 0,
  }).catch((e) => logger.warn({ module: "game" }, "create loan return news", e));

  // SMS oběma stranám
  const role = "Sportovní ředitel";
  await sendPhoneSMS(c.env.DB, teamId, role, role,
    `📤 Hostování ${pName} bylo předčasně ukončeno. Hráč se vrátil do ${owner?.name ?? "původního klubu"}.`
  ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  await sendPhoneSMS(c.env.DB, ownerTeamId, role, role,
    `📥 ${borrower?.name ?? "Klub"} předčasně ukončil hostování ${pName}. Hráč je zpět u tebe.`
  ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));

  return c.json({ ok: true });
});

gameRouter.delete("/teams/:teamId/offers/:offerId", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  await c.env.DB.prepare("UPDATE transfer_offers SET status = 'withdrawn' WHERE id = ? AND from_team_id = ? AND status = 'pending'").bind(offerId, teamId).run();
  return c.json({ ok: true });
});

// ── Player offers (organic scouting) ──

// GET /api/teams/:teamId/player-offers — pending offers
gameRouter.get("/teams/:teamId/player-offers", async (c) => {
  const teamId = c.req.param("teamId");
  const offers = await c.env.DB.prepare(
    "SELECT * FROM player_offers WHERE team_id = ? AND status = 'pending' AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY created_at DESC"
  ).bind(teamId).all().catch(() => ({ results: [] }));
  return c.json(offers.results.map((o) => ({
    id: o.id, source: o.source, sourceName: o.source_name, message: o.message,
    firstName: o.first_name, lastName: o.last_name, age: o.age, position: o.position,
    overallRating: o.overall_rating, weeklyWage: o.weekly_wage, expiresAt: o.expires_at,
    skills: JSON.parse((o.skills as string) ?? "{}"),
    physical: JSON.parse((o.physical as string) ?? "{}"),
    personality: JSON.parse((o.personality as string) ?? "{}"),
    lifeContext: JSON.parse((o.life_context as string) ?? "{}"),
    avatar: JSON.parse((o.avatar as string) ?? "{}"),
  })));
});

// POST /api/teams/:teamId/player-offers/:offerId/accept — sign the offered player
gameRouter.post("/teams/:teamId/player-offers/:offerId/accept", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");

  const offer = await c.env.DB.prepare("SELECT * FROM player_offers WHERE id = ? AND team_id = ? AND status = 'pending'")
    .bind(offerId, teamId).first<Record<string, unknown>>();
  if (!offer) return c.json({ error: "Nabídka nenalezena" }, 404);

  const playerId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).bind(playerId, teamId, offer.first_name, offer.last_name, offer.age, offer.position, offer.overall_rating,
    offer.skills, offer.physical, offer.personality, offer.life_context, offer.avatar, offer.weekly_wage).run();

  // Set residence
  const { generateResidence } = await import("../generators/residence");
  const teamVillage = await c.env.DB.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ name: string; size: string; district: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (teamVillage) {
    const resRng = createRng(cryptoSeed());
    const res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
    await c.env.DB.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
      .bind(res.residence, res.commuteKm, playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  // Contract
  const season = await c.env.DB.prepare("SELECT id FROM seasons ORDER BY number DESC LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 0, 1)")
    .bind(crypto.randomUUID(), playerId, teamId, season?.id ?? "season-1", offer.source).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));

  // Registration fee
  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  await recordTransaction(c.env.DB, teamId, "signing_fee", -500, `Registrace: ${offer.first_name} ${offer.last_name}`, team?.game_date ?? new Date().toISOString());

  // Mark offer as accepted
  await c.env.DB.prepare("UPDATE player_offers SET status = 'accepted' WHERE id = ?").bind(offerId).run();

  // Return full player data for reveal card
  const newPlayer = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const playerData = newPlayer ? {
    ...newPlayer,
    skills: JSON.parse((newPlayer.skills as string) ?? "{}"),
    physical: JSON.parse((newPlayer.physical as string) ?? "{}"),
    personality: JSON.parse((newPlayer.personality as string) ?? "{}"),
    lifeContext: JSON.parse((newPlayer.life_context as string) ?? "{}"),
    avatar: JSON.parse((newPlayer.avatar as string) ?? "{}"),
  } : null;

  return c.json({ ok: true, player: playerData });
});

// POST /api/teams/:teamId/player-offers/:offerId/reject
gameRouter.post("/teams/:teamId/player-offers/:offerId/reject", async (c) => {
  const offerId = c.req.param("offerId");
  const teamId = c.req.param("teamId");
  await c.env.DB.prepare("UPDATE player_offers SET status = 'rejected' WHERE id = ? AND team_id = ?").bind(offerId, teamId).run();
  return c.json({ ok: true });
});

// ── TEMP: Admin — manuální generování player offer pro testování ──
gameRouter.post("/admin/generate-player-offer/:teamId", async (c) => {
  const teamId = c.req.param("teamId");
  const { generatePlayerOffer } = await import("../events/player-offers");
  const { createRng } = await import("../generators/rng");
  const team = await c.env.DB.prepare(
    "SELECT v.district, v.population, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ district: string; population: number; size: string }>().catch((e) => { logger.warn({ module: "game" }, "admin offer gen", e); return null; });
  if (!team) return c.json({ error: "team not found" }, 404);
  const sizeMap: Record<string, string> = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
  const villageInfo = {
    region_code: team.district,
    category: (sizeMap[team.size] ?? "obec") as "vesnice" | "obec" | "mestys" | "mesto",
    population: team.population ?? 500,
    district: team.district,
  };
  const rng = createRng(cryptoSeed());
  const gameDate = new Date().toISOString();
  const result = await generatePlayerOffer(c.env.DB, rng, teamId, team.district, villageInfo, gameDate);
  return c.json({ ok: true, result });
});

// ── Coach interviews (Rozhovor kola) ──

// GET /api/teams/:teamId/coach-interviews — pending interviews
gameRouter.get("/teams/:teamId/coach-interviews", async (c) => {
  const teamId = c.req.param("teamId");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM coach_interviews WHERE team_id = ? AND status = 'pending' ORDER BY created_at DESC"
  ).bind(teamId).all<Record<string, unknown>>().catch((e) => {
    logger.warn({ module: "game.ts" }, "get coach_interviews", e);
    return { results: [] };
  });

  const interviews = (rows.results ?? []).map((r) => ({
    id: r.id,
    leagueId: r.league_id,
    teamId: r.team_id,
    managerId: r.manager_id,
    matchCalendarId: r.match_calendar_id,
    gameWeek: r.game_week,
    questions: (() => { try { return JSON.parse(r.questions as string); } catch { return []; } })(),
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));

  return c.json({ interviews });
});

// POST /api/teams/:teamId/coach-interviews/:interviewId/answer — submit answers + generate article
gameRouter.post("/teams/:teamId/coach-interviews/:interviewId/answer", async (c) => {
  const teamId = c.req.param("teamId");
  const interviewId = c.req.param("interviewId");

  const interview = await c.env.DB.prepare(
    "SELECT * FROM coach_interviews WHERE id = ? AND team_id = ? AND status = 'pending'"
  ).bind(interviewId, teamId).first<Record<string, unknown>>().catch((e) => {
    logger.warn({ module: "game.ts" }, "get interview for answer", e);
    return null;
  });
  if (!interview) return c.json({ error: "Rozhovor nenalezen nebo již zpracován" }, 404);

  const body = await c.req.json<{ answers: string[] }>().catch((e) => { logger.warn({ module: "game.ts" }, "parse interview answer body", e); return null; });
  if (!body?.answers?.length) return c.json({ error: "Chybí odpovědi" }, 400);

  const questions: string[] = (() => {
    try { return JSON.parse(interview.questions as string); } catch { return []; }
  })();

  if (body.answers.length !== questions.length) {
    return c.json({ error: `Očekáváno ${questions.length} odpovědí, dostáno ${body.answers.length}` }, 400);
  }

  // Sanitize answers — max 500 chars each
  const answers = body.answers.map((a) => String(a).slice(0, 500).trim());

  // KROK 1: Okamžitě ulož odpovědi před Gemini — odpovědi se neztratí při selhání generování
  await c.env.DB.prepare(
    "UPDATE coach_interviews SET status = 'answered', answers = ? WHERE id = ?"
  ).bind(JSON.stringify(answers), interviewId)
    .run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "save interview answers", e); });

  // KROK 2: Načti kontext pro generování článku
  const [managerRow, calRow] = await Promise.all([
    c.env.DB.prepare(
      "SELECT m.name as manager_name, m.avatar as manager_avatar, t.name as team_name, t.league_id FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ?"
    ).bind(teamId).first<{ manager_name: string; manager_avatar: string | null; team_name: string; league_id: string }>()
      .catch((e) => { logger.warn({ module: "game.ts" }, "load manager for interview article", e); return null; }),
    c.env.DB.prepare(
      `SELECT m.home_team_id, m.away_team_id, ht.name as home_name, at.name as away_name
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1`
    ).bind(interview.match_calendar_id, teamId, teamId)
      .first<{ home_team_id: string; away_team_id: string; home_name: string; away_name: string }>()
      .catch((e) => { logger.warn({ module: "game.ts" }, "load match for interview article", e); return null; }),
  ]);

  if (!managerRow) {
    logger.warn({ module: "game.ts", teamId }, "manager not found, answers saved but article skipped");
    return c.json({ ok: true, articlePending: true });
  }

  const opponentName = calRow
    ? (calRow.home_team_id === teamId ? calRow.away_name : calRow.home_name)
    : "soupeř";

  // KROK 3: Generuj článek přes Gemini — pokud selže, odpovědi jsou bezpečně uloženy a daily-tick je zretryuje
  const qa = questions.map((q, i) => ({ q, a: answers[i] ?? "" }));
  const { generateInterviewArticle } = await import("../news/interview-generator");
  const article = await generateInterviewArticle(
    (c.env as any).GEMINI_API_KEY,
    qa,
    managerRow.manager_name,
    managerRow.team_name,
    opponentName,
  );

  if (!article) {
    logger.warn({ module: "game.ts", teamId }, "Gemini failed for interview article, answers saved, will retry");
    return c.json({ ok: true, articlePending: true });
  }

  // KROK 4: Ulož článek + aktualizuj odkaz
  const newsId = crypto.randomUUID();
  const managerAvatar = (() => {
    try { return managerRow.manager_avatar ? JSON.parse(managerRow.manager_avatar) : null; } catch { return null; }
  })();

  const newsBody = JSON.stringify({
    managerName: managerRow.manager_name,
    managerAvatar,
    teamName: managerRow.team_name,
    article: article.body,
    qa,
  });

  await c.env.DB.prepare(
    "INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, created_at) VALUES (?, ?, ?, 'interview', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(newsId, managerRow.league_id, teamId, article.headline, newsBody, interview.game_week as number)
    .run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "insert interview news", e); });

  await c.env.DB.prepare(
    "UPDATE coach_interviews SET article_news_id = ? WHERE id = ?"
  ).bind(newsId, interviewId)
    .run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "update interview article_news_id", e); });

  // KROK 5: Notifikace ostatnim trenérum v lize
  try {
    const humanTeams = await c.env.DB.prepare(
      "SELECT id FROM teams WHERE league_id = ? AND user_id != 'ai' AND id != ?"
    ).bind(managerRow.league_id, teamId)
      .all<{ id: string }>()
      .then((r) => r.results ?? []);

    const msgBody = `📰 Vyšel nový Rozhovor kola: "${article.headline}"`;
    for (const t of humanTeams) {
      await sendPhoneSMS(c.env.DB, t.id, "Redakce Zpravodaje", "Redakce Zpravodaje", msgBody)
        .catch((e) => logger.warn({ module: "game.ts" }, "interview notify team", e));
    }
  } catch (e) {
    logger.warn({ module: "game.ts" }, "interview league notifications", e);
  }

  logger.info({ module: "game.ts", teamId }, `interview answered -> article ${newsId}`);
  return c.json({ ok: true, articleId: newsId });
});

// POST /api/teams/:teamId/coach-interviews/:interviewId/decline — odmítnutí rozhovoru
gameRouter.post("/teams/:teamId/coach-interviews/:interviewId/decline", async (c) => {
  const teamId = c.req.param("teamId");
  const interviewId = c.req.param("interviewId");
  await c.env.DB.prepare(
    "UPDATE coach_interviews SET status = 'declined' WHERE id = ? AND team_id = ? AND status = 'pending'"
  ).bind(interviewId, teamId).run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "decline interview", e); });
  return c.json({ ok: true });
});

// POST /api/admin/teams/:teamId/generate-interview — dev trigger pro testovani
gameRouter.post("/admin/teams/:teamId/generate-interview", async (c) => {
  const teamId = c.req.param("teamId");

  // Najdi nejblizsi nadchazejici zapas tohoto tymu
  const nextMatch = await c.env.DB.prepare(
    `SELECT sc.id as calendar_id, sc.game_week, sc.scheduled_at, t.league_id
     FROM season_calendar sc
     JOIN matches m ON m.calendar_id = sc.id
     JOIN teams t ON t.id = ?
     WHERE (m.home_team_id = ? OR m.away_team_id = ?)
       AND sc.scheduled_at > datetime('now')
       AND sc.status = 'scheduled'
     ORDER BY sc.scheduled_at ASC LIMIT 1`
  ).bind(teamId, teamId, teamId)
    .first<{ calendar_id: string; game_week: number; scheduled_at: string; league_id: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "admin generate-interview lookup", e); return null; });

  if (!nextMatch) return c.json({ error: "Zadny nadchazejici zapas" }, 404);

  const { tryCreateInterviewRequest } = await import("../news/interview-generator");
  await tryCreateInterviewRequest(c.env.DB, (c.env as any).GEMINI_API_KEY, {
    leagueId: nextMatch.league_id,
    calendarId: nextMatch.calendar_id,
    gameWeek: nextMatch.game_week,
  });

  return c.json({ ok: true, calendarId: nextMatch.calendar_id, gameWeek: nextMatch.game_week });
});

// ── Admin: Seed data management ──

gameRouter.get("/admin/seed-data", async (c) => {
  const { OCCUPATIONS } = await import("../generators/occupations");
  const tables = [
    { key: "villages", label: "Vesnice", editable: false },
    { key: "district_surnames", label: "Příjmení", editable: true },
    { key: "district_sponsors", label: "Sponzoři", editable: true },
    { key: "commentary_templates", label: "Komentáře", editable: true },
    { key: "crowd_reactions", label: "Reakce publika", editable: true },
    { key: "occupations", label: "Povolání", editable: false, count: OCCUPATIONS.length },
  ];

  const result: Array<{ key: string; label: string; count: number; editable: boolean; districts?: string[] }> = [];
  for (const t of tables) {
    const cnt = (t as any).count ?? (await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ${t.key}`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })))?.cnt ?? 0;
    const entry: typeof result[0] = { key: t.key, label: t.label, count: cnt, editable: t.editable };
    if (t.key === "district_surnames" || t.key === "district_sponsors") {
      const dists = await c.env.DB.prepare(`SELECT DISTINCT district FROM ${t.key} ORDER BY district`).all().catch(() => ({ results: [] }));
      entry.districts = dists.results.map((r) => r.district as string);
    }
    result.push(entry);
  }

  return c.json(result);
});

gameRouter.get("/admin/seed-data/:table", async (c) => {
  const table = c.req.param("table");
  // Special case: occupations from code
  if (table === "occupations") {
    const { OCCUPATIONS } = await import("../generators/occupations");
    const rows = OCCUPATIONS.map((o) => ({
      id: o.id, name: o.name,
      hamlet: o.w.hamlet, village: o.w.village, town: o.w.town, small_city: o.w.small_city, city: o.w.city,
      injuryRisk: o.injuryRisk, overtimeRisk: o.overtimeRisk, strengthBonus: o.strengthBonus,
      excuses: o.excuses.join(" | "),
    }));
    return c.json({ rows, total: rows.length });
  }

  const allowed = ["villages", "district_surnames", "district_sponsors", "commentary_templates", "crowd_reactions"];
  if (!allowed.includes(table)) return c.json({ error: "Invalid table" }, 400);

  const district = c.req.query("district");
  const limit = Number(c.req.query("limit") || "100");
  const offset = Number(c.req.query("offset") || "0");

  let query = `SELECT ${table === "district_surnames" ? "rowid as id, " : ""}* FROM ${table}`;
  const binds: unknown[] = [];
  if (district && (table === "district_surnames" || table === "district_sponsors")) {
    query += " WHERE district = ?";
    binds.push(district);
  }
  query += ` LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...binds).all().catch(() => ({ results: [] }));
  const total = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ${table}${district ? " WHERE district = ?" : ""}`)
    .bind(...(district ? [district] : [])).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));

  return c.json({ rows: rows.results, total: total?.cnt ?? 0 });
});

gameRouter.post("/admin/seed-data/:table", async (c) => {
  const table = c.req.param("table");
  const body = await c.req.json<Record<string, unknown>>();

  if (table === "district_surnames") {
    const { district, surname, frequency } = body;
    if (!district || !surname) return c.json({ error: "Missing district or surname" }, 400);
    await c.env.DB.prepare("INSERT INTO district_surnames (district, surname, frequency) VALUES (?, ?, ?)")
      .bind(district, surname, frequency ?? 10).run();
    return c.json({ ok: true });
  }
  if (table === "district_sponsors") {
    const { district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max } = body;
    if (!district || !name) return c.json({ error: "Missing fields" }, 400);
    await c.env.DB.prepare("INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(district, name, type ?? "obecné", monthly_min ?? 500, monthly_max ?? 1500, win_bonus_min ?? 100, win_bonus_max ?? 300).run();
    return c.json({ ok: true });
  }
  if (table === "commentary_templates") {
    const { event_type, template, tags } = body;
    if (!event_type || !template) return c.json({ error: "Missing fields" }, 400);
    await c.env.DB.prepare("INSERT INTO commentary_templates (event_type, template, tags) VALUES (?, ?, ?)")
      .bind(event_type, template, JSON.stringify(tags ?? [])).run();
    return c.json({ ok: true });
  }
  if (table === "crowd_reactions") {
    const { text } = body;
    if (!text) return c.json({ error: "Missing text" }, 400);
    await c.env.DB.prepare("INSERT INTO crowd_reactions (text) VALUES (?)").bind(text).run();
    return c.json({ ok: true });
  }
  return c.json({ error: "Table not writable" }, 400);
});

gameRouter.delete("/admin/seed-data/:table/:id", async (c) => {
  const table = c.req.param("table");
  const id = c.req.param("id");
  const allowed = ["district_surnames", "district_sponsors", "commentary_templates", "crowd_reactions"];
  if (!allowed.includes(table)) return c.json({ error: "Cannot delete from this table" }, 400);

  const idCol = table === "district_surnames" ? "rowid" : "id";
  await c.env.DB.prepare(`DELETE FROM ${table} WHERE ${idCol} = ?`).bind(id).run();
  return c.json({ ok: true });
});

gameRouter.put("/admin/seed-data/:table/:id", async (c) => {
  const table = c.req.param("table");
  const id = c.req.param("id");
  const allowed = ["district_surnames", "district_sponsors", "commentary_templates", "crowd_reactions"];
  if (!allowed.includes(table)) return c.json({ error: "Cannot edit this table" }, 400);

  const body = await c.req.json<Record<string, unknown>>();
  const idCol = table === "district_surnames" ? "rowid" : "id";

  // Build SET clause from body keys (only allowed columns)
  const allowedCols: Record<string, string[]> = {
    district_surnames: ["district", "surname", "frequency"],
    district_sponsors: ["district", "name", "type", "monthly_min", "monthly_max", "win_bonus_min", "win_bonus_max"],
    commentary_templates: ["event_type", "template", "tags"],
    crowd_reactions: ["text"],
  };
  const validCols = allowedCols[table] ?? [];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (validCols.includes(k)) {
      updates.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (updates.length === 0) return c.json({ error: "No valid fields" }, 400);

  values.push(id);
  await c.env.DB.prepare(`UPDATE ${table} SET ${updates.join(", ")} WHERE ${idCol} = ?`).bind(...values).run();
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// Fanoušci + Občerstvení (self concession mode)
// ─────────────────────────────────────────────────────────────

// GET /api/teams/:id/fans — stav fanoušků, vstupné override, last match delta
gameRouter.get("/teams/:teamId/fans", async (c) => {
  const teamId = c.req.param("teamId");
  const { ensureFansRow } = await import("../season/fans-processor");
  await ensureFansRow(c.env.DB, teamId);

  const fans = await c.env.DB.prepare(
    "SELECT satisfaction, loyalty, expected_performance, base_ticket_price, last_match_delta, last_match_reasons FROM fans WHERE team_id = ?",
  ).bind(teamId).first<{
    satisfaction: number;
    loyalty: number;
    expected_performance: number;
    base_ticket_price: number;
    last_match_delta: number;
    last_match_reasons: string | null;
  }>().catch((e) => { logger.warn({ module: "game" }, "load fans", e); return null; });

  if (!fans) return c.json({ error: "Fans not found" }, 404);

  // Load village size pro village base ticket price (prefill v UI)
  const { mapVillageSize, getBaseTicketPrice } = await import("../season/finance-processor");
  const villageRow = await c.env.DB.prepare(
    "SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ size: string }>().catch((e) => {
    logger.warn({ module: "game" }, "load village for base ticket", e);
    return null;
  });
  const villageBaseTicketPrice = getBaseTicketPrice(mapVillageSize(villageRow?.size ?? "village"));

  const mgr = await c.env.DB.prepare(
    "SELECT reputation, motivation FROM managers WHERE team_id = ?",
  ).bind(teamId).first<{ reputation: number; motivation: number }>().catch((e) => {
    logger.warn({ module: "game" }, "load manager for fans", e);
    return null;
  });

  const mgrMatchBoost = mgr
    ? Math.round((mgr.reputation - 50) * 0.03 + (mgr.motivation - 50) * 0.02)
    : 0;
  const mgrWeeklyLoyaltyBoost = mgr
    ? Math.round((mgr.reputation - 50) * 0.02 + (mgr.motivation - 50) * 0.015)
    : 0;

  let reasons: string[] = [];
  try {
    reasons = fans.last_match_reasons ? JSON.parse(fans.last_match_reasons) : [];
  } catch (e) {
    logger.warn({ module: "game" }, "parse last_match_reasons", e);
  }

  return c.json({
    satisfaction: fans.satisfaction,
    loyalty: fans.loyalty,
    expectedPerformance: fans.expected_performance,
    baseTicketPrice: fans.base_ticket_price,
    villageBaseTicketPrice,
    lastMatchDelta: fans.last_match_delta,
    lastMatchReasons: reasons,
    manager: mgr
      ? {
          reputation: mgr.reputation,
          motivation: mgr.motivation,
          matchBoost: mgrMatchBoost,
          weeklyLoyaltyBoost: mgrWeeklyLoyaltyBoost,
        }
      : null,
  });
});

// GET /api/teams/:id/fans/history — posledních N zápasů s satisfaction delta
gameRouter.get("/teams/:teamId/fans/history", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
  const rows = await c.env.DB.prepare(
    `SELECT id, match_id, gamedate, satisfaction_before, satisfaction_after, delta,
            reasons, opponent_name, result, attendance, created_at
     FROM fans_match_history
     WHERE team_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(teamId, limit)
    .all<{
      id: string;
      match_id: string | null;
      gamedate: string;
      satisfaction_before: number;
      satisfaction_after: number;
      delta: number;
      reasons: string | null;
      opponent_name: string | null;
      result: string | null;
      attendance: number;
      created_at: string;
    }>()
    .catch((e) => {
      logger.warn({ module: "game" }, "load fans history", e);
      return { results: [] };
    });

  const items = (rows.results ?? []).map((r) => ({
    id: r.id,
    matchId: r.match_id,
    gamedate: r.gamedate,
    satisfactionBefore: r.satisfaction_before,
    satisfactionAfter: r.satisfaction_after,
    delta: r.delta,
    reasons: r.reasons ? (JSON.parse(r.reasons) as string[]) : [],
    opponentName: r.opponent_name,
    result: r.result,
    attendance: r.attendance,
    createdAt: r.created_at,
  }));

  return c.json({ items });
});

// GET /api/teams/:id/concession/sales — detailní historie prodejů občerstvení (jen self mode)
gameRouter.get("/teams/:teamId/concession/sales", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "30", 10)));

  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.match_id, s.gamedate, s.product_key, s.quality_level, s.sell_price,
            s.wholesale_price, s.sold_count, s.revenue, s.profit, s.stockout, s.attendance,
            s.created_at,
            CASE WHEN m.home_team_id = ? THEN at.name ELSE ht.name END as opponent_name,
            CASE
              WHEN m.home_team_id = ? AND m.home_score > m.away_score THEN 'win'
              WHEN m.away_team_id = ? AND m.away_score > m.home_score THEN 'win'
              WHEN m.home_score = m.away_score THEN 'draw'
              ELSE 'loss'
            END as result
     FROM concession_match_sales s
     LEFT JOIN matches m ON m.id = s.match_id
     LEFT JOIN teams ht ON ht.id = m.home_team_id
     LEFT JOIN teams at ON at.id = m.away_team_id
     WHERE s.team_id = ?
     ORDER BY s.created_at DESC, s.product_key
     LIMIT ?`,
  )
    .bind(teamId, teamId, teamId, teamId, limit)
    .all<{
      id: string;
      match_id: string | null;
      gamedate: string;
      product_key: string;
      quality_level: number;
      sell_price: number;
      wholesale_price: number;
      sold_count: number;
      revenue: number;
      profit: number;
      stockout: number;
      attendance: number;
      created_at: string;
      opponent_name: string | null;
      result: string | null;
    }>()
    .catch((e) => {
      logger.warn({ module: "game" }, "load concession sales", e);
      return { results: [] };
    });

  // Grupování podle zápasu
  const byMatch = new Map<
    string,
    {
      matchId: string | null;
      gamedate: string;
      opponentName: string | null;
      result: string | null;
      attendance: number;
      products: {
        productKey: string;
        qualityLevel: number;
        sellPrice: number;
        wholesalePrice: number;
        soldCount: number;
        revenue: number;
        profit: number;
        stockout: boolean;
      }[];
      totalRevenue: number;
      totalProfit: number;
    }
  >();

  for (const r of rows.results ?? []) {
    const key = r.match_id ?? r.created_at;
    if (!byMatch.has(key)) {
      byMatch.set(key, {
        matchId: r.match_id,
        gamedate: r.gamedate,
        opponentName: r.opponent_name,
        result: r.result,
        attendance: r.attendance,
        products: [],
        totalRevenue: 0,
        totalProfit: 0,
      });
    }
    const group = byMatch.get(key)!;
    group.products.push({
      productKey: r.product_key,
      qualityLevel: r.quality_level,
      sellPrice: r.sell_price,
      wholesalePrice: r.wholesale_price,
      soldCount: r.sold_count,
      revenue: r.revenue,
      profit: r.profit,
      stockout: r.stockout === 1,
    });
    group.totalRevenue += r.revenue;
    group.totalProfit += r.profit;
  }

  return c.json({ matches: Array.from(byMatch.values()) });
});

// PATCH /api/teams/:id/fans/ticket-price — user override ceny vstupného
gameRouter.patch("/teams/:teamId/fans/ticket-price", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ baseTicketPrice: number }>().catch((e) => {
    logger.warn({ module: "game" }, "parse ticket-price body", e);
    return { baseTicketPrice: 0 };
  });
  const price = Math.max(0, Math.min(500, Math.round(body.baseTicketPrice ?? 0)));

  const { ensureFansRow } = await import("../season/fans-processor");
  await ensureFansRow(c.env.DB, teamId);

  await c.env.DB.prepare(
    "UPDATE fans SET base_ticket_price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ?",
  ).bind(price, teamId).run().catch((e) => logger.warn({ module: "game" }, "update ticket price", e));

  return c.json({ ok: true, baseTicketPrice: price });
});

// GET /api/teams/:id/concession — mód + stav produktů (+ katalog pro UI)
gameRouter.get("/teams/:teamId/concession", async (c) => {
  const teamId = c.req.param("teamId");
  const { ensureFansRow } = await import("../season/fans-processor");
  const { CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS } = await import("../season/concession-catalog");
  await ensureFansRow(c.env.DB, teamId);

  const stadium = await c.env.DB.prepare(
    "SELECT concession_mode, refreshments FROM stadiums WHERE team_id = ?",
  ).bind(teamId).first<{ concession_mode: string; refreshments: number }>().catch((e) => {
    logger.warn({ module: "game" }, "load stadium for concession", e);
    return null;
  });

  const mode = stadium?.concession_mode === "self" ? "self" : "external";
  const refreshmentsLevel = stadium?.refreshments ?? 0;
  const canSwitchToSelf = refreshmentsLevel >= 1;

  const productsResult = await c.env.DB.prepare(
    "SELECT product_key, quality_level, sell_price, stock_quantity FROM concession_products WHERE team_id = ?",
  ).bind(teamId).all<{
    product_key: string;
    quality_level: number;
    sell_price: number;
    stock_quantity: number;
  }>().catch((e) => { logger.warn({ module: "game" }, "load concession products", e); return { results: [] }; });

  const productsByKey = new Map(productsResult.results.map((r) => [r.product_key, r]));

  // Team reputation pro external income preview
  const teamRow = await c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ reputation: number }>().catch((e) => { logger.warn({ module: "game" }, "load team rep", e); return null; });
  const { computeExternalWeeklyConcession } = await import("../season/finance-processor");
  const externalWeeklyIncome = computeExternalWeeklyConcession(refreshmentsLevel, teamRow?.reputation ?? 50);

  const products = CONCESSION_PRODUCT_KEYS.map((key) => {
    const row = productsByKey.get(key);
    const catalog = CONCESSION_CATALOG[key];
    return {
      key,
      label: catalog.label,
      baseDemandRate: catalog.baseDemandRate,
      qualityLevel: row?.quality_level ?? 1,
      sellPrice: row?.sell_price ?? catalog.tiers[1].defaultSellPrice,
      stockQuantity: row?.stock_quantity ?? 0,
      tiers: catalog.tiers.map((t, i) => ({
        level: i,
        label: t.label,
        wholesalePrice: t.wholesalePrice,
        defaultSellPrice: t.defaultSellPrice,
      })),
    };
  });

  return c.json({
    mode,
    canSwitchToSelf,
    refreshmentsLevel,
    externalWeeklyIncome,
    products,
  });
});

// PATCH /api/teams/:id/concession/mode — přepínání mezi external a self
gameRouter.patch("/teams/:teamId/concession/mode", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ mode: "external" | "self" }>().catch((e) => {
    logger.warn({ module: "game" }, "parse mode body", e);
    return { mode: "external" as const };
  });
  const mode = body.mode === "self" ? "self" : "external";

  if (mode === "self") {
    const stadium = await c.env.DB.prepare(
      "SELECT refreshments FROM stadiums WHERE team_id = ?",
    ).bind(teamId).first<{ refreshments: number }>().catch((e) => {
      logger.warn({ module: "game" }, "check refreshments for self mode", e);
      return null;
    });
    if ((stadium?.refreshments ?? 0) < 1) {
      return c.json({ error: "Pro vlastní provoz je potřeba alespoň L1 občerstvení ve stadionu" }, 400);
    }
  }

  await c.env.DB.prepare(
    "UPDATE stadiums SET concession_mode = ? WHERE team_id = ?",
  ).bind(mode, teamId).run().catch((e) => logger.warn({ module: "game" }, "update concession mode", e));

  return c.json({ ok: true, mode });
});

// PATCH /api/teams/:id/concession/products/:key — kvalita + prodejní cena
gameRouter.patch("/teams/:teamId/concession/products/:key", async (c) => {
  const teamId = c.req.param("teamId");
  const key = c.req.param("key");
  const body = await c.req.json<{ qualityLevel?: number; sellPrice?: number }>().catch((e) => {
    logger.warn({ module: "game" }, "parse concession product body", e);
    return {} as { qualityLevel?: number; sellPrice?: number };
  });

  const { CONCESSION_CATALOG } = await import("../season/concession-catalog");
  const catalog = CONCESSION_CATALOG[key as keyof typeof CONCESSION_CATALOG];
  if (!catalog) return c.json({ error: "Neznámý produkt" }, 400);

  const { ensureFansRow } = await import("../season/fans-processor");
  await ensureFansRow(c.env.DB, teamId);

  const existing = await c.env.DB.prepare(
    "SELECT quality_level, sell_price FROM concession_products WHERE team_id = ? AND product_key = ?",
  ).bind(teamId, key).first<{ quality_level: number; sell_price: number }>().catch((e) => {
    logger.warn({ module: "game" }, "load concession product", e);
    return null;
  });

  const newQuality = body.qualityLevel !== undefined
    ? Math.max(0, Math.min(3, Math.round(body.qualityLevel)))
    : (existing?.quality_level ?? 1);
  const newPrice = body.sellPrice !== undefined
    ? Math.max(0, Math.min(1000, Math.round(body.sellPrice)))
    : (existing?.sell_price ?? catalog.tiers[newQuality]?.defaultSellPrice ?? 0);

  await c.env.DB.prepare(
    "UPDATE concession_products SET quality_level = ?, sell_price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?",
  ).bind(newQuality, newPrice, teamId, key).run().catch((e) => logger.warn({ module: "game" }, "update concession product", e));

  return c.json({ ok: true, qualityLevel: newQuality, sellPrice: newPrice });
});

// POST /api/teams/:id/concession/restock — nákup skladu (strhne wholesale × quantity z rozpočtu)
gameRouter.post("/teams/:teamId/concession/restock", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ productKey: string; quantity: number }>().catch((e) => {
    logger.warn({ module: "game" }, "parse restock body", e);
    return { productKey: "", quantity: 0 };
  });

  const { CONCESSION_CATALOG } = await import("../season/concession-catalog");
  const catalog = CONCESSION_CATALOG[body.productKey as keyof typeof CONCESSION_CATALOG];
  if (!catalog) return c.json({ error: "Neznámý produkt" }, 400);

  const quantity = Math.max(0, Math.min(10000, Math.round(body.quantity ?? 0)));
  if (quantity <= 0) return c.json({ error: "Množství musí být kladné" }, 400);

  const product = await c.env.DB.prepare(
    "SELECT quality_level, stock_quantity FROM concession_products WHERE team_id = ? AND product_key = ?",
  ).bind(teamId, body.productKey).first<{ quality_level: number; stock_quantity: number }>().catch((e) => {
    logger.warn({ module: "game" }, "load restock product", e);
    return null;
  });
  if (!product) return c.json({ error: "Produkt nenalezen" }, 404);

  const tier = catalog.tiers[product.quality_level];
  if (!tier || tier.wholesalePrice === 0) {
    return c.json({ error: "Tento produkt se nenabízí (L0)" }, 400);
  }
  const totalCost = tier.wholesalePrice * quantity;

  const team = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>().catch((e) => { logger.warn({ module: "game" }, "load team budget", e); return null; });
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  if (team.budget < totalCost) return c.json({ error: "Nedostatek peněz" }, 400);

  const gameDate = new Date().toISOString();
  await recordTransaction(
    c.env.DB, teamId, "concession_wholesale", -totalCost,
    `Nákup ${catalog.label} (${quantity} ks × ${tier.wholesalePrice} Kč)`, gameDate,
  );

  const newStock = product.stock_quantity + quantity;
  await c.env.DB.prepare(
    "UPDATE concession_products SET stock_quantity = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?",
  ).bind(newStock, teamId, body.productKey).run().catch((e) => logger.warn({ module: "game" }, "update stock after restock", e));

  return c.json({ ok: true, newStock, totalCost });
});

// POST /api/admin/backfill-fans — dev-only backfill pro existující týmy
gameRouter.post("/admin/backfill-fans", async (c) => {
  const { ensureFansRow } = await import("../season/fans-processor");
  const teams = await c.env.DB.prepare("SELECT id FROM teams").all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "backfill list teams", e); return { results: [] }; });
  let created = 0;
  for (const team of teams.results) {
    await ensureFansRow(c.env.DB, team.id);
    created++;
  }
  return c.json({ ok: true, teamsProcessed: created });
});

// POST /api/admin/leagues/:leagueId/set-game-date — ruční sync herního data ligy
gameRouter.post("/admin/leagues/:leagueId/set-game-date", async (c) => {
  const leagueId = c.req.param("leagueId");
  const body = await c.req.json<{ gameDate: string }>();
  if (!body.gameDate) return c.json({ error: "gameDate required" }, 400);

  const result = await c.env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
    .bind(body.gameDate, leagueId).run()
    .catch((e) => { logger.warn({ module: "game" }, "set-game-date", e); return null; });

  if (!result) return c.json({ error: "DB error" }, 500);
  return c.json({ ok: true, leagueId, gameDate: body.gameDate, rowsAffected: result.meta.changes });
});

// POST /api/admin/leagues/:leagueId/trigger-day-before — vygeneruje day-before attendance zprávy
gameRouter.post("/admin/leagues/:leagueId/trigger-day-before", async (c) => {
  const leagueId = c.req.param("leagueId");
  const { absenceSeedForMatch } = await import("../lib/seed");
  const { generateAbsences } = await import("../events/absence");
  const { generateAttendanceMessage } = await import("../messaging/message-generator");

  const teams = await c.env.DB.prepare(
    "SELECT id, user_id, game_date FROM teams WHERE league_id = ? AND user_id != 'ai'"
  ).bind(leagueId).all<{ id: string; user_id: string; game_date: string }>();

  let processed = 0;
  for (const team of teams.results) {
    const teamId = team.id;
    if (!team.game_date) continue;

    const tomorrow = new Date(team.game_date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tStart = new Date(tomorrow); tStart.setUTCHours(0, 0, 0, 0);
    const tEnd = new Date(tomorrow); tEnd.setUTCHours(23, 59, 59, 999);

    const tomorrowMatch = await c.env.DB.prepare(
      "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled'"
    ).bind(leagueId, tStart.toISOString(), tEnd.toISOString()).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "trigger-day-before match lookup", e); return null; });
    if (!tomorrowMatch) continue;

    const alreadySent = await c.env.DB.prepare(
      "SELECT id FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group') AND metadata LIKE ?"
    ).bind(teamId, `%${tomorrowMatch.id}%`).first()
      .catch((e) => { logger.warn({ module: "game" }, "trigger-day-before already sent check", e); return null; });
    if (alreadySent) continue;

    const matchRow = await c.env.DB.prepare(
      "SELECT m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) LIMIT 1"
    ).bind(tomorrowMatch.id, teamId, teamId).first<Record<string, unknown>>()
      .catch((e) => { logger.warn({ module: "game" }, "trigger-day-before match row", e); return null; });
    const opponentName = matchRow ? (matchRow.home_team_id === teamId ? matchRow.away_name : matchRow.home_name) as string : "Soupeř";

    // Vyloučit zraněné a suspendované — ti nedostanou absence SMS (mají vlastní kanál)
    const squadRows = await c.env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.life_context, p.physical, p.commute_km, p.is_celebrity, p.suspended_matches
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

    const dayBeforeAbsences = generateAbsences(absRng as any, absSquad, "day_before");
    const absentIds = new Set(dayBeforeAbsences.map((a) => squadRows.results[a.playerIndex]?.id as string));
    const matchConvId = crypto.randomUUID();

    await c.env.DB.prepare(
      "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_at, created_at) VALUES (?, ?, 'squad_group', ?, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(matchConvId, teamId, `⚽ vs ${opponentName}`).run()
      .catch((e) => logger.warn({ module: "game" }, "trigger-day-before create conv", e));

    const totalSquad = squadRows.results.length;
    await c.env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'user', ?, 'Trenér', ?, ?, datetime('now', '+' || ? || ' seconds'))"
    ).bind(crypto.randomUUID(), matchConvId, teamId, `📋 Zítra hrajeme proti ${opponentName}! Kdo může?`,
      JSON.stringify({ type: "match_announce", calendarId: tomorrowMatch.id }), 0).run()
      .catch((e) => logger.warn({ module: "game" }, "trigger-day-before announce", e));

    let msgCount = 1;
    for (const row of squadRows.results) {
      const pid = row.id as string;
      const absence = dayBeforeAbsences.find((a) => squadRows.results[a.playerIndex]?.id === pid);
      const available = !absentIds.has(pid);
      const lc = (() => { try { return JSON.parse(row.life_context as string); } catch { return {}; } })();
      const msg = generateAttendanceMessage(`${row.first_name} ${row.last_name}`, available, lc.condition ?? 100, absRng as any);
      await c.env.DB.prepare(
        "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))"
      ).bind(crypto.randomUUID(), matchConvId, pid, msg.senderName,
        absence ? absence.smsText : msg.body,
        JSON.stringify({ type: "attendance", response: available ? "yes" : "no", timing: "day_before", calendarId: tomorrowMatch.id }), msgCount * 10,
      ).run().catch((e) => logger.warn({ module: "game" }, "trigger-day-before player msg", e));
      msgCount++;
    }

    await c.env.DB.prepare(
      "UPDATE conversations SET unread_count = ?, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
    ).bind(msgCount, `📋 ${dayBeforeAbsences.length} omluvených z ${squadRows.results.length}`, matchConvId).run()
      .catch((e) => logger.warn({ module: "game" }, "trigger-day-before conv update", e));

    processed++;
  }
  return c.json({ ok: true, leagueId, processed });
});

// POST /api/admin/news/:newsId/regenerate-interview — přegeneruje článek z uložených QA
gameRouter.post("/admin/news/:newsId/regenerate-interview", async (c) => {
  const newsId = c.req.param("newsId");
  const { generateInterviewArticle } = await import("../news/interview-generator");

  const row = await c.env.DB.prepare("SELECT * FROM news WHERE id = ?")
    .bind(newsId)
    .first<{ id: string; headline: string; body: string; team_id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "regenerate-interview fetch", e); return null; });

  if (!row) return c.json({ error: "news not found" }, 404);

  const body = JSON.parse(row.body) as { managerName: string; teamName: string; qa: Array<{ q: string; a: string }>; [k: string]: unknown };
  if (!body.qa?.length) return c.json({ error: "no qa in article" }, 400);

  const opponentMatch = row.headline.match(/vs\.\s+(.+?)["„]/);
  const opponentName = opponentMatch?.[1]?.trim() ?? "soupeř";

  const geminiKey = (c.env as unknown as Record<string, string>).GEMINI_API_KEY;
  const result = await generateInterviewArticle(geminiKey, body.qa, body.managerName, body.teamName, opponentName);
  if (!result) return c.json({ error: "gemini failed" }, 500);

  const correctionNote = "\n\n— Oprava: Předchozí verze článku chybně upravila záměrné slovní hříčky trenéra jako překlepy. Za nedorozumění se omlouváme — chyba byla na straně redaktora.";
  const newBody = JSON.stringify({ ...body, article: result.body + correctionNote }, );
  const newHeadline = result.headline.replace(/\[oprava\]$/, "").trim() + " [oprava]";

  await c.env.DB.prepare("UPDATE news SET headline = ?, body = ? WHERE id = ?")
    .bind(newHeadline, newBody, newsId)
    .run()
    .catch((e) => { logger.warn({ module: "game" }, "regenerate-interview update", e); });

  return c.json({ ok: true, newsId, headline: newHeadline, articlePreview: result.body.slice(0, 200) });
});

export { gameRouter };
