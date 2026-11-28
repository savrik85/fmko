/**
 * Sazebník pokut kabiny (spec docs/superpowers/specs/2026-11-27-fine-schedule-design.md).
 * Čtení je soukromé (guardTeamReads v index.ts), zápisy jen pro majitele týmu.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import type { FineScheduleItemInput } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { BURDEN_STAGE_LABELS } from "../fines/burden";
import { captainOf, imposeSchedule, proposeSchedule, type ProposalNote } from "../fines/captain";
import { forgiveFine, insistOnFine } from "../fines/actions";
import { addDays, loadSchedule, PLAYER_PROFILE_SQL, playerBurden, profileFromRow } from "../fines/store";

const M = "routes-fines";

const finesRouter = new Hono<{ Bindings: Bindings }>();
finesRouter.use("/teams/:teamId/fines", requireTeamOwnership);
finesRouter.use("/teams/:teamId/fines/*", requireTeamOwnership);

const SQUAD_STAGE_LABELS = ["V kabině je klid", "Kapitán říká, že je to moc", "Kabina dala ultimátum", "Kabina stávkovala"];

async function teamDay(c: Context<{ Bindings: Bindings }>, teamId: string): Promise<{ day: string; u21: boolean } | null> {
  const t = await c.env.DB.prepare("SELECT game_date, team_type FROM teams WHERE id = ?").bind(teamId)
    .first<{ game_date: string | null; team_type: string | null }>();
  if (!t) return null;
  return { day: (t.game_date ?? new Date().toISOString()).slice(0, 10), u21: t.team_type === "u21" };
}

finesRouter.get("/teams/:teamId/fines", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;
  const t = await teamDay(c, teamId);
  if (!t) return c.json({ error: "Tým nenalezen" }, 404);
  if (t.u21) return c.json({ error: "Sazebník má jen áčko." }, 400);
  const [s, fund, fines, squadRows, captain] = await Promise.all([
    loadSchedule(db, teamId),
    db.prepare("SELECT fine_fund_balance FROM teams WHERE id = ?").bind(teamId).first<{ fine_fund_balance: number | null }>(),
    db.prepare(
      `SELECT f.id, f.player_id, p.first_name || ' ' || p.last_name AS player_name, f.item_key, f.condition_key, f.source,
              f.value_kind, f.amount_czk, f.status, f.fact, f.in_schedule, f.game_date
         FROM fines f LEFT JOIN players p ON p.id = f.player_id
        WHERE f.team_id = ? AND f.game_date > ? ORDER BY f.game_date DESC, f.created_at DESC LIMIT 100`,
    ).bind(teamId, addDays(t.day, -42)).all<Record<string, unknown>>(),
    db.prepare(`${PLAYER_PROFILE_SQL} WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY last_name`).bind(teamId).all<Record<string, unknown>>(),
    captainOf(db, teamId),
  ]);
  const players = (squadRows.results ?? []).map(profileFromRow);
  const burdened: Array<{ playerId: string; name: string; stage: number; label: string }> = [];
  for (const p of players) {
    const b = await playerBurden(db, p, t.day);
    if (b.stage >= 1) burdened.push({ playerId: p.id, name: `${p.firstName} ${p.lastName}`, stage: b.stage, label: BURDEN_STAGE_LABELS[b.stage] });
  }
  let note: ProposalNote | null = null;
  try { note = s.row?.proposal_note ? JSON.parse(s.row.proposal_note) as ProposalNote : null; } catch (e) { logger.warn({ module: M, teamId }, "výhrada kapitána", e); }
  const proposalCaptain = s.row?.proposal_captain_id ? players.find((p) => p.id === s.row?.proposal_captain_id) : null;
  return c.json({
    day: t.day,
    status: s.row?.status ?? "none",
    origin: s.row?.origin ?? null,
    effectiveFrom: s.row?.effective_from ?? null,
    inEffect: s.row?.status === "active" && (!s.row.effective_from || s.row.effective_from <= t.day),
    proposal: {
      status: s.row?.proposal_status ?? "none",
      captainName: proposalCaptain ? `${proposalCaptain.firstName} ${proposalCaptain.lastName}` : null,
      note,
      decidedAt: s.row?.decided_at ?? null,
    },
    captainName: captain ? `${captain.firstName} ${captain.lastName}` : null,
    squad: {
      stage: s.row?.squad_stage ?? 0,
      label: SQUAD_STAGE_LABELS[s.row?.squad_stage ?? 0] ?? SQUAD_STAGE_LABELS[0],
      ultimatum: (s.row?.squad_stage ?? 0) === 2 && !!s.row?.ultimatum_match_id,
    },
    active: s.active, draft: s.draft,
    fund: fund?.fine_fund_balance ?? 0,
    fines: (fines.results ?? []).map((f) => ({
      id: f.id, playerId: f.player_id, playerName: f.player_name ?? "Bývalý hráč", itemKey: f.item_key, conditionKey: f.condition_key,
      source: f.source, valueKind: f.value_kind, amountCzk: f.amount_czk, status: f.status, fact: f.fact, inSchedule: f.in_schedule === 1, gameDate: f.game_date,
    })),
    burdened,
  });
});

function itemsFrom(body: unknown): FineScheduleItemInput[] | null {
  const raw = (body as { items?: unknown })?.items;
  if (!Array.isArray(raw)) return null;
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      itemKey: String(o.itemKey) as FineScheduleItemInput["itemKey"], conditionKey: String(o.conditionKey),
      valueKind: String(o.valueKind) as FineScheduleItemInput["valueKind"],
      amountCzk: typeof o.amountCzk === "number" ? o.amountCzk : null,
      repeatMode: String(o.repeatMode ?? "flat") as FineScheduleItemInput["repeatMode"],
    };
  });
}

function waitUntilOf(c: Context<{ Bindings: Bindings }>): ((p: Promise<unknown>) => void) | undefined {
  try {
    const ctx = c.executionCtx;
    return (p) => ctx.waitUntil(p);
  } catch (e) {
    logger.warn({ module: M }, "executionCtx není k dispozici, SMS se pošle hned", e);
    return undefined;
  }
}

finesRouter.post("/teams/:teamId/fines/propose", async (c) => {
  const teamId = c.req.param("teamId");
  const t = await teamDay(c, teamId);
  if (!t) return c.json({ error: "Tým nenalezen" }, 404);
  if (t.u21) return c.json({ error: "Sazebník má jen áčko." }, 400);
  const body = await c.req.json().catch((e) => { logger.warn({ module: M, teamId }, "tělo návrhu sazebníku", e); return null; });
  const items = itemsFrom(body);
  if (!items) return c.json({ error: "Chybí položky sazebníku." }, 400);
  const r = await proposeSchedule(c.env.DB, c.env, { teamId, day: t.day, items, waitUntil: waitUntilOf(c) });
  if (!r.ok) return c.json({ error: r.error }, r.status as 400);
  return c.json(r);
});

finesRouter.post("/teams/:teamId/fines/impose", async (c) => {
  const teamId = c.req.param("teamId");
  const t = await teamDay(c, teamId);
  if (!t) return c.json({ error: "Tým nenalezen" }, 404);
  const r = await imposeSchedule(c.env.DB, c.env, { teamId, day: t.day, waitUntil: waitUntilOf(c) });
  if (!r.ok) return c.json({ error: r.error }, r.status as 409);
  return c.json(r);
});

for (const [path, action] of [["insist", insistOnFine], ["forgive", forgiveFine]] as const) {
  finesRouter.post(`/teams/:teamId/fines/:fineId/${path}`, async (c) => {
    const teamId = c.req.param("teamId");
    const t = await teamDay(c, teamId);
    if (!t) return c.json({ error: "Tým nenalezen" }, 404);
    const r = await action(c.env.DB, { teamId, fineId: c.req.param("fineId"), day: t.day });
    if (!r.ok) return c.json({ error: r.error }, r.status as 409);
    return c.json(r);
  });
}

export default finesRouter;
