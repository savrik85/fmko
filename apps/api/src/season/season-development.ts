/**
 * Vývoj na konci sezóny — hráči se zlepší/zhorší dle věku, trenér se vyvíjí.
 *
 * Hráči: mladí rostou, staří klesají (overall_rating + proporčně skills).
 * Trenér: získá zkušenost (atributy +/- dle sezóny) a zestárne.
 * Vrací top zlepšené/zhoršené hráče + změny trenéra pro recap.
 */

import { LICENCE_LEVELS, MANAGER_FANS, MAX_LICENCE } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { getTeamPosition } from "../stats/standings";
import { logger } from "../lib/logger";
import { overallRatingFromFlat } from "../skills/generator";

const M = "season-development";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface PlayerDevEntry { playerId: string; name: string; position: string; age: number; before: number; after: number; delta: number }
export interface ManagerAttrDelta { attr: string; label: string; before: number; after: number }
export interface ManagerDev { name: string; age: number; deltas: ManagerAttrDelta[] }
export interface DevResult { improved: PlayerDevEntry[]; declined: PlayerDevEntry[]; manager: ManagerDev | null }

/** Věkově řízená změna overall (s trochou náhody). */
function ratingDelta(rng: ReturnType<typeof createRng>, age: number): number {
  if (age <= 20) return rng.int(1, 4);
  if (age <= 23) return rng.int(0, 3);
  if (age <= 26) return rng.int(-1, 2);
  if (age <= 29) return rng.int(-1, 1);
  if (age <= 32) return rng.int(-2, 0);
  if (age <= 34) return rng.int(-3, -1);
  return rng.int(-4, -2);
}

/**
 * Proporční změna dovedností o `ratio` (celý hráč se mírně zlepší nebo zhorší).
 *
 * - Zkušenost se nemění: roste odehranými minutami, ne věkem. Dřív se násobila taky,
 *   takže veterán každé léto o zkušenost přišel a mladík ji dostal zadarmo.
 * - Růst se zastaví na potenciálu (`skills_max`). Hodnotu, která už nad ním je, nesnižuje.
 * - Výdrž a síla se propíšou i do `physical`, odkud je čte zápas. Dřív se měnila jen kopie
 *   ve `skills` a obě hodnoty se rozjely.
 */
export function applySeasonDevelopment(
  skills: Record<string, unknown>,
  physical: Record<string, unknown>,
  ratio: number,
  skillsMax?: Record<string, { maxPotential?: number }>,
): void {
  const scale = (k: string, value: number): number => {
    const next = clamp(Math.round(value * ratio), 1, 99);
    const cap = skillsMax?.[k]?.maxPotential;
    return next > value && typeof cap === "number" ? Math.min(next, Math.max(value, cap)) : next;
  };
  for (const k of Object.keys(skills)) {
    const value = skills[k];
    if (typeof value === "number" && k !== "experience") skills[k] = scale(k, value);
  }
  for (const k of ["stamina", "strength"] as const) {
    if (typeof skills[k] === "number") physical[k] = skills[k];
    else if (typeof physical[k] === "number") physical[k] = scale(k, physical[k] as number);
  }
}

/** Součet změn dovedností za sezónu po hráčích (training_log zapisuje trénink, zápasy i turnaj). */
async function loadSeasonGains(db: D1Database, teamId: string, playerIds: string[]): Promise<Map<string, Map<string, number>>> {
  const gains = new Map<string, Map<string, number>>();
  if (playerIds.length === 0) return gains;
  const team = await db.prepare("SELECT season_start FROM teams WHERE id = ?").bind(teamId).first<{ season_start: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "začátek sezóny týmu", e); return null; });
  if (!team?.season_start) return gains;
  const rows = await db.prepare(
    `SELECT player_id, attribute, SUM(change) AS total FROM training_log
     WHERE game_date >= ? AND player_id IN (${playerIds.map(() => "?").join(",")})
     GROUP BY player_id, attribute`,
  ).bind(team.season_start, ...playerIds).all<{ player_id: string; attribute: string; total: number }>()
    .catch((e) => { logger.warn({ module: M }, "růst hráčů za sezónu", e); return { results: [] as Array<{ player_id: string; attribute: string; total: number }> }; });
  for (const r of rows.results) {
    const m = gains.get(r.player_id) ?? new Map<string, number>();
    m.set(r.attribute, r.total);
    gains.set(r.player_id, m);
  }
  return gains;
}

/** Hodnocení na začátku sezóny: dnešní dovednosti bez toho, co hráč za sezónu získal. */
export function seasonStartRating(
  position: string,
  skills: Record<string, unknown>,
  physical: Record<string, unknown>,
  hiddenTalent: number,
  skillsMax: Record<string, { maxPotential?: number }> | undefined,
  gains: Map<string, number> | undefined,
): number | null {
  if (!gains || gains.size === 0) return null;
  const s0: Record<string, unknown> = { ...skills };
  const p0: Record<string, unknown> = { ...physical };
  for (const [attr, total] of gains) {
    if (typeof s0[attr] === "number") s0[attr] = clamp((s0[attr] as number) - total, 1, 99);
    if (typeof p0[attr] === "number") p0[attr] = clamp((p0[attr] as number) - total, 1, 99);
  }
  return overallRatingFromFlat(position, s0, p0, hiddenTalent, skillsMax);
}

const MGR_LABELS: Record<string, string> = {
  coaching: "Trénování", motivation: "Motivace", tactics: "Taktika",
  youth_development: "Mládež", discipline: "Disciplína",
};

export async function developSquadAndManager(
  db: D1Database,
  leagueId: string,
  teamId: string,
  seasonNumber: number,
): Promise<DevResult> {
  const rng = createRng(hashSeed(`${teamId}:s${seasonNumber}:dev`));

  // ── Hráči ──
  const playersRes = await db.prepare(
    "SELECT id, first_name, last_name, age, position, overall_rating, skills, skills_max, physical, hidden_talent FROM players WHERE team_id = ? AND status = 'active'",
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; age: number; position: string; overall_rating: number; skills: string; skills_max: string | null; physical: string | null; hidden_talent: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "load players", e); return { results: [] as any[] }; });

  // Co kdo za sezónu natrénoval a nahrál (trénink, zápasy, turnaj): z toho se dopočítá
  // hodnocení na začátku sezóny. Přehled „Vývoj týmu“ dřív ukazoval jen letní skok podle
  // věku (nejvýš ±4), takže hráč, který za sezónu vyrostl o 7, měl v přehledu +3 (2026-10-19).
  const seasonGains = await loadSeasonGains(db, teamId, playersRes.results.map((p) => p.id));

  const entries: PlayerDevEntry[] = [];
  for (const p of playersRes.results) {
    const before = p.overall_rating;
    if (before <= 0) continue;
    const target = clamp(before + ratingDelta(rng, p.age), 20, 99);

    let skills: Record<string, unknown>;
    let physical: Record<string, unknown>;
    let skillsMax: Record<string, { maxPotential?: number }> | undefined;
    try {
      skills = JSON.parse(p.skills);
      physical = p.physical ? JSON.parse(p.physical) : {};
      skillsMax = p.skills_max ? JSON.parse(p.skills_max) : undefined;
    } catch (e) {
      // Bez čitelných dovedností hráče radši vynechat. Dřív se tu uložil prázdný objekt.
      logger.warn({ module: M, playerId: p.id }, "parse player json", e);
      continue;
    }

    const seasonStart = seasonStartRating(p.position, skills, physical, p.hidden_talent ?? 0, skillsMax, seasonGains.get(p.id));

    let after = before;
    if (target !== before) {
      applySeasonDevelopment(skills, physical, target / before, skillsMax);
      after = overallRatingFromFlat(p.position, skills, physical, p.hidden_talent ?? 0, skillsMax) ?? target;
      await db.prepare("UPDATE players SET overall_rating = ?, skills = ?, physical = ? WHERE id = ?")
        .bind(after, JSON.stringify(skills), JSON.stringify(physical), p.id).run()
        .catch((e) => logger.warn({ module: M }, "update player dev", e));
    }

    // Za celou sezónu: od hodnocení na jejím začátku po hodnocení po letním skoku.
    const start = seasonStart ?? before;
    if (after === start) continue;
    entries.push({ playerId: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, age: p.age, before: start, after, delta: after - start });
  }

  const improved = entries.filter((e) => e.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const declined = entries.filter((e) => e.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

  // ── Trenér ──
  let manager: ManagerDev | null = null;
  const mgr = await db.prepare(
    "SELECT m.id, m.name, m.age, m.coaching, m.motivation, m.tactics, m.youth_development, m.discipline FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ? AND m.user_id = t.user_id AND t.user_id != 'ai'",
  ).bind(teamId).first<{ id: string; name: string; age: number | null; coaching: number; motivation: number; tactics: number; youth_development: number; discipline: number }>()
    .catch((e) => { logger.warn({ module: M }, "load manager", e); return null; });

  if (mgr) {
    const pos = await getTeamPosition(db, leagueId, teamId).catch((e) => { logger.warn({ module: M }, "team position", e); return 0; });
    const totalTeams = (await db.prepare("SELECT COUNT(*) AS c FROM teams WHERE league_id = ?").bind(leagueId).first<{ c: number }>()
      .catch((e) => { logger.warn({ module: M }, "team count", e); return null; }))?.c ?? 14;
    const topHalf = pos > 0 && pos <= Math.ceil(totalTeams / 2);

    const next = { coaching: mgr.coaching, motivation: mgr.motivation, tactics: mgr.tactics, youth_development: mgr.youth_development, discipline: mgr.discipline };
    // Zkušenost: +1 do trénování nebo taktiky
    const expAttr = rng.pick(["coaching", "tactics"]) as keyof typeof next;
    next[expAttr] = clamp(next[expAttr] + 1, MANAGER_FANS.ATTR_MIN, MANAGER_FANS.ATTR_MAX);
    // Dle výsledku sezóny
    if (topHalf) {
      next.motivation = clamp(next.motivation + 1, MANAGER_FANS.ATTR_MIN, MANAGER_FANS.ATTR_MAX);
    } else {
      next.discipline = clamp(next.discipline + 1, MANAGER_FANS.ATTR_MIN, MANAGER_FANS.ATTR_MAX);
      if (rng.random() < 0.5) next.motivation = clamp(next.motivation - 1, MANAGER_FANS.ATTR_MIN, MANAGER_FANS.ATTR_MAX);
    }
    // Občas rozvoj mládeže
    if (rng.random() < 0.35) next.youth_development = clamp(next.youth_development + 1, MANAGER_FANS.ATTR_MIN, MANAGER_FANS.ATTR_MAX);

    const newAge = (mgr.age ?? 40) + 1;
    // Věk zvlášť — není to atribut s auditem, jen se přičte rok.
    await db.prepare("UPDATE managers SET age = ? WHERE id = ?")
      .bind(newAge, mgr.id).run()
      .catch((e) => logger.warn({ module: M }, "update manager age", e));

    // Každá změna atributu jde přes audit, ať je v profilu vidět důvod.
    const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
    // Herní datum týmu — audit se čte v herním čase.
    const devGameDate = (await db.prepare("SELECT game_date FROM teams WHERE id = ?")
      .bind(teamId).first<{ game_date: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "load game date for manager dev", e); return null; })
    )?.game_date ?? undefined;
    const seasonReason = topHalf
      ? `Sezóna v horní polovině tabulky (${pos}. místo)`
      : `Sezóna ve spodní polovině tabulky (${pos}. místo)`;

    const deltas: ManagerAttrDelta[] = [];
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      const before = (mgr as unknown as Record<string, number>)[k];
      const delta = next[k] - before;
      if (delta === 0) continue;
      const res = await applyManagerAttrDelta(
        db, teamId, k, delta, "season_dev",
        k === "coaching" || k === "tactics" ? "Zkušenost z odehrané sezóny" : seasonReason,
        { referenceId: `mgr-dev-s${seasonNumber}-${teamId}-${k}`, gameDate: devGameDate },
      );
      // Do recapu jde SKUTEČNÁ změna, ne zamýšlená — když atribut narazil na strop,
      // hráč nesmí vidět posun, který se nestal.
      if (res.applied !== 0) {
        deltas.push({ attr: k, label: MGR_LABELS[k] ?? k, before: res.oldValue, after: res.newValue });
      }
    }
    manager = { name: mgr.name, age: newAge, deltas };
  }

  await upgradeAiLicence(db, teamId);

  logger.info({ module: M }, `dev team=${teamId} improved=${improved.length} declined=${declined.length} mgr=${manager ? "y" : "n"}`);
  return { improved, declined, manager };
}

/**
 * AI trenér na kurzy nechodí, licenci si „udělá" sám: po sezóně o stupeň výš,
 * pokud má reputaci, jakou by lidský trenér potřeboval k přihlášce. Jinak by AI
 * trenéři navždy trčeli pod stropem 60 a lidské kluby by je přerostly jen papíry.
 */
async function upgradeAiLicence(db: D1Database, teamId: string): Promise<void> {
  const cases = LICENCE_LEVELS.slice(1).map((l) => `WHEN ${l.level - 1} THEN ${l.minReputation}`).join(" ");
  await db.prepare(
    `UPDATE managers
        SET licence_level = licence_level + 1, licence_source = 'ai_upgrade'
      WHERE team_id = ? AND user_id = 'ai' AND licence_level < ?
        AND reputation >= CASE licence_level ${cases} ELSE 999 END`,
  ).bind(teamId, MAX_LICENCE).run()
    .catch((e) => logger.warn({ module: M }, `AI licence upgrade ${teamId}`, e));
}
