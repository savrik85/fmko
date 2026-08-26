/**
 * Rozvoj hráče — kolik už natrénoval a kam až může dojít.
 *
 * Potenciál (`skills_max`) je v datech přesné číslo, hráči se ale nikdy neukazuje přesně:
 * odhad je tím užší, čím lepšího má klub skauta. Bez skauta manažer vidí jen mlhu, což je
 * záměr — skaut se má vyplatit právě tím, že pozná, do koho stojí za to investovat.
 */

import { Hono } from "hono";
import { logger } from "../lib/logger";
import { requireTeamOwnership } from "../auth/middleware";
import { ratingWeightsFor } from "@okresni-masina/shared";

type Env = { Bindings: { DB: D1Database } };

export const developmentRouter = new Hono<Env>();
developmentRouter.use("/teams/:teamId/*", requireTeamOwnership);

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
  const atributy = Object.keys(NAZVY_ATRIBUTU)
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

export default developmentRouter;
