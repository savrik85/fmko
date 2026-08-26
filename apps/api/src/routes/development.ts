/**
 * Rozvoj hráče — kolik už natrénoval a kam až může dojít.
 *
 * Potenciál (`skills_max`) je v datech přesné číslo, hráči se ale nikdy neukazuje přesně:
 * odhad je tím užší, čím lepšího má klub skauta. Bez skauta manažer vidí jen mlhu, což je
 * záměr — skaut se má vyplatit právě tím, že pozná, do koho stojí za to investovat.
 */

import { Hono } from "hono";
import { logger } from "../lib/logger";
import { requireTeamOwnership, requireAdmin } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import { ratingWeightsFor } from "@okresni-masina/shared";

type Env = { Bindings: { DB: D1Database; SESSION_KV: KVNamespace } };

export const developmentRouter = new Hono<Env>();
// Pozor: `requireTeamOwnership` propouští GET bez kontroly (většina herních dat je veřejná).
// Tady to nestačí — odhad stropu je konkurenční výhoda, za kterou klub platí skauta, a bez
// vlastní kontroly by kdokoli se známým ID viděl potenciál cizích hráčů. Proto si GETy
// ověřují vlastnictví samy přes `overSiVlastnictvi`.
developmentRouter.use("/teams/:teamId/*", requireTeamOwnership);

/**
 * Ověří, že volající je přihlášený vlastník daného týmu. Vrací chybovou odpověď, nebo null
 * když je všechno v pořádku.
 */
async function overSiVlastnictvi(
  c: { req: { param: (k: string) => string | undefined }; env: { DB: D1Database; SESSION_KV: KVNamespace }; json: (o: unknown, s?: number) => Response },
  teamId: string,
): Promise<Response | null> {
  const token = getTokenFromRequest(c as never);
  if (!token) return c.json({ error: "Nepřihlášen" }, 401);

  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return c.json({ error: "Neplatná session" }, 401);

  const vlastni = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?")
    .bind(teamId, session.userId).first()
    .catch((e) => { logger.warn({ module: "development", teamId }, "check ownership", e); return null; });
  if (!vlastni) return c.json({ error: "Přístup odepřen" }, 403);

  return null;
}

/** České názvy atributů — do UI nikdy neposílat holý klíč. */
const NAZVY_ATRIBUTU: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba", passing: "Přihrávka",
  heading: "Hlavičky", defense: "Obrana", goalkeeping: "Chytání", stamina: "Výdrž",
  strength: "Síla", vision: "Přehled", creativity: "Kreativita", setPieces: "Standardky",
  experience: "Zkušenost",
};

/**
 * Jak přesně klub odhaduje strop. Bez skauta ±18 bodů (prakticky "nevíme"),
 * špičkový skaut ±4 (skoro jistota).
 */
function rozptylOdhadu(kvalitaSkauta: number): number {
  return Math.round(18 - Math.max(0, Math.min(1, kvalitaSkauta)) * 14);
}

/** Slovní hodnocení talentu. Bez skauta se neukazuje vůbec. */
function slovneTalent(talent: number): string {
  if (talent >= 61) return "výjimečný talent";
  if (talent >= 36) return "velký talent";
  if (talent >= 16) return "slibný";
  return "nic zvláštního";
}

/**
 * Stabilní pseudonáhoda z textu — aby se odhad stropu neměnil při každém načtení stránky.
 * Manažer nesmí odhad "vyrolovat" opakovaným refreshem.
 */
function stabilniPosun(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * 2 - 1; // -1..1
}

// GET /api/teams/:teamId/players/:playerId/development
developmentRouter.get("/teams/:teamId/players/:playerId/development", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const odmitnuto = await overSiVlastnictvi(c, teamId);
  if (odmitnuto) return odmitnuto;

  const player = await c.env.DB.prepare(
    "SELECT id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, skills_max, hidden_talent FROM players WHERE id = ?",
  ).bind(playerId).first<{
    id: string; team_id: string; first_name: string; last_name: string; age: number;
    position: string; overall_rating: number; skills: string; physical: string | null;
    skills_max: string | null; hidden_talent: number | null;
  }>().catch((e) => { logger.warn({ module: "development", playerId }, "load player", e); return null; });

  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  // Hráč musí patřit týmu nebo jeho U21 — jinak by šlo koukat soupeři do karet.
  const patriKlubu = await c.env.DB.prepare(
    "SELECT 1 AS ok FROM teams WHERE id = ? AND (id = ? OR parent_team_id = ?)",
  ).bind(player.team_id, teamId, teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "check club ownership", e); return null; });
  if (!patriKlubu) return c.json({ error: "Hráč není z tvého klubu" }, 403);

  // Skaut visí na A-týmu, i když hráč hraje za U21
  const clubRow = await c.env.DB.prepare("SELECT COALESCE(parent_team_id, id) AS club_id FROM teams WHERE id = ?")
    .bind(player.team_id).first<{ club_id: string }>()
    .catch((e) => { logger.warn({ module: "development" }, "load club id", e); return null; });
  const clubId = clubRow?.club_id ?? teamId;

  const staff = await c.env.DB.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
  ).bind(clubId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId: clubId }, "load staff", e); return { results: [] as never[] }; });

  const { scoutChanceMultiplier } = await import("../staff/staff-effects");
  const kvalitaSkauta = Math.max(0, scoutChanceMultiplier(staff.results) - 1); // 0..1
  const maSkauta = staff.results.some((r) => r.role === "skaut");
  const rozptyl = rozptylOdhadu(kvalitaSkauta);

  const skills = (() => {
    try { return JSON.parse(player.skills) as Record<string, number>; }
    catch (e) { logger.warn({ module: "development", playerId }, "parse skills", e); return {}; }
  })();
  const physical = (() => {
    try { return player.physical ? JSON.parse(player.physical) as Record<string, number> : {}; }
    catch (e) { logger.warn({ module: "development", playerId }, "parse physical", e); return {}; }
  })();
  const skillsMax = (() => {
    try { return player.skills_max ? JSON.parse(player.skills_max) as Record<string, { maxPotential?: number }> : {}; }
    catch (e) { logger.warn({ module: "development", playerId }, "parse skills_max", e); return {}; }
  })();

  const vahy = ratingWeightsFor(player.position);

  // Atributy, které dávají smysl ukazovat: co hráč má a co se dá trénovat.
  // Zkušenost se vynechává — neroste tréninkem ale odehranými minutami a strop má vždy 100,
  // takže by se u ní ukazovalo nesmyslné „2 / 94–100".
  const atributy = Object.keys(NAZVY_ATRIBUTU)
    .filter((attr) => attr !== "experience")
    .filter((attr) => typeof skills[attr] === "number" || typeof physical[attr] === "number")
    .map((attr) => {
      const soucasna = skills[attr] ?? physical[attr] ?? 0;
      const strop = skillsMax[attr]?.maxPotential;

      let odhadMin: number | null = null;
      let odhadMax: number | null = null;
      if (maSkauta && typeof strop === "number") {
        // Střed odhadu je posunutý stabilně podle hráče a atributu, ne náhodně při každém načtení
        const posun = Math.round(stabilniPosun(`${playerId}:${attr}`) * rozptyl * 0.5);
        const stred = strop + posun;
        odhadMin = Math.max(soucasna, Math.round(stred - rozptyl));
        odhadMax = Math.min(100, Math.round(stred + rozptyl));
      }

      return {
        atribut: attr,
        nazev: NAZVY_ATRIBUTU[attr],
        soucasna,
        odhadMin,
        odhadMax,
        /** Kolik váhy má atribut v hodnocení na téhle pozici (0 = do ratingu nevstupuje). */
        vahaVHodnoceni: vahy[attr] ?? 0,
      };
    })
    .sort((a, b) => b.vahaVHodnoceni - a.vahaVHodnoceni);

  // Kolik hráč natrénoval za posledních 30 herních dní — a v čem
  const rust = await c.env.DB.prepare(
    `SELECT attribute, SUM(change) AS zmena, COUNT(*) AS kroku
       FROM training_log
      WHERE player_id = ? AND created_at > datetime('now', '-30 days')
      GROUP BY attribute HAVING zmena != 0 ORDER BY zmena DESC`,
  ).bind(playerId).all<{ attribute: string; zmena: number; kroku: number }>()
    .catch((e) => { logger.warn({ module: "development", playerId }, "load growth", e); return { results: [] as never[] }; });

  const historie = await c.env.DB.prepare(
    `SELECT attribute, old_value, new_value, change, training_type, game_date
       FROM training_log WHERE player_id = ? ORDER BY created_at DESC LIMIT 30`,
  ).bind(playerId).all<{ attribute: string; old_value: number; new_value: number; change: number; training_type: string; game_date: string }>()
    .catch((e) => { logger.warn({ module: "development", playerId }, "load history", e); return { results: [] as never[] }; });

  const talent = player.hidden_talent ?? 0;

  return c.json({
    hrac: {
      id: player.id,
      jmeno: `${player.first_name} ${player.last_name}`,
      vek: player.age,
      pozice: player.position,
      hodnoceni: player.overall_rating,
    },
    skaut: {
      /** Bez skauta se strop ani talent neukazují — od toho ten skaut v realizačním týmu je. */
      maSkauta,
      presnost: maSkauta ? (rozptyl <= 6 ? "přesný" : rozptyl <= 12 ? "solidní" : "hrubý") : null,
      rozptyl: maSkauta ? rozptyl : null,
    },
    talent: maSkauta ? { slovne: slovneTalent(talent), hodnota: talent } : null,
    atributy,
    rustZa30Dni: {
      celkem: rust.results.reduce((s, r) => s + r.zmena, 0),
      podleAtributu: rust.results.map((r) => ({
        atribut: r.attribute, nazev: NAZVY_ATRIBUTU[r.attribute] ?? r.attribute, zmena: r.zmena,
      })),
    },
    historie: historie.results.map((h) => ({
      atribut: h.attribute,
      nazev: NAZVY_ATRIBUTU[h.attribute] ?? h.attribute,
      z: h.old_value, na: h.new_value, zmena: h.change,
      zdroj: h.training_type, datum: h.game_date,
    })),
  });
});

// ── Mládežnická akademie ─────────────────────────────────────────────────────

// GET /api/teams/:teamId/academy — stav akademie a nabídka úrovní
developmentRouter.get("/teams/:teamId/academy", async (c) => {
  const teamId = c.req.param("teamId");

  const odmitnuto = await overSiVlastnictvi(c, teamId);
  if (odmitnuto) return odmitnuto;

  const { YOUTH_LABELS, YOUTH_POPISY, YOUTH_SANCE, youthMonthlyCost } = await import("../season/youth");

  const team = await c.env.DB.prepare(
    `SELECT t.youth_investment, v.population FROM teams t
       JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<{ youth_investment: string | null; population: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "load academy", e); return null; });

  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  // Větší obec = víc kluků = vyšší šance. Týž vzorec, jaký používá tryGraduateYouth.
  const popMod = Math.max(0.5, Math.min(1.5, (team.population ?? 500) / 3000));

  const urovne = (["none", "minimal", "medium", "high"] as const).map((u) => ({
    klic: u,
    nazev: YOUTH_LABELS[u],
    popis: YOUTH_POPISY[u],
    mesicne: youthMonthlyCost(u),
    tydne: Math.round(youthMonthlyCost(u) / 4.3),
    sanceNaOdchovance: Math.round(Math.min(1, YOUTH_SANCE[u] * popMod) * 100),
  }));

  const maU21 = await c.env.DB.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
    .bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: "development", teamId }, "check u21", e); return null; });

  return c.json({
    aktualni: team.youth_investment ?? "none",
    populace: team.population,
    /** Bez U21 týmu nemá odchovanec kam jít — na to musí manažer vidět dřív, než začne platit. */
    maU21Tym: !!maU21,
    urovne,
  });
});

// POST /api/teams/:teamId/academy — nastavit úroveň investice
developmentRouter.post("/teams/:teamId/academy", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ investment?: string }>().catch((e) => {
    logger.warn({ module: "development", teamId }, "parse academy body", e);
    return null;
  });

  const povolene = ["none", "minimal", "medium", "high"];
  if (!body?.investment || !povolene.includes(body.investment)) {
    return c.json({ error: "Neplatná úroveň investice" }, 400);
  }

  await c.env.DB.prepare("UPDATE teams SET youth_investment = ? WHERE id = ?")
    .bind(body.investment, teamId).run();

  logger.info({ module: "development", teamId }, `akademie nastavena na ${body.investment}`);
  return c.json({ ok: true, investment: body.investment });
});

// POST /api/admin/academy-graduate/:teamId — ruční vychování odchovance.
// Stejný mechanismus, jaký spustí fáze `academy` na konci sezóny; slouží k ověření,
// že akademie funguje, bez čekání na konec ročníku.
developmentRouter.post("/admin/academy-graduate/:teamId", requireAdmin, async (c) => {
  const teamId = c.req.param("teamId");
  const { graduateAcademyPlayer, notifyAcademyGraduate } = await import("../season/academy-graduation");

  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE is_active = 1 LIMIT 1")
    .first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "development" }, "load active season", e); return null; });

  const res = await graduateAcademyPlayer(c.env.DB, teamId, season?.id ?? null);
  if (res) await notifyAcademyGraduate(c.env.DB, res);

  return c.json({
    ok: true,
    odchovanec: res,
    // null znamená buď „klub do mládeže nesype", „nemá U21", nebo „letos se nikdo neurodil"
    poznamka: res ? null : "Žádný odchovanec — zkontroluj investici, U21 tým, nebo to prostě nevyšlo",
  });
});

export default developmentRouter;
