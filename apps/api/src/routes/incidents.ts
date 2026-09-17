/**
 * Incidenty v klubu: přehled pro manažera a ruční spuštění pro testování.
 * Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 7 a 11.
 */

import { Hono, type Context } from "hono";
import { tymyDivaka } from "../auth/divak";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { cryptoSeed, createRng } from "../generators/rng";
import { obvinHrace, rozhodni, zavolejPolicii, zeptejSe, type VysledekAkce } from "../incidents/akce";
import { vystavHned } from "../incidents/bazar-db";
import { oznamIncident, zapisIncident } from "../incidents/dopady";
import { SLOUPCE_INCIDENTU, proAkce, type IncidentRadek } from "../incidents/incident-db";
import { KATALOG_PODLE_KIND } from "../incidents/katalog";
import { ozviSeObvineni } from "../incidents/krivda";
import { MAX_OBVINENI, SRAZKA_TYDNU } from "../incidents/nastaveni";
import { nactiZtraty, popisZtraty } from "../incidents/popis";
import { nactiStavKlubu } from "../incidents/stav-klubu";
import { nactiStopy } from "../incidents/stopy-db";
import { castkaPokuty, castkaSrazky, hodnotaSkody } from "../incidents/tresty";
import type { NavrhIncidentu } from "../incidents/typy";
import { zpracujVysetrovani } from "../incidents/vysetrovani-den";
import { AKCE_TRESTU, dostupneAkce, lzeVyslychat, nactiObvineni, stavVysetrovani } from "../incidents/vysetrovani";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

export const incidentsRouter = new Hono<{ Bindings: Bindings }>();
incidentsRouter.use("/admin/incidents/*", requireAdmin);
// Akce nad incidentem smí jen vlastník týmu. GET middleware pustí, detail si vlastnictví ověří sám.
incidentsRouter.use("/teams/:teamId/incidents/*", requireTeamOwnership);

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

type RadekDetailu = IncidentRadek & { jmeno: string | null; prijmeni: string | null };
type HracKadruRadek = { id: string; first_name: string; last_name: string; weekly_wage: number | null };

// ── GET /api/teams/:teamId/incidents/:id ─────────────────────────────────────
incidentsRouter.get("/teams/:teamId/incidents/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const incidentId = c.req.param("id");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);
  const db = c.env.DB;

  const row = await db.prepare(
    `SELECT ${SLOUPCE_INCIDENTU.map((s) => `i.${s}`).join(", ")},
            COALESCE(p.first_name, d.first_name) AS jmeno, COALESCE(p.last_name, d.last_name) AS prijmeni
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.id = ? AND i.team_id = ?`,
  ).bind(incidentId, teamId).first<RadekDetailu>()
    .catch((e) => { logger.warn({ module: M }, `detail incidentu ${incidentId}`, e); return null; });
  if (!row) return c.json({ error: "Incident nenalezen" }, 404);

  const stopy = await nactiStopy(db, incidentId);
  const kadr = await db.prepare(
    "SELECT id, first_name, last_name, weekly_wage FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY last_name, first_name",
  ).bind(teamId).all<HracKadruRadek>()
    .catch((e) => { logger.warn({ module: M }, `kádr k incidentu ${incidentId}`, e); return { results: [] as HracKadruRadek[] }; });
  const jmena = new Map(kadr.results.map((h) => [h.id, `${h.first_name} ${h.last_name}`]));

  const odhalen = row.culprit_revealed === 1;
  const pachatelVKadru = odhalen && !!row.culprit_player_id && jmena.has(row.culprit_player_id);
  const akce = dostupneAkce(proAkce(row, pachatelVKadru));
  const zeptat = lzeVyslychat(proAkce(row, pachatelVKadru));
  const vysetrovani = stavVysetrovani(stopy, odhalen);

  let castky: { srazka: number; pokuta: number; tydnu: number } | null = null;
  if (akce.tresty.length > 0) {
    const mzda = kadr.results.find((h) => h.id === row.culprit_player_id)?.weekly_wage ?? 0;
    const skoda = hodnotaSkody(nactiZtraty(row.loss));
    castky = { srazka: castkaSrazky(skoda, mzda), pokuta: castkaPokuty(skoda, mzda), tydnu: SRAZKA_TYDNU };
  }

  return c.json({
    incident: verejnyIncident(row),
    vysetrovani: {
      stav: vysetrovani.stav,
      podezreli: vysetrovani.podezreli.map((playerId) => ({ playerId, jmeno: jmena.get(playerId) ?? null })),
    },
    // Jen nalezené stopy a bez držitelů: kdo co ví, zjistí manažer až vyšetřováním.
    stopy: stopy.filter((s) => s.nalezena).map((s) => ({ zdroj: s.zdroj, text: s.text, sila: s.sila })),
    obvineni: nactiObvineni(row.accused),
    policie: { vysledekOn: row.status === "policie" ? row.police_result_on : null, vysledek: row.police_success },
    akce: { ...akce, zeptat },
    zbyvaObvineni: Math.max(0, MAX_OBVINENI - row.accusations),
    kadr: akce.obvinit || zeptat ? kadr.results.map((h) => ({ playerId: h.id, jmeno: `${h.first_name} ${h.last_name}` })) : [],
    castky,
  });
});

function odpovedAkce(c: Context<{ Bindings: Bindings }>, v: VysledekAkce) {
  return v.ok ? c.json(v) : c.json({ error: v.chyba }, v.kod);
}

async function teloPozadavku<T>(c: Context<{ Bindings: Bindings }>, co: string): Promise<T | null> {
  return c.req.json<T>().catch((e) => { logger.warn({ module: M }, `${co}: neplatné tělo`, e); return null; });
}

// ── POST /api/teams/:teamId/incidents/:id/obvinit ───────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/obvinit", async (c) => {
  const body = await teloPozadavku<{ playerId?: string }>(c, "obvinění");
  if (!body?.playerId) return c.json({ error: "Vyber hráče, kterého chceš obvinit" }, 400);
  return odpovedAkce(c, await obvinHrace(c.env, c.req.param("teamId"), c.req.param("id"), body.playerId));
});

// ── POST /api/teams/:teamId/incidents/:id/zeptat ────────────────────────────
// Otevře konverzaci s hráčem a nastaví téma rozhovoru (spec 7a).
incidentsRouter.post("/teams/:teamId/incidents/:id/zeptat", async (c) => {
  const body = await teloPozadavku<{ playerId?: string }>(c, "zeptat se");
  if (!body?.playerId) return c.json({ error: "Vyber hráče, kterého se chceš zeptat" }, 400);
  return odpovedAkce(c, await zeptejSe(c.env, c.req.param("teamId"), c.req.param("id"), body.playerId));
});

// ── POST /api/teams/:teamId/incidents/:id/policie ───────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/policie", async (c) =>
  odpovedAkce(c, await zavolejPolicii(c.env, c.req.param("teamId"), c.req.param("id"))));

// ── POST /api/teams/:teamId/incidents/:id/rozhodnuti ────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/rozhodnuti", async (c) => {
  const body = await teloPozadavku<{ akce?: string; zapasu?: number | string }>(c, "rozhodnutí");
  const akce = AKCE_TRESTU.find((a) => a === body?.akce);
  if (!akce) return c.json({ error: "Neznámé rozhodnutí" }, 400);
  const zapasu = body?.zapasu === undefined || body.zapasu === "" ? undefined : Number(body.zapasu);
  return odpovedAkce(c, await rozhodni(c.env, c.req.param("teamId"), c.req.param("id"), akce, { zapasu }));
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

// ── POST /api/admin/incidents/vysetrovani ────────────────────────────────────
// Jen pro ověření na testingu: spustí denní vyšetřování klubu hned. `policieTed`
// posune výsledky probíhajících šetření na dnešek, `srazky` zaúčtuje srážky i mimo pondělí.
// `krivdy` otevře vlákna křivdy pro dnešní obvinění (jinak až další den). `bazarTed`
// vystaví kradené zboží otevřených prodejných krádeží hned, bez losu.
incidentsRouter.post("/admin/incidents/vysetrovani", async (c) => {
  const body = await teloPozadavku<{ teamId?: string; policieTed?: boolean; srazky?: boolean; krivdy?: boolean; bazarTed?: boolean }>(c, "admin vyšetřování");
  if (!body?.teamId) return c.json({ error: "Chybí teamId" }, 400);
  const db = c.env.DB;

  const team = await db.prepare("SELECT id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin vyšetřování: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);
  const sezona = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin vyšetřování: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  if (body.policieTed) {
    await db.prepare("UPDATE club_incidents SET police_result_on = ? WHERE team_id = ? AND status = 'policie'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin vyšetřování: posun výsledku policie", e));
  }
  const t = { teamId: team.id, gameDate: team.game_date, seasonNumber: sezona.number };
  const vysledek = await zpracujVysetrovani(c.env, t, { pondeli: !!body.srazky });
  const krivdy = body.krivdy ? await ozviSeObvineni(c.env, t, { denObvineni: team.game_date.slice(0, 10) }) : 0;
  const bazar = body.bazarTed ? await vystavHned(c.env, t) : 0;
  return c.json({ ok: true, ...vysledek, krivdy, bazar });
});
