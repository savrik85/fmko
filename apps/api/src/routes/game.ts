/**
 * FMK-62: Game system API routes — tréninky, ekonomika, mládež, nábor.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { generateSponsors } from "../season/economy";
import { generateBetweenRoundEvents } from "../events/between-rounds";
import type { GeneratedPlayer } from "../generators/player";

const gameRouter = new Hono<{ Bindings: Bindings }>();

// POST /api/teams/:id/training — set training plan
gameRouter.post("/teams/:teamId/training", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ type: string; approach: string; sessionsPerWeek: number }>();

  // Store training plan (simplified: just return confirmation)
  // In full impl: save to team metadata, apply on daily tick

  return c.json({
    ok: true,
    message: `Tréninkový plán nastaven: ${body.type}, ${body.sessionsPerWeek}x týdně, přístup ${body.approach}`,
  });
});

// GET /api/teams/:id/budget — rozpočet
gameRouter.get("/teams/:teamId/budget", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.size, v.population FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const rng = createRng(teamId.charCodeAt(0));
  const sponsors = generateSponsors(rng, team.size as string, team.reputation as number);

  const playerCount = (await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?").bind(teamId).first<{ cnt: number }>())?.cnt ?? 0;

  const monthlyIncome = sponsors.reduce((sum, s) => sum + s.monthlyAmount, 0);
  const monthlyExpenses = (team.size as string) === "hamlet" ? 1500 : (team.size as string) === "village" ? 2500 : 4000;

  return c.json({
    budget: team.budget,
    sponsors,
    monthly: {
      income: monthlyIncome,
      expenses: monthlyExpenses,
      net: monthlyIncome - monthlyExpenses,
    },
    playerCount,
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
    return {
      firstName: r.first_name as string, lastName: r.last_name as string,
      age: r.age as number, position: r.position as "GK" | "DEF" | "MID" | "FWD",
      speed: skills.speed ?? 10, technique: skills.technique ?? 10,
      shooting: skills.shooting ?? 10, passing: skills.passing ?? 10,
      heading: skills.heading ?? 10, defense: skills.defense ?? 10,
      goalkeeping: skills.goalkeeping ?? 10, stamina: 10, strength: 10,
      injuryProneness: 10, discipline: personality.discipline ?? 50,
      patriotism: personality.patriotism ?? 50, alcohol: personality.alcohol ?? 30,
      temper: personality.temper ?? 40, occupation: lifeContext.occupation ?? "",
      bodyType: "normal" as const, avatarConfig: {} as any,
      condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
    };
  });

  const events = generateBetweenRoundEvents(
    rng, generatedPlayers,
    team.budget as number, team.reputation as number,
    null, 1,
  );

  return c.json(events);
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

export { gameRouter };
