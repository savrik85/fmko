/**
 * FMK-62: Game system API routes — tréninky, ekonomika, mládež, nábor.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { generateSponsors } from "../season/economy";
import { executeDailyTick } from "../season/daily-tick";
import { recordTransaction } from "../season/finance-processor";
import { generateBetweenRoundEvents } from "../events/between-rounds";
import { getSeasonalEventsForWeek, type SeasonalEventDef } from "../season/seasonal-events";
import type { GeneratedPlayer } from "../generators/player";

const gameRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/teams/:id/training — get training plan + simulate a session preview
gameRouter.get("/teams/:teamId/training", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT training_type, training_approach, training_sessions, last_training_at, last_training_result FROM teams WHERE id = ?"
  ).bind(teamId).first<Record<string, unknown>>().catch(() => null);

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
  ).bind(body.type, body.approach, body.sessionsPerWeek, teamId).run().catch(() => {});

  return c.json({ ok: true });
});

// Training simulation removed from manual endpoint — runs only via daily tick (cron)

// GET /api/teams/:id/budget — rozpočet s kompletním přehledem
gameRouter.get("/teams/:teamId/budget", async (c) => {
  const teamId = c.req.param("teamId");
  const { mapVillageSize } = await import("../season/finance-processor");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.size, v.population, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const category = mapVillageSize(team.size as string);

  // Players + wages
  const wageResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(weekly_wage), 0) as weekly_total FROM players WHERE team_id = ?"
  ).bind(teamId).first<{ cnt: number; weekly_total: number }>();
  const playerCount = wageResult?.cnt ?? 0;
  const weeklyWages = wageResult?.weekly_total ?? 0;

  // Sponsors (from contracts)
  const sponsorContracts = await c.env.DB.prepare(
    "SELECT sponsor_name, sponsor_type, monthly_amount, win_bonus FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch(() => ({ results: [] }));
  const sponsors = sponsorContracts.results.map((s) => ({
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

  // Forecast
  const weeksUntilBankrupt = weeklyNet < 0 ? Math.floor((team.budget as number) / Math.abs(weeklyNet)) : null;

  // Top 5 highest paid
  const topWages = await c.env.DB.prepare(
    "SELECT id, first_name, last_name, position, overall_rating, weekly_wage FROM players WHERE team_id = ? ORDER BY weekly_wage DESC LIMIT 5"
  ).bind(teamId).all().catch(() => ({ results: [] }));

  return c.json({
    budget: team.budget,
    sponsors: sponsors.map((s) => ({ ...s, weeklyAmount: Math.round(s.monthlyAmount / 4.3) })),
    playerCount,
    wageBill: {
      weekly: weeklyWages,
      topPlayers: topWages.results.map((p) => ({
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
        equipment: weeklyEquipment, training: weeklyTraining, total: weeklyExpenses,
      },
      net: weeklyNet,
    },
    forecast: {
      weeklyNet,
      weeksUntilBankrupt,
      in4Weeks: (team.budget as number) + weeklyNet * 4,
      inSeason: (team.budget as number) + weeklyNet * WEEKS_PER_SEASON,
    },
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

  const result = await c.env.DB.prepare(query).bind(...bindings).all().catch(() => ({ results: [] }));

  const countQuery = type
    ? "SELECT COUNT(*) as cnt FROM transactions WHERE team_id = ? AND type = ?"
    : "SELECT COUNT(*) as cnt FROM transactions WHERE team_id = ?";
  const countBindings = type ? [teamId, type] : [teamId];
  const total = await c.env.DB.prepare(countQuery).bind(...countBindings).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));

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
  ).bind(teamId).all().catch(() => ({ results: [] }));

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
  const rng = createRng(Date.now());

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
    null, 1,
  );

  return c.json(events);
});

// GET /api/teams/:id/seasonal-events — all seasonal events (pending = with choices, resolved = past)
gameRouter.get("/teams/:teamId/seasonal-events", async (c) => {
  const teamId = c.req.param("teamId");

  // Get events from DB
  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string }>();
  if (!team?.league_id) return c.json({ events: [] });

  const dbEvents = await c.env.DB.prepare(
    "SELECT * FROM seasonal_events WHERE league_id = ? ORDER BY game_week"
  ).bind(team.league_id).all().catch(() => ({ results: [] }));

  if (dbEvents.results.length > 0) {
    const events = dbEvents.results.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      effects: JSON.parse(row.effects as string),
      choices: row.choices ? JSON.parse(row.choices as string) : null,
      gameWeek: row.game_week,
      status: row.status,
    }));
    return c.json({ events });
  }

  // No events in DB yet — generate from templates for all weeks and insert
  const rng = createRng(team.league_id.charCodeAt(0));
  const allEvents: Array<SeasonalEventDef & { id: string; status: string }> = [];

  for (let week = 0; week <= 30; week++) {
    const weekEvents = getSeasonalEventsForWeek(rng, week);
    for (const ev of weekEvents) {
      const id = crypto.randomUUID();
      await c.env.DB.prepare(
        "INSERT INTO seasonal_events (id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, '1', ?, ?)"
      ).bind(id, team.league_id, ev.type, ev.title, ev.description,
        JSON.stringify(ev.effects), ev.choices ? JSON.stringify(ev.choices) : null,
        ev.gameWeek, ev.choices ? "pending" : "active",
      ).run().catch(() => {});

      allEvents.push({ ...ev, id, status: ev.choices ? "pending" : "active" });
    }
  }

  return c.json({
    events: allEvents.map((ev) => ({
      id: ev.id, type: ev.type, title: ev.title, description: ev.description,
      effects: ev.effects, choices: ev.choices ?? null,
      gameWeek: ev.gameWeek, status: ev.status,
    })),
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

  // Apply effects
  for (const effect of choice.effects) {
    if (effect.type === "budget") {
      await recordTransaction(c.env.DB, teamId, "event", effect.value as number,
        `Událost: ${(choice as Record<string, unknown>).text ?? "efekt"}`, new Date().toISOString()).catch(() => {});
    }
    if (effect.type === "reputation") {
      await c.env.DB.prepare("UPDATE teams SET reputation = MIN(100, MAX(0, reputation + ?)) WHERE id = ?")
        .bind(effect.value, teamId).run().catch(() => {});
    }
    if (effect.type === "morale") {
      await c.env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
          MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?)))
        WHERE team_id = ?`
      ).bind(effect.value, teamId).run().catch(() => {});
    }
  }

  // Mark as resolved
  await c.env.DB.prepare("UPDATE seasonal_events SET status = 'resolved' WHERE id = ?")
    .bind(eventId).run();

  return c.json({ ok: true, appliedEffects: choice.effects });
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
  const rng = createRng(Date.now());

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

  const team = await c.env.DB.prepare(
    "SELECT t.name, t.league_id, t.reputation FROM teams t WHERE t.id = ?"
  ).bind(teamId).first<{ name: string; league_id: string | null; reputation: number }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const articles: Array<{ id: string; type: string; headline: string; body: string; icon: string; date: string }> = [];

  // 1. Recent match results as articles
  const matches = await c.env.DB.prepare(
    `SELECT m.id, m.home_score, m.away_score, m.simulated_at, m.round,
       ht.name as home_name, at.name as away_name,
       m.home_team_id, m.away_team_id
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
     ORDER BY m.simulated_at DESC LIMIT 5`
  ).bind(teamId, teamId).all().catch(() => ({ results: [] }));

  for (const m of matches.results) {
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
      "SELECT id, type, headline, body, created_at FROM news WHERE league_id = ? OR team_id = ? ORDER BY created_at DESC LIMIT 20"
    ).bind(team.league_id, teamId).all().catch(() => ({ results: [] }));

    for (const n of newsRows.results) {
      const iconMap: Record<string, string> = {
        manager_arrival: "\u{1F4CB}",
        round_results: "\u26BD",
        seasonal: "\u{1F389}",
        transfer: "\u{1F91D}",
      };
      articles.push({
        id: n.id as string,
        type: n.type as string,
        headline: n.headline as string,
        body: n.body as string,
        icon: iconMap[n.type as string] ?? "\u{1F4F0}",
        date: n.created_at as string,
      });
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
  ).bind(teamId).first<Record<string, unknown>>().catch(() => null);

  if (!equip) {
    const team = await c.env.DB.prepare(
      "SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<{ size: string }>().catch(() => null);

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
    ).bind(crypto.randomUUID(), teamId, ...vals, ...condVals).run().catch(() => {});

    equip = await c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>().catch(() => null);
    if (!equip) return c.json({ error: "Failed to create equipment" }, 500);
  }

  // Get team reputation + matches played for unlock logic
  const team = await c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId).first<{ reputation: number }>().catch(() => null);
  const matchCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch(() => null);

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
    upgrades: getUpgradeOptions(levels, team?.reputation ?? 0, matchCount?.cnt ?? 0),
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
  ).bind(teamId, teamId).first<{ cnt: number }>().catch(() => null);

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
  ).bind(teamId).first<Record<string, unknown>>().catch(() => null);

  if (!stadium) {
    // Auto-create stadium
    const team = await c.env.DB.prepare(
      "SELECT t.*, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<Record<string, unknown>>().catch(() => null);

    if (!team) return c.json({ error: "Team not found" }, 404);

    const { generateStadium } = await import("../stadium/stadium-generator");
    const { createRng } = await import("../generators/rng");
    let seed = 0;
    for (let i = 0; i < teamId.length; i++) seed = ((seed << 5) - seed + teamId.charCodeAt(i)) | 0;
    const rng = createRng(Math.abs(seed));
    const config = generateStadium(rng, team.size as string);

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, lighting, stands, parking, fence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, teamId, config.capacity, config.pitchCondition, config.pitchType,
      config.changingRooms, config.showers, config.refreshments, config.lighting,
      config.stands, config.parking, config.fence,
    ).run().catch(() => {});

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
    lighting: stadium.lighting as number ?? 0,
    stands: stadium.stands as number ?? 0,
    parking: stadium.parking as number ?? 0,
    fence: stadium.fence as number ?? 0,
  };

  const teamInfo = await c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ reputation: number }>().catch(() => null);
  const matchCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch(() => null);

  // Pitch maintenance options
  const pitchActions = [
    { level: "basic", label: "Základní údržba", desc: "Posečení, zarovnání", cost: 1000, improvement: 10 },
    { level: "thorough", label: "Důkladná údržba", desc: "Přesetí holých míst, hnojení", cost: 3000, improvement: 25 },
    { level: "renovation", label: "Renovace trávníku", desc: "Kompletní obnova povrchu", cost: 8000, improvement: 50 },
  ].filter((a) => (stadium.pitch_condition as number) + a.improvement <= 110); // only show useful actions

  // Pitch type upgrades
  const pitchUpgrades = [];
  if (stadium.pitch_type === "natural") {
    pitchUpgrades.push({ pitchType: "hybrid", label: "Hybridní trávník", desc: "Mix přírodní + umělé vlákno, odolnější", cost: 50000 });
  }
  if (stadium.pitch_type === "hybrid") {
    pitchUpgrades.push({ pitchType: "artificial", label: "Umělý trávník", desc: "Žádná údržba, hratelný za každého počasí", cost: 120000 });
  }

  return c.json({
    capacity: stadium.capacity,
    pitchCondition: stadium.pitch_condition,
    pitchType: stadium.pitch_type,
    facilities,
    upgrades: getUpgradeOptions(facilities, teamInfo?.reputation ?? 0, matchCount?.cnt ?? 0),
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
  ).bind(teamId, teamId).first<{ cnt: number }>().catch(() => null);

  const { getUpgradeOptions } = await import("../stadium/stadium-generator");
  const facilities: Record<string, number> = {
    changing_rooms: stadium.changing_rooms as number ?? 0,
    showers: stadium.showers as number ?? 0,
    refreshments: stadium.refreshments as number ?? 0,
    lighting: stadium.lighting as number ?? 0,
    stands: stadium.stands as number ?? 0,
    parking: stadium.parking as number ?? 0,
    fence: stadium.fence as number ?? 0,
  };

  const upgrades = getUpgradeOptions(facilities, team.reputation, matchCount?.cnt ?? 0);
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

// POST /api/teams/:id/stadium/maintain-pitch — improve pitch condition
gameRouter.post("/teams/:teamId/stadium/maintain-pitch", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ level: "basic" | "thorough" | "renovation" }>();

  const costs: Record<string, { cost: number; improvement: number; label: string }> = {
    basic:      { cost: 1000, improvement: 10, label: "Základní údržba (+10%)" },
    thorough:   { cost: 3000, improvement: 25, label: "Důkladná údržba (+25%)" },
    renovation: { cost: 8000, improvement: 50, label: "Renovace trávníku (+50%)" },
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
    hybrid:     { from: "natural", cost: 50000 },
    artificial: { from: "hybrid", cost: 120000 },
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
  ).bind(teamId).first<Record<string, unknown>>().catch(() => null);

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

  if (body.captainId !== undefined) { updates.push("captain_id = ?"); binds.push(body.captainId || null); }
  if (body.penaltyTakerId !== undefined) { updates.push("penalty_taker_id = ?"); binds.push(body.penaltyTakerId || null); }
  if (body.freekickTakerId !== undefined) { updates.push("freekick_taker_id = ?"); binds.push(body.freekickTakerId || null); }

  if (updates.length > 0) {
    binds.push(teamId);
    await c.env.DB.prepare(`UPDATE teams SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds).run().catch(() => {});
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
  ).bind(teamId).all().catch(() => ({ results: [] }));

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
  ).bind(teamId).first<{ reputation: number; district: string; size: string; village_name: string; stadium_name: string | null }>().catch(() => null);
  if (!team) return c.json({ error: "Team not found" }, 404);

  // Active contracts — one per category
  const activeRows = await c.env.DB.prepare(
    "SELECT * FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch(() => ({ results: [] }));

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

  // Load district sponsors for generating offers
  const sponsorRows = await c.env.DB.prepare(
    "SELECT * FROM district_sponsors WHERE district = ? ORDER BY RANDOM()"
  ).bind(team.district).all().catch(() => ({ results: [] }));

  const repMod = team.reputation / 50;
  const sizeMod = team.size === "mesto" ? 1.3 : team.size === "mestys" ? 1.1 : team.size === "obec" ? 1.0 : 0.8;
  const rng = createRng(Date.now() + teamId.charCodeAt(0));

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

  // Check season limit for main sponsor changes
  const currentSeason = await c.env.DB.prepare(
    "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ number: number }>().catch(() => null);
  const seasonNum = currentSeason?.number ?? 1;

  const teamFull = await c.env.DB.prepare(
    "SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?"
  ).bind(teamId).first<{ name: string; last_main_sponsor_change_season: number | null }>().catch(() => null);

  const changedThisSeason = (teamFull?.last_main_sponsor_change_season ?? 0) >= seasonNum;

  return c.json({
    mainContract: mainContract ? mapContract(mainContract) : null,
    stadiumContract: stadiumContract ? mapContract(stadiumContract) : null,
    stadiumName: team.stadium_name,
    teamName: teamFull?.name ?? "",
    mainOffers: changedThisSeason ? [] : mainOffers, // no offers if already changed
    stadiumOffers,
    canChangeMainSponsor: !changedThisSeason,
    season: seasonNum,
  });
});

// POST /api/teams/:id/sponsors/sign — sign a new sponsor contract
gameRouter.post("/teams/:teamId/sponsors/sign", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{
    category: "main" | "stadium";
    sponsorName: string; sponsorType: string;
    monthlyAmount: number; winBonus: number;
    seasons: number; earlyTerminationFee: number;
    isNamingRights?: boolean;
  }>();

  const category = body.category || "main";

  // Check no active contract in this category
  const allActive = await c.env.DB.prepare(
    "SELECT id, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch(() => ({ results: [] }));

  const existing = allActive.results.find((r) => (r.category || "main") === category);
  if (existing) return c.json({ error: `Už máš aktivní smlouvu pro ${category === "main" ? "hlavního sponzora" : "stadion"}` }, 400);

  // Season limit for main sponsor
  if (category === "main") {
    const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
      .first<{ number: number }>().catch(() => null);
    const sn = season?.number ?? 1;
    const team = await c.env.DB.prepare("SELECT last_main_sponsor_change_season FROM teams WHERE id = ?")
      .bind(teamId).first<{ last_main_sponsor_change_season: number | null }>().catch(() => null);
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
      .bind(teamInfo!.village_id).first<{ name: string }>().catch(() => null);
    const oldName = teamInfo!.name;
    const newName = `FK ${body.sponsorName} ${village?.name ?? ""}`.trim();
    const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
      .first<{ number: number }>().catch(() => null);
    // Reputation penalty for name change (-3)
    await c.env.DB.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ?, reputation = MAX(0, reputation - 3) WHERE id = ?")
      .bind(newName, season?.number ?? 1, teamId).run();

    // News for entire league
    await c.env.DB.prepare(
      "INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, datetime('now'))"
    ).bind(crypto.randomUUID(), teamId,
      `${oldName} mění název na ${newName}`,
      `Klub ${oldName} podepsal sponzorskou smlouvu s ${body.sponsorName} a mění svůj název na ${newName}. Fanoušci nejsou nadšení (-3 reputace).`,
    ).run().catch(() => {});

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
  const body = await c.req.json<{ category?: "main" | "stadium" }>().catch(() => ({ category: "main" as const }));
  const category = body.category || "main";

  const allActiveT = await c.env.DB.prepare(
    "SELECT id, early_termination_fee, seasons_remaining, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch(() => ({ results: [] }));
  const contractRow = allActiveT.results.find((r) => (r.category || "main") === category);
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
    .bind(team.village_id).first<{ name: string }>().catch(() => null);

  if (category === "main") {
    // Revert to default name + reputation penalty (-2)
    const oldName = (await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>())?.name ?? "";
    const defaultName = `SK ${village?.name ?? ""}`.trim();
    await c.env.DB.prepare("UPDATE teams SET name = ?, reputation = MAX(0, reputation - 2) WHERE id = ?")
      .bind(defaultName, teamId).run();

    // News for entire league
    await c.env.DB.prepare(
      "INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, datetime('now'))"
    ).bind(crypto.randomUUID(), teamId,
      `${oldName} se přejmenovává na ${defaultName}`,
      `Klub ${oldName} ukončil sponzorskou smlouvu a vrací se k názvu ${defaultName}. Fanoušci zmatení (-2 reputace).`,
    ).run().catch(() => {});

    return c.json({ ok: true, fee, newTeamName: defaultName, reputationPenalty: 2 });
  }

  if (category === "stadium") {
    if (village) {
      await c.env.DB.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?")
        .bind(`Sportovní areál ${village.name}`, teamId).run();
    }
  }

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
    .first<{ number: number }>().catch(() => null);
  const sn = season?.number ?? 1;
  const team = await c.env.DB.prepare("SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; last_main_sponsor_change_season: number | null }>().catch(() => null);

  if (!team) return c.json({ error: "Team not found" }, 404);
  if ((team.last_main_sponsor_change_season ?? 0) >= sn) {
    return c.json({ error: "Název lze změnit pouze jednou za sezónu" }, 400);
  }

  // Check no active main sponsor (can't rename while sponsored)
  const activeSponsor = await c.env.DB.prepare(
    "SELECT id FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'main' OR category IS NULL)"
  ).bind(teamId).first().catch(() => null);
  if (activeSponsor) return c.json({ error: "Nelze přejmenovat při aktivní sponzorské smlouvě" }, 400);

  const oldName = team.name;
  const newName = name.trim();
  // Reputation penalty (-3)
  await c.env.DB.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ?, reputation = MAX(0, reputation - 3) WHERE id = ?")
    .bind(newName, sn, teamId).run();

  // News for entire league
  await c.env.DB.prepare(
    "INSERT INTO news (id, league_id, type, title, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, datetime('now'))"
  ).bind(crypto.randomUUID(), teamId,
    `${oldName} se přejmenovává na ${newName}`,
    `Klub ${oldName} mění svůj název na ${newName}. Fanoušci reagují rozpačitě (-3 reputace).`,
  ).run().catch(() => {});

  return c.json({ ok: true, newName, reputationPenalty: 3 });
});

// POST /api/leagues/:leagueId/generate-schedule — generate schedule if missing
gameRouter.post("/leagues/:leagueId/generate-schedule", async (c) => {
  const leagueId = c.req.param("leagueId");

  const league = await c.env.DB.prepare(
    "SELECT l.id, l.season_id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(leagueId).first<{ id: string; season_id: string; season_number: number }>().catch(() => null);
  if (!league) return c.json({ error: "League not found" }, 404);

  // Check if schedule already exists
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE league_id = ?"
  ).bind(leagueId).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
  if (existing && existing.cnt > 0) return c.json({ error: "Schedule already exists", matchCount: existing.cnt }, 400);

  const teamRows = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE league_id = ? ORDER BY name"
  ).bind(leagueId).all().catch(() => ({ results: [] }));

  const teamIds = teamRows.results.map((r) => r.id as string);
  if (teamIds.length < 2) return c.json({ error: "Not enough teams" }, 400);

  const { generateSchedule } = await import("../league/schedule");
  const { generateSeasonCalendar } = await import("../season/calendar");

  const rng = createRng(Date.now());
  const schedule = generateSchedule(rng, teamIds.length);
  const calendar = generateSeasonCalendar(leagueId, league.season_number, new Date());

  for (const entry of calendar.entries) {
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
    ).bind(entry.id, leagueId, league.season_number, entry.gameWeek, entry.matchDay, entry.scheduledAt).run().catch(() => {});
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
    ).bind(crypto.randomUUID(), leagueId, calId, match.round, teamIds[match.homeTeamIndex], teamIds[match.awayTeamIndex]).run().catch(() => {});
    inserted++;
  }

  return c.json({ ok: true, matchesCreated: inserted, calendarEntries: calendar.entries.length, teams: teamIds.length });
});

// GET /api/teams/:id/season-info — season number, current day, total days, upcoming events
gameRouter.get("/teams/:teamId/season-info", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id, training_type FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; training_type: string | null }>();
  if (!team?.league_id) return c.json({ season: 1, currentDay: 1, totalDays: 1, upcoming: [] });

  const league = await c.env.DB.prepare(
    "SELECT l.id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?"
  ).bind(team.league_id).first<{ id: string; season_number: number }>().catch(() => null);

  // Get all calendar entries for this league
  const calEntries = await c.env.DB.prepare(
    "SELECT sc.*, m.home_team_id, m.away_team_id, m.status as match_status, m.home_score, m.away_score, ht.name as home_name, at.name as away_name FROM season_calendar sc LEFT JOIN matches m ON m.calendar_id = sc.id AND (m.home_team_id = ? OR m.away_team_id = ?) LEFT JOIN teams ht ON m.home_team_id = ht.id LEFT JOIN teams at ON m.away_team_id = at.id WHERE sc.league_id = ? ORDER BY sc.scheduled_at ASC"
  ).bind(teamId, teamId, team.league_id).all().catch(() => ({ results: [] }));

  if (calEntries.results.length === 0) return c.json({ season: league?.season_number ?? 1, currentDay: 1, totalDays: 1, upcoming: [] });

  // Calculate season day
  const firstEntry = calEntries.results[0];
  const lastEntry = calEntries.results[calEntries.results.length - 1];
  const seasonStart = new Date(firstEntry.scheduled_at as string);
  seasonStart.setDate(seasonStart.getDate() - 3); // a few days before first match
  const seasonEnd = new Date(lastEntry.scheduled_at as string);
  seasonEnd.setDate(seasonEnd.getDate() + 7); // a week after last match

  const now = new Date();
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
  for (const entry of calEntries.results) {
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

  // Training days (Mon-Fri if training plan set)
  if (team.training_type) {
    const today = new Date();
    for (let d = 0; d < 14; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() + d);
      const dow = day.getDay();
      if (dow >= 1 && dow <= 5) { // Mon-Fri
        upcoming.push({
          type: "training",
          date: day.toISOString(),
          title: "Trénink",
          subtitle: team.training_type,
        });
      }
    }
  }

  // Sort by date and take next events
  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const futureEvents = upcoming.filter((e) => new Date(e.date) >= new Date() || e.status === "Naplánováno");

  return c.json({
    season: league?.season_number ?? 1,
    currentDay,
    totalDays,
    upcoming: futureEvents.slice(0, 15),
  });
});

// POST /api/game/advance-day — spustí přesně stejný daily tick jako cron
gameRouter.post("/game/advance-day", async (c) => {
  const result = await executeDailyTick(c.env);
  return c.json({ ok: true, result });
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
  ).bind(team?.league_id ?? "", now).all().catch(() => ({ results: [] }));

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
  const body = await c.req.json<{ category?: string; message?: string }>().catch(() => ({ category: undefined, message: undefined }));

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

export { gameRouter };
