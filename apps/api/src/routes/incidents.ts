/**
 * Incidenty v klubu: přehled pro manažera a ruční spuštění pro testování.
 * Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 7 a 11.
 */

import { Hono } from "hono";
import { tymyDivaka } from "../auth/divak";
import { requireAdmin } from "../auth/middleware";
import { cryptoSeed, createRng } from "../generators/rng";
import { oznamIncident, zapisIncident } from "../incidents/dopady";
import { KATALOG_PODLE_KIND } from "../incidents/katalog";
import { nactiZtraty, popisZtraty } from "../incidents/popis";
import { nactiStavKlubu } from "../incidents/stav-klubu";
import type { NavrhIncidentu } from "../incidents/typy";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

export const incidentsRouter = new Hono<{ Bindings: Bindings }>();
incidentsRouter.use("/admin/incidents/*", requireAdmin);

const M = "incidents-api";

interface IncidentRow {
  id: string; kind: string; category: string; status: string; severity: number;
  game_date: string; deadline: string | null; culprit_player_id: string | null;
  culprit_revealed: number; loss: string; text: string;
  resolution: string | null; resolved_on: string | null;
  jmeno: string | null; prijmeni: string | null;
}

function verejnyIncident(r: IncidentRow) {
  const def = KATALOG_PODLE_KIND.get(r.kind);
  const odhalen = r.culprit_revealed === 1 && !!r.culprit_player_id;
  return {
    id: r.id, kind: r.kind, label: def?.label ?? r.kind, emoji: def?.emoji ?? "❗",
    category: r.category, status: r.status, severity: r.severity,
    gameDate: r.game_date, deadline: r.deadline, text: r.text,
    ztraty: nactiZtraty(r.loss).map(popisZtraty),
    // Neodhaleného pachatele API nevrací nikdy.
    pachatel: odhalen
      ? { playerId: r.culprit_player_id as string, jmeno: [r.jmeno, r.prijmeni].filter(Boolean).join(" ") || null }
      : null,
    resolution: r.resolution, resolvedOn: r.resolved_on,
  };
}

// ── GET /api/teams/:teamId/incidents ─────────────────────────────────────────
incidentsRouter.get("/teams/:teamId/incidents", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.kind, i.category, i.status, i.severity, i.game_date, i.deadline,
            i.culprit_player_id, i.culprit_revealed, i.loss, i.text, i.resolution, i.resolved_on,
            COALESCE(p.first_name, d.first_name) AS jmeno, COALESCE(p.last_name, d.last_name) AS prijmeni
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.team_id = ?
        AND COALESCE(i.resolution, '') != 'bez_skody'
        AND (i.status != 'uzavreny'
             OR (i.season_number = (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)
                 AND i.game_date >= date((SELECT game_date FROM teams WHERE id = ?), '-30 days')))
      ORDER BY i.game_date DESC
      LIMIT 50`,
  ).bind(teamId, teamId).all<IncidentRow>()
    .catch((e) => { logger.warn({ module: M }, `incidenty ${teamId}`, e); return null; });
  if (!rows) return c.json({ error: "Incidenty se nepodařilo načíst" }, 500);

  return c.json({ incidents: rows.results.map(verejnyIncident) });
});

// ── POST /api/admin/incidents/force ──────────────────────────────────────────
// Jen pro ověření na testingu. Obchází šanci, cooldown, ochranu nového týmu
// a limit otevřených problémů. Podmínky (co klub má) neobchází nikdy.
incidentsRouter.post("/admin/incidents/force", async (c) => {
  const body = await c.req.json<{ teamId?: string; kind?: string; playerId?: string }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: neplatné tělo", e); return null; });
  if (!body?.teamId || !body.kind) return c.json({ error: "Chybí teamId nebo kind" }, 400);

  const def = KATALOG_PODLE_KIND.get(body.kind);
  if (!def) return c.json({ error: `Neznámý typ incidentu ${body.kind}` }, 400);

  const team = await c.env.DB.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?")
    .bind(body.teamId).first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);

  const sezona = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  const stav = await nactiStavKlubu(c.env.DB, team, team.game_date, sezona.number);
  if (!stav) return c.json({ error: "Stav klubu se nepodařilo načíst" }, 500);
  if (!def.muze(stav)) return c.json({ error: "Klub podmínky pro tenhle incident nesplňuje", kind: def.kind }, 409);

  // Volitelně vynutit pachatele z kádru: je jediným kandidátem s nejhorší povahou.
  let stavProLos = stav;
  if (body.playerId) {
    const hrac = stav.kadr.find((h) => h.id === body.playerId);
    if (!hrac) return c.json({ error: "Hráč není v kádru klubu" }, 400);
    stavProLos = { ...stav, kadr: [{ ...hrac, alkohol: 100, disciplina: 0, vernost: 0, vztahKTrenerovi: 0 }] };
  }

  let navrh: NavrhIncidentu | null = null;
  for (let pokus = 0; pokus < 50 && !navrh; pokus++) {
    navrh = def.vytvor(stavProLos, createRng(cryptoSeed()));
    if (navrh && body.playerId && navrh.culpritPlayerId !== body.playerId) navrh = null;
  }
  if (!navrh) return c.json({ error: "Incident se nestal ani na 50 pokusů (odradil zámek, chybí kandidát, nebo tenhle typ nemá pachatele z kádru)" }, 409);

  // Stopy se počítají se skutečným kádrem, ne s upraveným pro los.
  const zapsany = await zapisIncident(c.env.DB, stav, navrh, `inc-${team.id}-${navrh.kind}-${stav.den}-admin-${Date.now()}`);
  if (!zapsany) return c.json({ error: "Škodu se nepodařilo provést", incident: navrh }, 409);

  await oznamIncident(c.env, team.id, navrh, zapsany);
  return c.json({ ok: true, id: zapsany.id, odhalen: zapsany.odhalen, nalezeneStopy: zapsany.nalezeneStopy, incident: navrh });
});
