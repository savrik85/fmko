/**
 * FMK-62: Game system API routes — tréninky, ekonomika, mládež, nábor.
 */

import { brokenCzech } from "../messaging/foreign-speech";
import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { createRng, cryptoSeed } from "../generators/rng";
import { executeDailyTick } from "../season/daily-tick";
import { recordTransaction } from "../season/finance-processor";
import { getSeasonalEventsForWeek, type SeasonalEventDef } from "../season/seasonal-events";
import { logger } from "../lib/logger";
import { validateMatchPlan, parseStoredPlan } from "../lib/match-plan-validation";
import { validateBench, parseStoredBench, benchColumn } from "../lib/lineup-bench";
import { saveLineup, setTeamRoles, VALID_TACTICS, VALID_HARDNESS, VALID_FORMATIONS } from "../services/lineup";
import { setTrainingPlan } from "../services/training";
import { repairEquipment, upgradeEquipment } from "../services/equipment";
import { maintainPitch, setPitchCareMode, upgradeStadiumFacility } from "../services/stadium";
import { computeBannerOffers, MAX_BANNERS, signSponsorContract } from "../services/banner-sponsors";
import { setTicketPrice } from "../services/club-settings";
import { restockConcession, setConcessionMode, setConcessionProduct } from "../services/concessions";
import { mustSeason } from "../lib/season";
import { MAX_CLUB_NAME_LENGTH, NAME_TAKEN_ERROR, renameClub } from "../lib/club-rename";
import { getSession, getTokenFromRequest } from "../auth/session";
import { requireTeamOwnership, requireAdmin, requireOwnedTeamRead } from "../auth/middleware";
import { buildPlayerView } from "../transfers/player-view";
import { findTransferSearchPlayerRows, resolveTransferSearchContext } from "../transfers/player-search";
import { resolveClubTeamId, resolveOfferClubScope } from "../transfers/offer-club-scope";
import { suspensionSms, injurySms } from "../events/injury-sms";
import { injuryPronenessOf } from "../injuries/proneness";
import { isBodyType } from "../generators/physicals";
import { MAX_ACTIVE_INSTALLMENT_DEALS, CPU_CLUB_ID, clubPrefixOf, sponsorWeeklyPayout, transferSchedule, termsFromRow, splitPlanByLineup, benchForLineup } from "@okresni-masina/shared";
import { sendPhoneSMS } from "../messaging/phone-sms";
import {
  acceptListingBid, acceptTransferOffer, counterListingBid, counterTransferOffer, createTransferOffer, listPlayerOnMarket,
  onPlayerTransferred, placeListingBid, rejectListingBid, rejectTransferOffer, signFreeAgent, withdrawListing, withdrawTransferOffer,
  type CounterOfferInput, type CreateOfferInput, type ListingBidInput, type TransferActionFailure,
} from "../services/transfer-actions";

/**
 * Povrchy areálu, které má klub ZAPLACENÉ.
 *
 * Sloupec `stadiums.surround_owned` drží JSON seznam. U klubů, které od migrace 0177
 * nic nekupovaly, může být prázdný — proto se do seznamu vždy přidá i to, co má klub
 * právě položené: za to zaplatil, i když o tom záznam nevznikl. Tráva je zdarma,
 * takže se ve vlastnictví nedrží.
 */
function vlastnenePovrchy(raw: string | null, polozene: string | null): string[] {
  const seznam: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const p of parsed) if (typeof p === "string" && p !== "grass") seznam.push(p);
      }
    } catch (e) {
      logger.warn({ module: "game", raw }, "parse surround_owned", e);
    }
  }
  if (polozene && polozene !== "grass" && !seznam.includes(polozene)) seznam.push(polozene);
  return seznam;
}

const gameRouter = new Hono<{ Bindings: Bindings }>();

/** Explicitní KV přepínač pro ruční testování stadionových levelů, pouze na localhostu. */
async function ignoreStadiumProgressLocks(cache: KVNamespace, teamId: string, requestUrl: string, origin?: string | null): Promise<boolean> {
  // `wrangler dev` posílá Worker pod hostem produkční route, takže podle URL se localhost nepozná.
  // Proto se bere i hlavička Origin (stránka na localhostu). Samotný host nestačí: přepínač musí
  // být navíc zapnutý klíčem v KV, který na produkci nikdo nenastaví.
  let hostname = new URL(requestUrl).hostname;
  if (origin) {
    try {
      hostname = new URL(origin).hostname;
    } catch (error) {
      logger.warn({ module: "game" }, "neplatná hlavička Origin u odemykání stadionu", error);
    }
  }
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") return false;

  try {
    return await cache.get(`dev:stadium:unlock:${teamId}`) === "1";
  } catch (error) {
    logger.warn({ module: "game" }, "load local stadium unlock flag", error);
    return false;
  }
}

// ── Auth middleware ──────────────────────────────────────────────────────────
// Všechny write operace na týmových routách vyžadují ownership ověření.
gameRouter.use("/teams/:teamId/*", requireTeamOwnership);

// Admin operace vyžadují admin session.
gameRouter.use("/admin/*", requireAdmin);
gameRouter.use("/game/*", requireAdmin);
gameRouter.use("/leagues/:leagueId/generate-schedule", requireAdmin);
// ────────────────────────────────────────────────────────────────────────────

/** Neúspěch přestupové služby jako odpověď routy (s id existující nabídky nebo lhůtou, když je služba vrátí). */
function transferError(c: Context, res: TransferActionFailure) {
  return c.json({
    error: res.error,
    ...(res.offerId ? { offerId: res.offerId } : {}),
    ...(res.retryInDays != null ? { retryInDays: res.retryInDays } : {}),
  }, res.status);
}


// GET /api/teams/:id/training — get training plan + simulate a session preview
gameRouter.get("/teams/:teamId/training", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT training_type, training_approach, training_sessions, training_days, training_plan, last_training_at, last_training_result FROM teams WHERE id = ?"
  ).bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch training plan", e); return null; });

  if (!team) return c.json({ error: "Team not found" }, 404);

  const lastResult = team.last_training_result
    ? JSON.parse(team.last_training_result as string)
    : null;

  // Parse custom training days (JSON array of 1-5). Fallback na default mapping.
  let trainingDays: number[] | null = null;
  if (team.training_days) {
    try {
      const parsed = JSON.parse(team.training_days as string);
      if (Array.isArray(parsed) && parsed.every((d) => typeof d === "number" && d >= 0 && d <= 6)) {
        trainingDays = parsed;
      }
    } catch (e) { logger.warn({ module: "game", teamId }, "parse training_days", e); }
  }

  // Hráči s naplánovaným volnem z příštího tréninku (life_context.$.trainingRest)
  const restRows = await c.env.DB.prepare(
    `SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') AND json_extract(life_context, '$.trainingRest') = 1`
  ).bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "load training rest players", e); return { results: [] as Array<{ id: string }> }; });

  // Týdenní plán {"1":"conditioning",...} — každý den vlastní typ. null = jednotný typ pro všechny dny.
  const { parseTrainingPlan } = await import("../season/daily-tick");
  const trainingPlan = parseTrainingPlan(team.training_plan as string | null, teamId);

  return c.json({
    type: team.training_type ?? "conditioning",
    approach: team.training_approach ?? "balanced",
    sessionsPerWeek: team.training_sessions ?? 2,
    trainingDays,
    trainingPlan,
    restPlayerIds: restRows.results.map((r) => r.id),
    lastTrainingAt: team.last_training_at,
    lastResult,
  });
});

// POST /api/teams/:id/training — set training plan (pravidla v services/training.ts, sdílí je AI trenér)
gameRouter.post("/teams/:teamId/training", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ type: string; approach: string; sessionsPerWeek: number; trainingDays?: number[] | null; trainingPlan?: Record<string, string> | null }>();
  const res = await setTrainingPlan(c.env.DB, teamId, body);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true });
});

// POST /api/teams/:teamId/training-rest — volno z příštího tréninku pro vybrané hráče
gameRouter.post("/teams/:teamId/training-rest", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ playerIds: string[] }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "parse training-rest body", e); return null; });
  if (!body || !Array.isArray(body.playerIds)) return c.json({ error: "Chybí playerIds" }, 400);

  const playerIds = Array.from(new Set(
    body.playerIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64)
  )).slice(0, 60);

  // Idempotentní zápis: nejdřív smazat flag celému týmu, pak nastavit vybraným
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE players SET life_context = json_remove(life_context, '$.trainingRest') WHERE team_id = ? AND json_extract(life_context, '$.trainingRest') IS NOT NULL`
    ).bind(teamId),
  ];
  if (playerIds.length > 0) {
    const placeholders = playerIds.map(() => "?").join(", ");
    stmts.push(c.env.DB.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.trainingRest', 1) WHERE team_id = ? AND (status IS NULL OR status = 'active') AND id IN (${placeholders})`
    ).bind(teamId, ...playerIds));
  }
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    logger.error({ module: "game", teamId }, "save training rest", e);
    return c.json({ error: "Uložení volna se nepovedlo" }, 500);
  }

  return c.json({ ok: true, count: playerIds.length });
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

  // Popisy odpovídají SKUTEČNÝM efektům v enginu (simulation.ts + kabina.ts).
  // Neslibovat nic, co kód nedělá — dřív tu byly 4 fantomové efekty.
  const EFFECT_MAP: Record<string, string> = {
    brothers: "Častější asistence mezi sebou, +morálka při gólu bratra",
    father_son: "Častější asistence mezi sebou, +morálka při gólu",
    in_laws: "Třecí plochy, −1 morálka týdně, když jsou oba v kádru",
    classmates: "Sehraní ze školy, častější asistence mezi sebou",
    coworkers: "+1 morálka týdně, znají se z práce",
    neighbors: "+1 morálka týdně, společná cesta na zápasy",
    drinking_buddies: "+2 morálka týdně, +morálka při gólu parťáka",
    rivals: "−3 morálka týdně, častější fauly v zápase",
    mentor_pupil: "Žák má s mentorem na hřišti jistější zakončení a víc asistencí",
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

// POST /api/teams/:id/training-preview — co dané nastavení tréninku přinese, PŘED uložením.
// Počítá ze stejných funkcí jako simulace (training.ts), aby predikce nelhala.
gameRouter.post("/teams/:teamId/training-preview", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ type: string; approach: string; trainingDays?: number[] | null; trainingPlan?: Record<string, string> | null }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "parse training-preview body", e); return null; });
  if (!body) return c.json({ error: "Neplatný požadavek" }, 400);

  // Kolik dnů se týdně trénuje = zátěž. Plán má přednost, pak explicitní dny, pak default mapa.
  const DEFAULT_DAY_MAP: Record<number, number[]> = { 1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
  const planDays = body.trainingPlan ? Object.keys(body.trainingPlan).map(Number).filter((d) => d >= 0 && d <= 6) : [];
  const days = planDays.length > 0
    ? planDays
    : (Array.isArray(body.trainingDays) && body.trainingDays.length > 0 ? body.trainingDays : DEFAULT_DAY_MAP[2]);

  const { INTENSITY } = await import("../season/training");
  const intensityOf = (day: number): "light" | "normal" | "hard" => {
    const v = body.trainingPlan?.[String(day)] as unknown;
    if (v && typeof v === "object") {
      const i = (v as { intensity?: string }).intensity;
      if (i === "light" || i === "hard") return i;
    }
    return "normal";
  };
  // Zátěž pro spokojenost hráčů váží intenzitu; růst se násobí průměrnou intenzitou dnů.
  const load = planDays.length > 0
    ? planDays.reduce((sum, d) => sum + INTENSITY[intensityOf(d)].load, 0)
    : days.length;
  const growthMul = planDays.length > 0
    ? planDays.reduce((sum, d) => sum + INTENSITY[intensityOf(d)].growth, 0) / planDays.length
    : 1;

  const team = await c.env.DB.prepare(
    "SELECT t.id, t.game_date, v.size AS village_size FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(teamId).first<{ village_size: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "training-preview team", e); return null; });
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  // Životní situace (spec 17b): stejné modifikátory docházky jako reálný trénink.
  const { nactiDruhyHracu } = await import("../incidents/absence-hracu");
  const { TRENINK_SITUACE } = await import("../incidents/nastaveni");
  const druhySituaci = await nactiDruhyHracu(c.env.DB, teamId, team.game_date ?? new Date().toISOString());

  const playersRes = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, age, position, overall_rating, skills, personality, life_context
       FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
         AND id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)`,
  ).bind(teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "training-preview players", e); return { results: [] as Record<string, unknown>[] }; });

  const mgr = await c.env.DB.prepare("SELECT coaching, youth_development, discipline FROM managers WHERE team_id = ?")
    .bind(teamId).first<{ coaching: number; youth_development: number; discipline: number }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "training-preview manager", e); return null; });

  const { TRAINING_EFFECTS, BASE_IMPROVE_CHANCE, ageGrowthMod, diminishingMod, idealTrainingLoad, loadVerdict } =
    await import("../season/training");

  // Zaměstnanci a vybavení do tréninku mluví — bez nich by predikce podstřelovala.
  const staffRows = await c.env.DB.prepare(
    `SELECT id, role, first_name, last_name, avatar, coaching, medicine, maintenance, judgement,
            communication, work_rate, charm
       FROM staff_members WHERE team_id = ?`,
  ).bind(teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "training-preview staff", e); return { results: [] as Record<string, unknown>[] }; });

  const equipRow = await c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?")
    .bind(teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "training-preview equipment", e); return null; });

  const { calculateStaffEffects } = await import("../staff/staff-effects");
  const staffFx = calculateStaffEffects(staffRows.results as never);

  let equipMul = 1, equipAttend = 0, equipYouth = 0;
  const equipParts: Array<{ label: string; detail: string }> = [];
  if (equipRow) {
    const { calculateEffects } = await import("../equipment/equipment-generator");
    const levels: Record<string, number> = {};
    const conditions: Record<string, number> = {};
    for (const [k, v] of Object.entries(equipRow)) {
      if (k.endsWith("_condition")) conditions[k] = v as number;
      else if (typeof v === "number" && k !== "id") levels[k] = v;
    }
    const eff = calculateEffects(levels, conditions);
    equipMul = eff.trainingMultiplier * (body.type === "tactics" ? 1 + eff.tacticsTrainingBonus : 1);
    equipAttend = eff.attendanceBonus;
    equipYouth = eff.youthTrainingMod;

    // Rozepsat po konkrétních kusech vybavení, ne jedním souhrnem — ať je vidět, co přesně
    // pomáhá a co si zaslouží investici. Váhy drží sync s calculateEffects.
    const { CATEGORY_LABELS } = await import("../equipment/equipment-generator");
    const itemEffect = (key: string, perLevel: number, suffix: string) => {
      const lvl = levels[key] ?? 0;
      if (lvl <= 0) return;
      const cond = (conditions[`${key}_condition`] ?? 100) / 100;
      const pct = Math.round(lvl * perLevel * cond * 100);
      if (pct > 0) equipParts.push({ label: CATEGORY_LABELS[key] ?? key, detail: `+${pct} % ${suffix}` });
    };
    itemEffect("balls", 0.05, "k růstu");
    itemEffect("training_cones", 0.07, "k růstu");
    if (body.type === "tactics") {
      itemEffect("bibs", 0.05, "k taktice");
      itemEffect("tactics_board", 0.06, "k taktice");
    }
    itemEffect("team_van", 0.02, "docházka");
    itemEffect("video_setup", 0.05, "pro hráče do 22 let");
  }

  // Kdo z personálu na trénink reálně působí (a jak)
  const STAFF_TRAINING_ROLES: Record<string, (fx: typeof staffFx) => string | null> = {
    asistent: (fx) => fx.trainingMultiplier > 1 ? `+${Math.round((fx.trainingMultiplier - 1) * 100)} % k růstu, +${Math.round(fx.trainingAttendanceBonus * 100)} % docházka` : null,
    trener_mladeze: (fx) => fx.youthTrainingMod > 0 ? `+${Math.round(fx.youthTrainingMod * 100)} % pro hráče do 22 let` : null,
    trener_brankaru: (fx) => fx.gkTrainingMul > 1 ? `+${Math.round((fx.gkTrainingMul - 1) * 100)} % pro brankáře` : null,
    kondicni_trener: (fx) => fx.conditionDrainReduction > 0 ? `−${Math.round(fx.conditionDrainReduction * 100)} % únavy z tréninku` : null,
  };
  const staffImpact = staffRows.results
    .map((r) => {
      const role = r.role as string;
      const describe = STAFF_TRAINING_ROLES[role];
      const detail = describe ? describe(staffFx) : null;
      if (!detail) return null;
      const ROLE_LABELS: Record<string, string> = {
        asistent: "Asistent trenéra", trener_mladeze: "Trenér mládeže",
        trener_brankaru: "Trenér brankářů", kondicni_trener: "Kondiční trenér",
      };
      return {
        staffId: r.id as string,
        name: `${r.first_name} ${r.last_name}`,
        role: ROLE_LABELS[role] ?? role,
        avatar: (r.avatar as string) ?? null,
        detail,
      };
    })
    .filter(Boolean);

  const coachMod = 0.8 + ((mgr?.coaching ?? 40) / 100) * 0.8;
  const youthDev = mgr?.youth_development ?? 40;
  const discipline = mgr?.discipline ?? 40;
  // Docházka podle stejného vzorce jako simulace (disciplína hráče + přístup trenéra).
  const approachAttend = body.approach === "strict" ? 0.08 : body.approach === "relaxed" ? -0.08 : 0;

  let expectedPerWeek = 0;
  let overloaded = 0, underused = 0, content = 0;
  const strain: Array<{ playerId: string; name: string; verdict: string }> = [];

  for (const row of playersRes.results) {
    const skills = JSON.parse((row.skills as string) || "{}");
    const personality = JSON.parse((row.personality as string) || "{}");
    const life = JSON.parse((row.life_context as string) || "{}");
    const age = row.age as number;
    const condition = life.condition ?? 100;
    const p = { workRate: personality.workRate ?? 50, age, condition };

    // Průměrná úroveň atributů, které daný typ tréninku rozvíjí → klesající výnosy
    const attrs = (TRAINING_EFFECTS as Record<string, string[]>)[body.type] ?? [];
    const vals = attrs.map((a) => (skills[a] as number) ?? 40).filter((v) => typeof v === "number");
    const avgAttr = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 40;

    const youthMod = age < 22
      ? (0.9 + (youthDev / 100) * 0.6) * (1 + equipYouth + staffFx.youthTrainingMod)
      : 1.0;
    const gkMul = (row.position as string) === "GK" ? staffFx.gkTrainingMul : 1;
    const situacniMod = (druhySituaci.get(row.id as string) ?? [])
      .reduce((s, kind) => s + (TRENINK_SITUACE[kind] ?? 0), 0);
    const attendProb = Math.max(0.05, Math.min(0.98,
      (personality.discipline ?? 50) / 100 * 0.6 + 0.3 + approachAttend + ((discipline - 40) / 100) * 0.2
      + equipAttend + staffFx.trainingAttendanceBonus + situacniMod));

    const chance = BASE_IMPROVE_CHANCE * equipMul * staffFx.trainingMultiplier
      * diminishingMod(avgAttr) * ageGrowthMod(age) * coachMod * youthMod * gkMul;
    expectedPerWeek += chance * growthMul * attendProb * days.length;

    const verdict = loadVerdict(p, load) as string;
    if (verdict === "pretizeny") { overloaded++; strain.push({ playerId: row.id as string, name: `${row.first_name} ${row.last_name}`, verdict }); }
    else if (verdict === "nevytizeny") { underused++; strain.push({ playerId: row.id as string, name: `${row.first_name} ${row.last_name}`, verdict }); }
    else if (verdict === "spokojeny") content++;
  }

  const { calculateTrainingCost, mapVillageSize } = await import("../season/economy").then(async (m) => ({
    calculateTrainingCost: m.calculateTrainingCost,
    mapVillageSize: (await import("../season/finance-processor")).mapVillageSize,
  }));
  const category = mapVillageSize(team.village_size ?? "village");
  const monthlyCost = calculateTrainingCost(days.length, category);

  // Hlavní trenér — jeho koučink násobí růst (×0,8 až ×1,6), takže patří na první místo rozpisu.
  const mgrRow = await c.env.DB.prepare("SELECT name, avatar FROM managers WHERE team_id = ?")
    .bind(teamId).first<{ name: string; avatar: string | null }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "training-preview manager row", e); return null; });
  const coachPct = Math.round((coachMod - 1) * 100);
  const managerImpact = mgrRow ? {
    name: mgrRow.name,
    avatar: mgrRow.avatar,
    role: "Hlavní trenér",
    detail: `${coachPct >= 0 ? "+" : ""}${coachPct} % k růstu (koučink ${mgr?.coaching ?? 40})`,
    youthDetail: (mgr?.youth_development ?? 40) >= 55 ? `+ práce s mládeží ${mgr?.youth_development}` : null,
  } : null;

  return c.json({
    daysPerWeek: days.length,
    weeklyLoad: Math.round(load * 10) / 10,
    managerImpact,
    squadSize: playersRes.results.length,
    expectedImprovementsPerWeek: Math.round(expectedPerWeek * 10) / 10,
    expectedImprovementsPerMonth: Math.round(expectedPerWeek * 4.3 * 10) / 10,
    monthlyCost,
    load: { overloaded, underused, content },
    strain: strain.slice(0, 6),
    staffImpact,
    equipmentImpact: equipParts,
  });
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
  // GET middleware nehlídá vlastníka — rozpočet (mzdy, sponzoři, splátky přestupů) je jen pro vlastní klub.
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const { mapVillageSize, countRemainingMatchDays, PLACENY_HRAC_SQL } = await import("../season/finance-processor");

  // Batch: team info + wages + sponsors + top wages in single round-trip
  const [teamResult, wageResult, sponsorContracts, topWages] = await c.env.DB.batch([
    c.env.DB.prepare(
      "SELECT t.*, v.name as village_name, v.size, v.population, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId),
    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(weekly_wage), 0) as weekly_total FROM players WHERE team_id = ? AND ${PLACENY_HRAC_SQL}`
    ).bind(teamId),
    c.env.DB.prepare(
      "SELECT sponsor_name, sponsor_type, monthly_amount, win_bonus FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
    ).bind(teamId),
    c.env.DB.prepare(
      `SELECT id, first_name, last_name, position, overall_rating, weekly_wage FROM players WHERE team_id = ? AND ${PLACENY_HRAC_SQL} ORDER BY weekly_wage DESC LIMIT 5`
    ).bind(teamId),
  ]);

  const team = teamResult.results[0] as Record<string, unknown> | undefined;
  if (!team) return c.json({ error: "Team not found" }, 404);

  const category = mapVillageSize(team.size as string);

  const wageRow = wageResult.results[0] as { cnt: number; weekly_total: number } | undefined;
  const playerCount = wageRow?.cnt ?? 0;
  const weeklyWages = wageRow?.weekly_total ?? 0;

  // Jen REÁLNÉ smlouvy — dřív se bez podepsané smlouvy fabrikovali sponzoři přes
  // generateSponsors() a jejich fiktivní příjem šel do celé prognózy, i když finance
  // processor nikdy nic nepřipsal. Bez smlouvy = 0 Kč, ať přehled nelže.
  const sponsors = (sponsorContracts.results as Record<string, unknown>[]).map((s) => ({
    name: s.sponsor_name as string,
    type: s.sponsor_type as string,
    monthlyAmount: s.monthly_amount as number,
    winBonus: s.win_bonus as number,
  }));

  const reputation = (team.reputation as number) ?? 50;
  const WEEKS_PER_SEASON = 16;

  // All amounts calculated as WEEKLY (= per 7 game days) — zrcadlí processWeeklyFinances.
  // Příjmy počítá jedna funkce i pro strop splátek přestupů, ať se čísla nerozejdou.
  const { weeklyIncomeOf } = await import("../season/weekly-income");
  const income = await weeklyIncomeOf(c.env.DB, teamId);
  const weeklySponsorIncome = income.sponsors;
  const weeklyBaseSponsor = income.baseSponsor;
  const weeklySubsidy = income.subsidy;
  const weeklyContributions = income.contributions;
  const weeklyIncome = income.total;

  // Expense sources (weekly)
  const maintenanceCosts: Record<string, number> = { vesnice: 115, obec: 230, mestys: 465, mesto: 700 };
  const weeklyMaintenance = maintenanceCosts[category] ?? 230;
  const weeklyEquipment = 115; // ~500/4.3
  const trainingPerSession: Record<string, number> = { vesnice: 200, obec: 400, mestys: 600, mesto: 1000 };
  const sessionsPerWeek = (team.training_sessions as number) ?? 2;
  const weeklyTraining = (trainingPerSession[category] ?? 400) * sessionsPerWeek;
  // Mzdy zaměstnanců — reálný týdenní výdaj (finance-processor je strhává), dřív v prognóze chyběly
  const staffWageRow = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(weekly_wage), 0) as total FROM staff_members WHERE team_id = ?"
  ).bind(teamId).first<{ total: number }>().catch((e) => { logger.warn({ module: "game" }, "load staff wages for budget", e); return null; });
  const weeklyStaffWages = staffWageRow?.total ?? 0;

  const weeklyExpenses = weeklyWages + weeklyStaffWages + weeklyMaintenance + weeklyEquipment + weeklyTraining;
  const weeklyNet = weeklyIncome - weeklyExpenses;

  // Active cash loan + remaining match days
  const activeLoan = await c.env.DB.prepare(
    "SELECT id, principal, total_to_repay, remaining, total_installments, installments_paid, per_match_installment, status FROM cash_loans WHERE team_id = ? AND status = 'active' LIMIT 1"
  ).bind(teamId).first<{
    id: string; principal: number; total_to_repay: number; remaining: number;
    total_installments: number; installments_paid: number; per_match_installment: number; status: string;
  }>().catch((e) => { logger.warn({ module: "game" }, "load active cash loan", e); return null; });

  const remainingInfo = await countRemainingMatchDays(c.env.DB, teamId);

  // Přesný forecast: načteme datumy zbývajících ligových zápasů a pro každý
  // příští týden spočítáme kolik splátek do té doby proběhne.
  const matchDatesRows = remainingInfo.seasonId
    ? await c.env.DB.prepare(
        `SELECT sc.scheduled_at FROM matches m
         JOIN season_calendar sc ON m.calendar_id = sc.id
         JOIN leagues l ON sc.league_id = l.id
         WHERE l.season_id = ?
           AND (m.home_team_id = ? OR m.away_team_id = ?)
           AND m.status = 'scheduled'
         ORDER BY sc.scheduled_at`
      ).bind(remainingInfo.seasonId, teamId, teamId).all<{ scheduled_at: string }>()
        .catch((e) => { logger.warn({ module: "game" }, "load scheduled match dates", e); return { results: [] as { scheduled_at: string }[] }; })
    : { results: [] as { scheduled_at: string }[] };

  const matchTimestamps = (matchDatesRows.results ?? [])
    .map((r) => new Date(r.scheduled_at).getTime())
    .filter((t) => !Number.isNaN(t));

  const perMatchInstallment = activeLoan?.per_match_installment ?? 0;
  const installmentsRemaining = activeLoan
    ? activeLoan.total_installments - activeLoan.installments_paid
    : 0;
  const loanRemaining = activeLoan?.remaining ?? 0;

  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Vrátí kumulovanou částku splacenou po uplynutí N týdnů.
  const loanDrainAfterWeeks = (weeks: number): number => {
    if (installmentsRemaining <= 0 || perMatchInstallment <= 0) return 0;
    const cutoff = now + weeks * WEEK_MS;
    const matchesPlayedBy = matchTimestamps.filter((t) => t <= cutoff).length;
    const installments = Math.min(installmentsRemaining, matchesPlayedBy);
    // Poslední splátka dorovnává zbytek (kvůli ceil zaokrouhlení při uzavření)
    if (installments >= installmentsRemaining) return loanRemaining;
    return installments * perMatchInstallment;
  };

  // Splátky přestupů: každé pondělí jedna splátka každé aktivní dohody (kupující platí, prodávající dostává).
  const instDeals = await c.env.DB.prepare(
    `SELECT buyer_team_id, installment_amount, installments_total, installments_paid, remaining
       FROM transfer_installments WHERE status = 'active' AND (buyer_team_id = ? OR seller_team_id = ?)`,
  ).bind(teamId, teamId).all<{ buyer_team_id: string; installment_amount: number; installments_total: number; installments_paid: number; remaining: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "load transfer installments for budget", e); return { results: [] as never[] }; });
  const instAfterWeeks = (d: { installment_amount: number; installments_total: number; installments_paid: number; remaining: number }, weeks: number) => {
    const left = d.installments_total - d.installments_paid;
    const k = Math.min(weeks, left);
    return k >= left ? d.remaining : k * d.installment_amount;
  };
  const transferInstallmentsAfterWeeks = (weeks: number) => instDeals.results.reduce(
    (sum, d) => sum + (d.buyer_team_id === teamId ? -1 : 1) * instAfterWeeks(d, weeks), 0);
  const nextTransferInstallmentsOut = instDeals.results.filter((d) => d.buyer_team_id === teamId).reduce((s2, d) => s2 + instAfterWeeks(d, 1), 0);
  const nextTransferInstallmentsIn = instDeals.results.filter((d) => d.buyer_team_id !== teamId).reduce((s2, d) => s2 + instAfterWeeks(d, 1), 0);

  // Forecast series: 17 bodů (dnes + 16 týdnů)
  const forecastSeries = Array.from({ length: WEEKS_PER_SEASON + 1 }, (_, w) => ({
    week: w,
    budget: (team.budget as number) + weeklyNet * w - loanDrainAfterWeeks(w) + transferInstallmentsAfterWeeks(w),
  }));

  const in4Weeks = forecastSeries[4]?.budget ?? (team.budget as number);
  const inSeason = forecastSeries[WEEKS_PER_SEASON]?.budget ?? (team.budget as number);

  // Bankrot: první týden kde budget < 0
  const bankruptIdx = forecastSeries.findIndex((p, i) => i > 0 && p.budget < 0);
  const weeksUntilBankrupt = bankruptIdx > 0 ? bankruptIdx : null;

  // Reálný průměrný "loanRepayment / týden" pro zobrazení v UI
  const weeklyLoanRepayment = installmentsRemaining > 0 && matchTimestamps.length > 0
    ? Math.round(loanRemaining / Math.max(1, Math.ceil(
        (matchTimestamps[Math.min(matchTimestamps.length, installmentsRemaining) - 1] - now) / WEEK_MS
      )))
    : 0;
  const effectiveWeeklyNet = weeklyNet - weeklyLoanRepayment - nextTransferInstallmentsOut + nextTransferInstallmentsIn;

  return c.json({
    budget: team.budget,
    // Týdně tolik, kolik sponzor opravdu vyplácí (s násobitelem výplaty), ať řádky smluv
    // sedí se souhrnem sponzorských smluv výš.
    sponsors: sponsors.map((s) => ({ ...s, weeklyAmount: sponsorWeeklyPayout(s.monthlyAmount) })),
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
        // Splátky za prodané hráče, které přijdou příští pondělí (v `total` nejsou, jako půjčka).
        transferInstallments: nextTransferInstallmentsIn,
        total: weeklyIncome,
      },
      expenses: {
        wages: weeklyWages, staffWages: weeklyStaffWages, maintenance: weeklyMaintenance,
        equipment: weeklyEquipment, training: weeklyTraining,
        loanRepayment: weeklyLoanRepayment,
        // Splátky za koupené hráče příští pondělí (v `total` nejsou, jako půjčka).
        transferInstallments: nextTransferInstallmentsOut,
        total: weeklyExpenses,
      },
      net: weeklyNet,
      netWithLoan: effectiveWeeklyNet,
    },
    forecast: {
      weeklyNet: effectiveWeeklyNet,
      weeksUntilBankrupt,
      in4Weeks,
      inSeason,
      series: forecastSeries,
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

  const { PLACENY_HRAC_SQL } = await import("../season/finance-processor");
  const result = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, position, overall_rating, weekly_wage, age FROM players WHERE team_id = ? AND ${PLACENY_HRAC_SQL} ORDER BY weekly_wage DESC`
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

// GET /api/teams/:id/seasonal-events — all seasonal events (pending = with choices, resolved = past)
gameRouter.get("/teams/:teamId/seasonal-events", async (c) => {
  const teamId = c.req.param("teamId");

  // Get events from DB
  const team = await c.env.DB.prepare("SELECT t.league_id, v.district FROM teams t JOIN villages v ON t.village_id=v.id WHERE t.id = ?").bind(teamId).first<{ league_id: string; district: string }>();
  if (!team?.league_id) return c.json({ events: [] });

  const seasonNum = await activeSeasonNumber(c.env.DB);
  const seasonStr = String(seasonNum);

  // Batch: seasonal events (AKTUÁLNÍ sezóny) + current game week (AKTUÁLNÍ sezóny)
  const [dbEventsRes, lastCalRes, seededRes] = await c.env.DB.batch([
    // hospoda_action je jen cooldown marker ve stejné tabulce — do Událostí nepatří.
    c.env.DB.prepare("SELECT * FROM seasonal_events WHERE team_id = ? AND season = ? AND type != 'hospoda_action' ORDER BY game_week").bind(teamId, seasonStr),
    c.env.DB.prepare("SELECT MAX(game_week) as gw FROM season_calendar WHERE league_id = ? AND status = 'simulated' AND season_number = ?").bind(team.league_id, seasonNum),
    // Má tým už vygenerovanou ŠABLONOVOU sadu? Pozná se podle deterministického id.
    // Nestačí "existuje jakýkoli řádek": ad-hoc událost po simulaci kola nebo návštěva
    // hospody by generaci navždy umlčely a tým by sezónní akce nikdy nedostal.
    c.env.DB.prepare("SELECT 1 FROM seasonal_events WHERE team_id = ? AND season = ? AND id LIKE ? LIMIT 1").bind(teamId, seasonStr, `se-${teamId}-s${seasonStr}-%`),
  ]);
  const dbEvents = { results: dbEventsRes.results };
  const currentGameWeek = (lastCalRes.results[0] as { gw: number | null } | undefined)?.gw ?? 0;
  const hasTemplateSet = (seededRes.results?.length ?? 0) > 0;

  if (hasTemplateSet) {
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

  // Tým ještě události nemá — vygenerovat mu VLASTNÍ sadu ze šablon.
  // Dřív byly vázané jen na ligu, takže je spotřeboval první tým, který klikl,
  // a zbylých 13 dostalo 400 "Already resolved".
  // Šablony na týden nezávisí na rng (getSeasonalEventsForWeek jen filtruje podle týdne),
  // takže tu žádný seed nepotřebujeme.
  const allEvents: Array<SeasonalEventDef & { id: string; status: string }> = [];
  const seedStmts: D1PreparedStatement[] = [];

  for (let week = 0; week <= 30; week++) {
    const weekEvents = getSeasonalEventsForWeek(week, team.district);
    for (let idx = 0; idx < weekEvents.length; idx++) {
      const ev = weekEvents[idx];
      // Deterministické id (tým+sezóna+týden+index) + INSERT OR IGNORE → dvě souběžná první načtení
      // (obě vidí prázdno) nevloží duplicity.
      const id = `se-${teamId}-s${seasonStr}-w${week}-${idx}`;
      // Status je vždy 'pending'. Události bez voleb vyřeší automaticky denní tick — dřív
      // dostávaly 'active' a jejich efekty se nikdy neaplikovaly, přestože je UI slibovalo.
      seedStmts.push(c.env.DB.prepare(
        "INSERT OR IGNORE INTO seasonal_events (id, team_id, league_id, type, title, description, effects, choices, season, game_week, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
      ).bind(id, teamId, team.league_id, ev.type, ev.title, ev.description,
        JSON.stringify(ev.effects), ev.choices ? JSON.stringify(ev.choices) : null,
        seasonStr, ev.gameWeek,
      ));

      allEvents.push({ ...ev, id, status: "pending" });
    }
  }

  // Jeden batch místo 30+ sekvenčních zápisů — po přechodu na per-tým generaci
  // tímhle prochází každý tým zvlášť, ne jen jeden za ligu.
  if (seedStmts.length > 0) {
    await c.env.DB.batch(seedStmts)
      .catch((e) => logger.warn({ module: "game" }, "seed seasonal events", e));
  }

  // K nově vygenerovaným přidat i to, co už tým měl (ad-hoc události po simulaci kola),
  // ať se první otevření stránky neliší od dalších.
  const existing = (dbEvents.results as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    description: row.description as string,
    effects: JSON.parse(row.effects as string),
    choices: row.choices ? JSON.parse(row.choices as string) : null,
    gameWeek: row.game_week as number,
    status: row.status as string,
  }));

  const seeded = allEvents.map((ev) => ({
    id: ev.id, type: ev.type, title: ev.title, description: ev.description,
    effects: ev.effects, choices: ev.choices ?? null,
    gameWeek: ev.gameWeek, status: ev.status,
  }));

  return c.json({
    events: [...existing, ...seeded].sort((a, b) => a.gameWeek - b.gameWeek),
    currentGameWeek,
  });
});

// POST /api/teams/:id/seasonal-events/:eventId/choose — make a choice
gameRouter.post("/teams/:teamId/seasonal-events/:eventId/choose", async (c) => {
  const teamId = c.req.param("teamId");
  const eventId = c.req.param("eventId");
  const body = await c.req.json<{ choiceId: string }>();

  // Filtr na team_id je druhý zámek vedle requireTeamOwnership — událost patří jednomu týmu.
  const event = await c.env.DB.prepare("SELECT * FROM seasonal_events WHERE id = ? AND team_id = ?")
    .bind(eventId, teamId).first<Record<string, unknown>>();
  if (!event) return c.json({ error: "Událost nenalezena" }, 404);
  if (event.status !== "pending") return c.json({ error: "Už je vyřešená" }, 400);

  const choices = JSON.parse(event.choices as string) as Array<{ id: string; label?: string; effects: Array<{ type: string; value: number }> }>;
  const choice = choices.find((ch) => ch.id === body.choiceId);
  if (!choice) return c.json({ error: "Invalid choice" }, 400);

  // Atomický claim — zabraňuje double-apply při souběžných requestech.
  // WHERE status = 'pending' zajistí že jen první request proběhne.
  const claimed = await c.env.DB.prepare(
    "UPDATE seasonal_events SET status = 'resolved' WHERE id = ? AND team_id = ? AND status = 'pending'"
  ).bind(eventId, teamId).run().catch((e) => { logger.warn({ module: "game" }, "claim seasonal event", e); return { meta: { changes: 0 } }; });
  if (claimed.meta.changes === 0) return c.json({ error: "Už je vyřešená" }, 400);

  // Aplikace efektů je sdílená s automatickým resolverem v denním ticku
  // (události bez voleb) — viz season/event-effects.ts.
  const { applyEventEffects } = await import("../season/event-effects");
  // Volby mají `label` (season/seasonal-events.ts). Čtení `text` vracelo vždy undefined,
  // takže se v transakcích i reputaci psal jen název události bez zvolené možnosti.
  const choiceLabel = String(choice.label ?? event.title ?? "efekt");
  // Herní datum — reputační log i transakce se porovnávají v herním čase.
  const eventTeamDate = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "game" }, "load game date for event effects", e); return null; });
  await applyEventEffects(
    c.env.DB, teamId, choice.effects, choiceLabel,
    eventTeamDate?.game_date ?? new Date().toISOString(), `sev-${eventId}`,
  );

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
    "SELECT created_at FROM seasonal_events WHERE team_id = ? AND type = 'hospoda_action' ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId).first<{ created_at: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  if (lastVisit) {
    const lastDate = new Date(lastVisit.created_at).getTime();
    const gameDate = new Date(team.game_date).getTime();
    const daysDiff = (gameDate - lastDate) / (1000 * 60 * 60 * 24);
    if (daysDiff < 2) {
      return c.json({ error: "Hospoda je dostupná jednou za 2 dny", cooldown: true }, 400);
    }
  }

  const gameDate = team.game_date.slice(0, 10); // YYYY-MM-DD

  if (body.choice === "no") {
    // Trenér zakázal hospodu — žádná pub_session, jen morale penalty.
    await c.env.DB.prepare(
      "UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, MAX(0, json_extract(life_context, '$.morale') - 3))) WHERE team_id = ?",
    ).bind(teamId).run().catch((e) => logger.warn({ module: "game" }, "apply no-pub morale penalty", e));
  } else {
    // "all" / "one" — vytvoř coach-led pub_session (effects přes incident.effects, condition_log, hangover...)
    const { createCoachLedSession } = await import("../season/pub");
    const result = await createCoachLedSession(c.env.DB, teamId, gameDate, body.choice);
    if (!result.ok) return c.json({ error: result.reason }, 400);

    // Cost (mimo session — peněženka týmu)
    const cost = body.choice === "all" ? -1500 : -500;
    await recordTransaction(c.env.DB, teamId, "event", cost, "Hospoda", team.game_date)
      .catch((e) => logger.warn({ module: "game" }, "record pub cost", e));
  }

  // Cooldown event — vázaný na TÝM. Dřív se ukládal jen s league_id a četl se stejně,
  // takže jeden tým v hospodě zablokoval celou ligu na dva herní dny.
  await c.env.DB.prepare(
    "INSERT INTO seasonal_events (id, team_id, league_id, type, title, description, effects, season, game_week, status, created_at) VALUES (?, ?, (SELECT league_id FROM teams WHERE id = ?), 'hospoda_action', 'Posezení v hospodě', ?, '[]', ?, 0, 'resolved', ?)",
  ).bind(crypto.randomUUID(), teamId, teamId,
    body.choice === "all" ? "Celý tým šel do hospody" : body.choice === "one" ? "Jen jedno pivo" : "Trenér zakázal hospodu",
    String(await activeSeasonNumber(c.env.DB)),
    team.game_date,
  ).run().catch((e) => logger.warn({ module: "game" }, "record pub cooldown event", e));

  return c.json({ ok: true, choice: body.choice });
});

// GET /api/teams/:id/pub-status — cooldown check
gameRouter.get("/teams/:teamId/pub-status", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>();
  if (!team) return c.json({ available: false });

  const lastVisit = await c.env.DB.prepare(
    "SELECT created_at FROM seasonal_events WHERE team_id = ? AND type = 'hospoda_action' ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId).first<{ created_at: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  if (!lastVisit) return c.json({ available: true });

  const daysDiff = (new Date(team.game_date).getTime() - new Date(lastVisit.created_at).getTime()) / (1000 * 60 * 60 * 24);
  return c.json({ available: daysDiff >= 2, daysLeft: Math.max(0, Math.ceil(2 - daysDiff)) });
});

// GET /api/teams/:id/news — obecní zpravodaj / news feed
//
// Odznak s počtem nepřečtených článků tady byl a je pryč. Vymyslel jsem si ho
// jako náhradu za rozesílání SMS „vyšel článek", ale nikdo o něj nestál:
// zpravodaj je čtení na kdykoliv, ne úkol, který má v menu svítit číslem.
// Sloupec `teams.news_seen_at` v databázi zůstává, nikdo ho nečte.

gameRouter.get("/teams/:teamId/news", async (c) => {
  const teamId = c.req.param("teamId");

  // Batch: team info + recent matches.
  // Jen soutěžní zápasy (`calendar_id IS NOT NULL`) — přátelák do okresního plátku
  // nepatří. Bez toho se čerstvě odehraná příprava stala úvodníkem Zpravodaje.
  const [teamRes, matchesRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT t.name, t.league_id, t.reputation FROM teams t WHERE t.id = ?").bind(teamId),
    c.env.DB.prepare(`SELECT m.id, m.home_score, m.away_score, m.simulated_at, m.round,
       ht.name as home_name, at.name as away_name,
       m.home_team_id, m.away_team_id
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
       AND m.calendar_id IS NOT NULL
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
      body: `${m.round ? m.round + ". kolo " : ""}${isHome ? "Domácí zápas" : "Venku"}. ${won ? "Fanoušci slaví!" : drew ? "Spravedlivá dělba bodů." : "Příště to bude lepší."}`,
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
    const { loadFeedArticles, newsIcon } = await import("../news/feed");
    const newsRows = await loadFeedArticles(c.env.DB, team.league_id, teamId)
      .catch((e) => { logger.warn({ module: "game" }, "fetch news articles", e); return []; });

    for (const n of newsRows) {
      articles.push({
        id: n.id,
        type: n.type,
        headline: n.headline,
        body: n.body,
        icon: newsIcon(n.type),
        journalist: n.journalist_id ? {
          id: n.journalist_id,
          name: n.journalist_nick
            ? `${n.journalist_first} „${n.journalist_nick}" ${n.journalist_last}`
            : `${n.journalist_first} ${n.journalist_last}`,
          style: n.journalist_style,
        } : undefined,
        date: n.created_at,
        gameWeek: n.game_week,
        teamId: n.team_id,
        photos: n.photos_json ? JSON.parse(n.photos_json) : undefined,
      } as any);
    }
  }

  // Sort by date
  articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Hlavička novin uvádí sezónu — bez toho by tam navždy svítila „Sezóna 1".
  const seasonRow = team.league_id
    ? await c.env.DB.prepare("SELECT MAX(season_number) as s FROM season_calendar WHERE league_id = ?")
        .bind(team.league_id).first<{ s: number | null }>()
        .catch((e) => { logger.warn({ module: "game" }, "fetch season for news", e); return null; })
    : null;

  return c.json({ articles, season: seasonRow?.s ?? 1 });
});

// GET /api/teams/:id/transfers — generate transfer offers + departure risks
gameRouter.get("/teams/:teamId/transfers", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.name as village_name, v.size, v.population, v.region as region_code, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
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
      injuryProneness: injuryPronenessOf(physical, personality), discipline: personality.discipline,
      patriotism: personality.patriotism, alcohol: personality.alcohol,
      temper: personality.temper, occupation: lifeContext.occupation,
      bodyType: isBodyType(physical.bodyType) ? physical.bodyType : "normal", avatarConfig: {} as any,
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
  const { teamSeed } = await import("../lib/seed");
  const rng = createRng(teamSeed(teamId, weekSeed, "transfers"));

  // `team.size` je velikost z DB (hamlet…city), ne kategorie — dřív se předávala syrová
  // a generátor z ní nenašel kvalitu, takže dovednosti vyšly NaN.
  const { categoryFromVillageSize } = await import("../generators/create-player");
  const villageInfo = {
    region_code: team.region_code as string,
    category: categoryFromVillageSize(team.size as string),
    population: team.population as number,
  };

  // Jména jako všude jinde: příjmení z okresu, křestní podle skutečných četností v ČR.
  const { FIRSTNAMES } = await import("../data/czech-names");
  const { getDistrictDataFromDB } = await import("../data/districts/index");
  const districtData = await getDistrictDataFromDB(c.env.DB, team.district as string);
  const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

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
  const { getUpgradeOptions, getRepairOptions, getLevelDescription, calculateEffects, getSellOptions, CATEGORIES, CATEGORY_LABELS } = await import("../equipment/equipment-generator");
  const { ensureEquipmentRow } = await import("../equipment/equipment-service");

  const equip = await ensureEquipmentRow(c.env.DB, teamId);
  if (!equip) return c.json({ error: "Failed to create equipment" }, 500);

  // Batch: team reputation + matches played + active season + moje inzeráty v bazaru
  const [teamRes, matchCountRes, seasonRes, listingsRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' LIMIT 1"),
    c.env.DB.prepare("SELECT id, category, level, price, expires_at FROM equipment_listings WHERE team_id = ? AND status = 'active'").bind(teamId),
  ]);
  const team = teamRes.results[0] as { reputation: number } | undefined;
  const matchCount = matchCountRes.results[0] as { cnt: number } | undefined;
  const seasonNum = mustSeason((seasonRes.results[0] as { number: number } | undefined)?.number);
  const activeListings = (listingsRes.results ?? []) as Array<{ id: string; category: string; level: number; price: number; expires_at: string }>;
  const listingByCategory = new Map(activeListings.map((l) => [l.category, l]));

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

  // Co můžu prodat — čistý výpočet z už načtených hodnot, žádný dotaz navíc.
  const sellOptions = getSellOptions(levels, conditions).map((opt) => {
    const listing = listingByCategory.get(opt.category);
    return {
      ...opt,
      listingId: listing?.id ?? null,
      listedPrice: listing?.price ?? null,
      listedUntil: listing?.expires_at ?? null,
    };
  });

  // Ozvučení spadá pod společný strop zázemí. Nabídka řekne, kolik spokojenosti
  // tomuhle klubu opravdu přidá, a když nic, tak dřív, než zaplatí.
  const { loadAmenityInput, withEquipmentAmenity } = await import("../season/amenity-outlook");
  const amenityInput = await loadAmenityInput(c.env.DB, teamId);

  return c.json({
    categories,
    upgrades: withEquipmentAmenity(
      getUpgradeOptions(levels, team?.reputation ?? 0, matchCount?.cnt ?? 0, seasonNum),
      levels, conditions, amenityInput,
    ),
    repairs: getRepairOptions(levels, conditions),
    effects,
    sellOptions,
  });
});

// POST /api/teams/:id/equipment/upgrade (pravidla v services/equipment.ts, sdílí je AI trenér)
gameRouter.post("/teams/:teamId/equipment/upgrade", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category: string }>();
  const res = await upgradeEquipment(c.env.DB, teamId, body.category);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, cost: res.cost, newLevel: res.newLevel });
});

// POST /api/teams/:id/equipment/repair
gameRouter.post("/teams/:teamId/equipment/repair", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category: string }>();
  const res = await repairEquipment(c.env.DB, teamId, body.category);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, cost: res.cost });
});

// GET /api/teams/:id/stadium — get stadium info (auto-create if missing)
gameRouter.get("/teams/:teamId/stadium", async (c) => {
  const teamId = c.req.param("teamId");

  const { ensureStadiumRow } = await import("../stadium/stadium-service");
  const stadium = await ensureStadiumRow(c.env.DB, teamId);
  if (!stadium) return c.json({ error: "Team not found" }, 404);

  // Get upgrade options with unlock logic
  const { getUpgradeOptions } = await import("../stadium/stadium-generator");
  const facilities: Record<string, number> = {
    changing_rooms: stadium.changing_rooms as number ?? 0,
    showers: stadium.showers as number ?? 0,
    refreshments: stadium.refreshments as number ?? 0,
    lighting: stadium.lighting as number ?? 0,
    stands: stadium.stands as number ?? 0,
    stand_main: stadium.stand_main as number ?? 0,
    stand_opposite: stadium.stand_opposite as number ?? 0,
    stand_goal_west: stadium.stand_goal_west as number ?? 0,
    stand_goal_east: stadium.stand_goal_east as number ?? 0,
    stand_ext_capacity: stadium.stand_ext_capacity as number ?? 0,
    roof: stadium.roof as number ?? 0,
    ultras_stand: stadium.ultras_stand as number ?? 0,
    toilets: stadium.toilets as number ?? 0,
    parking: stadium.parking as number ?? 0,
    fence: stadium.fence as number ?? 0,
    entrance_gate: stadium.entrance_gate as number ?? 0,
    security: stadium.security as number ?? 0,
    cage: stadium.cage as number ?? 0,
    vip_box: stadium.vip_box as number ?? 0,
  };

  // Batch: team info + match count + active season
  const [teamInfoRes, matchCountRes, currentSeasonRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT reputation, stadium_name, game_date FROM teams WHERE id = ?").bind(teamId),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
  ]);
  const teamInfo = (teamInfoRes.results[0] as { reputation: number; stadium_name: string | null; game_date: string | null } | undefined) ?? null;
  const matchCount = (matchCountRes.results[0] as { cnt: number } | undefined) ?? null;
  const currentSeason = (currentSeasonRes.results[0] as { number: number } | undefined) ?? null;

  // Pitch maintenance options
  // Množstevní sleva: větší údržba = levnější na procento (160/120/100 Kč/%).
  //
  // Ceny do 2026-08-25 sedely na treti tomu, co rika tenhle komentar (50/40/34 Kč
  // za procento), takze se cely travnik obnovil levneji nez jeden uklid snehu
  // (4 500 Kč) a sezonni udrzba vysla na vydelek ze dvou domacich zapasu. Sekacka
  // za 8 000 Kč se pri te cene nevratila nikdy. Srovnano na puvodni zamer.
  const pitchActions = [
    { level: "basic", label: "Základní údržba", desc: "Posečení, zarovnání", cost: 1600, improvement: 10 },
    { level: "thorough", label: "Důkladná údržba", desc: "Přesetí holých míst, hnojení", cost: 3000, improvement: 25 },
    { level: "renovation", label: "Renovace trávníku", desc: "Kompletní obnova povrchu", cost: 5000, improvement: 50 },
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
    ultrasText: (stadium.ultras_text as string | null) ?? null,
    // Proč na plachtě visí zrovna tohle. Prázdné, dokud si nápis píše manažer.
    ultrasTextDuvod: (stadium.ultras_text_duvod as string | null) ?? null,
    ultrasBannerColor: (stadium.ultras_banner_color as string | null) ?? null,
    ultrasTextColor: (stadium.ultras_text_color as string | null) ?? null,
    flagColor: (stadium.flag_color as string | null) ?? null,
    mowingPattern: (stadium.mowing_pattern as string | null) ?? "stripes",
    netPattern: (stadium.net_pattern as string | null) ?? "white",
    netStyle: (stadium.net_style as string | null) ?? "loose",
    surroundSurface: (stadium.surround_surface as string | null) ?? "grass",
    // Co má klub ZAPLACENÉ. Přepnutí na vlastněný povrch je zdarma, takže to FE
    // potřebuje vědět, aby u něj neukazovalo cenu.
    surroundOwned: vlastnenePovrchy(stadium.surround_owned as string | null, stadium.surround_surface as string | null),
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

  // Efektivní kapacita = základ + bonus tribun. Stejný výpočet používá zápasový
  // engine (match-runner) i pohár — zobrazené číslo musí sedět s limitem v zápase.
  const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
  const effectiveCapacity = ((stadium.capacity as number) ?? 200) + calculateFacilityEffects(facilities).capacityBonus;

  // Co lóže právě dává a bere. Stránka stadionu to vypíše u karty lóže, aby
  // hráč po nákupu nejvyšší úrovně (kdy nabídka upgradu zmizí) věděl, co má.
  const vipFx = calculateFacilityEffects(facilities);
  const vipBox = {
    level: facilities.vip_box ?? 0,
    seatsLost: vipFx.vipBoxCapacityLoss,
    matchCost: vipFx.vipBoxMatchCost,
    sponsorFavorBonus: vipFx.vipBoxSponsorFavorBonus,
    sponsorAcceptancePct: Math.round(vipFx.vipBoxSponsorAcceptanceBonus * 100),
    villageFavorBonus: vipFx.vipBoxVillageFavorBonus,
  };
  const ignoreProgressLocks = await ignoreStadiumProgressLocks(c.env.CACHE_KV, teamId, c.req.url, c.req.header("origin"));

  const careEquip = await c.env.DB.prepare("SELECT pitch_heating, pitch_irrigation, mower FROM equipment WHERE team_id = ?")
    .bind(teamId).first<{ pitch_heating: number; pitch_irrigation: number; mower: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "load pitch care equipment", e); return null; });
  const pitchHeatingLevel = careEquip?.pitch_heating ?? 0;
  const pitchIrrigationLevel = careEquip?.pitch_irrigation ?? 0;
  const mowerLevel = careEquip?.mower ?? 0;

  const { PITCH_CARE_MODE_LABEL, serviceCost, dailyServiceCost, SNOW_CLEARING_COST } = await import("../stadium/pitch-care");
  const careMode = ((stadium.pitch_care_mode as string) ?? "auto") as keyof typeof PITCH_CARE_MODE_LABEL;
  const pitchCare = {
    mode: careMode,
    modeLabel: PITCH_CARE_MODE_LABEL[careMode] ?? PITCH_CARE_MODE_LABEL.auto,
    heatingLevel: pitchHeatingLevel,
    irrigationLevel: pitchIrrigationLevel,
    heatingCost: serviceCost("heating", pitchHeatingLevel),
    irrigationCost: serviceCost("irrigation", pitchIrrigationLevel),
    // Provoz mimo zápas je udržovací, tedy levnější — hráč musí vidět obě sazby,
    // jinak by ho denní účet v financích překvapil.
    heatingDailyCost: dailyServiceCost("heating", pitchHeatingLevel),
    irrigationDailyCost: dailyServiceCost("irrigation", pitchIrrigationLevel),
    snowClearingCost: SNOW_CLEARING_COST,
    careOrdered: ((stadium.pitch_care_ordered as number) ?? 0) > 0,
    snowClearingOrdered: ((stadium.pitch_snow_clearing_ordered as number) ?? 0) > 0,
  };

  // Počasí, které je nad areálem PRÁVĚ TEĎ — počasí herního dne, ne toho
  // zápasového. Na stadion se hráč dívá dnes; jak bude v sobotu, mu říká
  // předpověď u zápasu.
  const { resolveWeatherForDate } = await import("../season/season-weather");
  const dnesniPocasi = await resolveWeatherForDate(c.env.DB, (teamInfo?.game_date as string) ?? "");

  // Hraje se dnes doma? Zápasový režim areálu je o fanoušcích, kotli a plných
  // tribunách — na venkovní zápas se tady nikdo nesejde, takže se počítá výhradně
  // domácí zápas. Zdroj je stejný jako u bufetu (`findNextHomeMatch`), ať obě
  // stránky neukazují jiný „dnešní zápas".
  const { findNextHomeMatch } = await import("../season/next-home-match");
  const dalsiDoma = await findNextHomeMatch(c.env.DB, teamId);
  const herniDen = ((teamInfo?.game_date as string) ?? "").slice(0, 10);
  const matchDay = !!herniDen && dalsiDoma?.scheduledAt?.slice(0, 10) === herniDen;

  // Sociálky a pořadatelé spadají pod společný strop zázemí s ozvučením, obsluhou,
  // bufetem a trávníkem. Nabídka řekne, kolik spokojenosti klubu opravdu přidají.
  const { loadAmenityInput, withFacilityAmenity } = await import("../season/amenity-outlook");
  const amenityInput = await loadAmenityInput(c.env.DB, teamId);

  // Kolik lidí doma opravdu chodí: u nabídky tribun a přístaveb vedle kapacity,
  // ať klub nestaví místa, která žádný zápas nenaplní.
  const { loadHomeAttendance } = await import("../stadium/home-attendance");
  const homeAttendance = await loadHomeAttendance(c.env.DB, teamId);

  return c.json({
    stadiumName: teamInfo?.stadium_name ?? null,
    /** Dnes se hraje doma → 3D areál se otevře v zápasovém režimu. */
    matchDay,
    matchDayOpponent: matchDay ? (dalsiDoma?.opponent ?? null) : null,
    capacity: effectiveCapacity,
    /** Průměrná a nejvyšší návštěva posledních domácích soutěžních zápasů (null = nepovedlo se načíst). */
    homeAttendance,
    pitchCondition: stadium.pitch_condition,
    pitchType: stadium.pitch_type,
    currentWeather: dnesniPocasi?.weather ?? null,
    currentTemperature: dnesniPocasi?.temperature ?? null,
    // Vyhřívání je vybavení, ne zázemí stadionu — 3D pohled ho potřebuje zvlášť,
    // aby na vyhřívané ploše nevykresloval sníh.
    pitchHeating: pitchHeatingLevel,
    pitchIrrigation: pitchIrrigationLevel,
    mowerLevel,
    pitchMoisture: (stadium.pitch_moisture as number) ?? 50,
    pitchCare,
    facilities,
    vipBox,
    customization,
    visualUpgrades,
    upgrades: withFacilityAmenity(
      getUpgradeOptions(
        facilities,
        teamInfo?.reputation ?? 0,
        matchCount?.cnt ?? 0,
        mustSeason(currentSeason?.number),
        ignoreProgressLocks,
      ),
      facilities, amenityInput,
    ),
    standExtensions: await (async () => {
      const { loadExtensions } = await import("../stadium/extensions-db");
      const { getExtensionSlots } = await import("../stadium/extension-catalog");
      const { readStandLevels } = await import("../stadium/stands-model");
      // Tabulka přístaveb vzniká migrací 0240; bez ní se jen nic nenabídne, stadion se načte dál.
      const rows = await loadExtensions(c.env.DB, teamId).catch((e) => {
        logger.warn({ module: "game", teamId }, "načtení přístaveb tribun", e);
        return [];
      });
      return {
        capacity: (stadium.stand_ext_capacity as number) ?? 0,
        slots: getExtensionSlots(readStandLevels(stadium), rows, {
          reputation: teamInfo?.reputation ?? 0,
          matchesPlayed: matchCount?.cnt ?? 0,
          season: mustSeason(currentSeason?.number),
          ignoreProgressLocks,
        }),
      };
    })(),
    pitchActions,
    pitchUpgrades,
    // Sektory: kde stojí kotel a co je zavřené. 3D scéna podle toho nechá
    // zavřený sektor prázdný a kotel nakreslí tam, kde parta opravdu je.
    sektory: await stavSektoru(c.env.DB, teamId, effectiveCapacity, facilities),
  });
});

/**
 * Stav sektorů pro 3D scénu.
 *
 * Bez tohohle vypadal stadion pořád stejně, ať byl kotel zavřený nebo ne, a
 * trest za výtržnosti nebyl vidět nikde než v čísle návštěvnosti.
 */
async function stavSektoru(
  db: D1Database,
  teamId: string,
  capacity: number,
  facilities: Record<string, number>,
): Promise<{
  ultrasSector: string;
  closed: string[];
  fill: Record<string, number>;
  rozpad: Record<string, number>;
  hoste: { pocet: number; barva: string; nazev: string; kdy: "prijede" | "prijel" } | null;
}> {
  const { kapacitaSektoru, zaplneniSektoru } = await import("../stadium/sektory");
  const rows = await db
    .prepare("SELECT kind, sector, closed_matches, size FROM fan_groups WHERE team_id = ?")
    .bind(teamId)
    .all<{ kind: string; sector: string; closed_matches: number; size: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "sektory part", e); return { results: [] as never[] }; });

  const zavrene = [...new Set(
    rows.results.filter((g) => g.closed_matches > 0).map((g) => g.sector),
  )] as Array<"kotel" | "hlavni" | "za_branou">;
  const kotel = rows.results.find((g) => g.kind === "kotel");
  const lidi = rows.results.reduce((s, g) => s + Math.max(0, g.size), 0);

  // Hostující sektor. Bere se PŘEDEVŠÍM z nejbližšího domácího zápasu, tedy
  // kdo přijede, ne kdo přijel: to je informace, se kterou se dá něco dělat.
  //
  // Původně se to četlo jen z `matches.away_fans`, což se plní až při
  // vyhodnocení odehraného zápasu. Na existujících zápasech je ten sloupec
  // prázdný, takže sektor hostů nebyl vidět vůbec a čekalo se na první nové
  // kolo. Odehraný zápas teď slouží jen jako záloha, když se nehraje.
  const { jadroNaVenkovni } = await import("../engine/fan-groups");

  let hoste: { pocet: number; barva: string; nazev: string; kdy: "prijede" | "prijel" } | null = null;

  const { findNextHomeLeagueOpponent } = await import("../season/next-home-match");
  const nextOpponent = await findNextHomeLeagueOpponent(db, teamId);

  /** Kolik jich z toho klubu vyrazí ven. `syncFanGroups` dopočítá jádro. */
  const kolikPrijede = async (awayTeamId: string): Promise<number> => {
    const { syncFanGroups } = await import("../fans/fan-group-state");
    await syncFanGroups(db, awayTeamId, { drift: false })
      .catch((e) => logger.warn({ module: "game" }, "party hostů pro sektor", e));
    const jejichKotel = await db
      .prepare("SELECT core FROM fan_groups WHERE team_id = ? AND kind = 'kotel'")
      .bind(awayTeamId).first<{ core: number }>()
      .catch((e) => { logger.warn({ module: "game" }, "jádro hostů", e); return null; });
    return jadroNaVenkovni(jejichKotel?.core ?? 0);
  };

  // Soupeř se vrací i s nulou. Když má malý a otrávený kotel, NIKOHO nepošle
  // a to je informace: hráč jinak vidí prázdno a myslí si, že je něco rozbité.
  if (nextOpponent) {
    hoste = {
      pocet: await kolikPrijede(nextOpponent.id),
      barva: nextOpponent.primary_color ?? "#B91C1C",
      nazev: nextOpponent.name,
      kdy: "prijede",
    };
  }

  if (!hoste) {
    const posledni = await db
      .prepare(
        `SELECT m.away_fans, t.name, t.primary_color
         FROM matches m JOIN teams t ON t.id = m.away_team_id
         WHERE m.home_team_id = ? AND m.away_fans IS NOT NULL
         ORDER BY COALESCE(m.simulated_at, m.created_at) DESC LIMIT 1`,
      )
      .bind(teamId)
      .first<{ away_fans: string; name: string; primary_color: string | null }>()
      .catch((e) => { logger.warn({ module: "game" }, "hosté na stadionu", e); return null; });
    if (posledni) {
      try {
        const j = JSON.parse(posledni.away_fans) as { pocet?: number };
        if ((j.pocet ?? 0) > 0) {
          hoste = { pocet: j.pocet ?? 0, barva: posledni.primary_color ?? "#B91C1C", nazev: posledni.name, kdy: "prijel" };
        }
      } catch (e) {
        logger.warn({ module: "game" }, "rozbitý záznam o hostech", e);
      }
    }
  }

  // Poslední záloha: soupeř z posledního odehraného domácího zápasu a kolik by
  // jich dnes vyrazilo. Bez tohohle je sektor hostů prázdný celou dobu, kdy se
  // zrovna nehraje a starší zápasy záznam o hostech nemají.
  if (!hoste) {
    const naposled = await db
      .prepare(
        `SELECT t.id, t.name, t.primary_color FROM matches m
         JOIN teams t ON t.id = m.away_team_id
         WHERE m.home_team_id = ? AND m.home_score IS NOT NULL
         ORDER BY COALESCE(m.simulated_at, m.created_at) DESC LIMIT 1`,
      )
      .bind(teamId)
      .first<{ id: string; name: string; primary_color: string | null }>()
      .catch((e) => { logger.warn({ module: "game" }, "poslední soupeř doma", e); return null; });
    if (naposled) {
      hoste = {
        pocet: await kolikPrijede(naposled.id),
        barva: naposled.primary_color ?? "#B91C1C",
        nazev: naposled.name,
        kdy: "prijel",
      };
    }
  }

  return {
    ultrasSector: kotel?.sector ?? "kotel",
    closed: zavrene,
    fill: zaplneniSektoru(lidi, capacity, facilities, zavrene),
    rozpad: kapacitaSektoru(capacity, facilities),
    hoste,
  };
}

// POST /api/teams/:id/stadium/upgrade — upgrade a facility
gameRouter.post("/teams/:teamId/stadium/upgrade", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ facility: string }>();
  // Pravidla stavby (ceny, zámky, atomický zámek) v services/stadium.ts, sdílí je AI trenér.
  const ignoreProgressLocks = await ignoreStadiumProgressLocks(c.env.CACHE_KV, teamId, c.req.url, c.req.header("origin"));
  const res = await upgradeStadiumFacility(c.env.DB, teamId, body.facility, { ignoreProgressLocks });
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, cost: res.cost, newLevel: res.newLevel });
});

// POST /api/teams/:id/stadium/extension — postaví přístavbu tribuny do místa, nebo ji vylepší
gameRouter.post("/teams/:teamId/stadium/extension", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ slot?: string; kind?: string }>();
  const { EXT_SLOTS, allowedKinds, getExtensionSlots } = await import("../stadium/extension-catalog");
  const { loadExtensions, buildExtension, replaceMobileExtension } = await import("../stadium/extensions-db");
  const { readStandLevels } = await import("../stadium/stands-model");

  if (!body.slot || !(EXT_SLOTS as readonly string[]).includes(body.slot)) return c.json({ error: "Neznámé místo pro přístavbu" }, 400);
  if (!body.kind || !allowedKinds(body.slot).includes(body.kind as never)) return c.json({ error: "Tuhle přístavbu sem nejde postavit" }, 400);

  const stadium = await c.env.DB.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!stadium) return c.json({ error: "Stadium not found" }, 404);
  const team = await c.env.DB.prepare("SELECT budget, reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number; reputation: number }>();
  if (!team) return c.json({ error: "Team not found" }, 404);

  const matchCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'"
  ).bind(teamId, teamId).first<{ cnt: number }>().catch((e) => { logger.warn({ module: "game" }, "count matches for extension", e); return null; });
  const seasonRow = await c.env.DB.prepare(
    "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
  ).first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for extension", e); return null; });

  const rows = await loadExtensions(c.env.DB, teamId);
  const ignoreProgressLocks = await ignoreStadiumProgressLocks(c.env.CACHE_KV, teamId, c.req.url, c.req.header("origin"));
  const slotState = getExtensionSlots(readStandLevels(stadium), rows, {
    reputation: team.reputation,
    matchesPlayed: matchCount?.cnt ?? 0,
    season: mustSeason(seasonRow?.number),
    ignoreProgressLocks,
  }).find((s) => s.slot === body.slot);
  const option = slotState?.options.find((o) => o.kind === body.kind);
  if (!slotState || !option) return c.json({ error: "Tuhle přístavbu sem nejde postavit ani vylepšit" }, 400);
  if (option.locked) return c.json({ error: option.lockReason ?? "Zamčeno" }, 400);
  if (team.budget < option.cost) return c.json({ error: "Nedostatek peněz" }, 400);

  // Zámek proti dvojímu odeslání: kdo prohraje, nezapíše nic a peníze se nestrhnou.
  const claimed = option.replaces
    ? await replaceMobileExtension(c.env.DB, teamId, body.slot, body.kind, slotState.built?.level ?? 0)
    : await buildExtension(c.env.DB, teamId, body.slot, body.kind, slotState.built?.level ?? 0);
  if (!claimed) {
    return c.json({ error: "Stavba už probíhá, načti stránku znovu" }, 409);
  }
  try {
    await recordTransaction(c.env.DB, teamId, "stadium_upgrade", -option.cost,
      `Přístavba tribuny: ${option.label}, úroveň ${option.level}${option.replaces ? " (nahradila mobilní tribunku)" : ""}`, new Date().toISOString());
  } catch (e) {
    // Přístavba už stojí. Bez záznamu by klub dostal stavbu zadarmo a nikdo by se to nedozvěděl.
    logger.error({ module: "game", teamId }, `přístavba ${body.slot}/${body.kind}: zapsána, ale strhnutí ${option.cost} Kč selhalo`, e);
  }
  return c.json({ ok: true, cost: option.cost, level: option.level, capacityGain: option.capacityGain });
});

// PATCH /api/teams/:id/stadium/customize — set color (zdarma)
gameRouter.patch("/teams/:teamId/stadium/customize", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ field: string; value: string | null }>();

  // Nápis v kotli si píše KOTEL. Manažer do něj nemluví a nemá to jak obejít.
  //
  // Přepínač „píšu si sám" tu byl a musel pryč: celý smysl plachty je v tom, že
  // ji vyvěsili fanoušci podle toho, jak jim zrovna je. Když si na ni napíše
  // manažer, co chce, je to jen další kolonka v nastavení stadionu.
  //
  // Endpoint zůstává a vrací chybu, protože starý frontend v mezipaměti
  // prohlížeče by jinak tiše zapisoval do databáze.
  if (body.field === "ultras_text" || body.field === "ultras_text_mode") {
    return c.json({ error: "Plachtu si píše kotel. Nastavit jde jen barva plachty a písma." }, 400);
  }

  // Vzor sekání trávníku
  if (body.field === "mowing_pattern") {
    const allowed = new Set(["stripes", "checkerboard", "circles", "crooked"]);
    const val = allowed.has(String(body.value)) ? String(body.value) : "stripes";
    await c.env.DB.prepare("UPDATE stadiums SET mowing_pattern = ? WHERE team_id = ?")
      .bind(val, teamId).run();
    return c.json({ ok: true, value: val });
  }

  // Vzor sítě v brance
  if (body.field === "net_pattern") {
    const allowed = new Set(["white", "checkered", "striped"]);
    const val = allowed.has(String(body.value)) ? String(body.value) : "white";
    await c.env.DB.prepare("UPDATE stadiums SET net_pattern = ? WHERE team_id = ?")
      .bind(val, teamId).run();
    return c.json({ ok: true, value: val });
  }

  // Styl zavěšení branky
  if (body.field === "net_style") {
    const allowed = new Set(["loose", "box"]);
    const val = allowed.has(String(body.value)) ? String(body.value) : "loose";
    await c.env.DB.prepare("UPDATE stadiums SET net_style = ? WHERE team_id = ?")
      .bind(val, teamId).run();
    return c.json({ ok: true, value: val });
  }

  // Povrch areálu / výběhové zóny (s cenou dle luxusu)
  if (body.field === "surround_surface") {
    const SURROUND_COSTS: Record<string, { cost: number; label: string }> = {
      grass:   { cost: 0,     label: "Přírodní tráva" },
      cinders: { cost: 3000,  label: "Antukový pás" },
      paving:  { cost: 10000, label: "Zámková dlažba" },
      astro:   { cost: 25000, label: "Umělý trávník" },
      tartan:  { cost: 50000, label: "Klubový VIP koberec" },
    };

    const allowed = new Set(Object.keys(SURROUND_COSTS));
    const val = allowed.has(String(body.value)) ? String(body.value) : "grass";
    const currentStadium = await c.env.DB.prepare(
      "SELECT surround_surface, surround_owned FROM stadiums WHERE team_id = ?"
    ).bind(teamId).first<{ surround_surface: string | null; surround_owned: string | null }>();

    const currentVal = currentStadium?.surround_surface ?? "grass";
    if (val === currentVal) {
      return c.json({ ok: true, value: val, cost: 0, owned: vlastnenePovrchy(currentStadium?.surround_owned ?? null, currentVal) });
    }

    // Povrch se platí JEDNOU. Dřív se účtovalo při každé změně na jinou hodnotu, takže
    // kdo si prohlédl trávu (ta je zdarma) a vrátil se ke koberci, zaplatil ho podruhé —
    // na produkci se to stalo za 50 000 Kč. Zaplacené povrchy zůstávají klubu napořád.
    const owned = vlastnenePovrchy(currentStadium?.surround_owned ?? null, currentVal);
    const jizZaplaceno = owned.includes(val);

    const { cost: cenik, label } = SURROUND_COSTS[val] ?? { cost: 0, label: val };
    const cost = jizZaplaceno ? 0 : cenik;
    if (cost > 0) {
      const team = await c.env.DB.prepare("SELECT budget, game_date FROM teams WHERE id = ?")
        .bind(teamId).first<{ budget: number; game_date: string | null }>();
      if (!team || team.budget < cost) {
        return c.json({ error: "Nedostatek financí na účtu klubu" }, 400);
      }
      await recordTransaction(c.env.DB, teamId, "stadium_visual", -cost,
        `Povrch areálu: ${label}`, team.game_date ?? new Date().toISOString());
    }

    const noveVlastnene = jizZaplaceno ? owned : [...owned, val].filter((p) => p !== "grass");
    await c.env.DB.prepare("UPDATE stadiums SET surround_surface = ?, surround_owned = ? WHERE team_id = ?")
      .bind(val, JSON.stringify(noveVlastnene), teamId).run();
    return c.json({ ok: true, value: val, cost, owned: noveVlastnene });
  }

  const allowed = new Set(["fence_color", "stand_color", "seat_color", "roof_color", "accent_color", "ultras_banner_color", "ultras_text_color", "flag_color"]);
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
    `Stadion vzhled: ${body.kind === "scoreboard" ? "ukazatel skóre" : "vlajka"} L${nextLevel}`,
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
  // Ceny musí sedět s nabídkou v `GET /stadium` výš (services/stadium.ts PITCH_MAINTENANCE).
  const res = await maintainPitch(c.env.DB, teamId, body.level);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, cost: res.cost, improvement: res.improvement });
});

// POST /api/teams/:id/stadium/pitch-care-mode — jak se má péče o trávník zapínat
gameRouter.post("/teams/:teamId/stadium/pitch-care-mode", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ mode: string }>();
  const res = await setPitchCareMode(c.env.DB, teamId, body.mode);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, mode: res.mode, label: res.label });
});

// POST /api/teams/:id/stadium/pitch-care-order — objednávka péče na nejbližší domácí zápas
gameRouter.post("/teams/:teamId/stadium/pitch-care-order", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ service: "care" | "snow_clearing" }>();

  const { SNOW_CLEARING_COST, serviceCost } = await import("../stadium/pitch-care");

  const stadium = await c.env.DB.prepare(
    "SELECT pitch_care_mode, pitch_care_ordered, pitch_snow_clearing_ordered FROM stadiums WHERE team_id = ?"
  ).bind(teamId).first<{
    pitch_care_mode: string | null;
    pitch_care_ordered: number | null;
    pitch_snow_clearing_ordered: number | null;
  }>();
  if (!stadium) return c.json({ error: "Stadion nenalezen" }, 404);

  if (body.service === "snow_clearing") {
    if ((stadium.pitch_snow_clearing_ordered ?? 0) > 0) {
      return c.json({ error: "Úklid sněhu už je na příští domácí zápas objednaný." }, 409);
    }
    // Platí se až u zápasu — do té doby se dá objednávka zrušit a počasí se může změnit.
    await c.env.DB.prepare("UPDATE stadiums SET pitch_snow_clearing_ordered = 1 WHERE team_id = ?")
      .bind(teamId).run();
    return c.json({ ok: true, service: "snow_clearing", estimatedCost: SNOW_CLEARING_COST });
  }

  if (stadium.pitch_care_mode !== "manual") {
    return c.json({ error: "Objednávat se dá jen v ručním režimu. V automatickém se péče zapne sama." }, 409);
  }
  if ((stadium.pitch_care_ordered ?? 0) > 0) {
    return c.json({ error: "Péče už je na příští domácí zápas objednaná." }, 409);
  }

  const equip = await c.env.DB.prepare("SELECT pitch_heating, pitch_irrigation FROM equipment WHERE team_id = ?")
    .bind(teamId).first<{ pitch_heating: number; pitch_irrigation: number }>();
  if (!equip || (equip.pitch_heating ?? 0) + (equip.pitch_irrigation ?? 0) === 0) {
    return c.json({ error: "Nemáš vyhřívání ani zavlažování, není co zapínat." }, 400);
  }

  await c.env.DB.prepare("UPDATE stadiums SET pitch_care_ordered = 1 WHERE team_id = ?")
    .bind(teamId).run();

  return c.json({
    ok: true,
    service: "care",
    estimatedCost: {
      heating: serviceCost("heating", equip.pitch_heating ?? 0),
      irrigation: serviceCost("irrigation", equip.pitch_irrigation ?? 0),
    },
  });
});

// DELETE /api/teams/:id/stadium/pitch-care-order — zrušení objednávky (ještě se neplatilo)
gameRouter.delete("/teams/:teamId/stadium/pitch-care-order", async (c) => {
  const teamId = c.req.param("teamId");
  await c.env.DB.prepare(
    "UPDATE stadiums SET pitch_care_ordered = 0, pitch_snow_clearing_ordered = 0 WHERE team_id = ?"
  ).bind(teamId).run();
  return c.json({ ok: true });
});

// POST /api/teams/:id/stadium/upgrade-pitch — change pitch type
gameRouter.post("/teams/:teamId/stadium/upgrade-pitch", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ pitchType: string }>();

  const upgrades: Record<string, { from: string; cost: number }> = {
    hybrid:     { from: "natural", cost: 85000 },
    artificial: { from: "hybrid", cost: 220000 },
  };
  // Popis transakce čte hráč — do účetnictví patří "hybridní", ne "hybrid".
  const PITCH_TYPE_LABELS: Record<string, string> = {
    natural: "přírodní", hybrid: "hybridní", artificial: "umělý",
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
    `Změna povrchu: ${PITCH_TYPE_LABELS[body.pitchType] ?? body.pitchType}`, new Date().toISOString());
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
  const res = await setTeamRoles(c.env.DB, teamId, body);
  if (!res.ok) return c.json({ error: res.error }, res.status);
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
/** Podmínky prodloužení smlouvy — deterministické (tým+sponzor+sezóna), stejný vzorec jako nabídky.
 *  Sponzor mimo okresní pool (např. z onboardingu) → prodloužení za stávající částky. */
function computeRenewalTerms(
  teamId: string,
  seasonNum: number,
  contract: { sponsor_name: string; category: string | null; monthly_amount: number; win_bonus: number },
  reputation: number,
  size: string,
  spRows: Array<{ name: string; monthly_min: number; monthly_max: number; win_bonus_min: number; win_bonus_max: number }>,
  seedFn: (s: string) => number,
): { monthlyAmount: number; winBonus: number; seasons: number; earlyTerminationFee: number } {
  const category = contract.category || "main";
  const seasons = category === "banner" ? 2 : 3;
  const repMod = reputation / 50;
  const sizeMod = size === "mesto" ? 1.3 : size === "mestys" ? 1.1 : size === "obec" ? 1.0 : 0.8;
  const catMult = category === "main" ? 3 : category === "stadium" ? 1.5 : 0.8;
  const cleanSp = (nm: string) => nm.replace(/\s*s\.r\.o\.?\s*/gi, "").trim();
  const baseName = category === "stadium" ? contract.sponsor_name.replace(/\s+Arena$/i, "").trim() : contract.sponsor_name;
  const spRow = category === "stadium"
    ? spRows.find((r) => cleanSp(r.name) === baseName)
    : spRows.find((r) => r.name === contract.sponsor_name);
  let monthly = contract.monthly_amount;
  let winBonus = contract.win_bonus;
  if (spRow) {
    const rng = createRng(seedFn(teamId + "renew" + contract.sponsor_name + seasonNum));
    monthly = Math.round(rng.int(spRow.monthly_min, spRow.monthly_max) * repMod * sizeMod * catMult);
    winBonus = category === "main" ? Math.round(rng.int(spRow.win_bonus_min, spRow.win_bonus_max) * repMod * 2) : 0;
  }
  const earlyTerminationFee = Math.round(monthly * seasons * (category === "banner" ? 1.5 : 2));
  return { monthlyAmount: monthly, winBonus, seasons, earlyTerminationFee };
}

/** Smlouvu lze prodloužit až v její poslední sezóně, případně po vypršení. */
function isRenewable(row: Record<string, unknown>): boolean {
  return row.status === "expired" || (row.status === "active" && (row.seasons_remaining as number) <= 1);
}

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

  // Poměrná výpovědní pokuta, stejný vzorec jako POST /sponsors/terminate — karta smlouvy musí
  // ukazovat přesně tu částku, kterou by výpověď teď strhla, ne nominální earlyTerminationFee
  // celé smlouvy (ta se zmenšuje s ubývajícími sezónami).
  const { prorataTerminationFee } = await import("../sponsors/negotiation-db");
  const mapContract = (row: Record<string, unknown>) => ({
    id: row.id as string,
    category: (row.category as string) || "main",
    sponsorId: (row.sponsor_id as number | null) ?? null,
    sponsorName: row.sponsor_name as string,
    sponsorType: row.sponsor_type as string,
    monthlyAmount: row.monthly_amount as number,
    winBonus: row.win_bonus as number,
    seasonsTotal: row.seasons_total as number,
    seasonsRemaining: row.seasons_remaining as number,
    earlyTerminationFee: row.early_termination_fee as number,
    terminationFee: prorataTerminationFee(row as unknown as Parameters<typeof prorataTerminationFee>[0]),
    // Smlouva z doby před vyjednáváním: přechod na nového sponzora přes jednání je zdarma.
    isLegacy: !row.negotiation_id,
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
  const seedSeason = mustSeason(seasonForSeed?.number);

  // Stable seed: same team + same season = same offers (výpočet sdílí AI trenér, services/banner-sponsors.ts)
  const { seedFromString } = await import("../lib/seed");

  // Hlavní sponzor a název stadionu se vyjednávají s majitelem firmy (routes/sponsors.ts,
  // sponsors/negotiation*.ts). Pevné nabídky zůstaly jen u bannerů.
  const { mainSponsorBlock } = await import("../sponsors/exclusivity");

  // Banner offers — vždy 12 možných, malé částky, bez naming/win bonus
  const bannerOffers = computeBannerOffers({
    teamId, seedSeason, reputation: team.reputation, size: team.size,
    sponsorRows: sponsorRows.results as Array<Record<string, unknown>>,
    activeRows: activeRows.results as Array<Record<string, unknown>>,
    seedFromString,
  });

  // Obor chráněný slibem exkluzivity se v nabídkách bannerů neukazuje.
  const { exclusiveSectors } = await import("../sponsors/promise-runs");
  const { sectorBlockReason } = await import("../sponsors/promise-eval");
  const exclusive = await exclusiveSectors(c.env.DB, teamId)
    .catch((e) => { logger.warn({ module: "game", teamId }, "exkluzivita oboru pro nabídky bannerů", e); return new Map<string, string>(); });
  const allowedBannerOffers = bannerOffers.filter((o) => !exclusive.has(o.sponsorType));

  // Batch: current season + team sponsor change info
  const [currentSeasonRes, teamFullRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
    c.env.DB.prepare("SELECT name, last_main_sponsor_change_season FROM teams WHERE id = ?").bind(teamId),
  ]);
  const seasonNum = mustSeason((currentSeasonRes.results[0] as { number: number } | undefined)?.number);
  const teamFull = (teamFullRes.results[0] as { name: string; last_main_sponsor_change_season: number | null } | undefined) ?? null;

  const changedThisSeason = (teamFull?.last_main_sponsor_change_season ?? 0) >= seasonNum;

  // Bannery se prodlužují za pevné podmínky podle aktuální reputace. Prodloužit jde jen smlouvu
  // v poslední sezóně (nebo vypršelou), jinak šlo klikáním resetovat délku a částky.
  type SpRow = { name: string; monthly_min: number; monthly_max: number; win_bonus_min: number; win_bonus_max: number };
  const renewalFor = (row: Record<string, unknown> | undefined | null) => row && isRenewable(row)
    ? computeRenewalTerms(teamId, seedSeason, row as { sponsor_name: string; category: string | null; monthly_amount: number; win_bonus: number },
        team.reputation, team.size, sponsorRows.results as unknown as SpRow[], seedFromString)
    : null;

  // Banner v oboru chráněném slibem exkluzivity: prodloužení by stejně jako podpis skončilo 409,
  // GET to ukáže dopředu (stejně jako blockedReason u hlavního sponzora/stadionu níž) — ale jen
  // v okně, kdy by se jinak prodloužení nabízelo, aby text nebyl matoucí dřív.
  const bannerRenewal = (row: Record<string, unknown>) => {
    if (!isRenewable(row)) return { renewal: null };
    const holder = exclusive.get(row.sponsor_type as string);
    return holder
      ? { renewal: null, renewable: false, blockedReason: sectorBlockReason(holder, "renew") }
      : { renewal: renewalFor(row) };
  };

  // Hlavní sponzor a stadion: prodloužení je jednání se stejnou firmou. `renewable` říká, jestli
  // na něj už je čas; u hlavního sponzora ho zablokuje exkluzivita (hlavní jinde, přednost jiného klubu).
  // Smlouva z jednání: kolik zálohy by klub při výpovědi vracel (ukazuje se v dialogu výpovědi).
  const { contractClawback, loadTeamSeasonProgress } = await import("../sponsors/signing");
  const progress = activeRows.results.some((r) => r.negotiation_id)
    ? await loadTeamSeasonProgress(c.env.DB, teamId)
      .catch((e) => { logger.warn({ module: "game", teamId }, "postup sezóny pro vratku zálohy", e); return 0; })
    : 0;
  const clawbackOf = async (row: Record<string, unknown>): Promise<number> => {
    if (row.status !== "active" || !row.negotiation_id) return 0;
    return contractClawback(c.env.DB, {
      id: row.id as string, seasons_total: row.seasons_total as number, seasons_remaining: row.seasons_remaining as number,
      signing_bonus: (row.signing_bonus as number | null) ?? 0, paid_construction: (row.paid_construction as string | null) ?? null,
      negotiation_id: row.negotiation_id as string,
    }, progress).catch((e) => { logger.warn({ module: "game", teamId }, `vratka zálohy smlouvy ${row.id as string}`, e); return 0; });
  };

  // Pokuty za sliby, které by výpověď aktivní smlouvy nechala propadnout (dialog výpovědi je ukazuje dopředu).
  const { forfeitPenaltiesByContract } = await import("../sponsors/promise-forfeit");
  const forfeitByContract = await forfeitPenaltiesByContract(c.env.DB, teamId, seasonNum)
    .catch((e) => { logger.warn({ module: "game", teamId }, "pokuty za propadlé sliby", e); return new Map<string, number>(); });
  const forfeitOf = (row: Record<string, unknown>): number =>
    row.status === "active" ? forfeitByContract.get(row.id as string) ?? 0 : 0;

  const withRenewable = async (row: Record<string, unknown> | null | undefined, cat: "main" | "stadium") => {
    if (!row) return null;
    const base = {
      ...mapContract(row), renewal: null, renewable: isRenewable(row), blockedReason: null as string | null, clawback: await clawbackOf(row),
      forfeitPenalty: forfeitOf(row),
    };
    if (cat === "main" && base.renewable && base.sponsorId) {
      const block = await mainSponsorBlock(c.env.DB, base.sponsorId, teamId, seedSeason);
      if (block) return { ...base, renewable: false, blockedReason: block.reason };
    }
    return base;
  };

  // Vypršelá smlouva (main/stadium), jejíž obnova je prodloužení (vypršela při posledním rolloveru
  // a v kategorii se od té doby nic nepodepsalo): obnovit jde jednáním se stejnou firmou.
  const { lastRenewableExpired } = await import("../sponsors/negotiation-db");
  const lastExpiredFor = (cat: "main" | "stadium") => lastRenewableExpired(c.env.DB, teamId, cat)
    .catch((e) => { logger.warn({ module: "game", teamId }, "fetch expired contract", e); return null; });

  const [mainContractOut, mainExpired, stadiumContractOut, stadiumExpired] = await Promise.all([
    withRenewable(mainContract, "main"),
    mainContract ? null : lastExpiredFor("main").then((r) => withRenewable(r, "main")),
    withRenewable(stadiumContract, "stadium"),
    stadiumContract ? null : lastExpiredFor("stadium").then((r) => withRenewable(r, "stadium")),
  ]);

  const { listTeamNegotiations } = await import("../sponsors/negotiation-db");
  const negotiations = await listTeamNegotiations(c.env.DB, teamId)
    .catch((e) => { logger.warn({ module: "game", teamId }, "fetch sponsor negotiations", e); return []; });

  return c.json({
    mainContract: mainContractOut,
    stadiumContract: stadiumContractOut,
    mainExpired,
    stadiumExpired,
    bannerContracts: bannerContracts.map((r) => ({ ...mapContract(r), ...bannerRenewal(r), forfeitPenalty: forfeitOf(r) })),
    stadiumName: team.stadium_name,
    teamName: teamFull?.name ?? "",
    bannerOffers: bannerContracts.length >= MAX_BANNERS ? [] : allowedBannerOffers,
    maxBanners: MAX_BANNERS,
    canChangeMainSponsor: !changedThisSeason,
    season: seasonNum,
    negotiations,
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
  // Pravidla podpisu (meze sponzora, exkluzivita, max bannerů) v services/banner-sponsors.ts, sdílí je AI trenér.
  const res = await signSponsorContract(c.env.DB, teamId, body);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, contractId: res.contractId });
});

// POST /api/teams/:teamId/sponsors/renew — prodloužení stávající smlouvy za aktuální podmínky
// (stejný sponzor: bez přejmenování, bez reputační sankce, nepočítá se jako změna hlavního sponzora)
gameRouter.post("/teams/:teamId/sponsors/renew", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ contractId: string }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "parse sponsor renew body", e); return null; });
  if (!body?.contractId) return c.json({ error: "Chybí contractId" }, 400);

  const contract = await c.env.DB.prepare(
    "SELECT * FROM sponsor_contracts WHERE id = ? AND team_id = ? AND status IN ('active', 'expired')"
  ).bind(body.contractId, teamId).first<Record<string, unknown>>();
  if (!contract) return c.json({ error: "Smlouva nenalezena" }, 404);
  // Hlavního sponzora a stadion prodlužuje jednání s majitelem firmy, pevné podmínky mají jen bannery.
  if (((contract.category as string) || "main") !== "banner") {
    return c.json({ error: "Hlavního sponzora a název stadionu prodloužíš jednáním s majitelem firmy" }, 400);
  }
  if (!isRenewable(contract)) {
    return c.json({ error: "Smlouvu lze prodloužit až v její poslední sezóně" }, 400);
  }

  // Obnova expirované smlouvy — jen pokud v kategorii mezitím nevznikla jiná aktivní
  if (contract.status === "expired") {
    const cat = (contract.category as string) || "main";
    const active = await c.env.DB.prepare(
      "SELECT id, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
    ).bind(teamId).all().catch((e) => { logger.warn({ module: "game", teamId }, "renew expired active check", e); return { results: [] }; });
    if (cat === "banner") {
      if (active.results.filter((r) => r.category === "banner").length >= 6) return c.json({ error: "Maximální počet bannerů je dosažen" }, 400);
    } else if (active.results.some((r) => ((r.category as string) || "main") === cat)) {
      return c.json({ error: "V této kategorii už máš aktivní smlouvu" }, 400);
    }
  }

  const econ = await c.env.DB.prepare(
    "SELECT t.reputation, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ reputation: number; size: string; district: string }>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "sponsor renew econ lookup", e); return null; });
  if (!econ) return c.json({ error: "Tým nenalezen" }, 404);

  const spRows = await c.env.DB.prepare("SELECT * FROM district_sponsors WHERE district = ?")
    .bind(econ.district).all().catch((e) => { logger.warn({ module: "game", teamId }, "sponsor renew bounds", e); return { results: [] }; });
  const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for renew", e); return null; });
  const { seedFromString } = await import("../lib/seed");

  // Server-side přepočet — klient neposílá žádné částky (anti-podvrh)
  const terms = computeRenewalTerms(
    teamId, mustSeason(season?.number),
    contract as unknown as { sponsor_name: string; category: string | null; monthly_amount: number; win_bonus: number },
    econ.reputation, econ.size,
    spRows.results as unknown as Array<{ name: string; monthly_min: number; monthly_max: number; win_bonus_min: number; win_bonus_max: number }>,
    seedFromString,
  );

  // Hlavní sponzor je exkluzivní — neprodloužit, když je hlavním jinde nebo dal přednost jinému klubu.
  const { mainSponsorBlock, MAIN_SPONSOR_FREE_SQL, mainSponsorFreeParams } = await import("../sponsors/exclusivity");
  const sponsorId = (contract.sponsor_id as number | null) ?? null;
  const isMain = ((contract.category as string) || "main") === "main" && sponsorId !== null;
  if (isMain) {
    const block = await mainSponsorBlock(c.env.DB, sponsorId!, teamId, mustSeason(season?.number));
    if (block) return c.json({ error: block.reason }, 409);
  }
  if (((contract.category as string) || "main") === "banner") {
    const { exclusiveSectors } = await import("../sponsors/promise-runs");
    const { sectorBlockMessage } = await import("../sponsors/promise-eval");
    const holder = (await exclusiveSectors(c.env.DB, teamId)).get(contract.sponsor_type as string);
    if (holder) return c.json({ error: sectorBlockMessage(holder, "renew") }, 409);
  }

  // Podmínka na původní stav — dva souběžné požadavky (dvojklik) neprodlouží dvakrát.
  const upd = await c.env.DB.prepare(
    `UPDATE sponsor_contracts SET status = 'active', monthly_amount = ?, win_bonus = ?, seasons_total = ?, seasons_remaining = ?, early_termination_fee = ?
     WHERE id = ? AND status = ? AND seasons_remaining = ? AND (? = 0 OR ${MAIN_SPONSOR_FREE_SQL})`
  ).bind(terms.monthlyAmount, terms.winBonus, terms.seasons, terms.seasons, terms.earlyTerminationFee,
    body.contractId, contract.status, contract.seasons_remaining, isMain ? 1 : 0, ...mainSponsorFreeParams(sponsorId, teamId)).run();
  if (!upd.meta.changes) return c.json({ error: "Smlouvu se nepodařilo prodloužit, načti stránku znovu" }, 409);

  return c.json({ ok: true, renewed: terms });
});

// POST /api/teams/:id/sponsors/terminate — early termination (with fee)
gameRouter.post("/teams/:teamId/sponsors/terminate", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ category?: "main" | "stadium" | "banner"; contractId?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse terminate body", e); return { category: "main" as const, contractId: undefined as string | undefined }; });
  const category = body.category || "main";

  const allActiveT = await c.env.DB.prepare(
    "SELECT id, sponsor_name, early_termination_fee, seasons_total, seasons_remaining, category, sponsor_id, signing_bonus, paid_construction, negotiation_id FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch contracts for termination", e); return { results: [] }; });

  // Pro banner — vyžaduje contractId (může jich být víc)
  const contractRow = category === "banner"
    ? allActiveT.results.find((r) => r.id === body.contractId && r.category === "banner")
    : allActiveT.results.find((r) => (r.category || "main") === category);
  const contract = contractRow ? {
    id: contractRow.id as string,
    sponsor_name: contractRow.sponsor_name as string,
    early_termination_fee: contractRow.early_termination_fee as number,
    seasons_total: contractRow.seasons_total as number,
    seasons_remaining: contractRow.seasons_remaining as number,
    signing_bonus: (contractRow.signing_bonus as number | null) ?? 0,
    paid_construction: (contractRow.paid_construction as string | null) ?? null,
    negotiation_id: (contractRow.negotiation_id as string | null) ?? null,
  } : null;

  if (!contract) return c.json({ error: "Žádná aktivní smlouva" }, 400);

  // Poměrná výpovědní pokuta, stejný vzorec jako karta smlouvy na GET /sponsors (mapContract).
  const { prorataTerminationFee } = await import("../sponsors/negotiation-db");
  const fee = prorataTerminationFee(contract as unknown as Parameters<typeof prorataTerminationFee>[0]);
  // Smlouva z jednání: jednorázová plnění sponzora (příspěvek za podpis, stavba, vybavení,
  // zaplacená pokuta, vyplacené termínové bonusy) jsou záloha, klub vrací nesplacenou část.
  const { contractClawback, loadTeamSeasonProgress } = await import("../sponsors/signing");
  const clawback = await contractClawback(c.env.DB, contract, await loadTeamSeasonProgress(c.env.DB, teamId));

  // Sliby aktuální sezóny a termínové sliby propadnou s plnou pokutou: neaktivní smlouvu už nikdo
  // nevyhodnotí, výpověď v poslední sezóně by je jinak obešla (promise-forfeit.ts).
  const { activeSeason } = await import("../sponsors/negotiation-db");
  const { prepareForfeit, terminateWithForfeit } = await import("../sponsors/promise-forfeit");
  const forfeit = await prepareForfeit(c.env.DB, contract.id, await activeSeason(c.env.DB));

  const team = await c.env.DB.prepare("SELECT budget, village_id, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number; village_id: string; game_date: string | null }>();
  if (!team || team.budget < fee + clawback + forfeit.total) {
    const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
    const parts = [`sankce ${kc(fee)}`];
    if (clawback > 0) parts.push(`vrácení zálohy ${kc(clawback)}`);
    if (forfeit.total > 0) parts.push(`pokuty za propadlé sliby ${kc(forfeit.total)}`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} a ${parts[parts.length - 1]}` : parts[0];
    return c.json({ error: `Nedostatek peněz (${list})` }, 400);
  }

  // Nejdřív ukončit (podmíněně, dvojklik nesmí strhnout sankci dvakrát), pak strhnout peníze.
  // Propadlé sliby jdou ve stejné dávce jako konec smlouvy.
  const termDate = team.game_date ?? new Date().toISOString();
  const ended = await terminateWithForfeit(c.env.DB, {
    teamId, contractId: contract.id, sponsorName: contract.sponsor_name, forfeit, gameDate: termDate,
  });
  if (!ended) return c.json({ error: "Smlouva už je ukončená, načti stránku znovu" }, 409);
  if (forfeit.rows.length > 0) {
    logger.info({ module: "game", teamId }, `výpověď smlouvy ${contract.id}: propadlé sliby ${forfeit.rows.length} za ${forfeit.total}`);
  }
  await recordTransaction(c.env.DB, teamId, "sponsor_termination", -fee,
    `Ukončení sponzorské smlouvy (sankce)`, termDate);
  if (clawback > 0) {
    await recordTransaction(c.env.DB, teamId, "sponsor_termination", -clawback,
      `Vrácení nesplacené zálohy: ${contract.sponsor_name}`, termDate, `sponsor-clawback-${contract.id}`);
  }

  // Majitel firmy, se kterou klub ukončil hlavní smlouvu, se ozve SMS.
  const terminatedSponsorId = (contractRow?.sponsor_id as number | null | undefined) ?? null;
  if (category === "main" && terminatedSponsorId !== null) {
    try {
      const { enqueueMainSponsorSms } = await import("../sponsors/owner-sms-triggers");
      await enqueueMainSponsorSms(c.env.DB, teamId, terminatedSponsorId, "main_lost", `main-lost:${contract.id}`, { deliverNow: true });
    } catch (e) {
      logger.warn({ module: "game" }, "SMS od odcházejícího hlavního sponzora", e);
    }
  }

  const village = await c.env.DB.prepare("SELECT name FROM villages WHERE id = ?")
    .bind(team.village_id).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch village for termination", e); return null; });

  if (category === "main") {
    // Návrat k původnímu názvu — fanoušci z toho nadšení nejsou (-2).
    const oldName = (await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>())?.name ?? "";
    // Zkratka klubu zůstává, ze jména zmizí jen sponzor. Pohár, U21 i stará adresa webu
    // jdou s názvem (club-rename.ts).
    const defaultName = `${clubPrefixOf(oldName) ?? "SK"} ${village?.name ?? ""}`.trim();
    const renamed = await renameClub(c.env.DB, { teamId, oldName, newName: defaultName }) === "renamed";
    if (!renamed) {
      logger.warn({ module: "game", teamId }, `výpověď smlouvy ${contract.id}: název se mezitím změnil, klub se nepřejmenoval`);
    }
    {
      const { applyReputationDelta } = await import("../lib/reputation");
      await applyReputationDelta(
        c.env.DB, teamId, -2, "sponsor", "Ukončení smlouvy s hlavním sponzorem",
        { referenceId: `sponsor-term-${contract.id}` },
      );
    }

    // News for entire league
    if (renamed) {
      await c.env.DB.prepare(
        "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
      ).bind(crypto.randomUUID(), teamId,
        `${oldName} se přejmenovává na ${defaultName}`,
        `Klub ${oldName} ukončil sponzorskou smlouvu a vrací se k názvu ${defaultName}. Fanoušci zmatení (-2 reputace).`,
      ).run().catch((e) => logger.warn({ module: "game" }, "insert termination rename news", e));
    }

    return c.json({
      ok: true, fee, clawback, forfeitPenalty: forfeit.total, newTeamName: renamed ? defaultName : undefined, reputationPenalty: 2,
    });
  }

  if (category === "stadium") {
    if (village) {
      await c.env.DB.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?")
        .bind(`Sportovní areál ${village.name}`, teamId).run();
    }
  }

  // Banner — žádné rename ani penalty na reputaci
  return c.json({ ok: true, fee, clawback, forfeitPenalty: forfeit.total });
});

// POST /api/teams/:id/rename — custom rename (after sponsor termination, once per season)
gameRouter.post("/teams/:teamId/rename", async (c) => {
  const teamId = c.req.param("teamId");
  const { name } = await c.req.json<{ name: string }>();

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > MAX_CLUB_NAME_LENGTH) {
    return c.json({ error: `Název musí mít 2-${MAX_CLUB_NAME_LENGTH} znaků` }, 400);
  }

  // Check season limit
  const season = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for rename", e); return null; });
  const sn = mustSeason(season?.number);
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
  // Přejmenování klubu fanoušci neberou dobře (-3). Název se nesmí plést s jiným klubem;
  // pohár, U21 i stará adresa webu jdou s názvem; zápis podmíněný starým názvem,
  // dvojklik nepřejmenuje dvakrát (club-rename.ts).
  const outcome = await renameClub(c.env.DB, {
    teamId, oldName, newName, chosenByManager: true, seasonMark: { column: "last_main_sponsor_change_season", season: sn },
  });
  if (outcome === "name_taken") return c.json({ error: NAME_TAKEN_ERROR }, 409);
  if (outcome === "name_changed") return c.json({ error: "Název se mezitím změnil, načti stránku znovu" }, 409);
  {
    const { applyReputationDelta } = await import("../lib/reputation");
    await applyReputationDelta(
      c.env.DB, teamId, -3, "rename", `Přejmenování klubu na ${newName}`,
      { referenceId: `rename-${teamId}-s${sn}` },
    );
  }

  // News for entire league
  await c.env.DB.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
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
  const { totalRounds } = await import("../league/schedule");
  const calendar = generateSeasonCalendar(leagueId, league.season_number, new Date(), totalRounds(teamIds.length));

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

  const team = await c.env.DB.prepare("SELECT league_id, training_type, training_sessions, training_approach, training_days, training_plan, season_start, season_end, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null; training_type: string | null; training_sessions: number | null; training_approach: string | null; training_days: string | null; training_plan: string | null; season_start: string | null; season_end: string | null; game_date: string | null }>();
  if (!team?.league_id) return c.json({ season: 1, currentDay: 1, totalDays: 1, upcoming: [] });

  // Batch: league info + calendar entries
  const [leagueRes, calRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT l.id, s.number as season_number FROM leagues l JOIN seasons s ON l.season_id = s.id WHERE l.id = ?").bind(team.league_id),
    c.env.DB.prepare("SELECT sc.*, m.home_team_id, m.away_team_id, m.status as match_status, m.home_score, m.away_score, ht.name as home_name, at.name as away_name FROM season_calendar sc LEFT JOIN matches m ON m.calendar_id = sc.id AND (m.home_team_id = ? OR m.away_team_id = ?) LEFT JOIN teams ht ON m.home_team_id = ht.id LEFT JOIN teams at ON m.away_team_id = at.id WHERE sc.league_id = ? AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = sc.league_id) ORDER BY sc.scheduled_at ASC").bind(teamId, teamId, team.league_id),
  ]);
  const league = (leagueRes.results[0] as { id: string; season_number: number } | undefined) ?? null;
  const calEntries = calRes.results as Record<string, unknown>[];

  if (calEntries.length === 0) return c.json({ season: mustSeason(league?.season_number), currentDay: 1, totalDays: 1, upcoming: [] });

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
    isCup?: boolean;
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
       t1.name as home_name, t2.name as away_name, ch.venue AS friendly_venue
     FROM matches m
     JOIN teams t1 ON m.home_team_id = t1.id
     JOIN teams t2 ON m.away_team_id = t2.id
     LEFT JOIN challenges ch ON ch.match_id = m.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.calendar_id IS NULL
       AND COALESCE(m.simulated_at, m.created_at) >= ?
     ORDER BY m.created_at DESC LIMIT 10`
  ).bind(teamId, teamId, team.season_start ?? "1970-01-01").all().catch((e) => { logger.warn({ module: "game" }, "load friendlies for calendar", e); return { results: [] }; });

  for (const fm of friendlyMatches.results as Record<string, unknown>[]) {
    const isHome = fm.home_team_id === teamId;
    const opponent = isHome ? fm.away_name as string : fm.home_name as string;
    const fmStatus = fm.status as string;
    upcoming.push({
      type: "match",
      date: (fm.simulated_at ?? fm.created_at) as string,
      title: `Přátelák ${opponent}`,
      subtitle: fm.friendly_venue === "neutral" ? "Neutrální hřiště" : isHome ? "Doma" : "Venku",
      status: fmStatus === "simulated"
        ? `${fm.home_score}:${fm.away_score}`
        : fmStatus === "lineups_open" ? "Nastav sestavu!" : "Naplánováno",
      isHome,
    });
  }

  // Pohárové zápasy — vlastní tabulky (cup_matches/cup_teams), takže je kalendář
  // dosud neviděl vůbec. Na rozdíl od stripu na Sestavě bereme i odehraná kola,
  // aby v kalendáři zpětně zůstal záznam s výsledkem.
  const cupMatches = await c.env.DB.prepare(
    `SELECT cm.id, cm.round, cm.scheduled_at, cm.status, cm.home_score, cm.away_score,
       cm.home_pens, cm.away_pens, cm.home_cup_team_id, cc.total_rounds,
       ht.name AS home_name, at.name AS away_name, myct.id AS my_cup_team_id
     FROM cup_matches cm
     JOIN cup_competitions cc ON cc.id = cm.cup_id AND cc.season_number = (SELECT MAX(season_number) FROM cup_competitions)
     JOIN cup_teams myct ON myct.cup_id = cm.cup_id AND myct.team_id = ? AND (myct.id = cm.home_cup_team_id OR myct.id = cm.away_cup_team_id)
     JOIN cup_teams ht ON ht.id = cm.home_cup_team_id
     JOIN cup_teams at ON at.id = cm.away_cup_team_id
     ORDER BY cm.scheduled_at ASC`
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "load cup matches for calendar", e); return { results: [] }; });

  if (cupMatches.results.length > 0) {
    const { roundName } = await import("../cup/cup");
    for (const cm of cupMatches.results as Record<string, unknown>[]) {
      const isHome = cm.home_cup_team_id === cm.my_cup_team_id;
      const opponent = (isHome ? cm.away_name : cm.home_name) as string;
      const done = cm.status === "simulated";
      // Rozstřel dopisujeme jen když opravdu byl — u nerozstřelovaných zápasů
      // nejsou sloupce prázdné, ale nulové, takže nestačí kontrola na null.
      const hp = (cm.home_pens as number) ?? 0;
      const ap = (cm.away_pens as number) ?? 0;
      const pens = cm.home_score === cm.away_score && (hp > 0 || ap > 0)
        ? ` (pen. ${hp}:${ap})` : "";
      upcoming.push({
        type: "match",
        date: cm.scheduled_at as string,
        title: `Pohár ${opponent}`,
        subtitle: `${roundName(cm.round as number, cm.total_rounds as number)} · ${isHome ? "Doma" : "Venku"}`,
        status: done ? `${cm.home_score}:${cm.away_score}${pens}` : "Naplánováno",
        isHome,
        isCup: true,
      });
    }
  }

  // Training days — custom training_days override default mapping podle sessions
  if (team.training_type) {
    const sessions = team.training_sessions ?? 2;
    const defaultDayMap: Record<number, number[]> = {
      1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5],
    };
    let customDays: number[] | null = null;
    if (team.training_days) {
      try {
        const parsed = JSON.parse(team.training_days);
        if (Array.isArray(parsed) && parsed.every((d) => typeof d === "number" && d >= 0 && d <= 6)) {
          customDays = parsed;
        }
      } catch (e) { logger.warn({ module: "game", teamId }, "parse training_days for calendar", e); }
    }
    const trainingDays: number[] = (customDays && customDays.length > 0) ? customDays : (defaultDayMap[sessions] ?? defaultDayMap[2]);

    const typeLabels: Record<string, string> = { conditioning: "Kondice", technique: "Technika", tactics: "Taktika", match_practice: "Zápasový" };
    const approachLabels: Record<string, string> = { strict: "přísný", balanced: "vyrovnaný", relaxed: "volný" };
    const intensityLabels: Record<string, string> = { light: "lehký", normal: "normální", hard: "tvrdý" };
    const approach = team.training_approach ? approachLabels[team.training_approach] ?? "" : "";

    // Týdenní plán má u každého dne vlastní typ i intenzitu — kalendář musí ukazovat je,
    // ne jednotný typ týmu (jinak svítí u všech dnů totéž, i když se trénuje něco jiného).
    const { parseTrainingPlan } = await import("../season/daily-tick");
    const dayPlan = parseTrainingPlan((team.training_plan as string | null) ?? null, teamId);

    // Dny, kdy se hraje — v ten den trénink odpadá, stejně jako to udělá denní tick
    const zapasoveDny = new Set(
      upcoming.filter((e) => e.type === "match").map((e) => e.date.slice(0, 10)),
    );

    const today = new Date(now);
    const daysToGenerate = Math.max(14, totalDays - currentDay + 1);
    for (let d = 0; d < daysToGenerate; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() + d);
      const dow = day.getDay();
      if (zapasoveDny.has(day.toISOString().slice(0, 10))) continue;
      if (trainingDays.includes(dow)) {
        const planned = dayPlan?.[dow];
        const dayType = planned?.type ?? team.training_type;
        const label = typeLabels[dayType] ?? dayType;
        const intensity = planned ? intensityLabels[planned.intensity] : null;

        upcoming.push({
          type: "training",
          date: day.toISOString(),
          title: `Trénink ${label}`,
          subtitle: [intensity, approach].filter(Boolean).join(" · ") || `${sessions}×/týden`,
          // Samostatně, ať si kalendář nemusí intenzitu tahat z textu podtitulku
          ...(planned ? { intensity: planned.intensity } : {}),
        });
      }
    }
  }

  // Sort by date and take next events
  upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gameNow = new Date(now); gameNow.setUTCHours(0, 0, 0, 0);
  const futureEvents = upcoming.filter((e) => new Date(e.date) >= gameNow || e.status === "Naplánováno");

  return c.json({
    season: mustSeason(league?.season_number),
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

// POST /api/game/seed-market — admin: napln trh AI hráči, obnov/dopln volné hráče v okrese,
// volitelně vygeneruj legendu. Vše pro danou ligu, obejde běžné stropy (ruční admin doplnění).
// Body: { leagueId, listings?, freeAgents?, replaceFreeAgents?, celebrity?, celebrityTier? }
gameRouter.post("/game/seed-market", async (c) => {
  const body = await c.req.json<{ leagueId: string; listings?: number; freeAgents?: number; replaceFreeAgents?: boolean; celebrity?: boolean; celebrityTier?: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "parse seed-market body", e); return null; });
  if (!body?.leagueId) return c.json({ error: "Missing leagueId" }, 400);
  const league = await c.env.DB.prepare("SELECT district FROM leagues WHERE id = ?").bind(body.leagueId).first<{ district: string }>();
  if (!league) return c.json({ error: "League not found" }, 404);
  const district = league.district;
  const rng = createRng(cryptoSeed());

  // Rozumné horní meze — ruční admin doplnění, ne hromadná generace (ochrana DB/CPU).
  const wantFreeAgents = Math.min(Math.max(0, body.freeAgents ?? 0), 30);
  const wantListings = Math.min(Math.max(0, body.listings ?? 0), 30);

  // Herní datum ligy (pro expiraci volných hráčů v herním čase)
  const gd = await c.env.DB.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL LIMIT 1")
    .bind(body.leagueId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "game" }, "seed-market game_date lookup", e); return null; });
  const gameDate = gd?.game_date ? new Date(gd.game_date) : new Date();

  const result: Record<string, unknown> = { district };

  // 1) Volní hráči — obnova (smazat nejslabší) + doplnění
  if (wantFreeAgents > 0) {
    const { generateFreeAgentsForDistrict } = await import("../transfers/free-agent-pool");
    let removed = 0;
    if (body.replaceFreeAgents) {
      const del = await c.env.DB.prepare(
        "DELETE FROM free_agents WHERE id IN (SELECT id FROM free_agents WHERE district = ? ORDER BY overall_rating ASC LIMIT ?)"
      ).bind(district, wantFreeAgents).run().catch((e) => { logger.warn({ module: "game" }, "seed-market delete weak FA", e); return null; });
      removed = del?.meta?.changes ?? 0;
    }
    const gen = await generateFreeAgentsForDistrict(c.env.DB, rng, district, wantFreeAgents, gameDate);
    result.freeAgents = { removed, generated: gen };
  }

  // 2) Trh — force AI listingy (obejde strop 5)
  if (wantListings > 0) {
    const { generateAiListings } = await import("../transfers/virtual-teams");
    let made = 0;
    for (let i = 0; i < wantListings; i++) {
      made += await generateAiListings(c.env.DB, district, body.leagueId, rng, { force: true });
    }
    result.listings = made;
  }

  // 3) Legenda — bývalá ligová hvězda jako volný hráč (is_celebrity)
  if (body.celebrity) {
    const { spawnCelebrity } = await import("../season/celebrity-spawn");
    result.celebrity = await spawnCelebrity(c.env.DB, body.leagueId, rng, "legend", (body.celebrityTier as any) ?? "A");
  }

  return c.json({ ok: true, ...result });
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
  // Jména AI hráčů podle skutečných četností v ČR (data/czech-names.ts), ne vlastní
  // seznam se sedmi jmény na desetiletí.
  const { FIRSTNAMES } = await import("../data/czech-names");
  const firstnameData = { male: FIRSTNAMES };

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
  const seasonNumber = mustSeason(seasonRow?.number);

  const schedule = generateSchedule(rng, teamIds.length);
  const calendar = generateSeasonCalendar(league.id, seasonNumber, new Date(), totalRounds(teamIds.length));
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
      await runScheduledMatches(db, cal.id, c.env.GEMINI_API_KEY);
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

// POST /api/game/staff-tick — staff tick (masér, lékař, správce, psycholog, kurzy, skaut, pool).
// Samostatný cron (0 5 * * *); tenhle endpoint je pro ruční spuštění na testu (bez cronů).
gameRouter.post("/game/staff-tick", async (c) => {
  const { executeStaffTick } = await import("../staff/staff-tick");
  const result = await executeStaffTick(c.env);
  return c.json({ ok: true, type: "staff", result });
});

// POST /api/game/run-matches[?leagueId=X] — simulace zápasů.
//
// Volá TUTÉŽ processLeagueRound() jako cron i konzumer fronty. Dřív tu byla čtvrtá
// kopie zpracování kola, která se od cronu lišila (chyběly události mezi koly
// i notifikace a hlavně filtr na aktuální sezónu, takže uměla odsimulovat kolo
// ze staré sezóny). Tím je ta divergence pryč a ruční test na testingu dělá
// bit po bitu totéž co produkční fronta.
gameRouter.post("/game/run-matches", async (c) => {
  const { recoverStuckRounds } = await import("../multiplayer/match-runner");
  const { findLeaguesWithDueRound, processLeagueRound } = await import("../season/league-round");
  const targetLeagueId = c.req.query("leagueId");
  // ?all=1 zpracuje všechny splatné ligy; bez něj se drží původní chování (jedna liga).
  const processAll = c.req.query("all") === "1";

  // Recovery: dohraj kola uvízlá v 'lineup_locked' (simulace spadla v půlce). Bez tohoto
  // by endpoint i cron locked kolo ignorovaly (hledají jen 'scheduled') a liga by stála.
  let recoveredRounds: { calendarId: string; leagueId: string; matches: number }[] = [];
  try {
    recoveredRounds = await recoverStuckRounds(c.env.DB, c.env.GEMINI_API_KEY);
  } catch (e) { logger.warn({ module: "game" }, "stuck round recovery failed", e); }

  const due = await findLeaguesWithDueRound(c.env.DB);
  const targets = targetLeagueId ? due.filter((d) => d.leagueId === targetLeagueId) : due;

  let totalMatches = 0;
  let processedLeague: string | null = null;
  const rounds: Array<{ leagueId: string; status: string; matches: number; durationMs: number; queries: number }> = [];

  for (const lg of targets) {
    const result = await processLeagueRound(c.env, lg.leagueId);
    rounds.push({
      leagueId: result.leagueId,
      status: result.status,
      matches: result.matches,
      durationMs: result.durationMs,
      queries: result.queries,
    });
    totalMatches += result.matches;
    if (result.status === "done") {
      processedLeague = result.leagueId;
      // Původní chování: bez ?leagueId a bez ?all zpracuj jen první ligu s kolem.
      if (!targetLeagueId && !processAll) break;
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
  return c.json({ ok: true, type: "matches", totalMatches, processedLeague, rounds, recoveredRounds, debug: debugLogs });
});

// POST /api/game/generate-round-report?calendarId=X
// Dogeneruje chybějící AI souhrn kola (news type 'ai_report'). Recovery uvízlého kola
// vkládá jen základní round_results — tenhle dotvoří plný redakční článek.
// Idempotentní: pokud ai_report pro kolo už existuje, nedělá nic.
gameRouter.post("/game/generate-round-report", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (!calendarId) return c.json({ error: "calendarId je povinný" }, 400);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY není nastaven" }, 500);

  const cal = await c.env.DB.prepare(
    "SELECT league_id, game_week, status FROM season_calendar WHERE id = ?"
  ).bind(calendarId).first<{ league_id: string; game_week: number; status: string }>();
  if (!cal) return c.json({ error: "kolo nenalezeno" }, 404);
  if (cal.status !== "simulated") return c.json({ error: `kolo není simulated (${cal.status})` }, 400);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM news WHERE league_id = ? AND game_week = ? AND type = 'ai_report'"
  ).bind(cal.league_id, cal.game_week).first();
  if (existing) return c.json({ ok: false, skipped: true, reason: "ai_report pro toto kolo už existuje" });

  // standingsBefore: nejlepší dostupné přiblížení = aktuální tabulka (kolo je už odehrané).
  // Pozice "před kolem" mohou být mírně posunuté, ale fakta o zápasech jsou přesná.
  const { calculateStandings } = await import("../stats/standings");
  const { generateAiRoundReport } = await import("../news/ai-reporter");
  const standings = await calculateStandings(c.env.DB, cal.league_id);
  await generateAiRoundReport(c.env.DB, c.env.GEMINI_API_KEY, cal.league_id, calendarId, cal.game_week, standings);

  const report = await c.env.DB.prepare(
    "SELECT headline, substr(body, 1, 240) as preview, length(body) as len FROM news WHERE league_id = ? AND game_week = ? AND type = 'ai_report'"
  ).bind(cal.league_id, cal.game_week).first();
  return c.json({ ok: true, calendarId, gameWeek: cal.game_week, generated: !!report, report });
});

// POST /api/game/fix-match-finances?matchId=X&teamId=Y
// Doplní match-day finance pro tým, kterému chybí — half-processed zápas, kde simulace spadla
// mezi financemi domácího a hostů (zápas zůstal 'simulated', takže recovery ho nesáhne).
// Idempotentní: pokud tým už má transakce pro tento zápas, nedělá nic.
gameRouter.post("/game/fix-match-finances", async (c) => {
  const matchId = c.req.query("matchId");
  const teamId = c.req.query("teamId");
  if (!matchId || !teamId) return c.json({ error: "matchId a teamId jsou povinné" }, 400);

  const match = await c.env.DB.prepare(
    "SELECT home_team_id, away_team_id, home_score, away_score, attendance, status FROM matches WHERE id = ?"
  ).bind(matchId).first<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number; attendance: number; status: string }>();
  if (!match) return c.json({ error: "zápas nenalezen" }, 404);
  if (match.status !== "simulated") return c.json({ error: `zápas není simulated (${match.status})` }, 400);

  const isHome = match.home_team_id === teamId;
  const isAway = match.away_team_id === teamId;
  if (!isHome && !isAway) return c.json({ error: "tým v tomto zápase nehrál" }, 400);

  // Idempotence: tým už finance pro tento zápas má → nepřidávej znovu
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) as c FROM transactions WHERE team_id = ? AND reference_id = ?"
  ).bind(teamId, matchId).first<{ c: number }>();
  if ((existing?.c ?? 0) > 0) {
    return c.json({ ok: false, skipped: true, reason: `tým už má ${existing!.c} transakcí pro tento zápas` });
  }

  const { processMatchDayFinances, processCashLoanRepayment } = await import("../season/finance-processor");
  const hs = match.home_score, as_ = match.away_score;
  const result: "win" | "draw" | "loss" = isHome
    ? (hs > as_ ? "win" : hs < as_ ? "loss" : "draw")
    : (as_ > hs ? "win" : as_ < hs ? "loss" : "draw");
  const opponentId = isHome ? match.away_team_id : match.home_team_id;
  const oppRow = await c.env.DB.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(opponentId).first<{ reputation: number }>();
  const opponentRep = oppRow?.reputation ?? 50;
  const gameDate = new Date().toISOString();

  const before = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
  await processMatchDayFinances(c.env.DB, teamId, matchId, isHome, result, match.attendance ?? 0, gameDate, opponentRep);
  await processCashLoanRepayment(c.env.DB, teamId, matchId, gameDate);
  const after = await c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();

  const txs = await c.env.DB.prepare("SELECT type, amount FROM transactions WHERE team_id = ? AND reference_id = ?")
    .bind(teamId, matchId).all<{ type: string; amount: number }>();
  return c.json({
    ok: true, matchId, teamId, isHome, result, attendance: match.attendance,
    budgetBefore: before?.budget, budgetAfter: after?.budget,
    delta: (after?.budget ?? 0) - (before?.budget ?? 0),
    transactions: txs.results,
  });
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
const TOURNAMENT_STAGE_NAME: Record<string, string> = { qf: "čtvrtfinále", sf: "semifinále", third: "zápas o 3. místo", final: "finále" };

/** „Turnaj P-Mobile, 2. den" / „Turnaj P-Mobile, finále" */
function tournamentRoundName(m: Record<string, unknown>): string {
  const name = (m.tournament_name as string) ?? "Turnaj";
  return m.stage === "league" ? `${name}, ${m.day}. den` : `${name}, ${TOURNAMENT_STAGE_NAME[m.stage as string] ?? m.stage}`;
}

/** Turnajový zápas týmu: konkrétní (`matchId`), nebo nejbližší neodehraný. Stejné sloupce jako zápasy ligy. */
async function loadTournamentMatchForTeam(db: D1Database, teamId: string, matchId: string | null): Promise<Record<string, unknown> | null> {
  return db.prepare(
    `SELECT m.id, m.tournament_id, m.stage, m.day, m.scheduled_at, m.home_team_id, m.away_team_id,
            h.name AS home_name, a.name AS away_name, h.primary_color AS home_color, a.primary_color AS away_color,
            t.name AS tournament_name, t.city, v.name AS venue_name
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
       LEFT JOIN tournament_venues v ON v.id = m.venue_id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?)
        AND ${matchId ? "m.id = ?" : "m.status = 'scheduled'"}
      ORDER BY m.scheduled_at ASC LIMIT 1`
  ).bind(...(matchId ? [teamId, teamId, matchId] : [teamId, teamId])).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game" }, "turnajový zápas pro sestavu", e); return null; });
}

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
  let isCup = false;
  let isTournament = false;
  let cupRoundName: string | null = null;

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
      } else {
        // Možná je to pohárový zápas (cup_matches.id). Pohár má oddělené tabulky (cup_teams),
        // soupeř může být velkoklub bez reálného teams řádku → jméno/barvy bereme z cup_teams.
        const cupM = await c.env.DB.prepare(
          `SELECT cm.id, cm.round, cm.scheduled_at, cc.total_rounds, cm.home_cup_team_id,
             ht.name AS home_name, ht.primary_color AS home_color, ht.team_id AS home_team_id,
             at.name AS away_name, at.primary_color AS away_color, at.team_id AS away_team_id,
             myct.id AS my_cup_team_id
           FROM cup_matches cm
           JOIN cup_competitions cc ON cc.id = cm.cup_id
           JOIN cup_teams myct ON myct.cup_id = cm.cup_id AND myct.team_id = ? AND (myct.id = cm.home_cup_team_id OR myct.id = cm.away_cup_team_id)
           JOIN cup_teams ht ON ht.id = cm.home_cup_team_id
           JOIN cup_teams at ON at.id = cm.away_cup_team_id
           WHERE cm.id = ?`
        ).bind(teamId, requestedCalId).first<Record<string, unknown>>()
          .catch((e) => { logger.warn({ module: "game" }, "load requested cup match", e); return null; });
        if (cupM) {
          match = cupM;
          isCup = true;
          calendarId = cupM.id as string;
          scheduledAt = cupM.scheduled_at as string | null;
          const { roundName } = await import("../cup/cup");
          cupRoundName = roundName(cupM.round as number, cupM.total_rounds as number);
        } else {
          // Turnaj P-Mobile (tournament_matches.id) — sestava se ukládá na id zápasu jako u poháru.
          const tm = await loadTournamentMatchForTeam(c.env.DB, teamId, requestedCalId);
          if (tm) {
            match = tm;
            isTournament = true;
            calendarId = tm.id as string;
            scheduledAt = tm.scheduled_at as string;
            cupRoundName = tournamentRoundName(tm);
          }
        }
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
    } else {
      // Kandidáti na "nejbližší zápas": nejbližší ligové kolo + nejbližší pohárový zápas.
      // Vybereme chronologicky dřívější — pohár se tak správně zařadí mezi ligová kola.
      let leagueCand: { calId: string; gameWeek: number; scheduledAt: string; match: Record<string, unknown> } | null = null;
      if (team.league_id) {
        // Nejstarší NEODEHRANÉ ligové kolo AKTUÁLNÍ sezóny, které MÁ zápasy. Bez filtru
        // scheduled_at >= game_date (přeskakoval by kola předběhnutá kalendářem); prázdné týdny
        // a minulé sezóny se přeskakují — jinak blokují sestavu.
        const nextCal = await c.env.DB.prepare(
          "SELECT sc.id, sc.scheduled_at, sc.game_week FROM season_calendar sc WHERE sc.league_id = ? AND sc.status = 'scheduled' AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = sc.league_id) AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id) ORDER BY sc.scheduled_at ASC LIMIT 1"
        ).bind(team.league_id).first<{ id: string; scheduled_at: string; game_week: number }>();
        if (nextCal) {
          const lm = await c.env.DB.prepare(
            "SELECT m.id, m.home_team_id, m.away_team_id, t1.name as home_name, t2.name as away_name, t1.primary_color as home_color, t2.primary_color as away_color FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id WHERE m.calendar_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?)"
          ).bind(nextCal.id, teamId, teamId).first<Record<string, unknown>>();
          if (lm) leagueCand = { calId: nextCal.id, gameWeek: nextCal.game_week, scheduledAt: nextCal.scheduled_at, match: lm };
        }
      }
      // Nejbližší neodehraný pohárový zápas tohoto týmu (oba soupeři už známí).
      const nextCup = await c.env.DB.prepare(
        `SELECT cm.id, cm.round, cm.scheduled_at, cc.total_rounds, cm.home_cup_team_id,
           ht.name AS home_name, ht.primary_color AS home_color, ht.team_id AS home_team_id,
           at.name AS away_name, at.primary_color AS away_color, at.team_id AS away_team_id,
           myct.id AS my_cup_team_id
         FROM cup_matches cm
         JOIN cup_competitions cc ON cc.id = cm.cup_id AND cc.season_number = (SELECT MAX(season_number) FROM cup_competitions)
         JOIN cup_teams myct ON myct.cup_id = cm.cup_id AND myct.team_id = ? AND (myct.id = cm.home_cup_team_id OR myct.id = cm.away_cup_team_id)
         JOIN cup_teams ht ON ht.id = cm.home_cup_team_id
         JOIN cup_teams at ON at.id = cm.away_cup_team_id
         WHERE cm.status = 'scheduled' AND cm.scheduled_at IS NOT NULL
         ORDER BY cm.scheduled_at ASC LIMIT 1`
      ).bind(teamId).first<Record<string, unknown>>()
        .catch((e) => { logger.warn({ module: "game" }, "load next cup match", e); return null; });

      const nextTournament = await loadTournamentMatchForTeam(c.env.DB, teamId, null);
      const cupAt = (nextCup?.scheduled_at as string | undefined) ?? null;
      const tourAt = (nextTournament?.scheduled_at as string | undefined) ?? null;
      const useTournament = !!nextTournament && (!leagueCand || (tourAt ?? "") < leagueCand.scheduledAt) && (!cupAt || (tourAt ?? "") < cupAt);
      const useCup = !useTournament && nextCup && (!leagueCand || ((nextCup.scheduled_at as string) ?? "") < leagueCand.scheduledAt);
      if (useTournament && nextTournament) {
        match = nextTournament;
        isTournament = true;
        calendarId = nextTournament.id as string;
        scheduledAt = tourAt;
        cupRoundName = tournamentRoundName(nextTournament);
      } else if (useCup && nextCup) {
        match = nextCup;
        isCup = true;
        calendarId = nextCup.id as string;
        scheduledAt = nextCup.scheduled_at as string | null;
        const { roundName } = await import("../cup/cup");
        cupRoundName = roundName(nextCup.round as number, nextCup.total_rounds as number);
      } else if (leagueCand) {
        calendarId = leagueCand.calId;
        gameWeek = leagueCand.gameWeek;
        scheduledAt = leagueCand.scheduledAt;
        match = leagueCand.match;
      }
    }
  }

  if (!match) return c.json({ nextMatch: null });

  // Local derby detection — oba týmy ze stejné village_id
  let isLocalDerby = false;
  if (match.home_team_id && match.away_team_id) {
    const vr = await c.env.DB.prepare(
      "SELECT CASE WHEN h.village_id = a.village_id AND h.village_id IS NOT NULL THEN 1 ELSE 0 END as d FROM teams h, teams a WHERE h.id = ? AND a.id = ?"
    ).bind(match.home_team_id as string, match.away_team_id as string).first<{ d: number }>()
      .catch((e) => { logger.warn({ module: "game" }, "derby check", e); return null; });
    isLocalDerby = vr?.d === 1;
  }

  // For friendlies, lookup lineup by match_id; for league by calendar_id
  const lineupQuery = isFriendly
    ? c.env.DB.prepare("SELECT formation, tactic, hardness, players_data, is_auto, captain_id, preset_slot, match_plan, bench_data FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, match.id as string)
    : c.env.DB.prepare("SELECT formation, tactic, hardness, players_data, is_auto, captain_id, preset_slot, match_plan, bench_data FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(teamId, calendarId!);

  // Batch: existing lineup + all players (including injured)
  const [lineupRes, playersRes] = await c.env.DB.batch([
    lineupQuery,
    c.env.DB.prepare("SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.weekly_wage, p.skills, p.life_context, p.personality, p.physical, p.squad_number, p.commute_km, p.suspended_matches, p.is_celebrity, ps.avg_rating, i.days_remaining as injury_days, i.type as injury_type FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0 LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id AND ps.season_id = (SELECT id FROM seasons WHERE status = 'active' LIMIT 1) WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.overall_rating DESC").bind(teamId),
  ]);
  let lineup = (lineupRes.results[0] as { formation: string; tactic: string; hardness: string | null; players_data: string; is_auto: number; captain_id: string | null; preset_slot: string | null; match_plan: string | null; bench_data: string | null } | undefined) ?? null;
  let lineupSource: "explicit" | "default" | null = lineup ? "explicit" : null;

  // If no lineup for this specific match, use the last saved lineup as default
  if (!lineup) {
    lineup = await c.env.DB.prepare(
      "SELECT formation, tactic, hardness, players_data, is_auto, captain_id, preset_slot, match_plan, bench_data FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1"
    ).bind(teamId).first<{ formation: string; tactic: string; hardness: string | null; players_data: string; is_auto: number; captain_id: string | null; preset_slot: string | null; match_plan: string | null; bench_data: string | null }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
    if (lineup) lineupSource = "default";
  }
  const players = { results: playersRes.results as Record<string, unknown>[] };
  // V turnaji platí jen turnajové stopky (ligové se tam neodpykávají a naopak).
  if (isTournament) {
    const { loadTournamentSuspensions } = await import("../tournament/match");
    const susp = await loadTournamentSuspensions(c.env.DB, match.tournament_id as string, [teamId])
      .catch((e) => { logger.warn({ module: "game" }, "turnajové stopky pro sestavu", e); return new Map<string, number>(); });
    for (const r of players.results) r.suspended_matches = susp.get(r.id as string) ?? 0;
  }

  // Generate absences only day_before or match_day (not 2+ days before) — friendlies always match_day
  const matchDate = new Date(scheduledAt!);
  const daysUntilMatch = isFriendly ? 0 : Math.max(0, Math.round((matchDate.getTime() - gameDate.getTime()) / 86400000));

  const { absenceSeedForMatch } = await import("../lib/seed");
  const { generateAbsences } = await import("../events/absence");
  const { fetchTeamDistrict, visibleAbsencePhases } = await import("../events/match-absences");
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

  const { hracProAbsenci } = await import("../events/absence");
  const district = await fetchTeamDistrict(c.env.DB, teamId);
  // Preview spouští fáze se stejnými seedy jako SMS + simulace, pak deduplikuje dle playerIndex.
  // Den předem jen výmluvy „den předem“, ranní až v den zápasu, kdy je hráči pošlou do skupiny
  // (visibleAbsencePhases). 2+ dny předem nic. Přátelák = vyšší šance.
  const friendlyMultiplier = isFriendly ? 1.8 : undefined;
  const phases = visibleAbsencePhases(daysUntilMatch);
  let absences: ReturnType<typeof generateAbsences> = [];
  if (phases.length > 0) {
    // Vlivy incidentů (spec 17a) se čtou jen tady — los běží jen v tomhle okně, dřív se dotaz
    // na incidenty a sestavení absenceSquad dělaly zbytečně i 2+ dny před zápasem.
    const { nactiIncidentniKontext, pridejIncidentniAbsence } = await import("../incidents/absence-hracu");
    const incKontext = await nactiIncidentniKontext(c.env.DB, teamId, scheduledAt!);
    const absenceSquad = healthyPlayers.map((row) => hracProAbsenci(row, incKontext.druhy.get(row.id as string)));
    const dayBeforeRng = createRng(absenceSeedForMatch({ matchKey, teamId, phase: "day_before" }));
    const matchDayRng = createRng(absenceSeedForMatch({ matchKey, teamId, phase: "match_day" }));
    // Dodávka musí být i tady: preview jede na stejných seedech jako SMS a simulace,
    // takže bez ní by ukazovalo absence, které se pak neodehrají.
    const { kontextDojizdeni } = await import("../events/match-absences");
    // Podle klíče, ne podle kalendáře — `matchKey` je u poháru id pohárového
    // zápasu a u přáteláku id zápasu, a ani jedno kalendář nezná.
    const { resolveWeatherForMatchKey } = await import("../season/season-weather");
    const { commuteMod, maDodavku, isAway } = await kontextDojizdeni(c.env.DB, teamId, matchKey);
    const weather = (await resolveWeatherForMatchKey(c.env.DB, matchKey))?.weather;
    const dayBeforeAbs = generateAbsences(dayBeforeRng as any, absenceSquad, { timing: "day_before", district, friendlyMultiplier, commuteMod, maDodavku, isAway, weather });
    // Každá fáze má vlastní seed, takže vynechání ranní fáze los „den předem“ neposune.
    const matchDayAbs = phases.includes("match_day")
      ? generateAbsences(matchDayRng as any, absenceSquad, { timing: "match_day", district, friendlyMultiplier, commuteMod, maDodavku, isAway, weather })
      : [];
    const seen = new Set<number>();
    absences = pridejIncidentniAbsence(
      [...dayBeforeAbs, ...matchDayAbs].filter((a) => {
        if (seen.has(a.playerIndex)) return false;
        seen.add(a.playerIndex);
        return true;
      }),
      healthyPlayers.map((r) => r.id as string), incKontext.absence, "day_before",
    );
  }
  const absentPlayerIds = new Set(absences.map((a) => healthyPlayers[a.playerIndex]?.id as string).filter(Boolean));

  // Load relationships for lineup visualization
  const playerIds = players.results.map((p) => p.id as string);
  // `strength` a `effect` jde do UI spolu s typem — sestavovač z toho počítá chemii
  // stejnými vahami jako engine (packages/shared: CHEMISTRY_WEIGHTS).
  let relMap: Record<string, Array<{ otherPlayerId: string; type: string; strength: number; effect: string }>> = {};
  if (playerIds.length > 1) {
    try {
      const { CHEMISTRY_EFFECT_TEXT } = await import("@okresni-masina/shared");
      const placeholders = playerIds.map(() => "?").join(",");
      const relRows = await c.env.DB.prepare(
        `SELECT player_a_id, player_b_id, type, strength FROM relationships WHERE player_a_id IN (${placeholders}) OR player_b_id IN (${placeholders})`
      ).bind(...playerIds, ...playerIds).all();
      for (const r of relRows.results as Array<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }>) {
        if (!relMap[r.player_a_id]) relMap[r.player_a_id] = [];
        if (!relMap[r.player_b_id]) relMap[r.player_b_id] = [];
        const strength = r.strength ?? 50;
        const effect = CHEMISTRY_EFFECT_TEXT[r.type as keyof typeof CHEMISTRY_EFFECT_TEXT] ?? "";
        relMap[r.player_a_id].push({ otherPlayerId: r.player_b_id, type: r.type, strength, effect });
        relMap[r.player_b_id].push({ otherPlayerId: r.player_a_id, type: r.type, strength, effect });
      }
    } catch (e) {
      logger.warn({ module: "game" }, "relationships query for lineup", e);
    }
  }

  const available = players.results.map((p) => {
    const skills = (() => { try { return JSON.parse(p.skills as string); } catch (e) { logger.warn({ module: "game" }, "parse player skills for lineup", e); return {}; } })();
    const lc = (() => { try { return JSON.parse(p.life_context as string); } catch (e) { logger.warn({ module: "game" }, "parse player life_context for lineup", e); return {}; } })();
    // Vůdcovství potřebuje výběr kapitána — bez něj se kapitán vybíral naslepo
    const pers = (() => { try { return JSON.parse(p.personality as string); } catch (e) { logger.warn({ module: "game" }, "parse player personality for lineup", e); return {}; } })();
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
      setPieces: skills.setPieces ?? 50,
      leadership: pers.leadership ?? 30,
      avgRating: p.avg_rating ?? null,
      hangover: !!lc.hangover,
      absent,
      injured,
      suspended,
      suspendedMatches: suspended ? (p.suspended_matches as number) : null,
      injuryDays: injured ? (p.injury_days as number) : null,
      injuryType: injured ? (p.injury_type as string) : null,
      absenceReason: suspended ? "Stopka" : injured ? "Zranění" : (absenceInfo?.reason ?? null),
      absenceSms: suspended ? suspensionSms(p.suspended_matches as number)
        : injured ? injurySms(p.id as string, p.injury_type as string | null, p.injury_days as number)
        : (absenceInfo?.smsText ?? null),
      absenceEmoji: suspended ? "🟥" : injured ? "🩹" : (absenceInfo?.emoji ?? null),
      relationships: relMap[p.id as string] ?? [],
    };
  });

  // Upcoming matches strip — ligové, přátelské i pohárové, sloučené chronologicky
  let upcomingMatches: Array<{ calendarId: string; gameWeek: number | null; scheduledAt: string; opponentName: string; isHome: boolean; hasLineup: boolean; isFriendly: boolean; isCup?: boolean; isTournament?: boolean; roundName?: string | null }> = [];
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
    // Pohárové zápasy (nadcházející, oba soupeři známí) — cup_matches.id jako calendarId
    const upcomingCup = await c.env.DB.prepare(
      `SELECT cm.id, cm.round, cm.scheduled_at, cc.total_rounds, cm.home_cup_team_id,
        ht.name AS home_name, at.name AS away_name, myct.id AS my_cup_team_id,
        (SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = cm.id) AS has_lineup
      FROM cup_matches cm
      JOIN cup_competitions cc ON cc.id = cm.cup_id AND cc.season_number = (SELECT MAX(season_number) FROM cup_competitions)
      JOIN cup_teams myct ON myct.cup_id = cm.cup_id AND myct.team_id = ? AND (myct.id = cm.home_cup_team_id OR myct.id = cm.away_cup_team_id)
      JOIN cup_teams ht ON ht.id = cm.home_cup_team_id
      JOIN cup_teams at ON at.id = cm.away_cup_team_id
      WHERE cm.status = 'scheduled'
      ORDER BY cm.scheduled_at ASC`
    ).bind(teamId, teamId).all();
    if (upcomingCup.results.length > 0) {
      const { roundName } = await import("../cup/cup");
      for (const u of upcomingCup.results) {
        const isHome = u.home_cup_team_id === u.my_cup_team_id;
        upcomingMatches.push({
          calendarId: u.id as string,
          gameWeek: null,
          scheduledAt: (u.scheduled_at as string | null) ?? "",
          opponentName: (isHome ? u.away_name : u.home_name) as string,
          isHome,
          hasLineup: (u.has_lineup as number) > 0,
          isFriendly: false,
          isCup: true,
          roundName: roundName(u.round as number, u.total_rounds as number),
        });
      }
    }
    // Turnaj P-Mobile — tournament_matches.id jako calendarId
    const upcomingTournament = await c.env.DB.prepare(
      `SELECT m.id, m.stage, m.day, m.scheduled_at, m.home_team_id, h.name AS home_name, a.name AS away_name, t.name AS tournament_name,
        (SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = m.id) AS has_lineup
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
       WHERE m.status = 'scheduled' AND (m.home_team_id = ? OR m.away_team_id = ?)
       ORDER BY m.scheduled_at ASC LIMIT 12`
    ).bind(teamId, teamId, teamId).all();
    for (const u of upcomingTournament.results) {
      const isHome = u.home_team_id === teamId;
      upcomingMatches.push({
        calendarId: u.id as string,
        gameWeek: null,
        scheduledAt: u.scheduled_at as string,
        opponentName: (isHome ? u.away_name : u.home_name) as string,
        isHome,
        hasLineup: (u.has_lineup as number) > 0,
        isFriendly: false,
        isTournament: true,
        roundName: tournamentRoundName(u),
      });
    }
    // Sloučit chronologicky
    upcomingMatches.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  } catch (e) { logger.warn({ module: "game" }, "fetch upcoming matches", e); }

  // Delegovaný rozhodčí. Vyplní se dva herní dny před výkopem — do té doby null
  // a frontend řekne, že se sudí teprve losuje. Přátelák rozhodčího nemá.
  let refereeInfo: Record<string, unknown> | null = null;
  if (!isFriendly) {
    try {
      // Pohár se nedeleguje dva dny předem — sudí je deterministický z id zápasu,
      // takže ho jde ukázat rovnou. Dotaz do `matches` by u pohárového id nevrátil nic,
      // protože pohár žije v `cup_matches`; karta by pak byla vždycky prázdná.
      let refRow: Record<string, unknown> | null = null;
      if (isTournament) {
        const { loadDistrictReferee } = await import("../referees/load");
        const { profile } = await loadDistrictReferee(c.env.DB, match.id as string, match.city as string);
        if (profile.id) {
          refRow = await c.env.DB.prepare("SELECT * FROM referees WHERE id = ?")
            .bind(profile.id).first<Record<string, unknown>>();
        }
      } else if (isCup) {
        const { loadCupReferee } = await import("../referees/load");
        const { profile } = await loadCupReferee(
          c.env.DB, match.id as string, (match.home_team_id as string | null) ?? null,
        );
        if (profile.id) {
          refRow = await c.env.DB.prepare("SELECT * FROM referees WHERE id = ?")
            .bind(profile.id).first<Record<string, unknown>>();
        }
      } else {
        refRow = await c.env.DB.prepare(
          `SELECT r.*, m.referee_id AS assigned
           FROM matches m JOIN referees r ON r.id = m.referee_id
           WHERE m.id = ?`
        ).bind(match.id as string).first<Record<string, unknown>>();
      }
      if (refRow) {
        const { archetypeLabel, refereeBias } = await import("../engine/referee");
        const { refereeFullName } = await import("../referees/referee-generator");
        const seasonRow = await c.env.DB.prepare(
          "SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
        ).first<{ number: number }>();
        const st = await c.env.DB.prepare(
          `SELECT SUM(matches) m, SUM(yellow_cards) y, SUM(red_cards) rc,
                  SUM(fouls) f, SUM(grade_sum) gs
           FROM referee_stats WHERE referee_id = ? AND season_number = ?`
        ).bind(refRow.id as string, seasonRow?.number ?? 1).first<Record<string, number | null>>();
        const rel = await c.env.DB.prepare(
          `SELECT matches, wins, draws, losses, yellow_cards, red_cards, sentiment, duvod
           FROM referee_team_relations WHERE referee_id = ? AND team_id = ?`
        ).bind(refRow.id as string, teamId).first<Record<string, number | string>>();
        const played = st?.m ?? 0;
        refereeInfo = {
          id: refRow.id,
          name: refereeFullName(refRow as never),
          nickname: refRow.nickname,
          age: refRow.age,
          occupation: refRow.occupation,
          archetype: refRow.archetype,
          archetypeLabel: archetypeLabel(refRow.archetype as string, refRow.gender as string | null),
          bio: refRow.bio,
          hlaska: refRow.hlaska,
          strictness: refRow.strictness,
          cardHappiness: refRow.card_happiness,
          experience: refRow.experience,
          homeBias: refRow.home_bias,
          advantage: refRow.advantage,
          fitness: refRow.fitness,
          avatar: (() => { try { return refRow.avatar ? JSON.parse(refRow.avatar as string) : null; } catch { return null; } })(),
          stats: played > 0 ? {
            matches: played,
            avgGrade: Math.round(((st!.gs ?? 0) / played) * 100) / 100,
            cardsPerMatch: Math.round((((st!.y ?? 0) + (st!.rc ?? 0)) / played) * 100) / 100,
            foulsPerMatch: Math.round(((st!.f ?? 0) / played) * 10) / 10,
          } : null,
          vsTeam: rel && (rel.matches as number) > 0 ? rel : null,
          // Paměť sudího vůči klubu — žádný skrytý modifikátor, karta ukazuje
          // spočítané procento i důvod.
          memory: rel && (rel.sentiment as number) !== 0 ? {
            sentiment: rel.sentiment as number,
            duvod: (rel.duvod as string) || null,
            biasPct: Math.round(Math.abs(refereeBias(rel.sentiment as number)) * 1000) / 10,
          } : null,
        };
      }
    } catch (e) { logger.warn({ module: "game" }, "načtení delegovaného rozhodčího", e); }
  }

  // Předpověď na zápas + tipy, co podmínky udělají se hrou. Trenér je vidí ještě
  // před uložením sestavy, takže se podle nich může rozhodnout o taktice.
  const homeTeamId = match.home_team_id as string;
  const { forecastForMatch } = await import("../season/season-weather");
  // Ze stejného zdroje jako simulace, bufet i omluvenky hráčů.
  const forecast = await forecastForMatch(
    c.env.DB, (match.calendar_id as string | null) ?? null, scheduledAt ?? "", String(match.id),
  );
  const pitchRow = isTournament ? null : await c.env.DB.prepare(
    "SELECT pitch_condition, pitch_moisture FROM stadiums WHERE team_id = ?"
  ).bind(homeTeamId).first<{ pitch_condition: number; pitch_moisture: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "hriste k tipum na sestavu", e); return null; });
  const winter = await c.env.DB.prepare(
    "SELECT winter_gear, winter_gear_condition FROM equipment WHERE team_id = ?"
  ).bind(teamId).first<{ winter_gear: number; winter_gear_condition: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "zimni vybava k tipum na sestavu", e); return null; });

  const { tacticHints } = await import("../engine/tactic-hints");
  const hints = tacticHints({
    weather: forecast.expected,
    pitchCondition: pitchRow?.pitch_condition ?? null,
    pitchMoisture: pitchRow?.pitch_moisture ?? null,
    tactic: lineup?.tactic ?? null,
    weatherResist: winter ? (winter.winter_gear ?? 0) * ((winter.winter_gear_condition ?? 50) / 100) * 0.15 : 0,
  });

  return c.json({
    referee: refereeInfo,
    forecast: {
      icon: forecast.icon,
      expected: forecast.expected,
      temperature: forecast.temperature,
      description: forecast.description,
    },
    pitch: {
      condition: pitchRow?.pitch_condition ?? null,
      moisture: pitchRow?.pitch_moisture ?? null,
    },
    tacticHints: hints,
    nextMatch: {
      matchId: match.id,
      calendarId: (isFriendly || isCup || isTournament) ? (match.id as string) : calendarId,
      gameWeek: gameWeek,
      scheduledAt: scheduledAt,
      isHome: match.home_team_id === teamId,
      homeName: match.home_name, awayName: match.away_name,
      homeColor: match.home_color, awayColor: match.away_color,
      isFriendly,
      isCup,
      isTournament,
      venueName: isTournament ? (match.venue_name as string | null) ?? null : null,
      roundName: cupRoundName,
      isLocalDerby,
    },
    lineup: lineup ? {
      formation: lineup.formation, tactic: lineup.tactic,
      hardness: lineup.hardness ?? "normal",
      isAuto: lineup.is_auto === 1,
      captainId: lineup.captain_id ?? null,
      presetSlot: lineup.preset_slot ?? null,
      ...storedExtrasForSquad(lineup, new Set(players.results.map((p) => p.id as string))),
      source: lineupSource, // "explicit" = pro tento zápas, "default" = fallback z poslední uložené
      players: (() => { try { return JSON.parse(lineup.players_data); } catch (e) { logger.warn({ module: "game" }, "parse lineup players_data", e); return []; } })(),
    } : null,
    availablePlayers: available,
    upcomingMatches,
  });
});

// POST lineup-preview — vrátí sílu sestavy (per linie, attack/defense, overall)
// + comparison se soupeřem (auto best 11). Pure read, žádné DB writes.
// Když je předán matchId, backend si sám dohledá opponent.
gameRouter.post("/teams/:teamId/lineup-preview", async (c) => {
  const teamId = c.req.param("teamId");
  let body: {
    matchId?: string;
    formation?: string;
    tactic?: string;
    hardness?: string;
    captainId?: string | null;
    players?: Array<{ playerId: string; matchPosition: string }>;
  };
  try {
    body = await c.req.json();
  } catch (e) {
    logger.warn({ module: "game" }, "lineup-preview parse body", e);
    return c.json({ error: "invalid_body" }, 400);
  }

  const players = body.players ?? [];
  if (players.length === 0) return c.json({ error: "no_players" }, 400);

  const { mapRowToMatchPlayer, autoSelectBest11 } = await import("../engine/lineup-loader");
  const { calcLineupPreview } = await import("../engine/lineup-strength");

  // Load own players
  const placeholders = players.map(() => "?").join(",");
  const rows = (await c.env.DB.prepare(
    `SELECT id, first_name, last_name, nickname, position, skills, personality, life_context, physical FROM players WHERE id IN (${placeholders}) AND team_id = ?`
  ).bind(...players.map((p) => p.playerId), teamId).all<{ id: string; first_name: string; last_name: string; nickname: string | null; position: string; skills: string; personality: string; life_context: string; physical: string | null }>()).results ?? [];

  const posByPlayerId = new Map(players.map((p) => [p.playerId, p.matchPosition]));
  const ownLineup = rows.map((r) => mapRowToMatchPlayer(r, posByPlayerId.get(r.id)));

  if (ownLineup.length < 11) {
    return c.json({ error: "incomplete_lineup", count: ownLineup.length }, 400);
  }

  const ownSetup = {
    teamId: 1,
    teamName: "own",
    lineup: ownLineup,
    subs: [],
    tactic: (body.tactic ?? "balanced") as "offensive" | "balanced" | "defensive" | "long_ball" | "possession" | "pressing",
    formation: body.formation ?? "4-4-2",
  };

  // Auto-dohledat opponentTeamId z matchId
  let opponentTeamId: string | null = null;
  if (body.matchId) {
    const matchRow = await c.env.DB.prepare(
      "SELECT home_team_id, away_team_id FROM matches WHERE id = ?"
    ).bind(body.matchId).first<{ home_team_id: string; away_team_id: string }>();
    if (matchRow) {
      opponentTeamId = matchRow.home_team_id === teamId ? matchRow.away_team_id : matchRow.home_team_id;
    }
  }

  let opponentSetup;
  if (opponentTeamId) {
    const opp = await autoSelectBest11(c.env.DB, opponentTeamId);
    if (opp.players.length >= 11) {
      opponentSetup = {
        teamId: 2,
        teamName: "opponent",
        lineup: opp.players,
        subs: [],
        tactic: opp.tactic,
        formation: opp.formation,
      };
    }
  }

  const preview = calcLineupPreview(ownSetup, opponentSetup);

  // Predikce kartové bilance — počítá se tady, ne na frontendu, aby vzorce enginu
  // nežily podruhé v UI. Bere v úvahu zvolenou tvrdost i povahu delegovaného sudího.
  let cardRisk = null;
  try {
    const { predictDiscipline } = await import("../engine/hardness");
    const {
      NEUTRAL_REFEREE, severeFoulProb, pettyFoulProb, advantageProb, cardMultiplier, directRedProb,
    } = await import("../engine/referee");

    let refProfile = NEUTRAL_REFEREE;
    if (body.matchId) {
      const refRow = await c.env.DB.prepare(
        "SELECT r.* FROM matches m JOIN referees r ON r.id = m.referee_id WHERE m.id = ?"
      ).bind(body.matchId).first<Record<string, unknown>>()
        .catch((e) => { logger.warn({ module: "game" }, "referee pro predikci karet", e); return null; });
      if (refRow) {
        const { rowToProfile } = await import("../referees/referee-generator");
        refProfile = rowToProfile(refRow as never);
      }
    }

    const hardnessKey = (body.hardness ?? "normal") as "fair" | "normal" | "hard";
    const pred = predictDiscipline(ownLineup, hardnessKey, refProfile, {
      severeFoul: severeFoulProb(refProfile),
      petty: pettyFoulProb(refProfile),
      advantage: advantageProb(refProfile),
      cardMul: cardMultiplier(refProfile),
      // Průměrná agresivita sestavy rozhoduje, jak často z faulu bude rovnou červená.
      redBase: directRedProb(refProfile, ownLineup.reduce((a, p) => a + p.aggression, 0) / ownLineup.length),
    });

    // Kdo je jednu žlutou od stopky — nejkonkrétnější důvod, proč hrát na férovku.
    const seasonRow = await c.env.DB.prepare(
      "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
    ).first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "aktivní sezóna pro karetní hranu", e); return null; });
    const edgeRow = seasonRow ? await c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM player_stats
       WHERE team_id = ? AND season_id = ? AND yellow_cards % 4 = 3 AND player_id IN (${placeholders})`
    ).bind(teamId, seasonRow.id, ...players.map((p) => p.playerId)).first<{ c: number }>()
      .catch((e) => { logger.warn({ module: "game" }, "hráči na hraně stopky", e); return null; }) : null;

    cardRisk = { ...pred, onEdge: edgeRow?.c ?? 0 };
  } catch (e) {
    logger.warn({ module: "game" }, "predikce kartové bilance", e);
  }

  return c.json({ ...preview, cardRisk });
});

/**
 * Uložené pokyny a lavička srovnané na sestavu a dnešní kádr. Sestava bývá z minulého
 * zápasu a hráč z lavičky nebo z pokynu mezitím mohl odejít; web by je poslal zpátky
 * a uložení by sestavu odmítlo. Kádr = aktivní hráči týmu, stejně jako při uložení.
 */
function storedExtrasForSquad(
  row: { players_data: string; match_plan: string | null; bench_data: string | null },
  squadIds: ReadonlySet<string>,
) {
  let starters: Array<{ playerId: string }> = [];
  try {
    starters = JSON.parse(row.players_data);
  } catch (e) {
    logger.warn({ module: "game" }, "parse players_data pro pokyny a lavičku", e);
  }
  const lineupIds = { starterIds: new Set(starters.map((p) => p.playerId)), squadIds };
  return {
    matchPlan: splitPlanByLineup(parseStoredPlan(row.match_plan), lineupIds).kept,
    bench: benchForLineup(parseStoredBench(row.bench_data), lineupIds),
  };
}

// GET lineup for specific calendar entry
gameRouter.get("/teams/:teamId/lineup/:calendarId", async (c) => {
  const teamId = c.req.param("teamId");
  const calendarId = c.req.param("calendarId");
  const row = await c.env.DB.prepare(
    "SELECT formation, tactic, hardness, players_data, captain_id, preset_slot, match_plan, bench_data FROM lineups WHERE team_id = ? AND calendar_id = ?"
  ).bind(teamId, calendarId).first<{ formation: string; tactic: string; hardness: string | null; players_data: string; captain_id: string | null; preset_slot: string | null; match_plan: string | null; bench_data: string | null }>();
  if (!row) return c.json({ lineup: null });
  const squadRows = await c.env.DB.prepare(
    "SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
  ).bind(teamId).all<{ id: string }>();
  return c.json({
    lineup: {
      formation: row.formation, tactic: row.tactic, hardness: row.hardness ?? "normal",
      captainId: row.captain_id ?? null,
      presetSlot: row.preset_slot ?? null,
      ...storedExtrasForSquad(row, new Set(squadRows.results.map((r) => r.id))),
      players: (() => { try { return JSON.parse(row.players_data); } catch { return []; } })(),
    },
  });
});

// Whitelisty taktik, tvrdosti a formací žijí ve službě sestavy (services/lineup.ts),
// stejné kontroly používá i AI trenér.

// POST save lineup for next match
gameRouter.post("/teams/:teamId/lineup", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ calendarId: string; formation: string; tactic: string; hardness?: string; captainId?: string; presetSlot?: "A" | "B" | "C" | null; matchPlan?: unknown; bench?: unknown; players: Array<{ playerId: string; matchPosition: string }> }>();
  const res = await saveLineup(c.env.DB, teamId, body);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true });
});

// ═══ LINEUP PRESETS — fixní sloty A/B/C ═══

const PRESET_SLOTS = ["A", "B", "C"] as const;
type PresetSlot = typeof PRESET_SLOTS[number];

gameRouter.get("/teams/:teamId/lineup-presets", async (c) => {
  const teamId = c.req.param("teamId");
  const rows = await c.env.DB.prepare(
    "SELECT slot, formation, tactic, hardness, captain_id, players_data, match_plan, bench_data, updated_at FROM lineup_presets WHERE team_id = ?"
  ).bind(teamId).all<{ slot: string; formation: string; tactic: string; hardness: string | null; captain_id: string | null; players_data: string; match_plan: string | null; bench_data: string | null; updated_at: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "load presets", e); return { results: [] }; });

  const presets: Record<string, { formation: string; tactic: string; hardness: string; captainId: string | null; players: Array<{ playerId: string; matchPosition: string }>; matchPlan: ReturnType<typeof parseStoredPlan>; bench: string[] | null; updatedAt: string } | null> = { A: null, B: null, C: null };
  for (const r of rows.results) {
    presets[r.slot] = {
      formation: r.formation,
      tactic: r.tactic,
      hardness: r.hardness ?? "normal",
      captainId: r.captain_id,
      players: (() => { try { return JSON.parse(r.players_data); } catch { return []; } })(),
      matchPlan: parseStoredPlan(r.match_plan),
      bench: parseStoredBench(r.bench_data),
      updatedAt: r.updated_at,
    };
  }
  return c.json({ presets });
});

gameRouter.put("/teams/:teamId/lineup-presets/:slot", async (c) => {
  const teamId = c.req.param("teamId");
  const slot = c.req.param("slot") as PresetSlot;
  if (!PRESET_SLOTS.includes(slot)) return c.json({ error: "Neplatný slot (A/B/C)" }, 400);

  const body = await c.req.json<{ formation: string; tactic: string; hardness?: string; captainId?: string; matchPlan?: unknown; bench?: unknown; players: Array<{ playerId: string; matchPosition: string }> }>();
  if (!body.players || body.players.length !== 11) return c.json({ error: "Sestava musí mít 11 hráčů" }, 400);
  if (!VALID_TACTICS.includes(body.tactic as typeof VALID_TACTICS[number])) {
    return c.json({ error: `Neplatná taktika "${body.tactic}"` }, 400);
  }
  const hardness = body.hardness ?? "normal";
  if (!VALID_HARDNESS.includes(hardness as typeof VALID_HARDNESS[number])) {
    return c.json({ error: `Neplatná tvrdost hry "${body.hardness}"` }, 400);
  }
  if (!VALID_FORMATIONS.includes(body.formation as typeof VALID_FORMATIONS[number])) {
    return c.json({ error: `Neplatná formace "${body.formation}"` }, 400);
  }
  // Captain musí být v lineupu (pokud je vyplněn)
  const playerIds = body.players.map((p) => p.playerId);
  const captainId = body.captainId && playerIds.includes(body.captainId) ? body.captainId : null;

  const squadRows = await c.env.DB.prepare(
    "SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
  ).bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "kádr pro validaci pokynů presetu", e); return { results: [] }; });
  const planCheck = validateMatchPlan(body.matchPlan, {
    starterIds: new Set(playerIds),
    squadIds: new Set(squadRows.results.map((r) => r.id)),
  });
  if (!planCheck.ok) return c.json({ error: planCheck.error }, 400);
  const benchCheck = validateBench(body.bench, {
    starterIds: new Set(playerIds),
    squadIds: new Set(squadRows.results.map((r) => r.id)),
  });
  if (!benchCheck.ok) return c.json({ error: benchCheck.error }, 400);

  await c.env.DB.prepare(
    `INSERT INTO lineup_presets (team_id, slot, formation, tactic, hardness, captain_id, players_data, match_plan, bench_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(team_id, slot) DO UPDATE SET
       formation = excluded.formation,
       tactic = excluded.tactic,
       hardness = excluded.hardness,
       captain_id = excluded.captain_id,
       players_data = excluded.players_data,
       match_plan = excluded.match_plan,
       bench_data = excluded.bench_data,
       updated_at = excluded.updated_at`
  ).bind(teamId, slot, body.formation, body.tactic, hardness, captainId, JSON.stringify(body.players), JSON.stringify(planCheck.plan), benchColumn(benchCheck.bench)).run();

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
  // Optional body — zatím nepoužíváme, ale FE ho posílá. Parse pro kompatibilitu.
  await c.req.json<{ calendarId?: string }>().catch((e) => { logger.warn({ module: "game" }, "neplatné tělo uložení sestavy do slotu", e); return {}; });

  const preset = await c.env.DB.prepare(
    "SELECT formation, tactic, hardness, captain_id, players_data, match_plan, bench_data FROM lineup_presets WHERE team_id = ? AND slot = ?"
  ).bind(teamId, slot).first<{ formation: string; tactic: string; hardness: string | null; captain_id: string | null; players_data: string; match_plan: string | null; bench_data: string | null }>();
  if (!preset) return c.json({ error: "Preset je prázdný" }, 404);

  const presetPlayers: Array<{ playerId: string; matchPosition: string }> = (() => { try { return JSON.parse(preset.players_data); } catch { return []; } })();

  // Auto-substitute jen injury/suspension/left-team. Generátorové absence (Práce/Osobní/...)
  // NEsubstituujeme — match-runner je filtruje při simulaci se stejným seedem. UI pool filtruje
  // klientsky. Pokud apply-preset substituoval navíc i absentní, u týmů s vyšší absencí by
  // docházel z dostupných hráčů → 400 a FE by skončil v init state (prázdná sestava).
  const allPlayers = await c.env.DB.prepare(
    `SELECT p.id, p.position, p.overall_rating,
       (CASE WHEN i.days_remaining > 0 OR (p.suspended_matches IS NOT NULL AND p.suspended_matches > 0) OR p.status != 'active' THEN 1 ELSE 0 END) as unavailable
     FROM players p LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
     WHERE p.team_id = ?`
  ).bind(teamId).all<{ id: string; position: string; overall_rating: number; unavailable: number }>();

  const playerMap = new Map(allPlayers.results.map((p) => [p.id, p]));
  const used = new Set<string>();
  const warnings: string[] = [];

  // Helper na slot s undefined-safe substitucí
  const finalPlayersRaw: Array<{ playerId: string; matchPosition: string } | null> = presetPlayers.map((slot) => {
    const stored = playerMap.get(slot.playerId);
    if (stored && !stored.unavailable && !used.has(slot.playerId)) {
      used.add(slot.playerId);
      return slot;
    }
    // substitute — preferuj stejnou pozici, pak cokoliv dostupné
    const repl = allPlayers.results.filter((x) => !x.unavailable && !used.has(x.id) && x.position === slot.matchPosition)
      .sort((a, b) => b.overall_rating - a.overall_rating)[0]
      ?? allPlayers.results.filter((x) => !x.unavailable && !used.has(x.id))
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

  // Pokyny na lavičce přežijí jen dokud sedí na skutečnou sestavu. Když sestavu
  // přeskládaly absence, plánované střídání se odkazuje na hráče, který dnes
  // nehraje — takové pravidlo se zahodí a uživatel se to dozví hned, ne až po
  // zápase, kde by pokyn tiše nesepnul.
  const lineupIds = {
    starterIds: new Set(finalPlayers.map((p) => p.playerId)),
    squadIds: new Set(allPlayers.results.filter((p) => !p.unavailable).map((p) => p.id)),
  };
  const { kept: matchPlan, dropped } = splitPlanByLineup(parseStoredPlan(preset.match_plan), lineupIds);
  for (const { rule } of dropped) {
    warnings.push(`Pokyn na střídání v ${rule.fromMinute}. minutě zrušen, hráč není k dispozici`);
  }

  // Z lavičky presetu vypadnou zranění, suspendovaní a hráči, kteří se mezitím dostali
  // do základu jako náhrada. Volné místo doplní automat při sestavování zápasu.
  const bench = benchForLineup(parseStoredBench(preset.bench_data), lineupIds);

  return c.json({
    formation: preset.formation,
    tactic: preset.tactic,
    hardness: preset.hardness ?? "normal",
    captainId: captainStillIn ? preset.captain_id : null,
    players: finalPlayers,
    matchPlan,
    bench,
    warnings,
  });
});

// ═══ DASHBOARD LAYOUT — konfigurovatelná stránka Domů ═══
//
// Layout je JSON pole { id, w } (w = šířka 1–3 sloupce). Neexistující řádek
// znamená "uživatel nikdy needitoval" → BE vrátí widgets: null a frontend
// dosadí svůj výchozí layout. Katalog widgetů je záměrně jen na frontendu:
// nový widget je pak čistě FE změna a BE se nemusí nasazovat znovu.

const MAX_DASHBOARD_WIDGETS = 60;

type DashboardHeight = 1 | 2 | 3 | "auto";
interface DashboardLayoutItem { id: string; w: 1 | 2 | 3; c?: string; h?: DashboardHeight }

/** Vrátí očištěný layout, nebo chybovou hlášku (česky) když je vstup nepoužitelný. */
function parseDashboardWidgets(raw: unknown): { widgets: DashboardLayoutItem[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Očekávám pole widgetů" };
  if (raw.length > MAX_DASHBOARD_WIDGETS) return { error: `Maximálně ${MAX_DASHBOARD_WIDGETS} widgetů` };

  const seen = new Set<string>();
  const widgets: DashboardLayoutItem[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return { error: "Widget musí být objekt" };
    const { id, w, c, h } = item as { id?: unknown; w?: unknown; c?: unknown; h?: unknown };
    if (typeof id !== "string" || id.length === 0 || id.length > 40) {
      return { error: "Widget musí mít id (1–40 znaků)" };
    }
    if (w !== 1 && w !== 2 && w !== 3) return { error: `Neplatná šířka widgetu "${id}" (povoleno 1–3)` };
    if (seen.has(id)) return { error: `Widget "${id}" je v layoutu dvakrát` };
    // Paleta barev žije jen na frontendu — tady hlídáme pouze tvar, aby přidání
    // nového odstínu neznamenalo nasazovat API.
    if (c != null && (typeof c !== "string" || c.length > 20)) {
      return { error: `Neplatná barva widgetu "${id}"` };
    }
    if (h != null && h !== 1 && h !== 2 && h !== 3 && h !== "auto") {
      return { error: `Neplatná výška widgetu "${id}" (povoleno 1–3 nebo auto)` };
    }
    seen.add(id);
    const entry: DashboardLayoutItem = { id, w };
    if (c) entry.c = c as string;
    if (h != null) entry.h = h as DashboardHeight;
    widgets.push(entry);
  }
  return { widgets };
}

/**
 * requireTeamOwnership propouští GET bez tokenu (middleware.ts), takže si
 * vlastnictví u čtení layoutu musíme ohlídat sami — jinak by šel cizí layout
 * přečíst pouhým uhodnutím team id.
 */
async function assertOwnsTeam(
  c: import("hono").Context<{ Bindings: Bindings }>,
  teamId: string,
): Promise<{ error: string; status: 401 | 403 | 404 } | null> {
  const token = getTokenFromRequest(c);
  if (!token) return { error: "Nepřihlášen", status: 401 };
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return { error: "Neplatná session", status: 401 };
  const team = await c.env.DB.prepare("SELECT user_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "dashboard layout ownership check", e); return null; });
  if (!team) return { error: "Tým nenalezen", status: 404 };
  if (team.user_id !== session.userId) return { error: "Přístup odepřen", status: 403 };
  return null;
}

gameRouter.get("/teams/:teamId/dashboard-layout", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await assertOwnsTeam(c, teamId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const row = await c.env.DB.prepare("SELECT widgets, updated_at FROM dashboard_layouts WHERE team_id = ?")
    .bind(teamId).first<{ widgets: string; updated_at: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "load dashboard layout", e); return null; });

  if (!row) return c.json({ widgets: null, updatedAt: null });

  const parsed = (() => {
    try { return parseDashboardWidgets(JSON.parse(row.widgets)); }
    catch (e) { logger.warn({ module: "game" }, "parse dashboard layout", e); return { error: "poškozený layout" }; }
  })();

  // Poškozený nebo neplatný uložený layout nesmí shodit Domů — spadneme na výchozí.
  if ("error" in parsed) return c.json({ widgets: null, updatedAt: null });
  return c.json({ widgets: parsed.widgets, updatedAt: row.updated_at });
});

gameRouter.put("/teams/:teamId/dashboard-layout", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ widgets?: unknown }>()
    .catch((e) => { logger.warn({ module: "game" }, "parse dashboard layout body", e); return null; });
  if (!body) return c.json({ error: "Neplatné tělo požadavku" }, 400);

  const parsed = parseDashboardWidgets(body.widgets);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  await c.env.DB.prepare(
    `INSERT INTO dashboard_layouts (team_id, widgets, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(team_id) DO UPDATE SET
       widgets = excluded.widgets,
       updated_at = excluded.updated_at`
  ).bind(teamId, JSON.stringify(parsed.widgets)).run();

  return c.json({ ok: true });
});

gameRouter.delete("/teams/:teamId/dashboard-layout", async (c) => {
  const teamId = c.req.param("teamId");
  await c.env.DB.prepare("DELETE FROM dashboard_layouts WHERE team_id = ?").bind(teamId).run();
  return c.json({ ok: true });
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

// Dopočet standardkových statistik (penalty, góly ze standardek) z uložených záznamů zápasů
// aktivní sezóny. Zápis je absolutní, takže opakované spuštění nic nezdvojí.
// ?leagueId=... zpracuje jen jednu ligu (bez parametru všechny).
gameRouter.post("/admin/backfill-set-pieces", async (c) => {
  const { backfillSetPieces } = await import("../stats/backfill-set-pieces");
  const result = await backfillSetPieces(c.env.DB, { leagueId: c.req.query("leagueId") || undefined });
  return c.json({ ok: true, ...result });
});

// Doplní bazar vybavení o nabídky AI klubů. Běží samo v daily-ticku, tohle je
// ruční spuštění — po nasazení nebo když je bazar prázdný a nechce se čekat na noc.
gameRouter.post("/admin/generate-equipment-listings", async (c) => {
  const { generateAiEquipmentListings } = await import("../equipment/ai-listings");
  const created = await generateAiEquipmentListings(c.env.DB, new Date());
  return c.json({ ok: true, created });
});

// Backfill: do pub_sessions z historických posezení doplnit avatary trenérů
gameRouter.post("/admin/backfill-stammtisch-coaches", async (c) => {
  const { backfillStammtischCoaches } = await import("../community/manager-relations");
  const result = await backfillStammtischCoaches(c.env.DB);
  return c.json({ ok: true, ...result });
});

// POST /api/admin/regenerate-u21-schedule — smaže U21 rozpis aktuální sezóny a vygeneruje
// celé dvoukolo, kola den po áčku. Pozor: maže i odehrané zápasy sezóny. Volitelně ?leagueId=...
gameRouter.post("/admin/regenerate-u21-schedule", async (c) => {
  const u21LeagueId = c.req.query("leagueId");
  const { regenerateU21Schedule } = await import("../league/u21-generator");
  const { createRng, cryptoSeed } = await import("../generators/rng");

  const targets = u21LeagueId
    ? [{ id: u21LeagueId }]
    : (await c.env.DB.prepare(
        "SELECT id FROM leagues WHERE league_type = 'u21'"
      ).all<{ id: string }>()).results;

  const results: Array<Record<string, unknown>> = [];
  for (const lg of targets) {
    try {
      const rng = createRng(cryptoSeed());
      const r = await regenerateU21Schedule(c.env.DB, lg.id, rng);
      results.push({ u21LeagueId: lg.id, ...r });
    } catch (e) {
      results.push({ u21LeagueId: lg.id, error: String(e) });
    }
  }
  return c.json({ ok: true, leagues: results.length, results });
});

// POST /api/admin/backfill-u21 — vytvoří U21 ligu/týmy/rozpis pro všechny existující A-ligy.
// Idempotentní: liga s parent_league_id se přeskočí.
gameRouter.post("/admin/backfill-u21", async (c) => {
  const seniorLeagueId = c.req.query("leagueId");
  const { backfillU21ForLeague } = await import("../league/u21-generator");
  const { createRng, cryptoSeed } = await import("../generators/rng");

  const targets = seniorLeagueId
    ? [{ id: seniorLeagueId }]
    : (await c.env.DB.prepare(
        "SELECT id FROM leagues WHERE league_type = 'senior' OR league_type IS NULL"
      ).all<{ id: string }>()).results;

  const results: Array<Record<string, unknown>> = [];
  for (const lg of targets) {
    try {
      const rng = createRng(cryptoSeed());
      const r = await backfillU21ForLeague(c.env.DB, lg.id, rng);
      results.push({ seniorLeagueId: lg.id, ...r });
    } catch (e) {
      results.push({ seniorLeagueId: lg.id, error: String(e) });
    }
  }
  return c.json({ ok: true, leagues: results.length, results });
});

// POST /api/admin/backfill-u21-relations — dogeneruje vazby v kabině U21 soupiskám,
// které vznikly dřív, než je generátor uměl vytvářet (do 2026-08 žádná U21 soupiska
// vazby nedostala, takže jim chemie ukazovala napořád plochou padesátku).
//
// Idempotentní: tým, který už nějakou vazbu má, se přeskočí. `?teamId=` omezí na jeden tým,
// `?dryRun=1` jen spočítá, kolika týmů by se to týkalo, a nic nezapíše.
gameRouter.post("/admin/backfill-u21-relations", async (c) => {
  const onlyTeamId = c.req.query("teamId");
  const dryRun = c.req.query("dryRun") === "1";

  const targets = await c.env.DB.prepare(
    `SELECT t.id, t.name FROM teams t
      WHERE t.parent_team_id IS NOT NULL
        ${onlyTeamId ? "AND t.id = ?" : ""}
        AND NOT EXISTS (
          SELECT 1 FROM relationships r
            JOIN players p ON p.id = r.player_a_id
           WHERE p.team_id = t.id
        )`,
  ).bind(...(onlyTeamId ? [onlyTeamId] : [])).all<{ id: string; name: string }>()
    .catch((e) => { logger.error({ module: "game" }, "load U21 teams for backfill", e); return { results: [] as Array<{ id: string; name: string }> }; });

  if (dryRun) {
    return c.json({ ok: true, dryRun: true, teams: targets.results.length, names: targets.results.map((t) => t.name) });
  }

  const { attachSquadRelations } = await import("../transfers/attach-relations");
  const results: Array<{ team: string; created: number }> = [];
  let totalCreated = 0;
  for (const t of targets.results) {
    const created = await attachSquadRelations(c.env.DB, t.id);
    totalCreated += created;
    results.push({ team: t.name, created });
  }

  logger.info({ module: "game" }, `U21 backfill vazeb: ${results.length} týmů, ${totalCreated} vazeb`);
  return c.json({ ok: true, teams: results.length, totalCreated, results });
});

// POST /api/admin/backfill-pub?date=YYYY-MM-DD — vygenerovat pub session pro daný den pro všechny lidské týmy.
// Pokud date neuvedeno, použije se včerejšek.
gameRouter.post("/admin/backfill-pub", async (c) => {
  const today = new Date();
  const dateParam = c.req.query("date");
  let target = dateParam;
  if (!target) {
    const y = new Date(today);
    y.setUTCDate(y.getUTCDate() - 1);
    target = y.toISOString().slice(0, 10);
  }
  const { generatePubSessionsForAllTeams } = await import("../season/pub");
  const result = await generatePubSessionsForAllTeams(c.env.DB, target);
  return c.json({ ok: true, gameDate: target, ...result });
});

// POST /api/admin/backfill-achievements — přepočítat achievementy ze stavu DB pro všechny týmy (nebo jeden).
gameRouter.post("/admin/backfill-achievements", async (c) => {
  const targetTeamId = c.req.query("teamId");
  const { backfillTeamAchievements } = await import("../services/achievements");

  const teams = targetTeamId
    ? [{ id: targetTeamId } as { id: string }]
    : (await c.env.DB.prepare("SELECT id FROM teams").all<{ id: string }>()).results;

  const summary: Record<string, number> = {};
  let totalUnlocked = 0;
  for (const t of teams) {
    const unlocked = await backfillTeamAchievements(c.env.DB, t.id).catch((e) => {
      logger.warn({ module: "game" }, `backfill achievements for ${t.id}`, e);
      return [] as string[];
    });
    totalUnlocked += unlocked.length;
    for (const key of unlocked) summary[key] = (summary[key] ?? 0) + 1;
  }

  return c.json({ ok: true, teams: teams.length, totalUnlocked, perAchievement: summary });
});

// ═══ TRANSFER SYSTEM ═══

// Release player → free agent
// PUT /api/teams/:teamId/players/:playerId/squad-number — manažer mění číslo dresu.
// Obsazené číslo se se spoluhráčem prohodí, takže dva hráči týmu nikdy nemají stejné číslo.
gameRouter.put("/teams/:teamId/players/:playerId/squad-number", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const body = (await c.req.json().catch((e) => {
    logger.warn({ module: "game" }, "parse squad number body", e);
    return null;
  })) as { number?: unknown } | null;
  const number = Number(body?.number);

  // Dorostenec patří U21 týmu, manažer ho ale ovládá z A-týmu (stejně jako u propuštění)
  const owned = await c.env.DB.prepare(
    `SELECT p.id FROM players p JOIN teams t ON p.team_id = t.id
      WHERE p.id = ? AND (p.team_id = ? OR t.parent_team_id = ?)`,
  ).bind(playerId, teamId, teamId).first<{ id: string }>();
  if (!owned) return c.json({ error: "Hráč nenalezen" }, 404);

  const { setSquadNumber } = await import("../players/squad-numbers");
  const result = await setSquadNumber(c.env.DB, playerId, number);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(result);
});

gameRouter.post("/teams/:teamId/players/:playerId/release", async (c) => {
  try {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  // Dorostenec patří U21 týmu, ale frontend sem posílá ID A-týmu — klub je jeden a manažer
  // ho ovládá odtamtud. Bez druhé podmínky hráče nenajdeme a manažer dostane „Hráč nenalezen",
  // takže z dorostu nešlo nikoho propustit ani vystavit na trh.
  const player = await c.env.DB.prepare(
    `SELECT p.*, t.name as team_name, t.league_id, v.district
       FROM players p JOIN teams t ON p.team_id = t.id JOIN villages v ON t.village_id = v.id
      WHERE p.id = ? AND (p.team_id = ? OR t.parent_team_id = ?)`
  ).bind(playerId, teamId, teamId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  // Hostující hráč patří jinému klubu — propuštěním by skončil mezi volnými hráči
  // a kmenový klub by o něj nadobro přišel. Stejná ochrana jako u vylistování na trh.
  if (player.loan_from_team_id) {
    return c.json({ error: "Hostující hráč nemůže být propuštěn, patří jinému klubu" }, 400);
  }
  // Propuštěním by procenta z příštího přestupu propadla a klub by si hráče mohl hned
  // podepsat zpátky jako volného a prodat ho bez nich. Hráče s doložkou jde jen prodat
  // (stejné pravidlo hlídá výměna, transfers/swap-players.ts).
  const { activeSellOnClause } = await import("../transfers/installments");
  const sellOnClause = await activeSellOnClause(c.env.DB, playerId);
  if (sellOnClause) {
    return c.json({ error: `${player.first_name} ${player.last_name} má doložku: ${sellOnClause.pct} % z příštího přestupu pro ${sellOnClause.beneficiaryName ?? "bývalý klub"}. Propustit ho nejde, můžeš ho prodat.` }, 400);
  }

  // Idempotency: zamezit duplicitám při double-click
  const existingFa = await c.env.DB.prepare(
    "SELECT id FROM free_agents WHERE released_from_team_id = ? AND first_name = ? AND last_name = ? AND created_at > datetime('now', '-5 minutes')"
  ).bind(teamId, player.first_name, player.last_name).first().catch((e) => { logger.warn({ module: "game" }, "check duplicate free agent", e); return null; });
  if (existingFa) return c.json({ ok: true });

  // Kompletní FK úklid + atomické odebrání (sdílené s koncem sezony)
  const { removePlayer } = await import("../transfers/remove-player");
  // Odebrat se musí z týmu, ve kterém hráč SKUTEČNĚ je — u dorostence je to U21 tým,
  // ne áčko, jehož ID přišlo v URL. Jinak `removePlayer` nic nenajde a propuštění selže.
  const kmenovy = (player.team_id as string) ?? teamId;
  const removed = await removePlayer(c.env.DB, playerId, "released", { toFreeAgent: true, teamId: kmenovy });
  if (!removed.ok) return c.json({ error: "Hráč nenalezen" }, 404);

  // Kořaly „Reforma kádru" patří klubu (áčku z adresy), i když šel dorostenec.
  // Kontrola dřív neběžela nikde a trofej šla jen ručním zpětným přepočtem.
  {
    const { checkReleaseAchievements } = await import("../services/achievements");
    await checkReleaseAchievements(c.env.DB, teamId)
      .catch((e) => logger.warn({ module: "game" }, "kořaly po propuštění", e));
  }

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(c.env.DB, player.league_id as string, teamId, "player_released", {
    playerName: `${player.first_name} ${player.last_name}`, playerAge: player.age as number,
    playerPosition: player.position as string, teamName: player.team_name as string,
  }).catch((e) => logger.warn({ module: "game" }, "create release news", e));

  // Push týmům, které hráče sledují ve watchlistu — je volný! Sledující načetl
  // `removePlayer` ještě před úklidem. Dřív se hledali až tady, kdy už pod id
  // hráče nikdo nebyl, a zprávu tak nedostal nikdo. Sledování samo se převedlo
  // na volného hráče.
  try {
    const { sendWebPushToTeams } = await import("../community/web-push");
    await sendWebPushToTeams(
      { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB },
      (removed.watcherTeamIds ?? []).filter((id) => id !== teamId && id !== kmenovy),
      `⭐ ${player.first_name} ${player.last_name} je volný!`,
      `${player.team_name} ho uvolnil, teď je k mání jako volný hráč.`,
      "/prestupy",
    );
  } catch (e) { logger.warn({ module: "game" }, "watcher push on release", e); }

  return c.json({ ok: true });
  } catch (e) { logger.error({ module: "game" }, "release player failed", e); return c.json({ error: String(e) }, 500); }
});

// List free agents
gameRouter.get("/teams/:teamId/free-agents", async (c) => {
  try {
    const teamId = c.req.param("teamId");
    const team = await c.env.DB.prepare(
      "SELECT t.reputation, t.user_id, v.district, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
    ).bind(teamId).first<{ reputation: number; user_id: string; district: string; lat: number; lng: number }>();
    if (!team) return c.json({ error: "Tým nenalezen" }, 404);

    // Z jiných okresů jen hráči, které propustil klub ve hře (lidský i AI) jiného majitele.
    // Vygenerovaní zůstávají ve svém okrese. Pravidla sdílí s AI trenérem market-visibility.ts.
    const { findVisibleFreeAgents } = await import("../transfers/market-visibility");
    const filtered = await findVisibleFreeAgents(c.env.DB, { id: teamId, district: team.district, userId: team.user_id });

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
        nationality: fa.nationality ?? "CZ",
        age: fa.age, position: fa.position, overallRating: fa.overall_rating, weeklyWage: fa.weekly_wage,
        occupation: (() => { try { return JSON.parse(fa.life_context as string)?.occupation ?? ""; } catch (e) { logger.warn({ module: "game" }, "parse free agent life_context", e); return ""; } })(),
        source: fa.source, villageName: fa.village_name ?? null, distanceKm: distKm, expiresAt: fa.expires_at,
        // Odkud hráč je, když ne z tvého okresu. Stejný štítek jako u inzerátů.
        origin: fa.district !== team.district ? (fa.district ?? null) : null,
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

// Search all players across all teams in the league, including its U21 mirror.
gameRouter.get("/teams/:teamId/search-players", async (c) => {
  try {
    const teamId = c.req.param("teamId");
    const searchLeagueId = c.req.query("leagueId");
    const context = await resolveTransferSearchContext(c.env.DB, teamId);
    if (!context) return c.json({ players: [] });

    const targetLeague = searchLeagueId ?? context.leagueId;

    const rows = await findTransferSearchPlayerRows(c.env.DB, targetLeague, context.rootTeamId);

    const blur = (v: number) => Math.round(v / 5) * 5;
    const players = rows.map((r) => {
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
        nationality: (r.nationality as string) ?? "CZ",
        age: r.age, position: r.position, overallRating: r.overall_rating, weeklyWage: r.weekly_wage,
        squadNumber: r.squad_number,
        teamId: r.team_id, teamName: r.team_name, isOwnTeam: isOwn, teamIsAi: r.team_user_id === "ai",
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

// Sign free agent (pravidla v services/transfer-actions.ts, platí i pro AI trenéra)
gameRouter.post("/teams/:teamId/free-agents/:faId/sign", async (c) => {
  const body = await c.req.json<{ offeredWage: number }>();
  const res = await signFreeAgent(c.env, c.req.param("teamId"), c.req.param("faId"), body.offeredWage);
  if (!res.ok) return transferError(c, res);
  const { ok: _ok, ...result } = res;
  return c.json(result);
});

// List player on transfer market
gameRouter.post("/teams/:teamId/players/:playerId/list", async (c) => {
  const body = await c.req.json<{ askingPrice: number }>();
  const res = await listPlayerOnMarket(c.env, c.req.param("teamId"), c.req.param("playerId"), body.askingPrice);
  return res.ok ? c.json({ ok: true, listingId: res.listingId }) : transferError(c, res);
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

// Hall of Fame — žebříček všech týmů podle počtu achievementů (zlato > stříbro > bronz)
gameRouter.get("/hall-of-fame", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT
       t.id as team_id, t.name as team_name, t.primary_color, t.secondary_color, t.badge_pattern,
       t.user_id as user_id,
       m.id as manager_id, m.name as manager_name, m.avatar as manager_avatar, m.user_id as manager_user_id,
       v.name as village_name,
       COUNT(ta.achievement_key) as total,
       COALESCE(SUM(CASE WHEN ta.tier = 'gold' THEN 1 ELSE 0 END), 0) as gold,
       COALESCE(SUM(CASE WHEN ta.tier = 'silver' THEN 1 ELSE 0 END), 0) as silver,
       COALESCE(SUM(CASE WHEN ta.tier = 'bronze' THEN 1 ELSE 0 END), 0) as bronze
     FROM teams t
     LEFT JOIN managers m ON m.team_id = t.id
     LEFT JOIN villages v ON v.id = t.village_id
     LEFT JOIN team_achievements ta ON ta.team_id = t.id
     GROUP BY t.id
     ORDER BY gold DESC, silver DESC, bronze DESC, t.name ASC
     LIMIT 100`
  ).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game" }, "hall of fame query", e); return { results: [] as Record<string, unknown>[] }; });

  const entries = rows.results.map((r, i) => ({
    rank: i + 1,
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    primaryColor: (r.primary_color as string) || "#2D5F2D",
    secondaryColor: (r.secondary_color as string) || "#FFFFFF",
    badgePattern: (r.badge_pattern as string) || "shield",
    isHuman: (r.user_id as string) !== "ai",
    managerId: r.manager_id as string | null,
    managerName: r.manager_name as string | null,
    coachIsAi: r.manager_user_id === "ai",
    managerAvatar: (() => {
      try { return r.manager_avatar ? JSON.parse(r.manager_avatar as string) : null; }
      catch (e) { logger.warn({ module: "game" }, "parse manager avatar for hof", e); return null; }
    })(),
    villageName: r.village_name as string | null,
    total: (r.total as number) ?? 0,
    gold: (r.gold as number) ?? 0,
    silver: (r.silver as number) ?? 0,
    bronze: (r.bronze as number) ?? 0,
  }));

  return c.json({ entries });
});

// Kořaly — seznam získaných + katalog všech achievementů
gameRouter.get("/teams/:teamId/achievements", async (c) => {
  const teamId = c.req.param("teamId");
  const { ACHIEVEMENTS, getTeamAchievements } = await import("../services/achievements");
  const earned = await getTeamAchievements(c.env.DB, teamId);
  const earnedMap = new Map(earned.map((e) => [e.key, e.earnedAt]));
  return c.json({
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key,
      icon: a.icon,
      title: a.title,
      desc: a.desc,
      tier: a.tier,
      earnedAt: earnedMap.get(a.key) ?? null,
    })),
    earnedCount: earned.length,
    totalCount: ACHIEVEMENTS.length,
  });
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
      freeAgent: false,
    };
  });

  // Sledovaní, kteří jsou zrovna volní. Propuštěním dostane hráč nové id (záznam
  // ve `free_agents`) a `removePlayer` na něj sledování převede. Bez tohohle by
  // sledujícím ze seznamu zmizel přesně ve chvíli, kdy je k mání.
  const freeRows = await c.env.DB.prepare(
    `SELECT w.created_at AS watched_since, fa.id, fa.first_name, fa.last_name, fa.nickname, fa.age,
            fa.position, fa.overall_rating, fa.skills, fa.avatar, fa.district, v.name AS village_name
       FROM player_watchlist w
       JOIN free_agents fa ON fa.id = w.player_id
       LEFT JOIN villages v ON v.id = fa.village_id
      WHERE w.team_id = ? AND fa.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
  ).bind(teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch watched free agents", e); return { results: [] as Record<string, unknown>[] }; });
  const freeAgents = freeRows.results.map((r) => {
    const parseJson = (raw: unknown, what: string): Record<string, unknown> => {
      try { return JSON.parse(raw as string) ?? {}; } catch (e) {
        logger.warn({ module: "game" }, `rozbité ${what} sledovaného volného hráče ${String(r.id)}`, e);
        return {};
      }
    };
    const skills = parseJson(r.skills, "dovednosti");
    const avatar = parseJson(r.avatar, "avatar");
    const blurredSkills: Record<string, number> = {};
    for (const k of Object.keys(skills)) {
      if (typeof skills[k] === "number") blurredSkills[k] = roundTo5(skills[k]);
    }
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
      teamId: null,
      teamName: null,
      teamColor: null,
      teamSecondary: null,
      teamBadge: null,
      teamIsAI: false,
      villageName: r.village_name ?? null,
      district: r.district,
      injury: null,
      watchedSince: r.watched_since,
      // Zápasy se vedou pod starým id hráče, volný hráč žádné nemá.
      recentStats: null,
      transfers: [],
      freeAgent: true,
    };
  });

  // Nejčerstvěji sledovaní nahoře, stejně jako dřív: řetězec data se řadí sám.
  const since = (p: { watchedSince: unknown }) => String(p.watchedSince ?? "");
  const watched = [...players, ...freeAgents]
    .sort((a, b) => (since(a) < since(b) ? 1 : since(a) > since(b) ? -1 : 0));
  return c.json({ players: watched });
});

// Withdraw listing
gameRouter.delete("/teams/:teamId/listings/:listingId", async (c) => {
  await withdrawListing(c.env, c.req.param("teamId"), c.req.param("listingId"));
  return c.json({ ok: true });
});

// Browse transfer market
gameRouter.get("/teams/:teamId/market", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare(
    "SELECT t.league_id, l.district FROM teams t LEFT JOIN leagues l ON l.id = t.league_id WHERE t.id = ?"
  ).bind(teamId).first<{ league_id: string; district: string | null }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  // Z ostatních soutěží inzeráty klubů ve hře (lidských i AI). Hráči klubů mimo hru
  // (is_ai_listing) se nabízejí jen ve své lize. Pravidla sdílí s AI trenérem market-visibility.ts.
  const { findVisibleListings } = await import("../transfers/market-visibility");
  const listings = { results: await findVisibleListings(c.env.DB, { id: teamId, leagueId: team.league_id }) };

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

  // Check if user has pending bids on any listing (legacy, jen pro AI listingy)
  const listingIds = listings.results.map((l) => l.id as string);
  let myBids: Record<string, number> = {};
  if (listingIds.length > 0) {
    const myBidsResult = await c.env.DB.prepare(
      `SELECT listing_id, amount FROM transfer_bids WHERE team_id = ? AND status = 'pending' AND listing_id IN (${listingIds.map(() => "?").join(",")})`
    ).bind(teamId, ...listingIds).all().catch((e) => { logger.warn({ module: "game" }, "fetch my bids", e); return { results: [] }; });
    for (const b of myBidsResult.results) {
      myBids[b.listing_id as string] = b.amount as number;
    }
  }

  // Po sjednoceni: nabidka z marketu vznika jako transfer_offer.
  // Najdi aktivni offers na hrace v listingu, abychom v UI mohli misto "Nabidnout" zobrazit link na jednani.
  const playerIds = listings.results.map((l) => l.player_id as string).filter(Boolean);
  const myOffersByPlayer: Record<string, { offerId: string; amount: number; counterAmount: number | null; status: string }> = {};
  if (playerIds.length > 0) {
    const myOffersResult = await c.env.DB.prepare(
      `SELECT id, player_id, offer_amount, counter_amount, status FROM transfer_offers
       WHERE from_team_id = ? AND status IN ('pending','countered') AND player_id IN (${playerIds.map(() => "?").join(",")})`
    ).bind(teamId, ...playerIds).all().catch((e) => { logger.warn({ module: "game" }, "fetch my offers for market", e); return { results: [] }; });
    for (const o of myOffersResult.results) {
      myOffersByPlayer[o.player_id as string] = {
        offerId: o.id as string,
        amount: o.offer_amount as number,
        counterAmount: (o.counter_amount as number | null) ?? null,
        status: o.status as string,
      };
    }
  }

  // Rozjednané inzeráty cizích klubů: místo „Nabídnout" se v UI ukáže odkaz na jednání.
  const aiListingIds = listings.results.filter((l) => l.is_ai_listing).map((l) => l.id as string);
  const myNegotiations: Record<string, { id: string; status: string }> = {};
  if (aiListingIds.length > 0) {
    const negs = await c.env.DB.prepare(
      `SELECT id, listing_id, status FROM ai_negotiations
       WHERE team_id = ? AND status IN ('open','agreed') AND listing_id IN (${aiListingIds.map(() => "?").join(",")})`,
    ).bind(teamId, ...aiListingIds).all<{ id: string; listing_id: string; status: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "jednání k inzerátům", e); return { results: [] as { id: string; listing_id: string; status: string }[] }; });
    for (const n of negs.results) myNegotiations[n.listing_id] = { id: n.id, status: n.status };
  }

  return c.json({
    listings: listings.results.map((l) => {
      const isAi = !!(l.is_ai_listing as number);
      if (isAi) {
        const ai = (() => { try { return JSON.parse(l.ai_player_data as string); } catch { return {}; } })();
        const blur = (v: number) => Math.round(v / 5) * 5;
        return {
          id: l.id, playerId: "virtual_ai", askingPrice: l.asking_price, isAiListing: true,
          playerName: `${ai.firstName ?? "?"} ${ai.lastName ?? "?"}`, nationality: ai.nationality ?? "CZ", playerAge: ai.age, position: ai.position,
          overallRating: ai.overallRating, teamName: ai.fromTeam ?? "Neznámý tým", expiresAt: l.expires_at,
          avatar: ai.avatar ?? {},
          skills: ai.skills ? Object.fromEntries(Object.entries(ai.skills).map(([k, v]) => [k, typeof v === "number" ? blur(v as number) : v])) : {},
          myBidAmount: myBids[l.id as string] ?? null,
          myNegotiationId: myNegotiations[l.id as string]?.id ?? null,
          myNegotiationStatus: myNegotiations[l.id as string]?.status ?? null,
        };
      }
      const activeOffer = myOffersByPlayer[l.player_id as string] ?? null;
      return {
        id: l.id, playerId: l.player_id, askingPrice: l.asking_price, isAiListing: false,
        playerName: `${l.first_name} ${l.last_name}`, nationality: (l.nationality as string) ?? "CZ", playerAge: l.age, position: l.position,
        overallRating: l.overall_rating, teamName: l.team_name, teamIsAi: l.team_user_id === "ai", expiresAt: l.expires_at,
        // Štítek „odkud“ jako u volných hráčů: okres, a jen u jiné soutěže téhož okresu
        // (III. třída proti přeboru) název soutěže.
        origin: l.league_id === team.league_id ? null
          : l.league_district !== team.district ? ((l.league_district as string | null) ?? null)
          : ((l.league_name as string | null) ?? null),
        injuryDays: (l.injury_days as number) ?? null,
        avatar: (() => { try { return JSON.parse(l.player_avatar as string); } catch (e) { logger.warn({ module: "game" }, `parse market avatar: ${e}`); return {}; } })(),
        skills: (() => { try { const s = JSON.parse(l.skills as string); const blur = (v: number) => Math.round(v / 5) * 5; return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? blur(v) : v])); } catch { return {}; } })(),
        myBidAmount: myBids[l.id as string] ?? null,
        myActiveOfferId: activeOffer?.offerId ?? null,
        myActiveOfferAmount: activeOffer ? (activeOffer.counterAmount ?? activeOffer.amount) : null,
        myActiveOfferStatus: activeOffer?.status ?? null,
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

// Place bid — z inzerátu klubu ve hře vznikne nabídka, u klubu mimo hru jednání
gameRouter.post("/teams/:teamId/market/:listingId/bid", async (c) => {
  const body = await c.req.json<ListingBidInput>();
  const res = await placeListingBid(c.env, c.req.param("teamId"), c.req.param("listingId"), body);
  if (!res.ok) return transferError(c, res);
  if (res.kind === "negotiation") return c.json({ ok: true, negotiationId: res.negotiationId, existing: res.existing });
  return c.json(res.alreadyExists ? { ok: true, offerId: res.offerId, alreadyExists: true } : { ok: true, offerId: res.offerId });
});

// Accept bid — seller prijima initial bid, nebo buyer prijima counter
gameRouter.post("/teams/:teamId/bids/:bidId/accept", async (c) => {
  const res = await acceptListingBid(c.env, c.req.param("teamId"), c.req.param("bidId"));
  return res.ok ? c.json({ ok: true }) : transferError(c, res);
});

// Reject bid — seller odmita initial bid, nebo buyer odmita counter
gameRouter.post("/teams/:teamId/bids/:bidId/reject", async (c) => {
  const res = await rejectListingBid(c.env, c.req.param("teamId"), c.req.param("bidId"));
  return res.ok ? c.json({ ok: true }) : transferError(c, res);
});

// Counter bid — seller posle protinabidku, buyer ji muze prijmout/odmitnout/counter
gameRouter.post("/teams/:teamId/bids/:bidId/counter", async (c) => {
  const body = await c.req.json<{ amount: number }>();
  const res = await counterListingBid(c.env, c.req.param("teamId"), c.req.param("bidId"), body);
  return res.ok ? c.json({ ok: true }) : transferError(c, res);
});

// Withdraw bid — buyer stahne svou nabidku
gameRouter.delete("/teams/:teamId/bids/:bidId", async (c) => {
  const teamId = c.req.param("teamId");
  const bidId = c.req.param("bidId");
  const result = await c.env.DB.prepare(
    "UPDATE transfer_bids SET status = 'withdrawn' WHERE id = ? AND team_id = ? AND status IN ('pending','countered')"
  ).bind(bidId, teamId).run();
  if (result.meta.changes === 0) {
    return c.json({ error: "Nabídku nelze stáhnout (není tvoje nebo už je vyřešená)" }, 409);
  }

  const bidInfo = await c.env.DB.prepare(
    `SELECT tl.team_id as seller_team_id, tl.player_id, p.first_name, p.last_name, tbuyer.name as buyer_name
     FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id
     LEFT JOIN players p ON tl.player_id = p.id
     LEFT JOIN teams tbuyer ON tb.team_id = tbuyer.id
     WHERE tb.id = ?`
  ).bind(bidId).first<{ seller_team_id: string; first_name: string; last_name: string; buyer_name: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch bid for withdraw notif", e); return null; });
  if (bidInfo) {
    const pName = bidInfo.first_name ? `${bidInfo.first_name} ${bidInfo.last_name}` : "hráče";
    try {
      const { createNotification } = await import("../community/notifications");
      const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
      await createNotification(c.env.DB, bidInfo.seller_team_id, "transfer",
        `↩️ Nabídka za ${pName} stažena`,
        `${bidInfo.buyer_name ?? "Klub"} stáhl svou nabídku.`,
        "/prestupy", pushEnv);
    } catch (e) { logger.warn({ module: "game" }, "bid withdraw notification", e); }
  }

  return c.json({ ok: true });
});

// Transfer offers between teams (transfer or loan) — lidským i AI klubům
gameRouter.post("/teams/:teamId/offers", async (c) => {
  const body = await c.req.json<CreateOfferInput>();
  const res = await createTransferOffer(c.env, c.req.param("teamId"), body);
  return res.ok ? c.json({ ok: true, offerId: res.offerId }) : transferError(c, res);
});

gameRouter.get("/teams/:teamId/offers", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const clubTeamId = await resolveClubTeamId(c.env.DB, teamId) ?? teamId;
  // LEFT JOIN teams — nabídky od virtuálních klubů (from_team_id='virtual_ai') nemají řádek v teams.
  // Jméno klubu: virtual_team_data.$.name, u legacy nabídek message.$.teamName.
  const virtualNameSql = `CASE WHEN to2.from_team_id = 'virtual_ai' THEN COALESCE(
       json_extract(to2.virtual_team_data, '$.name'),
       CASE WHEN json_valid(to2.message) THEN json_extract(to2.message, '$.teamName') END,
       'Neznámý klub') ELSE t.name END`;
  const incoming = await c.env.DB.prepare(
    `SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar, p.skills as player_skills,
     ${virtualNameSql} as from_team_name, t.league_id as from_league_id,
     COALESCE(
       (SELECT owner.league_id FROM teams owner WHERE owner.id = p.loan_from_team_id),
       (SELECT current.league_id FROM teams current WHERE current.id = p.team_id),
       (SELECT recorded.league_id FROM teams recorded WHERE recorded.id = to2.to_team_id)
     ) as to_league_id,
     COALESCE((SELECT COALESCE(la.parent_team_id, la.id) FROM teams la WHERE la.id = to2.last_action_by), to2.last_action_by) as last_action_club_id,
     CASE WHEN to2.from_team_id = 'virtual_ai' THEN 1 ELSE 0 END as is_virtual
     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id LEFT JOIN teams t ON to2.from_team_id = t.id
     WHERE to2.to_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
       AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC`
  ).bind(clubTeamId, clubTeamId).all();
  const myTeam = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(clubTeamId).first<{ league_id: string }>();
  const outgoing = await c.env.DB.prepare(
    `SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.avatar as player_avatar, p.skills as player_skills,
     t.name as to_team_name,
     COALESCE(
       (SELECT owner.league_id FROM teams owner WHERE owner.id = p.loan_from_team_id),
       (SELECT current.league_id FROM teams current WHERE current.id = p.team_id),
       t.league_id
     ) as to_league_id,
     (SELECT tf.league_id FROM teams tf WHERE tf.id = to2.from_team_id) as from_league_id,
     COALESCE((SELECT COALESCE(la.parent_team_id, la.id) FROM teams la WHERE la.id = to2.last_action_by), to2.last_action_by) as last_action_club_id
     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id JOIN teams t ON to2.to_team_id = t.id
     WHERE to2.from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
       AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC`
  ).bind(clubTeamId, clubTeamId).all();

  // Historie — uzavrene offery (accepted, rejected, withdrawn, expired). Kam tym patril, ta role zustava.
  // LEFT JOIN kvůli virtuálním klubům; hráč může být po prodeji virtuálnímu klubu smazán → LEFT JOIN players + fallback.
  const history = await c.env.DB.prepare(
    `SELECT to2.*, COALESCE(p.first_name, dp.first_name) as first_name, COALESCE(p.last_name, dp.last_name) as last_name,
     COALESCE(p.age, dp.age) as age, COALESCE(p.position, dp.position) as position,
     COALESCE(p.overall_rating, dp.overall_rating) as overall_rating, p.avatar as player_avatar,
     ${virtualNameSql.replace("ELSE t.name END", "ELSE tf.name END")} as from_team_name, tt.name as to_team_name,
     tf.league_id as from_league_id, tt.league_id as to_league_id,
     COALESCE((SELECT COALESCE(fc.parent_team_id, fc.id) FROM teams fc WHERE fc.id = to2.from_team_id), to2.from_team_id) as from_club_team_id,
     CASE WHEN to2.from_team_id = 'virtual_ai' THEN 1 ELSE 0 END as is_virtual
     FROM transfer_offers to2
     LEFT JOIN players p ON to2.player_id = p.id
     LEFT JOIN departed_players dp ON to2.player_id = dp.id
     LEFT JOIN teams tf ON to2.from_team_id = tf.id
     JOIN teams tt ON to2.to_team_id = tt.id
     WHERE (to2.from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
        OR to2.to_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?))
       AND to2.status IN ('accepted','rejected','withdrawn','expired')
     ORDER BY COALESCE(to2.resolved_at, to2.created_at) DESC
     LIMIT 50`
  ).bind(clubTeamId, clubTeamId, clubTeamId, clubTeamId).all();
  // Hostování — odchozí i příchozí. `loan_fee` z aktivní smlouvy rozhoduje, jestli
  // smí kmenový klub hráče povolat zpět; `days_left` se počítá v HERNÍM čase, protože
  // v něm se zapisuje loan_until (viz daily-tick).
  const loanedOut = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.loan_until,
            t.name as loan_team_name, COALESCE(pc.fee, 0) AS loan_fee
     FROM players p
     JOIN teams t ON p.team_id = t.id
     LEFT JOIN player_contracts pc ON pc.player_id = p.id AND pc.team_id = p.team_id
       AND pc.join_type = 'loan' AND pc.is_active = 1
     WHERE p.loan_from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`
  ).bind(clubTeamId, clubTeamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch loaned out", e); return { results: [] }; });
  // Include loaned-in players
  const loanedIn = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.loan_until,
            t.name as owner_team_name, COALESCE(pc.fee, 0) AS loan_fee
     FROM players p
     JOIN teams t ON p.loan_from_team_id = t.id
     LEFT JOIN player_contracts pc ON pc.player_id = p.id AND pc.team_id = p.team_id
       AND pc.join_type = 'loan' AND pc.is_active = 1
     WHERE p.team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
       AND p.loan_from_team_id IS NOT NULL`
  ).bind(clubTeamId, clubTeamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch loaned in", e); return { results: [] }; });

  const hodinyTymu = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(clubTeamId).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "herní datum pro hostování", e); return null; });
  const dnesHerne = new Date(hodinyTymu?.game_date ?? new Date().toISOString()).getTime();
  const sDnyDoNavratu = (rows: Record<string, unknown>[]) => rows.map((r) => ({
    ...r,
    days_left: r.loan_until
      ? Math.max(0, Math.ceil((new Date(r.loan_until as string).getTime() - dnesHerne) / 86400000))
      : 0,
  }));
  loanedOut.results = sDnyDoNavratu(loanedOut.results as Record<string, unknown>[]);
  loanedIn.results = sDnyDoNavratu(loanedIn.results as Record<string, unknown>[]);

  // on_turn = jsem na tahu (poslední akce nebyla moje). Pro starší nabídky kde last_action_by = NULL
  // použijeme fallback: pro incoming nabídky je na tahu seller (teamId === to_team_id) pokud status=pending,
  // pro outgoing nabídky je na tahu buyer (teamId === from_team_id) pokud status=countered.
  const addOnTurn = (rows: Record<string, unknown>[], role: "buyer" | "seller") =>
    rows.map((r) => {
      const onTurn = r.last_action_club_id != null
        ? r.last_action_club_id !== clubTeamId
        : r.status === "pending" ? role === "seller" : role === "buyer";
      return { ...r, on_turn: onTurn };
    });

  // Hráči na výměnu jdou opačným směrem jako protihodnota. Bez nich vypadá
  // doplatek jako celá cena přestupu a druzí hráči se v historii vůbec neobjeví.
  const { loadSwapPlayers } = await import("../transfers/swap-players");
  const offerRows = [incoming.results, outgoing.results, history.results].flat() as Record<string, unknown>[];
  const swapsByOffer = await loadSwapPlayers(c.env.DB, offerRows.map((r) => r.id as string))
    .catch((e) => { logger.error({ module: "game" }, "hráči na výměnu k nabídkám", e); return new Map<string, unknown[]>(); });
  const withSwaps = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
    rows.map((r) => ({ ...r, swap_players: swapsByOffer.get(r.id as string) ?? [] }));

  // Historie — doplnit "role" (buyer/seller) pro kazdy zaznam
  const historyWithRole = withSwaps(history.results as Record<string, unknown>[]).map((r) => ({
    ...r,
    my_role: r.from_club_team_id === clubTeamId ? "buyer" : "seller",
  }));

  // Aktivni bidy z trhu — prichozi (na moje listingy) a odchozi (moje bidy na cizi listingy)
  const incomingBids = await c.env.DB.prepare(
    `SELECT tb.id, tb.listing_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status, tb.created_at,
            tl.player_id, tl.asking_price,
            p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar,
            t.name as buyer_team_name
     FROM transfer_bids tb
     JOIN transfer_listings tl ON tb.listing_id = tl.id
     JOIN players p ON tl.player_id = p.id
     JOIN teams t ON tb.team_id = t.id
     WHERE tl.team_id = ? AND tb.status IN ('pending','countered') AND tl.status = 'active'
     ORDER BY tb.created_at DESC`
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch incoming bids", e); return { results: [] }; });

  const outgoingBids = await c.env.DB.prepare(
    `SELECT tb.id, tb.listing_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status, tb.created_at,
            tl.player_id, tl.asking_price, tl.team_id as seller_team_id,
            p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar,
            t.name as seller_team_name
     FROM transfer_bids tb
     JOIN transfer_listings tl ON tb.listing_id = tl.id
     JOIN players p ON tl.player_id = p.id
     JOIN teams t ON tl.team_id = t.id
     WHERE tb.team_id = ? AND tb.status IN ('pending','countered') AND tl.status = 'active'
     ORDER BY tb.created_at DESC`
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch outgoing bids", e); return { results: [] }; });

  const addBidOnTurn = (rows: Record<string, unknown>[], myRole: "buyer" | "seller") =>
    rows.map((r) => {
      const onTurn = r.last_action_by != null
        ? r.last_action_by !== teamId
        : myRole === "seller"; // legacy: seller je na tahu pro pending bid
      return { ...r, on_turn: onTurn };
    });

  // Administrační poplatek počítá server, ne prohlížeč.
  //
  // Frontend si ho dřív dopočítával sám natvrdo dvaceti procenty (a v jiné hlášce
  // na téže stránce psal patnáct), takže se rozcházel i se sazbou, kterou si
  // soutěž odhlasovala. A hlavně nevěděl o výjimce pro mládež — u přesunu mezi
  // A-týmem a rezervou se poplatek neplatí, protože to není přestup mezi
  // soutěžemi dospělých.
  const { computeTransferLevies } = await import("../competition/transfer-levy");
  const dopocitejPoplatek = async (rows: Record<string, unknown>[]) => {
    const out: Record<string, unknown>[] = [];
    for (const r of rows) {
      const castka = Number(r.counter_amount ?? r.offer_amount ?? 0);
      const poplatky = await computeTransferLevies(c.env.DB, {
        buyerLeagueId: r.from_league_id as string | null,
        sellerLeagueId: r.to_league_id as string | null,
        amount: castka,
        isLoan: r.offer_type === "loan",
      }).catch((e) => {
        logger.warn({ module: "game" }, "výpočet poplatku k nabídce", e);
        return null;
      });
      out.push({ ...r, admin_fee: poplatky?.adminFee ?? 0, admin_fee_pct: poplatky?.adminFeePct ?? 0 });
    }
    return out;
  };

  return c.json({
    incoming: await dopocitejPoplatek(addOnTurn(withSwaps(incoming.results as Record<string, unknown>[]), "seller")),
    outgoing: await dopocitejPoplatek(addOnTurn(withSwaps(outgoing.results as Record<string, unknown>[]), "buyer")),
    incomingBids: addBidOnTurn(incomingBids.results as Record<string, unknown>[], "seller"),
    outgoingBids: addBidOnTurn(outgoingBids.results as Record<string, unknown>[], "buyer"),
    history: historyWithRole,
    loanedOut: loanedOut.results,
    loanedIn: loanedIn.results,
    myLeagueId: myTeam?.league_id ?? null,
  });
});

// Detail jedné nabídky s face-off kontextem (oba trenéři, hráč, timeline eventů)
gameRouter.get("/teams/:teamId/offers/:offerId", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;

  const offer = await c.env.DB.prepare(
    "SELECT * FROM transfer_offers WHERE id = ?"
  ).bind(offerId).first<Record<string, unknown>>();
  if (!offer) return c.json({ error: "Nabídka nenalezena" }, 404);
  const scope = await resolveOfferClubScope(c.env.DB, teamId, offer);
  if (!scope?.role) return c.json({ error: "Nabídka nenalezena" }, 404);

  const role = scope.role;
  const status = offer.status as string;
  const isActive = status === "pending" || status === "countered";
  const onTurn = isActive && scope.onTurn;

  const playerRow = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(offer.player_id).first<Record<string, unknown>>();
  const playerCurrentClubTeamId = playerRow
    ? await resolveClubTeamId(c.env.DB, String(playerRow.team_id))
    : null;
  const playerLoanOwnerClubTeamId = playerRow?.loan_from_team_id
    ? await resolveClubTeamId(c.env.DB, String(playerRow.loan_from_team_id))
    : null;
  const playerIsOwn = playerCurrentClubTeamId === scope.actorClubTeamId;
  const playerIsParentClub = playerLoanOwnerClubTeamId === scope.actorClubTeamId;
  const playerViewerTeamId = playerRow && (playerIsOwn || playerIsParentClub)
    ? String(playerRow.team_id)
    : scope.actorClubTeamId;
  const player = playerRow
    ? { ...buildPlayerView(playerRow, playerViewerTeamId), isOwn: playerIsOwn, isParentClub: playerIsParentClub }
    : null;
  const currentSellerSquadCandidate = playerRow
    ? String(playerRow.loan_from_team_id ?? playerRow.team_id)
    : scope.sellerSquadTeamId;
  const currentSellerClubTeamId = await resolveClubTeamId(c.env.DB, currentSellerSquadCandidate);
  const effectiveSellerSquadTeamId = currentSellerClubTeamId === scope.sellerClubTeamId
    ? currentSellerSquadCandidate
    : scope.sellerSquadTeamId;

  // Hráči na výměnu v pořadí, v jakém je kupující vybral. Kdo už v databázi není, se nezobrazí.
  const offeredPlayers: ReturnType<typeof buildPlayerView>[] = [];
  const swapRows = await c.env.DB.prepare(
    `SELECT p.* FROM transfer_offer_swap_players s JOIN players p ON p.id = s.player_id
      WHERE s.offer_id = ? ORDER BY s.sort_order`,
  ).bind(offerId).all<Record<string, unknown>>();
  for (const op of swapRows.results) {
    const offeredPlayerClubTeamId = await resolveClubTeamId(c.env.DB, String(op.team_id));
    const offeredPlayerViewerTeamId = offeredPlayerClubTeamId === scope.actorClubTeamId
      ? String(op.team_id)
      : scope.actorClubTeamId;
    offeredPlayers.push(buildPlayerView(op, offeredPlayerViewerTeamId));
  }

  const teamFields = "id, name, primary_color, secondary_color, badge_pattern, badge_symbol, badge_initials, badge_primary_color, badge_secondary_color, budget, reputation, league_id";
  const isVirtualOffer = offer.from_team_id === "virtual_ai";
  const fromTeamRow = isVirtualOffer
    ? null
    : await c.env.DB.prepare(`SELECT ${teamFields} FROM teams WHERE id = ?`).bind(scope.buyerClubTeamId).first<Record<string, unknown>>();
  const toTeamRow = await c.env.DB.prepare(`SELECT ${teamFields} FROM teams WHERE id = ?`).bind(scope.sellerClubTeamId).first<Record<string, unknown>>();
  const sellerSquad = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(effectiveSellerSquadTeamId).first<{ league_id: string }>();

  // Virtuální klub nemá řádek v teams — syntetický profil z virtual_team_data (legacy: message JSON).
  let virtualFromTeam: Record<string, unknown> | null = null;
  if (isVirtualOffer) {
    let vd: { name?: string; city?: string; district?: string; rating?: number; country?: string } = {};
    try {
      if (offer.virtual_team_data) vd = JSON.parse(offer.virtual_team_data as string);
      else if (offer.message) { const legacy = JSON.parse(offer.message as string); vd = { name: legacy.teamName, city: legacy.city }; }
    } catch (e) { logger.warn({ module: "game" }, "parse virtual_team_data", e); }
    const vName = vd.name ?? "Neznámý klub";
    virtualFromTeam = {
      id: "virtual_ai",
      name: vName,
      primary_color: "#4a5d43",
      secondary_color: "#e8e4d8",
      badge_pattern: "plain",
      badge_symbol: null,
      initials: vName.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
      budget: null,
      reputation: vd.rating ?? null,
      league_id: null,
      is_virtual: true,
      city: vd.city ?? null,
      district: vd.district ?? null,
      country: vd.country ?? null,
    };
  }

  const teamPublic = (row: Record<string, unknown>, isMine: boolean) => ({
    id: row.id, name: row.name,
    primary_color: (row.badge_primary_color as string | null) ?? (row.primary_color as string),
    secondary_color: (row.badge_secondary_color as string | null) ?? (row.secondary_color as string),
    badge_pattern: row.badge_pattern,
    badge_symbol: row.badge_symbol,
    initials: row.badge_initials,
    budget: isMine ? row.budget : null,
    reputation: row.reputation ?? null,
    league_id: row.league_id,
  });

  const fetchManager = async (tId: string) => {
    const row = await c.env.DB.prepare(
      "SELECT id, user_id, name, backstory, avatar, age, coaching, motivation, tactics, youth_development, discipline, reputation FROM managers WHERE team_id = ? ORDER BY CASE WHEN user_id = 'ai' THEN 1 ELSE 0 END LIMIT 1"
    ).bind(tId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch manager for offer detail", e); return null; });
    if (!row) return null;
    let avatar = {};
    try { avatar = row.avatar ? JSON.parse(row.avatar as string) : {}; } catch (e) { logger.warn({ module: "game" }, "parse manager avatar", e); }
    return {
      id: row.id, name: row.name, backstory: row.backstory, avatar,
      coachIsAi: row.user_id === "ai",
      age: row.age,
      coaching: row.coaching ?? 40,
      motivation: row.motivation ?? 40,
      tactics: row.tactics ?? 40,
      reputation: row.reputation ?? 30,
    };
  };
  const [fromManager, toManager] = await Promise.all([
    isVirtualOffer ? Promise.resolve(null) : fetchManager(scope.buyerClubTeamId),
    fetchManager(scope.sellerClubTeamId),
  ]);

  const events = await c.env.DB.prepare(
    `SELECT e.id, e.event_type, COALESCE(t.parent_team_id, e.team_id) AS team_id,
            e.amount, e.message, e.created_at, COALESCE(parent.name, t.name) AS team_name,
            e.upfront_pct, e.installments, e.sell_on_pct
     FROM transfer_offer_events e
     JOIN teams t ON e.team_id = t.id
     LEFT JOIN teams parent ON parent.id = t.parent_team_id
     WHERE e.offer_id = ? ORDER BY e.created_at ASC, e.id ASC`
  ).bind(offerId).all<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch offer events", e); return { results: [] }; });

  const currentAmount = (offer.counter_amount != null ? offer.counter_amount : offer.offer_amount) as number;
  const crossLeague = !!(fromTeamRow?.league_id && sellerSquad?.league_id && fromTeamRow.league_id !== sellerSquad.league_id);
  // Stejný výpočet jako při přijetí, jinak by náhled ukazoval jinou částku, než se strhne.
  const { computeTransferLevies: previewLevies } = await import("../competition/transfer-levy");
  const adminFee = (await previewLevies(c.env.DB, {
    buyerLeagueId: fromTeamRow?.league_id as string | null | undefined,
    sellerLeagueId: sellerSquad?.league_id,
    amount: currentAmount, isLoan: offer.offer_type === "loan",
  })).adminFee;

  // Zájem hráče o přestup — u aktivní nabídky čerstvý přepočet, u uzavřené snapshot.
  // Detailní faktory vidí jen vlastník hráče (role seller); kupec jen úroveň.
  // Trenér hráči slíbil prodej („pustit ho“ nebo při další nabídce): okno odmítnutí upozorní.
  let promiseWarning: string | null = null;
  if (role === "seller" && (offer.status === "pending" || offer.status === "countered")) {
    const { activeTransferPromise } = await import("../transfers/promises");
    const promise = await activeTransferPromise(c.env.DB, offer.player_id as string);
    if (promise?.type === "release") {
      const offerId = await c.env.DB.prepare("SELECT json_extract(details, '$.offerId') AS id FROM player_promises WHERE id = ?")
        .bind(promise.id).first<{ id: string | null }>()
        .catch((e) => { logger.warn({ module: "game" }, "slib pustit ho u nabídky", e); return null; });
      if (offerId?.id === offer.id) promiseWarning = "Slíbil jsi mu, že tuhle nabídku přijmeš. Když ji odmítneš nebo necháš propadnout, slib porušíš.";
    } else if (promise?.type === "transfer" && offer.offer_type !== "loan") {
      promiseWarning = "Slíbil jsi mu, že ho při další dobré nabídce pustíš. Když ji odmítneš, slib porušíš.";
    }
  }

  let playerInterest: { level: number; label: string; factors?: { label: string; delta: number }[] } | null = null;
  try {
    const { computeInterestForOffer, INTEREST_LABELS } = await import("../transfers/player-interest");
    const isOfferActive = offer.status === "pending" || offer.status === "countered";
    if (isOfferActive && playerRow) {
      const virtualRating = virtualFromTeam ? (virtualFromTeam.reputation as number | null) : null;
      const virtualCountry = virtualFromTeam ? (virtualFromTeam.country as string | null) : null;
      const fresh = await computeInterestForOffer(c.env.DB, offer.player_id as string, {
        fromTeamId: offer.from_team_id as string, offerAmount: currentAmount, virtualRating, virtualCountry,
      });
      if (fresh) {
        playerInterest = { level: fresh.level, label: INTEREST_LABELS[fresh.level] };
        if (role === "seller") playerInterest.factors = fresh.factors;
      }
    } else if (offer.player_interest != null) {
      const lvl = offer.player_interest as 0 | 1 | 2 | 3;
      playerInterest = { level: lvl, label: INTEREST_LABELS[lvl] };
    }
  } catch (e) { logger.warn({ module: "game" }, "player interest for offer detail", e); }

  return c.json({
    offer: {
      id: offer.id,
      player_id: offer.player_id,
      from_team_id: scope.buyerClubTeamId,
      to_team_id: scope.sellerClubTeamId,
      offer_type: offer.offer_type ?? "transfer",
      loan_duration: offer.loan_duration,
      offer_amount: offer.offer_amount,
      counter_amount: offer.counter_amount,
      message: offer.message,
      reject_message: offer.reject_message,
      status: offer.status,
      last_action_by: scope.lastActionClubTeamId,
      expires_at: offer.expires_at,
      created_at: offer.created_at,
      resolved_at: offer.resolved_at,
      player_interest: offer.player_interest ?? null,
      is_virtual: isVirtualOffer,
      upfront_pct: offer.upfront_pct ?? 100,
      installments: offer.installments ?? 0,
      sell_on_pct: offer.sell_on_pct ?? 0,
    },
    role,
    on_turn: onTurn,
    player,
    offeredPlayers,
    fromTeam: fromTeamRow ? teamPublic(fromTeamRow, role === "buyer") : virtualFromTeam,
    toTeam: toTeamRow ? teamPublic(toTeamRow, role === "seller") : null,
    fromManager,
    toManager,
    events: events.results,
    currentAmount,
    // Podmínky aktuálního návrhu a co kupující platí hned (záloha + poplatek).
    terms: termsFromRow(offer as { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null }, currentAmount),
    payNow: (offer.offer_type === "loan" ? currentAmount : transferSchedule(termsFromRow(offer as { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null }, currentAmount)).upfront) + adminFee,
    crossLeague,
    adminFee,
    playerInterest,
    promiseWarning,
  });
});

// GET /teams/:teamId/promises — běžící sliby hráčům klubu (značka 🤞 v kádru).
gameRouter.get("/teams/:teamId/promises", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const clubTeamId = (await resolveClubTeamId(c.env.DB, teamId)) ?? teamId;
  const { activePromisesForClub } = await import("../transfers/promises");
  return c.json({ active: Object.fromEntries(await activePromisesForClub(c.env.DB, clubTeamId)) });
});

// GET /teams/:teamId/demands — poptávky: moje, manažerů, klubů mimo hru a koho můžu nabídnout.
gameRouter.get("/teams/:teamId/demands", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const { listDemands } = await import("../transfers/demands");
  const data = await listDemands(c.env.DB, teamId);
  return data ? c.json(data) : c.json({ error: "Tým nenalezen" }, 404);
});

// POST /teams/:teamId/demands — nová poptávka (post, věk, kam ho chci, strop ceny).
gameRouter.post("/teams/:teamId/demands", async (c) => {
  const { parseDemandInput, createDemand } = await import("../transfers/demands");
  const body = await c.req.json().catch((e) => { logger.warn({ module: "game" }, "demand body", e); return null; });
  const parsed = parseDemandInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const res = await createDemand(c.env.DB, c.req.param("teamId"), parsed.value);
  return res.ok ? c.json(res) : c.json({ error: res.error }, 400);
});

// POST /teams/:teamId/demands/:demandId/withdraw — stáhnout vlastní poptávku.
gameRouter.post("/teams/:teamId/demands/:demandId/withdraw", async (c) => {
  const { withdrawDemand } = await import("../transfers/demands");
  const ok = await withdrawDemand(c.env.DB, c.req.param("teamId"), c.req.param("demandId"));
  return ok ? c.json({ ok: true }) : c.json({ error: "Poptávku se nepodařilo stáhnout." }, 404);
});

// POST /teams/:teamId/demands/:demandId/pitch — nabídnout k poptávce svého hráče.
gameRouter.post("/teams/:teamId/demands/:demandId/pitch", async (c) => {
  const { pitchPlayer } = await import("../transfers/demands");
  const body = await c.req.json<{ playerId?: string }>().catch((e) => { logger.warn({ module: "game" }, "pitch body", e); return null; });
  if (!body?.playerId) return c.json({ error: "Vyber hráče." }, 400);
  const res = await pitchPlayer(c.env.DB, c.req.param("teamId"), c.req.param("demandId"), body.playerId, createRng(cryptoSeed()));
  return res.ok ? c.json(res) : c.json({ error: res.error }, 400);
});

// GET /teams/:teamId/players/:playerId/promises — co trenér hráči slíbil (profil hráče).
gameRouter.get("/teams/:teamId/players/:playerId/promises", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const clubTeamId = (await resolveClubTeamId(c.env.DB, teamId)) ?? teamId;
  const { listPromises, promiseText, PROMISE_STATUS_LABELS } = await import("../transfers/promises");
  const promises = await listPromises(c.env.DB, c.req.param("playerId"), clubTeamId);
  return c.json({
    promises: promises.map((p) => ({
      id: p.id, text: promiseText(p), status: p.status, statusLabel: PROMISE_STATUS_LABELS[p.status], madeAt: p.madeAt, resolvedAt: p.resolvedAt,
    })),
  });
});

gameRouter.post("/teams/:teamId/offers/:offerId/accept", async (c) => {
  const body = await c.req.json<{ message?: string }>().catch((e) => { logger.warn({ module: "game" }, "neplatné tělo odpovědi na nabídku", e); return {}; });
  const res = await acceptTransferOffer(c.env, c.req.param("teamId"), c.req.param("offerId"), {
    message: (body as { message?: string }).message ?? null,
  });
  if (!res.ok) return transferError(c, res);
  return c.json(res.soldTo ? { ok: true, sold_to: res.soldTo } : { ok: true });
});

gameRouter.post("/teams/:teamId/offers/:offerId/reject", async (c) => {
  const body = await c.req.json<{ message?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse reject offer body", e); return {}; });
  const res = await rejectTransferOffer(c.env, c.req.param("teamId"), c.req.param("offerId"), {
    message: (body as { message?: string }).message ?? null,
  }, { waitUntil: (p) => c.executionCtx.waitUntil(p) });
  return res.ok ? c.json({ ok: true }) : transferError(c, res);
});

// POST /teams/:teamId/players/:playerId/unrest-talk — usmiřovací akce s trucujícím hráčem.
// Deterministické efekty, AI generuje jen textaci odpovědi hráče (s fallbackem).
gameRouter.post("/teams/:teamId/players/:playerId/unrest-talk", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const body = await c.req.json<{ action?: string }>().catch((e) => { logger.warn({ module: "game" }, "parse unrest-talk body", e); return {}; });
  const actionId = (body as { action?: string }).action;
  if (!actionId) return c.json({ error: "Chybí akce" }, 400);

  const { performUnrestAction } = await import("../transfers/unrest");
  const result = await performUnrestAction(c.env.DB, c.env, teamId, playerId, actionId);
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400);
  // Dohoda uprostřed rozhovoru po zatrhnutém přestupu: hráč odpoví v rozhovoru.
  if (result.threadConvId) {
    const { handleAiPlayerReply } = await import("../messaging/ai-player-spawn");
    c.executionCtx.waitUntil(
      handleAiPlayerReply(c.env.DB, c.env, result.threadConvId)
        .catch((e) => logger.error({ module: "game" }, "odpověď hráče na dohodu v rozhovoru", e)),
    );
  }
  return c.json(result);
});

gameRouter.post("/teams/:teamId/offers/:offerId/counter", async (c) => {
  const body = await c.req.json<CounterOfferInput>();
  const res = await counterTransferOffer(c.env, c.req.param("teamId"), c.req.param("offerId"), body);
  return res.ok ? c.json({ ok: true }) : transferError(c, res);
});

// Předčasné ukončení hostování — hráč se ihned vrací do původního klubu
/**
 * Vrátí hostujícího hráče kmenovému klubu — společné jádro pro obě strany.
 *
 * Hostující klub hostování ukončí, kmenový klub si hráče povolá zpět. Liší se jen
 * `leave_type` a texty SMS; přesun, uzavření smlouvy, přepočet dojíždění i novinka
 * ve Zpravodaji jsou stejné, tak ať nejsou napsané dvakrát.
 */
async function vratZHostovani(
  db: D1Database,
  player: {
    id: string; first_name: string; last_name: string; age: number;
    position: string; team_id: string; loan_from_team_id: string;
  },
  iniciator: "hostujici" | "kmenovy",
): Promise<void> {
  const borrowerTeamId = player.team_id;
  const ownerRosterTeamId = player.loan_from_team_id;
  const ownerClubTeamId = await resolveClubTeamId(db, ownerRosterTeamId) ?? ownerRosterTeamId;
  const gameDate = (await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(borrowerTeamId).first<{ game_date: string }>())?.game_date ?? new Date().toISOString();

  await db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ?")
    .bind(ownerRosterTeamId, player.id).run();

  await db.prepare(
    "UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = ? WHERE player_id = ? AND team_id = ? AND is_active = 1"
  ).bind(gameDate, iniciator === "kmenovy" ? "loan_recalled" : "loan_terminated", player.id, borrowerTeamId)
    .run().catch((e) => logger.warn({ module: "game" }, "close loan contract failed", e));

  await onPlayerTransferred(db, player.id, ownerRosterTeamId, { permanent: false });

  const borrower = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(borrowerTeamId).first<{ name: string }>();
  const owner = await db.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(ownerClubTeamId).first<{ name: string; league_id: string }>();
  const pName = `${player.first_name} ${player.last_name}`;

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(db, owner?.league_id ?? "", null, "loan_return", {
    playerName: pName, playerAge: player.age,
    playerPosition: player.position, teamName: owner?.name ?? "",
    fromTeamName: borrower?.name, toTeamName: owner?.name, fee: 0,
  }).catch((e) => logger.warn({ module: "game" }, "create loan return news", e));

  const role = "Sportovní ředitel";
  const [proHostujici, proKmenovy] = iniciator === "kmenovy"
    ? [`📤 ${owner?.name ?? "Kmenový klub"} si povolal ${pName} zpět z hostování. Hráč u tebe končí.`,
       `📥 Povolal jsi ${pName} zpět z hostování v ${borrower?.name ?? "klubu"}. Hráč je zpátky v kádru.`]
    : [`📤 Hostování ${pName} bylo předčasně ukončeno. Hráč se vrátil do ${owner?.name ?? "původního klubu"}.`,
       `📥 ${borrower?.name ?? "Klub"} předčasně ukončil hostování ${pName}. Hráč je zpět u tebe.`];

  await sendPhoneSMS(db, borrowerTeamId, role, role, proHostujici)
    .catch((e) => logger.warn({ module: "game" }, "sms hostujicimu klubu", e));
  await sendPhoneSMS(db, ownerClubTeamId, role, role, proKmenovy)
    .catch((e) => logger.warn({ module: "game" }, "sms kmenovemu klubu", e));
}

/** Načte hráče v podobě, kterou `vratZHostovani` potřebuje. */
async function nactiHostujicihoHrace(db: D1Database, playerId: string) {
  return db.prepare(
    "SELECT id, first_name, last_name, age, position, team_id, loan_from_team_id FROM players WHERE id = ?"
  ).bind(playerId).first<{
    id: string; first_name: string; last_name: string; age: number;
    position: string; team_id: string; loan_from_team_id: string | null;
  }>();
}

// POST /teams/:teamId/loans/:playerId/terminate — hostující klub posílá hráče domů.
gameRouter.post("/teams/:teamId/loans/:playerId/terminate", async (c) => {
  const teamId = c.req.param("teamId");
  const player = await nactiHostujicihoHrace(c.env.DB, c.req.param("playerId"));
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (player.team_id !== teamId) return c.json({ error: "Hráč není ve tvém klubu" }, 403);
  if (!player.loan_from_team_id) return c.json({ error: "Hráč není na hostování" }, 400);

  await vratZHostovani(c.env.DB, { ...player, loan_from_team_id: player.loan_from_team_id }, "hostujici");
  return c.json({ ok: true });
});

// POST /teams/:teamId/loans/:playerId/recall — kmenový klub si bere hráče zpět.
//
// Jen u hostování zdarma. Za zaplacené hostování si klub koupil hráče na dohodnutou
// dobu; vzít mu ho uprostřed by znamenalo řešit vracení poplatku, a to je jednání
// mezi kluby, ne tlačítko.
gameRouter.post("/teams/:teamId/loans/:playerId/recall", async (c) => {
  const teamId = c.req.param("teamId");
  const player = await nactiHostujicihoHrace(c.env.DB, c.req.param("playerId"));
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (!player.loan_from_team_id) return c.json({ error: "Hráč není na hostování" }, 400);
  const ownerClubTeamId = await resolveClubTeamId(c.env.DB, player.loan_from_team_id);
  const actorClubTeamId = await resolveClubTeamId(c.env.DB, teamId);
  if (!ownerClubTeamId || ownerClubTeamId !== actorClubTeamId) return c.json({ error: "Nejsi kmenový klub hráče" }, 403);

  const smlouva = await c.env.DB.prepare(
    "SELECT fee FROM player_contracts WHERE player_id = ? AND team_id = ? AND join_type = 'loan' AND is_active = 1 ORDER BY joined_at DESC LIMIT 1"
  ).bind(player.id, player.team_id).first<{ fee: number | null }>()
    .catch((e) => { logger.warn({ module: "game" }, "poplatek za hostovani", e); return null; });
  const poplatek = smlouva?.fee ?? 0;
  if (poplatek > 0) {
    return c.json({
      error: `Hostování bylo za ${poplatek.toLocaleString("cs")} Kč. Předčasně povolat jde jen hráče, který šel zadarmo.`,
    }, 400);
  }

  await vratZHostovani(c.env.DB, { ...player, loan_from_team_id: player.loan_from_team_id }, "kmenovy");
  return c.json({ ok: true });
});

gameRouter.delete("/teams/:teamId/offers/:offerId", async (c) => {
  const body = await c.req.json<{ message?: string }>().catch((e) => { logger.warn({ module: "game" }, "neplatné tělo odpovědi na nabídku", e); return {}; });
  const res = await withdrawTransferOffer(c.env, c.req.param("teamId"), c.req.param("offerId"), {
    message: (body as { message?: string }).message ?? null,
  }, { waitUntil: (p) => c.executionCtx.waitUntil(p) });
  return res.ok ? c.json({ ok: true }) : transferError(c, res);
});

// ── Player offers (organic scouting) ──

// GET /api/teams/:teamId/player-offers — pending offers
gameRouter.get("/teams/:teamId/player-offers", async (c) => {
  const teamId = c.req.param("teamId");
  // expires_at je v HERNÍM čase (player-offers.ts počítá z game_date) → filtrovat
  // proti hernímu datu týmu, ne reálnému 'now' (při offsetu nabídky mizely/přežívaly).
  const teamClock = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>().catch((e) => { logger.warn({ module: "game" }, "load game_date for offers", e); return null; });
  const offerCutoff = teamClock?.game_date ?? new Date().toISOString();
  const offers = await c.env.DB.prepare(
    "SELECT * FROM player_offers WHERE team_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC"
  ).bind(teamId, offerCutoff).all().catch(() => ({ results: [] }));
  return c.json(offers.results.map((o) => ({
    id: o.id, source: o.source, sourceName: o.source_name, message: o.message,
    firstName: o.first_name, lastName: o.last_name, age: o.age, position: o.position,
    nationality: (o.nationality as string) ?? "CZ",
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

  // Atomicky claimni offer — pokud někdo souběžně už přijal, claim selže a nevytvoříme duplicitního hráče.
  const claim = await c.env.DB.prepare("UPDATE player_offers SET status = 'accepted' WHERE id = ? AND team_id = ? AND status = 'pending'")
    .bind(offerId, teamId).run();
  if (claim.meta.changes === 0) {
    return c.json({ error: "Nabídka už byla zpracována" }, 409);
  }

  const playerId = crypto.randomUUID();
  // Skrytý talent z nabídky se musí propsat do sloupce hidden_talent — jinak by
  // zobrazený badge "✨ Talent" byl fikce (dřívější bug: INSERT ho zahazoval → default 0).
  const offerPersonality = (() => { try { return JSON.parse((offer.personality as string) ?? "{}"); } catch (e) { logger.warn({ module: "game" }, "parse offer personality", e); return {}; } })();
  const hiddenTalent = Math.max(0, Math.round(offerPersonality.hiddenTalent ?? 0));
  // Strop rozvoje (skills_max) dodal při vzniku nabídky společný generátor a leží
  // v `life_context.skillsMax`. Starší nabídky (před sjednocením generátorů) ho nemají,
  // pro ty zůstává dřívější dopočet z talentu.
  const offerLifeContext = (() => { try { return JSON.parse((offer.life_context as string) ?? "{}"); } catch (e) { logger.warn({ module: "game" }, "parse offer life_context", e); return {}; } })();
  const { skillsMax: generatedSkillsMax, ...lifeContextWithoutCaps } = offerLifeContext as { skillsMax?: Record<string, { current: number; maxPotential: number }> } & Record<string, unknown>;
  const offerSkills = (() => { try { return JSON.parse((offer.skills as string) ?? "{}"); } catch (e) { logger.warn({ module: "game" }, "parse offer skills", e); return {}; } })();
  const skillsMax: Record<string, { current: number; maxPotential: number }> = generatedSkillsMax ?? {};
  if (!generatedSkillsMax) {
    const headroom = 10 + Math.round(hiddenTalent * 0.6); // talent 0 → +10, talent 65 → +49
    for (const [attr, val] of Object.entries(offerSkills)) {
      if (typeof val !== "number") continue;
      skillsMax[attr] = { current: val, maxPotential: Math.min(100, val + headroom) };
    }
  }
  await c.env.DB.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status, nationality, hidden_talent, skills_max)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  ).bind(playerId, teamId, offer.first_name, offer.last_name, offer.age, offer.position, offer.overall_rating,
    offer.skills, offer.physical, offer.personality, JSON.stringify(lifeContextWithoutCaps), offer.avatar, offer.weekly_wage,
    (offer.nationality as string) ?? "CZ", hiddenTalent, JSON.stringify(skillsMax)).run();

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

  // Vazby na spoluhráče — dorostenec z vesnice většinou někoho zná
  const { attachNewcomerRelations } = await import("../transfers/attach-relations");
  await attachNewcomerRelations(c.env.DB, teamId, playerId);
  const { initNewcomerCoachRelation } = await import("../lib/coach-relation");
  await initNewcomerCoachRelation(c.env.DB, teamId, playerId);

  // Contract
  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 0, 1)")
    .bind(crypto.randomUUID(), playerId, teamId, mustSeason(season?.id), offer.source).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));

  // Registration fee
  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  await recordTransaction(c.env.DB, teamId, "signing_fee", -500, `Registrace: ${offer.first_name} ${offer.last_name}`, team?.game_date ?? new Date().toISOString());

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
  // Expirace nabídky se počítá z HERNÍHO data — s reálným by při posunutých hodinách
  // nabídka vypršela dřív, než by ji hráč vůbec uviděl.
  const gameDate = (await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId)
    .first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "game" }, "load game_date for admin offer", e); return null; }))?.game_date
    ?? new Date().toISOString();
  const result = await generatePlayerOffer(c.env.DB, rng, teamId, team.district, villageInfo, gameDate);
  return c.json({ ok: true, result });
});

// POST /api/admin/generate-youth-offer-all — pošle KAŽDÉMU lidskému A-týmu jednu nabídku
// dorostence přes standardní mechanismus (stejná funkce, jakou používá daily-tick).
//
// Respektuje běžná pravidla: tým, který už má 2 čekající nabídky, se přeskočí.
// `?dryRun=1` jen spočítá, koho by se to týkalo. `?source=` umí i jiný zdroj (pub, friend,
// recommendation), výchozí je dorost. `?source=random` nechá losovat zdroj zvlášť pro každý
// tým — každý manažer pak dostane jiného odesílatele (starosta / dorost / hospodský / kapitán).
// POST /api/admin/transfer-installments/run?teamId=…&gameDate=YYYY-MM-DD — pondělní splátky přestupů
// jednoho klubu hned (náhrada za spadlé pondělní zpracování, test). Za herní den nejvýš jedna
// splátka dohody, takže opakované volání se stejným datem nic nestrhne.
gameRouter.post("/admin/transfer-installments/run", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "Chybí teamId" }, 400);
  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const gameDate = c.req.query("gameDate") ?? team.game_date ?? new Date().toISOString().slice(0, 10);
  const { processTransferInstallments } = await import("../transfers/installments");
  const paid = await processTransferInstallments(c.env.DB, teamId, gameDate);
  return c.json({ ok: true, teamId, gameDate, paid });
});

gameRouter.post("/admin/generate-youth-offer-all", async (c) => {
  const dryRun = c.req.query("dryRun") === "1";
  const sourceParam = c.req.query("source") ?? "youth";
  // U `random` se forceSource nepředá vůbec a generatePlayerOffer si zdroj vylosuje sám
  // (stejně jako v daily-ticku) — proto undefined, ne nějaká vlastní náhoda tady.
  const source = sourceParam === "random"
    ? undefined
    : (sourceParam as "pub" | "youth" | "friend" | "recommendation");

  const teams = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.game_date, v.district, v.population, v.size,
            (SELECT COUNT(*) FROM player_offers po WHERE po.team_id = t.id AND po.status = 'pending') AS pending
       FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.user_id != 'ai' AND t.parent_team_id IS NULL AND t.game_date IS NOT NULL`,
  ).all<{ id: string; name: string; game_date: string; district: string; population: number; size: string; pending: number }>()
    .catch((e) => { logger.error({ module: "game" }, "load teams for youth offers", e); return { results: [] as never[] }; });

  const eligible = teams.results.filter((t) => t.pending < 2);
  if (dryRun) {
    return c.json({
      ok: true, dryRun: true, source: sourceParam,
      teams: eligible.length,
      skipped: teams.results.length - eligible.length,
      names: eligible.map((t) => t.name),
    });
  }

  const { generatePlayerOffer } = await import("../events/player-offers");
  const sizeMap: Record<string, string> = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
  const results: Array<{ team: string; player?: string; source?: string; ok: boolean }> = [];
  for (const t of eligible) {
    const villageInfo = {
      region_code: t.district,
      category: (sizeMap[t.size] ?? "obec") as "vesnice" | "obec" | "mestys" | "mesto",
      population: t.population ?? 500,
      district: t.district,
    };
    const r = await generatePlayerOffer(c.env.DB, createRng(cryptoSeed()), t.id, t.district, villageInfo, t.game_date, source)
      .catch((e) => { logger.warn({ module: "game" }, `youth offer for ${t.id}`, e); return null; });
    results.push({ team: t.name, player: r?.playerName, source: r?.source, ok: !!r });
  }

  const created = results.filter((r) => r.ok).length;
  logger.info({ module: "game" }, `hromadné nabídky (${sourceParam}): ${created}/${eligible.length} týmů`);
  return c.json({ ok: true, source: sourceParam, created, skipped: teams.results.length - eligible.length, results });
});

// ── Coach interviews (Rozhovor kola) ──

// POST /api/admin/regenerate-pending-interviews — smaže všechny pending rozhovory
// a vygeneruje nové se stejnou (league_id, calendar_id, game_week) trojicí.
// Optional body: { groups: [{leagueId, calendarId, gameWeek, count}, ...] } — pokud zadané,
// použije se místo lookupu z DB (užitečné když pending už byly smazány).
gameRouter.post("/admin/regenerate-pending-interviews", async (c) => {
  const body = await c.req.json<{ groups?: Array<{ leagueId: string; calendarId: string; gameWeek: number; count: number }> }>().catch((e) => {
    logger.warn({ module: "game.ts" }, "regen interviews, parse body (může být prázdné)", e);
    return null;
  });

  let groups: { results: Array<{ league_id: string; match_calendar_id: string; game_week: number; cnt: number }> };
  if (body?.groups?.length) {
    groups = {
      results: body.groups.map((g) => ({
        league_id: g.leagueId,
        match_calendar_id: g.calendarId,
        game_week: g.gameWeek,
        cnt: g.count,
      })),
    };
  } else {
    groups = await c.env.DB.prepare(
      `SELECT league_id, match_calendar_id, game_week, COUNT(*) as cnt
       FROM coach_interviews WHERE status = 'pending'
       GROUP BY league_id, match_calendar_id, game_week`
    ).all<{ league_id: string; match_calendar_id: string; game_week: number; cnt: number }>().catch((e) => {
      logger.warn({ module: "game.ts" }, "regen interviews, group lookup", e);
      return { results: [] };
    });
  }

  const summary: Array<{ leagueId: string; calendarId: string; gameWeek: number; deleted: number; regenerated: number }> = [];

  for (const g of groups.results ?? []) {
    const del = await c.env.DB.prepare(
      "DELETE FROM coach_interviews WHERE status = 'pending' AND league_id = ? AND match_calendar_id = ? AND game_week = ?"
    ).bind(g.league_id, g.match_calendar_id, g.game_week).run().catch((e) => {
      logger.warn({ module: "game.ts" }, "regen interviews, delete", e);
      return { meta: { changes: 0 } } as any;
    });

    const { tryCreateInterviewRequest } = await import("../news/interview-generator");
    let regenerated = 0;
    for (let i = 0; i < g.cnt; i++) {
      try {
        const before = await c.env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM coach_interviews WHERE league_id = ? AND match_calendar_id = ?"
        ).bind(g.league_id, g.match_calendar_id).first<{ cnt: number }>();
        await tryCreateInterviewRequest(c.env.DB, (c.env as any).GEMINI_API_KEY, {
          leagueId: g.league_id,
          calendarId: g.match_calendar_id,
          gameWeek: g.game_week,
        });
        const after = await c.env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM coach_interviews WHERE league_id = ? AND match_calendar_id = ?"
        ).bind(g.league_id, g.match_calendar_id).first<{ cnt: number }>();
        if ((after?.cnt ?? 0) > (before?.cnt ?? 0)) regenerated++;
        else break; // round-robin už nemá komu přiřadit
      } catch (e) {
        logger.warn({ module: "game.ts" }, "regen interviews, create", e);
        break;
      }
    }

    summary.push({
      leagueId: g.league_id,
      calendarId: g.match_calendar_id,
      gameWeek: g.game_week,
      deleted: del.meta?.changes ?? 0,
      regenerated,
    });
  }

  return c.json({ ok: true, summary });
});

// GET /api/teams/:teamId/coach-interviews — pending interviews (jen ty kde zápas ještě nebyl)
gameRouter.get("/teams/:teamId/coach-interviews", async (c) => {
  const teamId = c.req.param("teamId");
  const rows = await c.env.DB.prepare(
    `SELECT ci.* FROM coach_interviews ci
     LEFT JOIN season_calendar sc ON ci.match_calendar_id = sc.id
     WHERE ci.team_id = ? AND ci.status = 'pending'
       AND (ci.kind = 'post_match'
            OR ci.match_calendar_id LIKE 'season-%-wrap'
            OR (sc.id IS NOT NULL AND sc.status NOT IN ('simulated','cancelled')))
     ORDER BY ci.created_at DESC`
  ).bind(teamId).all<Record<string, unknown>>().catch((e) => {
    logger.warn({ module: "game.ts" }, "get coach_interviews", e);
    return { results: [] };
  });

  // Kdo se ptá — redaktor se určuje stejným seedem jako při psaní otázek,
  // takže vyjde tentýž člověk i bez ukládání do rozhovoru. Rozhovory se mezi
  // redaktory střídají, proto se hledá pro každý zvlášť.
  const { journalistForInterview, sentimentKeKlubu, popisVztahu, jmenoRedaktora } = await import("../news/journalists");
  const interviewers = await Promise.all((rows.results ?? []).map(async (r): Promise<Record<string, unknown> | null> => {
    const redaktor = await journalistForInterview(c.env.DB, r.league_id as string, teamId,
      r.match_calendar_id as string | null, (r.kind as string | null) ?? "pre_match")
      .catch((e) => { logger.warn({ module: "game.ts" }, "redaktor pro rozhovor", e); return null; });
    if (!redaktor) return null;
    const sentiment = await sentimentKeKlubu(c.env.DB, redaktor.id, teamId);
    return {
      id: redaktor.id,
      name: jmenoRedaktora(redaktor),
      style: redaktor.style,
      bio: redaktor.bio,
      sentiment,
      vztah: popisVztahu(sentiment),
      avatar: (() => { try { return JSON.parse(redaktor.avatar); } catch { return null; } })(),
    };
  }));
  const tazatel = interviewers[0] ?? null;

  const interviews = (rows.results ?? []).map((r, i) => ({
    id: r.id,
    leagueId: r.league_id,
    teamId: r.team_id,
    managerId: r.manager_id,
    matchCalendarId: r.match_calendar_id,
    gameWeek: r.game_week,
    questions: (() => { try { return JSON.parse(r.questions as string); } catch { return []; } })(),
    kind: (r.kind as string) ?? "pre_match",
    // Do FE jdou jen klíče témat — podle nich se u správné otázky zobrazí citát soupeře.
    topics: (() => {
      try {
        const raw = JSON.parse((r.topics as string) ?? "[]") as Array<{ key: string } | string>;
        return raw.map((t) => (typeof t === "string" ? t : t.key));
      } catch (e) { logger.warn({ module: "game" }, "parse témat rozhovoru", e); return []; }
    })(),
    // Fakta ze zápasu — formulář z nich ukáže skóre, sudího a spornou situaci,
    // aby hráč nemusel odpovídat po paměti.
    context: (() => { try { return JSON.parse((r.context as string) ?? "null"); } catch { return null; } })(),
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    journalist: interviewers[i] ?? null,
  }));

  return c.json({ interviews, journalist: tazatel });
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

  const body = await c.req.json<{ answers: string[]; tones?: string[] }>().catch((e) => { logger.warn({ module: "game.ts" }, "parse interview answer body", e); return null; });
  if (!body?.answers?.length) return c.json({ error: "Chybí odpovědi" }, 400);

  const questions: string[] = (() => {
    try { return JSON.parse(interview.questions as string); } catch { return []; }
  })();

  if (body.answers.length !== questions.length) {
    return c.json({ error: `Očekáváno ${questions.length} odpovědí, dostáno ${body.answers.length}` }, 400);
  }

  // Sanitize answers — max 500 chars each
  const answers = body.answers.map((a) => String(a).slice(0, 500).trim());
  // Tón ke každé odpovědi volí trenér, chybějící = normální. Ukládá se, aby ho znal i retry.
  const { normalizeTones, lexiconWithTone } = await import("../news/answer-tone");
  const tones = normalizeTones(body.tones, answers.length);

  // KROK 1: Okamžitě ulož odpovědi před Gemini — odpovědi se neztratí při selhání generování
  await c.env.DB.prepare(
    "UPDATE coach_interviews SET status = 'answered', answers = ?, answer_tones = ? WHERE id = ?"
  ).bind(JSON.stringify(answers), JSON.stringify(tones), interviewId)
    .run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "save interview answers", e); });

  // ── Pozápasový rozhovor má vlastní cestu ──
  // Efekty se zaúčtují VŽDY, i když Gemini selže — jinak by si rozhodčí nic
  // nezapamatoval a hráč by nedostal pokutu, kterou článek popisuje.
  if (interview.kind === "post_match") {
    const {
      classifyRefereeStance, mergeStance, generatePostMatchArticle, applyPostMatchInterviewEffects,
    } = await import("../news/post-match-interview");

    const topics = (() => {
      try { return JSON.parse((interview.topics as string) ?? "[]") as Array<{ key: string }>; } catch { return []; }
    })();
    const ctx = (() => {
      try { return JSON.parse((interview.context as string) ?? "null"); } catch { return null; }
    })();
    if (!ctx) return c.json({ ok: true, articlePending: true });

    const refIdx = topics.findIndex((t) => t.key === "rozhodci");
    const lexicon = lexiconWithTone(
      classifyRefereeStance(refIdx >= 0 ? answers[refIdx] : null),
      refIdx >= 0 ? tones[refIdx] : undefined,
    );

    const mgr = await c.env.DB.prepare(
      "SELECT m.name AS manager_name, m.avatar AS manager_avatar, t.name AS team_name, t.league_id FROM managers m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ?"
    ).bind(teamId).first<{ manager_name: string; manager_avatar: string | null; team_name: string; league_id: string }>()
      .catch((e) => { logger.warn({ module: "game.ts" }, "manažer pro pozápasový článek", e); return null; });

    const { journalistForInterview: redakce, pokynyProRedaktora: pokyny, sentimentKeKlubu: sentimentPM } =
      await import("../news/journalists");
    const redaktorPM = mgr ? await redakce(c.env.DB, mgr.league_id, teamId,
      interview.match_calendar_id as string | null, "post_match")
      .catch((e) => { logger.warn({ module: "game.ts" }, "redaktor pozápasového rozhovoru", e); return null; }) : null;
    const sentPM = redaktorPM ? await sentimentPM(c.env.DB, redaktorPM.id, teamId) : 0;

    const apiKey = (c.env as any).GEMINI_API_KEY as string | undefined;
    const generated = apiKey
      ? await generatePostMatchArticle(apiKey, ctx, questions, answers,
          redaktorPM ? pokyny(redaktorPM, sentPM) : "", tones)
          .catch((e) => { logger.warn({ module: "game.ts" }, "pozápasový článek", e); return null; })
      : null;

    const stance = mergeStance(generated?.rozhodci ?? null, lexicon);
    const applied = await applyPostMatchInterviewEffects(
      c.env.DB,
      {
        id: interviewId, team_id: teamId,
        league_id: (interview.league_id as string),
        match_id: (interview.match_id as string | null) ?? null,
        referee_id: (interview.referee_id as string | null) ?? null,
      },
      ctx, stance, generated?.tonKSoupsri ?? "nic",
    );

    if (!generated || !mgr) {
      // Odpovědi i efekty jsou uložené, článek dopíše retry v denním ticku.
      return c.json({ ok: true, articlePending: true, effects: applied });
    }

    const pmNewsId = crypto.randomUUID();
    let vztahPM: { popis: string; sentiment: number; dopad?: string } | undefined;
    if (redaktorPM && generated.vztahRedaktor && generated.vztahRedaktor.posun !== 0) {
      const { posunSentiment, popisVztahu, dopadTisku } = await import("../news/journalists");
      const novy = await posunSentiment(c.env.DB, redaktorPM.id, teamId,
        generated.vztahRedaktor.posun, generated.vztahRedaktor.duvod);
      const dopad = await dopadTisku(c.env.DB, teamId, novy, `press-${pmNewsId}`);
      vztahPM = {
        popis: `${redaktorPM.first_name} ${redaktorPM.last_name}: ${popisVztahu(novy)}`,
        sentiment: novy, dopad: dopad?.popis,
      };
    }

    await c.env.DB.prepare(
      "INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, journalist_id, created_at) VALUES (?, ?, ?, 'post_match_interview', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))"
    ).bind(
      pmNewsId, mgr.league_id, teamId, generated.headline,
      JSON.stringify({
        managerName: mgr.manager_name,
        managerAvatar: (() => { try { return mgr.manager_avatar ? JSON.parse(mgr.manager_avatar) : null; } catch { return null; } })(),
        teamName: mgr.team_name,
        article: generated.article,
        qa: questions.map((q, i) => ({ q, a: answers[i] ?? "", tone: tones[i] })),
        vztah: vztahPM,
        // ID kvůli proklikům ve Zpravodaji — jméno trenéra i sudího je odkaz.
        teamId,
        refereeName: ctx.refereeName ?? null,
        refereeId: (interview.referee_id as string | null) ?? null,
        incidentText: ctx.incident?.text ?? null,
      }),
      interview.game_week as number, redaktorPM?.id ?? null,
    ).run().catch((e) => logger.warn({ module: "game.ts" }, "insert pozápasového článku", e));

    await c.env.DB.prepare("UPDATE coach_interviews SET article_news_id = ? WHERE id = ?")
      .bind(pmNewsId, interviewId).run()
      .catch((e) => logger.warn({ module: "game.ts" }, "odkaz na pozápasový článek", e));

    const { notifyPostMatchArticle } = await import("../news/post-match-interview");
    await notifyPostMatchArticle(c.env.DB, teamId, generated.headline);

    return c.json({ ok: true, newsId: pmNewsId, effects: applied });
  }

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
  const qa = questions.map((q, i) => ({ q, a: answers[i] ?? "", tone: tones[i] }));
  // Season-wrap rozhovor (match_calendar_id = 'season-{n}-wrap') → sezónní bilanční článek, ne pregame
  const isSeasonWrap = String(interview.match_calendar_id ?? "").includes("-wrap");
  let article: { headline: string; body: string; reakce?: { posun: number; duvod: string } } | null;
  const { journalistForInterview, pokynyProRedaktora, sentimentKeKlubu } = await import("../news/journalists");
  const redaktor = await journalistForInterview(c.env.DB, managerRow.league_id as string, teamId,
    interview.match_calendar_id as string | null, (interview.kind as string | null) ?? "pre_match");
  const vztahKeKlubu = redaktor ? await sentimentKeKlubu(c.env.DB, redaktor.id, teamId) : 0;

  if (isSeasonWrap) {
    const seasonNumber = Math.max(1, Math.round(Number(interview.game_week ?? 100) / 100));
    const { generateSeasonInterviewArticle } = await import("../news/season-interview");
    article = await generateSeasonInterviewArticle(
      (c.env as any).GEMINI_API_KEY, qa, managerRow.manager_name, managerRow.team_name, seasonNumber, tones,
    );
  } else {
    const { generateInterviewArticle } = await import("../news/interview-generator");
    article = await generateInterviewArticle(
      (c.env as any).GEMINI_API_KEY, qa, managerRow.manager_name, managerRow.team_name, opponentName,
      redaktor ? pokynyProRedaktora(redaktor, vztahKeKlubu) : undefined, tones,
    );
  }

  if (!article) {
    logger.warn({ module: "game.ts", teamId }, "Gemini failed for interview article, answers saved, will retry");
    return c.json({ ok: true, articlePending: true });
  }

  // KROK 4: Ulož článek + aktualizuj odkaz
  const newsId = crypto.randomUUID();
  const managerAvatar = (() => {
    try { return managerRow.manager_avatar ? JSON.parse(managerRow.manager_avatar) : null; } catch { return null; }
  })();

  // Jak trenér odpovídal, tak si ho redaktor zařadí — a podle výsledného
  // vztahu o klubu píše, což se propíše do reputace i do zájmu lidí.
  let vztahInfo: { popis: string; sentiment: number; dopad?: string } | undefined;
  if (redaktor && article.reakce && article.reakce.posun !== 0) {
    const { posunSentiment, popisVztahu, dopadTisku } = await import("../news/journalists");
    const novy = await posunSentiment(
      c.env.DB, redaktor.id, teamId, article.reakce.posun, article.reakce.duvod,
    );
    const dopad = await dopadTisku(c.env.DB, teamId, novy, `press-${newsId}`);
    vztahInfo = {
      popis: `${redaktor.first_name} ${redaktor.last_name}: ${popisVztahu(novy)}`,
      sentiment: novy,
      dopad: dopad?.popis,
    };
  }

  const newsBody = JSON.stringify({
    managerName: managerRow.manager_name,
    managerAvatar,
    teamName: managerRow.team_name,
    article: article.body,
    qa,
    vztah: vztahInfo,
  });

  await c.env.DB.prepare(
    "INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, journalist_id, created_at) VALUES (?, ?, ?, 'interview', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(newsId, managerRow.league_id, teamId, article.headline, newsBody, interview.game_week as number, redaktor?.id ?? null)
    .run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "insert interview news", e); });

  await c.env.DB.prepare(
    "UPDATE coach_interviews SET article_news_id = ? WHERE id = ?"
  ).bind(newsId, interviewId)
    .run()
    .catch((e) => { logger.warn({ module: "game.ts" }, "update interview article_news_id", e); });

  // KROK 5: Rozesílka „vyšel článek" ostatním trenérům zrušena — nic s ní
  // nedělali a zaplňovala telefon. Že je ve Zpravodaji něco nového, hlásí
  // nijak, Zpravodaj je čtení na kdykoliv.

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
  // Dev trigger cílí na tým z cesty — jinak round-robin vybere kohokoli
  // a nejde otestovat, jak se rozhovor liší podle vztahu ke konkrétnímu klubu.
  await tryCreateInterviewRequest(c.env.DB, (c.env as any).GEMINI_API_KEY, {
    leagueId: nextMatch.league_id,
    calendarId: nextMatch.calendar_id,
    gameWeek: nextMatch.game_week,
    forceTeamId: teamId,
  });

  return c.json({ ok: true, calendarId: nextMatch.calendar_id, gameWeek: nextMatch.game_week, teamId });
});

// POST /api/admin/leagues/:leagueId/generate-matchday-preview — dev trigger
gameRouter.post("/admin/leagues/:leagueId/generate-matchday-preview", async (c) => {
  const leagueId = c.req.param("leagueId");

  // Najdi nejbližší nadcházející kolo (status='scheduled') této ligy
  const nextCal = await c.env.DB.prepare(
    `SELECT id, game_week, scheduled_at FROM season_calendar
     WHERE league_id = ? AND status = 'scheduled'
     ORDER BY scheduled_at ASC LIMIT 1`
  ).bind(leagueId)
    .first<{ id: string; game_week: number; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "admin matchday-preview lookup", e); return null; });

  if (!nextCal) return c.json({ error: "Žádné nadcházející kolo v této lize" }, 404);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY není nastaven" }, 500);

  const { generateMatchdayPreview } = await import("../news/matchday-preview");
  await generateMatchdayPreview(c.env.DB, c.env.GEMINI_API_KEY, leagueId, nextCal.id);

  return c.json({ ok: true, calendarId: nextCal.id, gameWeek: nextCal.game_week, scheduledAt: nextCal.scheduled_at });
});

// POST /api/admin/generate-round-summary?calendarId=X — dev trigger pro Hráče+Trenéra kola
gameRouter.post("/admin/generate-round-summary", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (!calendarId) return c.json({ error: "calendarId query parameter required" }, 400);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY není nastaven" }, 503);

  const { generateRoundSummary } = await import("../news/round-summary");
  const result = await generateRoundSummary(c.env.DB, c.env.GEMINI_API_KEY, calendarId);
  return c.json({ ok: true, ...result });
});

// POST /api/admin/generate-ultras-report?calendarId=X — dev trigger rubriky Prales Ultras
gameRouter.post("/admin/generate-ultras-report", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (!calendarId) return c.json({ error: "calendarId query parameter required" }, 400);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY není nastaven" }, 503);
  const { generateUltrasReport } = await import("../news/ultras-report");
  const result = await generateUltrasReport(c.env.DB, c.env.GEMINI_API_KEY, calendarId, undefined, { ai: c.env.AI, bucket: c.env.SEED_DATA });
  return c.json({ ok: true, ...result });
});

// POST /api/admin/ultras-photos?newsId=X — doplní fotky plachet do už vydaného reportu Prales Ultras
// (nové reporty je dostávají samy). Kotle, které fotku mají, se přeskočí.
gameRouter.post("/admin/ultras-photos", async (c) => {
  const newsId = c.req.query("newsId");
  if (!newsId) return c.json({ error: "newsId query parameter required" }, 400);
  if (!c.env.AI) return c.json({ error: "Workers AI není k dispozici" }, 503);
  const row = await c.env.DB.prepare("SELECT id, photos_json FROM ultras_reports WHERE news_id = ?")
    .bind(newsId).first<{ id: string; photos_json: string | null }>();
  if (!row) return c.json({ error: "Report nenalezen" }, 404);
  const photos = JSON.parse(row.photos_json ?? "[]") as import("../news/ultras-report").UltrasPhoto[];
  const teamIds = photos.map((p) => p.teamId);
  type TeamRow = {
    id: string; primary_color: string | null; secondary_color: string | null;
    stand_goal_west: number | null; stands: number | null; roof: number | null; cage: number | null;
  };
  // Tribuna kotle podle dnešního stadionu klubu (fotka plachty ukáže kotel na jeho tribuně).
  const teams = teamIds.length === 0 ? { results: [] as TeamRow[] } : await c.env.DB
    .prepare(`SELECT t.id, t.primary_color, t.secondary_color, s.stand_goal_west, s.stands, s.roof, s.cage
                FROM teams t LEFT JOIN stadiums s ON s.team_id = t.id
               WHERE t.id IN (${teamIds.map(() => "?").join(",")})`)
    .bind(...teamIds).all<TeamRow>();
  const { addUltrasPhotos } = await import("../news/ultras-report");
  const { ultrasStandFromStadium } = await import("../news/ultras-photo");
  const { readAiProvider } = await import("../lib/ai-provider");
  const ocrKey = (await readAiProvider(c.env.CACHE_KV)) === "gemini" ? c.env.GEMINI_API_KEY : undefined;
  const added = await addUltrasPhotos(c.env.AI, c.env.SEED_DATA, photos, teams.results.map((t) => ({
    homeTeamId: t.id, primaryColor: t.primary_color ?? "#2D5F2D", secondaryColor: t.secondary_color ?? "#ffffff",
    stand: ultrasStandFromStadium(t),
  })), ocrKey);
  await c.env.DB.prepare("UPDATE ultras_reports SET photos_json = ? WHERE id = ?").bind(JSON.stringify(photos), row.id).run();
  return c.json({ ok: true, added, photos: photos.map((p) => ({ team: p.teamName, text: p.ultrasText, photoId: p.photoId ?? null })) });
});

// POST /api/admin/generate-player-interview?calendarId=X — dev trigger pro Rozhovor s hráčem
gameRouter.post("/admin/generate-player-interview", async (c) => {
  const calendarId = c.req.query("calendarId");
  if (!calendarId) return c.json({ error: "calendarId query parameter required" }, 400);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY není nastaven" }, 503);

  const { generatePlayerInterview } = await import("../news/player-interview");
  const result = await generatePlayerInterview(c.env.DB, c.env.GEMINI_API_KEY, calendarId);
  return c.json({ ok: true, ...result });
});

// POST /api/admin/generate-post-match-interviews?calendarId=X — dožene pozápasové
// rozhovory za kolo, které je odsimulované, ale rozhovory u něj chybí (starší běh je
// zastavil na limitu, nebo se běh přerušil). Idempotentní: UNIQUE index na
// (team_id, match_calendar_id, kind) druhý rozhovor ani druhou SMS nepustí.
// Bez calendarId vezme nejnovější odsimulované kolo z každé ligy.
gameRouter.post("/admin/generate-post-match-interviews", async (c) => {
  const calendarId = c.req.query("calendarId");
  const { tryCreatePostMatchInterviews } = await import("../news/post-match-interview");

  const calendars: string[] = [];
  if (calendarId) {
    calendars.push(calendarId);
  } else {
    const rows = await c.env.DB.prepare(
      `SELECT id FROM season_calendar sc WHERE status = 'simulated'
         AND scheduled_at = (SELECT MAX(scheduled_at) FROM season_calendar
                             WHERE league_id = sc.league_id AND status = 'simulated')`
    ).all<{ id: string }>().catch((e) => {
      logger.warn({ module: "game.ts" }, "poslední odsimulovaná kola", e);
      return { results: [] };
    });
    calendars.push(...(rows.results ?? []).map((r) => r.id));
  }

  const summary: Array<{ calendarId: string; created: number }> = [];
  for (const id of calendars) {
    const r = await tryCreatePostMatchInterviews(c.env.DB, c.env.GEMINI_API_KEY, id)
      .catch((e) => { logger.warn({ module: "game.ts" }, `dogenerování rozhovorů ${id}`, e); return { created: 0 }; });
    summary.push({ calendarId: id, created: r.created });
  }

  return c.json({ ok: true, calendars: calendars.length, created: summary.reduce((s, x) => s + x.created, 0), summary });
});

// POST /api/admin/teams/:teamId/grant-budget — admin korekce rozpočtu (refundy apod.)
// Body: { amount: number, reason: string }. Jde přes recordTransaction (audit + balance_after).
gameRouter.post("/admin/teams/:teamId/grant-budget", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ amount: number; reason?: string }>().catch((e) => {
    logger.warn({ module: "game.ts" }, "parse grant-budget body", e);
    return null;
  });
  if (!body || typeof body.amount !== "number" || body.amount === 0) {
    return c.json({ error: "amount (nenulové číslo) je povinné" }, 400);
  }

  const team = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const { recordTransaction } = await import("../season/finance-processor");
  const balanceAfter = await recordTransaction(
    c.env.DB, teamId, "other", body.amount,
    body.reason ?? "Admin korekce rozpočtu", team.game_date,
  );
  return c.json({ ok: true, teamId, amount: body.amount, balanceAfter });
});

// POST /api/game/delegate-referees — dodatečná delegace rozhodčích.
// Denní tick deleguje jen na kolo za dva herní dny. Když se rozhodčí nasadí do
// rozehrané sezóny (nebo tick kolo minul), tohle je dožene: bez parametrů projde
// všechna nadcházející kola do dvou týdnů, s ?calendarId= jen to jedno.
gameRouter.post("/game/delegate-referees", async (c) => {
  const calendarId = c.req.query("calendarId");
  const { delegateRefereesForCalendar } = await import("../referees/delegation");

  if (calendarId) {
    const n = await delegateRefereesForCalendar(c.env.DB, calendarId);
    return c.json({ ok: true, delegated: n, calendars: 1 });
  }

  const gd = await c.env.DB.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL")
    .first<{ d: string | null }>();
  if (!gd?.d) return c.json({ error: "Herní datum není nastavené" }, 400);

  const cals = await c.env.DB.prepare(
    `SELECT sc.id FROM season_calendar sc
     WHERE sc.status = 'scheduled' AND sc.scheduled_at >= ? AND sc.scheduled_at <= datetime(?, '+14 days')
       AND sc.season_number = (SELECT MAX(x.season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)
       AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id AND m.referee_id IS NULL)
     ORDER BY sc.scheduled_at ASC`
  ).bind(gd.d, gd.d).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "hledání kol k dodatečné delegaci", e); return null; });

  let delegated = 0;
  for (const row of cals?.results ?? []) {
    delegated += await delegateRefereesForCalendar(c.env.DB, row.id)
      .catch((e) => { logger.warn({ module: "game" }, `delegace kola ${row.id}`, e); return 0; });
  }
  return c.json({ ok: true, delegated, calendars: cals?.results.length ?? 0, gameDate: gd.d });
});

// POST /api/admin/end-season?force=1 — GLOBÁLNÍ chunkovaná orchestrace konce sezóny.
// Zakončí celý ročník napříč všemi senior ligami + založí nový globální ročník.
// Volat OPAKOVANĚ dokud allDone=true (admin tlačítko / curl loop). Jedna jednotka práce/invokaci.
gameRouter.post("/admin/end-season", async (c) => {
  const force = c.req.query("force") === "1";
  const { runEndSeasonStep } = await import("../season/end-season");
  const result = await runEndSeasonStep(c.env.DB, (c.env as any).GEMINI_API_KEY, { force });
  return c.json(result);
});

// GET /api/season-history — archiv všech sezón (síň slávy) pro stránku Historie.
gameRouter.get("/season-history", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT lh.id, lh.league_id, lh.season_number, lh.final_standings, lh.awards, lh.season_stats, lh.created_at, l.name AS league_name
     FROM league_history lh JOIN leagues l ON l.id = lh.league_id
     ORDER BY lh.season_number DESC, l.name ASC`,
  ).all<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game.ts" }, "load season history", e); return { results: [] as Record<string, unknown>[] }; });

  const safeParse = (v: unknown) => { try { return v ? JSON.parse(v as string) : null; } catch { return null; } };
  const history = rows.results.map((r) => ({
    id: r.id, leagueId: r.league_id, leagueName: r.league_name, seasonNumber: r.season_number,
    finalStandings: safeParse(r.final_standings), awards: safeParse(r.awards), seasonStats: safeParse(r.season_stats),
    createdAt: r.created_at,
  }));
  return c.json({ history });
});

// GET /api/teams/:teamId/trophies — trofeje klubu (ownership-guarded prefixem /teams/:teamId/*).
gameRouter.get("/teams/:teamId/trophies", async (c) => {
  const teamId = c.req.param("teamId");
  const row = await c.env.DB.prepare("SELECT trophies FROM teams WHERE id = ?").bind(teamId).first<{ trophies: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load trophies", e); return null; });
  let trophies: unknown[] = [];
  try { trophies = JSON.parse(row?.trophies ?? "[]"); } catch { trophies = []; }
  return c.json({ trophies });
});

// GET /api/teams/:teamId/season-recap — nepřečtený přehled konce sezóny (nebo null).
gameRouter.get("/teams/:teamId/season-recap", async (c) => {
  const teamId = c.req.param("teamId");
  const row = await c.env.DB.prepare(
    "SELECT season_number, data FROM season_recap WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1",
  ).bind(teamId).first<{ season_number: number; data: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load season recap", e); return null; });
  if (!row) return c.json({ recap: null });
  let data: Record<string, unknown> | null = null;
  try { data = JSON.parse(row.data) as Record<string, unknown>; } catch (e) { logger.warn({ module: "game.ts" }, "parse recap data", e); }
  // Neúplný recap (jen "departures" snapshot z fáze departures, bez champion/awards/seasonStats)
  // se nikdy nesmí servírovat na FE — /konec-sezony očekává plný recap a bez těch polí spadne.
  // Vzniká např. u AI týmu, který dohrál sezónu a NIKDY neprošel buildTeamRecap (běží jen pro
  // lidské týmy); po převzetí takového týmu ho nový manažer zdědí. Ber ho jako neexistující.
  if (!data || !data.champion || !data.awards || !data.seasonStats) {
    return c.json({ recap: null });
  }
  return c.json({ recap: data, seasonNumber: row.season_number });
});

// POST /api/teams/:teamId/season-recap/dismiss — manažer viděl recap.
gameRouter.post("/teams/:teamId/season-recap/dismiss", async (c) => {
  const teamId = c.req.param("teamId");
  await c.env.DB.prepare("UPDATE season_recap SET seen = 1 WHERE team_id = ? AND seen = 0").bind(teamId).run()
    .catch((e) => logger.warn({ module: "game.ts" }, "dismiss season recap", e));
  return c.json({ ok: true });
});

// GET /api/teams/:teamId/season-welcome — uvítání do nové sezóny (novinky + co tě čeká), pokud ještě nebylo viděno.
gameRouter.get("/teams/:teamId/season-welcome", async (c) => {
  const teamId = c.req.param("teamId");
  const w = await c.env.DB.prepare("SELECT season_number FROM season_welcome WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1")
    .bind(teamId).first<{ season_number: number }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load season welcome", e); return null; });
  if (!w) return c.json(null);
  const seasonNumber = w.season_number;

  const team = await c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(teamId).first<{ name: string; league_id: string | null }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "welcome team", e); return null; });
  const firstMatch = await c.env.DB.prepare(
    "SELECT MIN(sc.scheduled_at) AS d FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'scheduled' AND sc.season_number = ?"
  ).bind(teamId, teamId, seasonNumber).first<{ d: string | null }>().catch((e) => { logger.warn({ module: "game.ts" }, "welcome first match", e); return null; });
  const squad = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM players WHERE team_id = ? AND (status IS NULL OR status != 'released')").bind(teamId).first<{ c: number }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "welcome squad", e); return null; });

  // Pohár — síla soupeřů vs tvoje.
  let cup: { name: string; rounds: number; myStrength: number | null; bigMin: number; bigMax: number; realAvg: number } | null = null;
  const cupRow = await c.env.DB.prepare("SELECT id, name, total_rounds FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1").bind(seasonNumber).first<{ id: string; name: string; total_rounds: number }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "welcome cup", e); return null; });
  if (cupRow) {
    const mine = await c.env.DB.prepare("SELECT strength FROM cup_teams WHERE cup_id = ? AND team_id = ?").bind(cupRow.id, teamId).first<{ strength: number }>().catch((e) => { logger.warn({ module: "game.ts" }, "welcome cup mine", e); return null; });
    const big = await c.env.DB.prepare("SELECT MIN(strength) mn, MAX(strength) mx FROM cup_teams WHERE cup_id = ? AND is_big_club = 1").bind(cupRow.id).first<{ mn: number; mx: number }>().catch((e) => { logger.warn({ module: "game.ts" }, "welcome cup big", e); return null; });
    const real = await c.env.DB.prepare("SELECT ROUND(AVG(strength)) a FROM cup_teams WHERE cup_id = ? AND is_big_club = 0").bind(cupRow.id).first<{ a: number }>().catch((e) => { logger.warn({ module: "game.ts" }, "welcome cup real", e); return null; });
    cup = { name: cupRow.name, rounds: cupRow.total_rounds, myStrength: mine?.strength ?? null, bigMin: big?.mn ?? 0, bigMax: big?.mx ?? 0, realAvg: real?.a ?? 0 };
  }

  const news = seasonNumber === 2 ? [
    { icon: "🏆", title: "Celorepublikový pohár", text: "Nově hraješ i pohár. 128 týmů, vyřazovací pavouk. Los je náhodný, můžeš narazit i na velkoklub." },
    { icon: "🌦️", title: "Počasí rozhoduje", text: "Déšť, sníh a vítr mění hru, horší technika, víc soubojů, míň diváků i míň vypitého piva." },
    { icon: "🧢", title: "Kabina žije", text: "Tahoun drží partu a zvedá morálku, potížista dělá dusno. Rivalové v kádru se hádají, kámoši od piva táhnou spolu." },
    { icon: "🌍", title: "Cizinci na trhu", text: "Na trhu potkáš Slováky, Ukrajince, Vietnamce i Romy, s vlastními jmény a vzhledem." },
    { icon: "📅", title: "Pevné hrací dny", text: "Liga se hraje v pondělí a čtvrtek, pohár v sobotu." },
  ] : [];

  // Pravidla, která grémium soutěže změnilo — hodnoty z řádku nové sezóny, ze kterého čte hra.
  const { seasonRuleChanges } = await import("../competition/season-rule-changes");
  const ruleChanges = team?.league_id ? await seasonRuleChanges(c.env.DB, team.league_id, seasonNumber) : [];

  return c.json({
    seasonNumber,
    teamName: team?.name ?? "",
    firstMatch: firstMatch?.d ?? null,
    squadSize: squad?.c ?? 0,
    cup,
    news,
    ruleChanges,
  });
});

// POST /api/teams/:teamId/season-welcome/dismiss
gameRouter.post("/teams/:teamId/season-welcome/dismiss", async (c) => {
  const teamId = c.req.param("teamId");
  await c.env.DB.prepare("UPDATE season_welcome SET seen = 1 WHERE team_id = ? AND seen = 0").bind(teamId).run()
    .catch((e) => logger.warn({ module: "game.ts" }, "dismiss season welcome", e));
  return c.json({ ok: true });
});

// POST /api/teams/:teamId/season-recap/decide — manažer rozhodl souboje „kdo zůstane".
// Body: { leaving: string[] } — ID hráčů, kteří odejdou (poražení v duelech). Validuje proti staged duelům.
gameRouter.post("/teams/:teamId/season-recap/decide", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ leaving: string[] }>().catch((e) => { logger.warn({ module: "game.ts" }, "parse decide body", e); return null; });
  const leaving = Array.isArray(body?.leaving) ? body!.leaving : [];

  // Stejná služba rozhoduje souboje i za AI trenéra (ai-coach/season-duels.ts).
  const { decideSeasonDuels } = await import("../season/season-duels");
  const result = await decideSeasonDuels(c.env.DB, teamId, leaving);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true });
});

// POST /api/teams/:teamId/season-recap/party — proslov trenéra na závěrečné.
// Body: { tone: 'pokorny'|'chvastavy'|'nemuzu'|'opily' } → dopad na morálku kádru, přízeň vesnice, reputaci.
const PARTY_TONE_FX: Record<string, { morale: number; favor: number; rep: number }> = {
  pokorny: { morale: 4, favor: 4, rep: 1 },
  chvastavy: { morale: 5, favor: -3, rep: 0 },
  nemuzu: { morale: -5, favor: -4, rep: -1 },
  opily: { morale: 2, favor: 5, rep: -1 },
};
gameRouter.post("/teams/:teamId/season-recap/party", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ tone: string }>().catch((e) => { logger.warn({ module: "game.ts" }, "parse party body", e); return null; });
  const fx = body?.tone ? PARTY_TONE_FX[body.tone] : null;
  if (!fx) return c.json({ error: "Neznámý tón proslovu" }, 400);

  const row = await c.env.DB.prepare("SELECT season_number, data FROM season_recap WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1")
    .bind(teamId).first<{ season_number: number; data: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load recap for party", e); return null; });
  if (!row) return c.json({ error: "Recap nenalezen" }, 404);

  let data: Record<string, any> = {};
  try { data = JSON.parse(row.data); } catch (e) { logger.warn({ module: "game.ts" }, "parse recap data for party", e); }
  if (data?.party?.appliedTone) return c.json({ ok: true, already: true }); // jen jednou

  // Dopady (clamp), každý nekritický
  await c.env.DB.prepare(
    "UPDATE players SET life_context = json_set(COALESCE(life_context,'{}'), '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context,'$.morale'),50) + ?))) WHERE team_id = ? AND status = 'active'",
  ).bind(fx.morale, teamId).run().catch((e) => logger.warn({ module: "game.ts" }, "party morale", e));
  await c.env.DB.prepare(
    "UPDATE village_team_favor SET favor = MAX(0, MIN(100, favor + ?)) WHERE team_id = ? AND official_id IS NULL",
  ).bind(fx.favor, teamId).run().catch((e) => logger.warn({ module: "game.ts" }, "party favor", e));
  if (fx.rep !== 0) {
    const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
    const toneLabel: Record<string, string> = {
      pokorny: "Pokorný proslov na závěrečné párty",
      chvastavy: "Chvástavý proslov na závěrečné párty",
      nemuzu: "Výmluvy na závěrečné párty",
      opily: "Opilecký projev na závěrečné párty",
    };
    await applyManagerAttrDelta(
      c.env.DB, teamId, "reputation", fx.rep, "party",
      toneLabel[body!.tone] ?? "Proslov na závěrečné párty",
      { referenceId: `mgr-party-s${row.season_number}-${teamId}` },
    );
  }

  if (data.party) data.party.appliedTone = body!.tone;
  await c.env.DB.prepare("UPDATE season_recap SET data = ? WHERE team_id = ? AND season_number = ?")
    .bind(JSON.stringify(data), teamId, row.season_number).run()
    .catch((e) => logger.warn({ module: "game.ts" }, "mark party applied", e));
  return c.json({ ok: true });
});

// ── Celorepublikový pohár (KO) ──

async function activeSeasonNumber(db: D1Database): Promise<number> {
  const s = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number }>();
  return mustSeason(s?.n, "aktivní sezóna");
}

// GET /api/teams/:teamId/cup — pohár aktuální sezóny: pavouk + cesta daného týmu.
gameRouter.get("/teams/:teamId/cup", async (c) => {
  const teamId = c.req.param("teamId");
  const seasonNum = await activeSeasonNumber(c.env.DB);
  const cup = await c.env.DB.prepare("SELECT id, name, season_number, status, total_rounds, current_round, winner_team_id FROM cup_competitions WHERE season_number = ? LIMIT 1")
    .bind(seasonNum).first<{ id: string; name: string; season_number: number; status: string; total_rounds: number; current_round: number; winner_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load cup", e); return null; });
  if (!cup) return c.json({ cup: null });

  const { roundName, cupPrizeTable } = await import("../cup/cup");
  // Znak skutečného klubu (velkoklub ho nemá, kreslí se štít s iniciálami).
  const teamsRes = await c.env.DB.prepare(
    `SELECT ct.id, ct.team_id, ct.name, ct.strength, ct.is_big_club, ct.primary_color, ct.eliminated_round,
            t.badge_pattern, COALESCE(t.badge_primary_color, t.primary_color) AS badge_primary, COALESCE(t.badge_secondary_color, t.secondary_color) AS badge_secondary,
            t.badge_initials, t.badge_symbol
       FROM cup_teams ct LEFT JOIN teams t ON t.id = ct.team_id
      WHERE ct.cup_id = ?`
  ).bind(cup.id).all<{ id: string; team_id: string | null; name: string; strength: number; is_big_club: number; primary_color: string | null; eliminated_round: number | null; badge_pattern: string | null; badge_primary: string | null; badge_secondary: string | null; badge_initials: string | null; badge_symbol: string | null }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load cup teams", e); return { results: [] as any[] }; });
  const tmap = new Map(teamsRes.results.map((t) => [t.id, t]));
  const ctOf = (id: string | null) => (id ? tmap.get(id) : null);
  const side = (id: string | null) => {
    const t = ctOf(id);
    if (!t) return null;
    const crest = t.badge_pattern
      ? { pattern: t.badge_pattern, primary: t.badge_primary, secondary: t.badge_secondary, initials: t.badge_initials, symbol: t.badge_symbol }
      : null;
    return { name: t.name, color: t.primary_color, isBig: !!t.is_big_club, teamId: t.team_id, strength: t.strength, cupTeamId: t.id, crest };
  };

  const matchesRes = await c.env.DB.prepare("SELECT id, round, bracket_pos, home_cup_team_id, away_cup_team_id, home_score, away_score, home_pens, away_pens, winner_cup_team_id, status, upset, scheduled_at FROM cup_matches WHERE cup_id = ? ORDER BY round, bracket_pos")
    .bind(cup.id).all<{ id: string; round: number; bracket_pos: number; home_cup_team_id: string | null; away_cup_team_id: string | null; home_score: number | null; away_score: number | null; home_pens: number | null; away_pens: number | null; winner_cup_team_id: string | null; status: string; upset: number; scheduled_at: string | null }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load cup matches", e); return { results: [] as any[] }; });

  // Herní datum — pro "za X dní" u naplánovaných pohárových zápasů
  const gdRow = await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load game_date for cup", e); return null; });
  const gameNow = gdRow?.game_date ? new Date(gdRow.game_date).getTime() : Date.now();
  const daysUntil = (iso: string | null) => iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - gameNow) / 86400000)) : null;

  const myCt = teamsRes.results.find((t) => t.team_id === teamId);
  const roundsMap = new Map<number, any[]>();
  const myMatches: any[] = [];
  for (const m of matchesRes.results) {
    const entry = {
      id: m.id,
      scheduledAt: m.scheduled_at,
      bracketPos: m.bracket_pos,
      home: side(m.home_cup_team_id), away: side(m.away_cup_team_id),
      homeScore: m.home_score, awayScore: m.away_score, homePens: m.home_pens, awayPens: m.away_pens,
      winnerId: m.winner_cup_team_id, status: m.status, upset: !!m.upset,
    };
    if (!roundsMap.has(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round)!.push(entry);
    if (myCt && (m.home_cup_team_id === myCt.id || m.away_cup_team_id === myCt.id)) {
      const isHome = m.home_cup_team_id === myCt.id;
      const opp = side(isHome ? m.away_cup_team_id : m.home_cup_team_id);
      const won = m.winner_cup_team_id === myCt.id;
      myMatches.push({
        matchId: m.id,
        round: m.round, roundName: roundName(m.round, cup.total_rounds),
        opponent: opp, isHome,
        myScore: isHome ? m.home_score : m.away_score, oppScore: isHome ? m.away_score : m.home_score,
        myPens: isHome ? m.home_pens : m.away_pens, oppPens: isHome ? m.away_pens : m.home_pens,
        status: m.status, won: m.status === "simulated" ? won : null,
        scheduledAt: m.scheduled_at, daysUntil: m.status === "simulated" ? null : daysUntil(m.scheduled_at),
      });
    }
  }
  const rounds = [...roundsMap.entries()].sort(([a], [b]) => a - b).map(([round, matches]) => ({ round, roundName: roundName(round, cup.total_rounds), matches }));
  const winner = cup.winner_team_id ? side(cup.winner_team_id) : null;

  // Pohárové statistiky — střelci/asistence/karty z match_player_stats (reální hráči i velkokluby).
  const statsRes = await c.env.DB.prepare(
    `SELECT mps.player_id, SUM(mps.goals) AS goals, SUM(mps.assists) AS assists, SUM(mps.yellow_cards) AS yc, SUM(mps.red_cards) AS rc, COUNT(*) AS apps,
       COALESCE(p.first_name || ' ' || p.last_name, cc.first_name || ' ' || cc.last_name, '?') AS name,
       ct.name AS team_name, ct.team_id AS real_team_id
     FROM match_player_stats mps
     JOIN cup_matches cm ON cm.id = mps.match_id AND cm.cup_id = ?
     LEFT JOIN players p ON p.id = mps.player_id
     LEFT JOIN cup_club_players cc ON cc.id = mps.player_id
     LEFT JOIN cup_teams ct ON ct.id = mps.team_id
     GROUP BY mps.player_id
     HAVING SUM(mps.goals) > 0 OR SUM(mps.assists) > 0 OR SUM(mps.red_cards) > 0
     ORDER BY goals DESC, assists DESC LIMIT 20`
  ).bind(cup.id).all<{ player_id: string; goals: number; assists: number; yc: number; rc: number; apps: number; name: string; team_name: string; real_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "cup stats", e); return { results: [] as { player_id: string; goals: number; assists: number; yc: number; rc: number; apps: number; name: string; team_name: string; real_team_id: string | null }[] }; });
  const scorers = statsRes.results.map((r) => ({
    playerId: r.player_id, name: r.name, teamName: r.team_name ?? "", teamId: r.real_team_id,
    goals: r.goals, assists: r.assists, yellow: r.yc, red: r.rc, apps: r.apps,
  }));

  return c.json({
    cup: { name: cup.name, seasonNumber: cup.season_number, status: cup.status, totalRounds: cup.total_rounds, currentRound: cup.current_round, winner },
    myTeam: myCt ? { name: myCt.name, eliminatedRound: myCt.eliminated_round, alive: myCt.eliminated_round == null && cup.status === "active", isChampion: cup.winner_team_id === myCt.id } : null,
    myMatches,
    rounds,
    prizes: cupPrizeTable(cup.total_rounds),
    scorers,
  });
});

// GET /api/teams/:teamId/cup/team/:cupTeamId — detail pohárového týmu (síla, soupiska velkoklubu, cesta pohárem).
gameRouter.get("/teams/:teamId/cup/team/:cupTeamId", async (c) => {
  const cupTeamId = c.req.param("cupTeamId");
  const ct = await c.env.DB.prepare("SELECT ct.id, ct.cup_id, ct.team_id, ct.name, ct.strength, ct.is_big_club, ct.primary_color, ct.eliminated_round, cc.total_rounds FROM cup_teams ct JOIN cup_competitions cc ON cc.id = ct.cup_id WHERE ct.id = ?")
    .bind(cupTeamId).first<{ id: string; cup_id: string; team_id: string | null; name: string; strength: number; is_big_club: number; primary_color: string | null; eliminated_round: number | null; total_rounds: number }>();
  if (!ct) return c.json({ error: "Pohárový tým nenalezen" }, 404);

  const { roundName } = await import("../cup/cup");
  // Soupiska (velkokluby mají plný kádr v cup_club_players; slabé týmy z předkol kádr nemají)
  const squadRes = await c.env.DB.prepare(
    "SELECT first_name, last_name, position, overall_rating, age, condition, morale, suspended_matches FROM cup_club_players WHERE cup_team_id = ? ORDER BY CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 ELSE 3 END, overall_rating DESC",
  ).bind(cupTeamId).all<{ first_name: string; last_name: string; position: string; overall_rating: number; age: number; condition: number; morale: number; suspended_matches: number }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load cup squad", e); return { results: [] as any[] }; });

  // Cesta pohárem — zápasy tohoto pohárového týmu
  const matchesRes = await c.env.DB.prepare(
    `SELECT cm.round, cm.status, cm.home_score, cm.away_score, cm.home_pens, cm.away_pens, cm.winner_cup_team_id,
       h.name AS home_name, a.name AS away_name, h.id AS home_id, a.id AS away_id
     FROM cup_matches cm JOIN cup_teams h ON h.id = cm.home_cup_team_id JOIN cup_teams a ON a.id = cm.away_cup_team_id
     WHERE cm.cup_id = ? AND (cm.home_cup_team_id = ? OR cm.away_cup_team_id = ?) ORDER BY cm.round`,
  ).bind(ct.cup_id, cupTeamId, cupTeamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load cup team matches", e); return { results: [] as Record<string, unknown>[] }; });

  return c.json({
    team: {
      cupTeamId: ct.id, teamId: ct.team_id, name: ct.name, strength: ct.strength,
      isBig: !!ct.is_big_club, color: ct.primary_color,
      eliminatedRound: ct.eliminated_round, alive: ct.eliminated_round == null,
    },
    squad: squadRes.results.map((p) => ({
      name: `${p.first_name} ${p.last_name}`, position: p.position, rating: p.overall_rating,
      age: p.age, condition: p.condition, morale: p.morale, suspended: p.suspended_matches > 0,
    })),
    matches: matchesRes.results.map((m) => ({
      round: m.round, roundName: roundName(m.round as number, ct.total_rounds), status: m.status,
      homeName: m.home_name, awayName: m.away_name,
      homeScore: m.home_score, awayScore: m.away_score, homePens: m.home_pens, awayPens: m.away_pens,
      won: m.winner_cup_team_id === cupTeamId,
      isHome: m.home_id === cupTeamId,
    })),
  });
});

// POST /api/admin/run-daily-tick — ruční spuštění denního ticku (globální hodiny + auto-pohár + vše).
gameRouter.post("/admin/run-daily-tick", async (c) => {
  const { executeDailyTick } = await import("../season/daily-tick");
  try {
    const r = await executeDailyTick(c.env);
    return c.json({ ok: true, events: r.events?.length ?? 0 });
  } catch (e) {
    logger.error({ module: "game.ts" }, "manual daily tick", e);
    return c.json({ error: "tick selhal" }, 500);
  }
});

// POST /api/admin/sponsor-promises/evaluate — ruční vyhodnocení slibů sponzorům (testování).
// ?scope=deadline → termínové sliby k hernímu dni (jako denní tick, bez KV zámku ticku),
// ?scope=season&season=N → sezónní sliby sezóny N nad dosavadními daty, MIMO rollover
//   (atRollover: false — končící smlouvy se neuzavírají). POZOR: vyřízení je NATRVALO, stejný
//   nárok jako v ticku nebo rolloveru, jen nad rozehranou sezónou — ne náhled.
// Obojí je idempotentní: vyřízený slib se podruhé nenárokuje.
gameRouter.post("/admin/sponsor-promises/evaluate", async (c) => {
  const scope = c.req.query("scope");
  const row = await c.env.DB.prepare(
    "SELECT game_date FROM teams WHERE user_id != 'ai' AND game_date IS NOT NULL ORDER BY game_date DESC LIMIT 1",
  ).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "herní datum pro vyhodnocení slibů", e); return null; });
  const gameDate = row?.game_date ?? new Date().toISOString();
  const { evaluateDeadlinePromises, evaluateSeasonPromises } = await import("../sponsors/promise-runs");
  try {
    if (scope === "deadline") {
      return c.json({ ok: true, gameDate, ...(await evaluateDeadlinePromises(c.env.DB, gameDate)) });
    }
    if (scope === "season") {
      const season = Number(c.req.query("season"));
      if (!Number.isInteger(season) || season < 1) return c.json({ error: "Chybí číslo sezóny" }, 400);
      const r = await evaluateSeasonPromises(c.env.DB, season, {
        gameDate, day: gameDate.slice(0, 10), agedSinceSeason: false, atRollover: false,
      });
      return c.json({
        ok: true, gameDate,
        note: "Sezónní sliby se vyřizují natrvalo nad dosavadními daty, i mimo rollover.",
        ...r,
      });
    }
    return c.json({ error: "Parametr scope musí být deadline nebo season" }, 400);
  } catch (e) {
    logger.error({ module: "game.ts" }, "ruční vyhodnocení slibů sponzorům", e);
    return c.json({ error: "Vyhodnocení selhalo" }, 500);
  }
});

// POST /api/admin/run-transfer-tick — ruční spuštění transfer pressure ticku
// (expirace nabídek, CPU nabídky, truc). Testing env nemá crony — jediná cesta, jak ho tam spustit.
gameRouter.post("/admin/run-transfer-tick", async (c) => {
  const { executeTransferPressureTick } = await import("../transfers/transfer-pressure-tick");
  try {
    const r = await executeTransferPressureTick(c.env, { force: true });
    return c.json({ ok: true, ...r });
  } catch (e) {
    logger.error({ module: "game.ts" }, "manual transfer pressure tick", e);
    return c.json({ error: "tick selhal" }, 500);
  }
});

// POST /api/admin/generate-ai-offers — force vygeneruje čerstvé CPU nabídky pro KAŽDÝ lidský tým.
// ?replace=1 nejdřív expiruje stávající pending virtuální nabídky (přímý UPDATE, BEZ dopadu na
// hráče), takže se stará „studená" várka nahradí novou dle aktuálního modelu zájmu.
gameRouter.post("/admin/generate-ai-offers", async (c) => {
  const replace = c.req.query("replace") === "1";
  let expired = 0;
  if (replace) {
    const res = await c.env.DB.prepare(
      "UPDATE transfer_offers SET status = 'expired', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE from_team_id = 'virtual_ai' AND status = 'pending'"
    ).run().catch((e) => { logger.warn({ module: "game" }, "expire virtual offers", e); return null; });
    expired = res?.meta?.changes ?? 0;
  }
  const { generateAiOffers } = await import("../transfers/virtual-teams");
  const { createRng, cryptoSeed } = await import("../generators/rng");
  const rng = createRng(cryptoSeed());
  // Stejné ligy jako denní tick: CPU nabídky jdou i na hráče AI klubů.
  const leagues = await c.env.DB.prepare(
    "SELECT l.id, l.district FROM leagues l JOIN teams t ON t.league_id = l.id GROUP BY l.id"
  ).all().catch((e) => { logger.warn({ module: "game" }, "fetch leagues for force offers", e); return { results: [] }; });
  let created = 0;
  for (const lg of leagues.results) {
    created += await generateAiOffers(c.env.DB, lg.district as string, lg.id as string, rng, { force: true });
  }
  return c.json({ ok: true, expired, created });
});

// POST /api/admin/generate-club-demands — doplní poptávky klubů mimo hru do plna v každém okrese s kluby
// (lidskými i AI, stejně jako denní tick).
gameRouter.post("/admin/generate-club-demands", async (c) => {
  const { generateClubDemands, CLUB_DEMANDS_PER_DISTRICT } = await import("../transfers/demands");
  const rng = createRng(cryptoSeed());
  const districts = await c.env.DB.prepare(
    "SELECT DISTINCT l.district FROM leagues l JOIN teams t ON t.league_id = l.id WHERE t.user_id IS NOT NULL AND t.parent_team_id IS NULL",
  ).all<{ district: string }>();
  let created = 0;
  for (const d of districts.results) {
    if (!d.district) continue;
    for (let i = 0; i < CLUB_DEMANDS_PER_DISTRICT; i++) created += await generateClubDemands(c.env.DB, d.district, rng, { force: true });
  }
  return c.json({ ok: true, created });
});

// POST /api/admin/backfill-departed-avatars — doplní náhodný obličej všem archivovaným
// hráčům bez avataru (prodaní/odešlí před migrací 0115), aby v souhrnu přestupů nebyli bez ksichtu.
gameRouter.post("/admin/backfill-departed-avatars", async (c) => {
  const { generatePlayerFace } = await import("./teams");
  const rows = await c.env.DB.prepare(
    "SELECT id, age FROM departed_players WHERE avatar IS NULL OR avatar = '' OR avatar = '{}'"
  ).all<{ id: string; age: number }>().catch((e) => { logger.warn({ module: "game" }, "load departed for avatar backfill", e); return { results: [] as { id: string; age: number }[] }; });

  const stmts = rows.results.map((r) => {
    const face = generatePlayerFace({ age: (r.age as number) ?? 25, bodyType: "normal" });
    return c.env.DB.prepare("UPDATE departed_players SET avatar = ? WHERE id = ?").bind(JSON.stringify(face), r.id);
  });
  // Dávkovat po 50 (limit D1 batch)
  for (let i = 0; i < stmts.length; i += 50) {
    await c.env.DB.batch(stmts.slice(i, i + 50)).catch((e) => logger.warn({ module: "game" }, "avatar backfill batch", e));
  }
  return c.json({ ok: true, updated: stmts.length });
});

// POST /api/admin/cup/create — vytvoří pohár pro aktuální sezónu.
gameRouter.post("/admin/cup/create", async (c) => {
  const { createCup } = await import("../cup/cup");
  const r = await createCup(c.env.DB, await activeSeasonNumber(c.env.DB));
  return c.json(r);
});

// POST /api/admin/teams/:teamId/manager-attr — ruční korekce atributu trenéra.
//
// Legitimní admin nástroj (oprava po incidentu, vyvážení), ne jen testovací vrátka:
// zápis jde stejnou cestou jako herní změny, takže se objeví v historii trenéra
// se zdrojem "admin" a je vidět, že to nebyl výsledek hry.
gameRouter.post("/admin/teams/:teamId/manager-attr", async (c) => {
  const teamId = c.req.param("teamId");
  type AttrBody = { attr?: string; delta?: number; description?: string };
  const body: AttrBody = await c.req.json<AttrBody>()
    .catch((e) => { logger.warn({ module: "game" }, "parse manager-attr body", e); return {} as AttrBody; });

  const { MANAGER_ATTR_LABELS, applyManagerAttrDelta, attrBounds } = await import("../lib/manager-attrs");
  const allowed = Object.keys(MANAGER_ATTR_LABELS);
  if (!body.attr || !allowed.includes(body.attr)) {
    return c.json({ error: `Neplatný atribut. Povolené: ${allowed.join(", ")}` }, 400);
  }
  const delta = Number(body.delta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 50) {
    return c.json({ error: "delta musí být celé nenulové číslo v rozsahu ±50" }, 400);
  }

  const attr = body.attr as keyof typeof MANAGER_ATTR_LABELS;
  const gameDate = (await c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "game" }, "load game date for manager-attr", e); return null; })
  )?.game_date ?? undefined;

  const res = await applyManagerAttrDelta(
    c.env.DB, teamId, attr, delta, "admin",
    body.description?.trim() || `Ruční úprava (${MANAGER_ATTR_LABELS[attr]})`,
    { gameDate },
  );

  if (res.skipped === "no_manager") return c.json({ error: "Tým nemá trenéra" }, 404);
  if (res.skipped === "error") return c.json({ error: "Zápis selhal, viz logy" }, 500);

  return c.json({
    ok: true,
    attr,
    attrLabel: MANAGER_ATTR_LABELS[attr],
    requested: delta,
    applied: res.applied,
    oldValue: res.oldValue,
    newValue: res.newValue,
    bounds: attrBounds(attr),
    capped: res.skipped === "capped",
  });
});

// POST /api/admin/voice-rerecord-drunk?scenario=…&limit=3 — už odeslané hlasovky s tématem
// přehraje opilým hlasem (stejný hráč a text). Volat opakovaně, dokud `left` není 0.
gameRouter.post("/admin/voice-rerecord-drunk", async (c) => {
  const scenarioId = c.req.query("scenario") ?? "";
  const { getScenarioById } = await import("../messaging/ai-player-scenarios");
  const scenario = getScenarioById(scenarioId);
  if (!scenario) return c.json({ error: "Neznámé téma" }, 400);
  const { rerecordVoiceMessagesDrunk } = await import("../messaging/voice-message");
  const limit = Math.min(10, Math.max(1, Number(c.req.query("limit") ?? "3")));
  const fixAddress = c.req.query("fixAddress") === "1";
  const r = await rerecordVoiceMessagesDrunk(c.env.DB, c.env, { scenarioId, scene: scenario.description, limit, fixAddress })
    .catch((e) => { logger.error({ module: "game.ts" }, "přehrání hlasovek opile", e); return null; });
  if (!r) return c.json({ error: "přehrání selhalo" }, 500);
  return c.json({ ok: true, ...r });
});

// POST /api/admin/spawn-ai-chats — ruční spuštění SMS od hráčů (jinak jen cron 0 14).
// Umožňuje ověřit obsah zpráv bez čekání na noční běh. `?teamId=` spustí jen jeden tým
// bez losu a cooldownu, `&voice=1` k tomu rovnou pošle hlasovku (jinak strop 2 týdně).
gameRouter.post("/admin/spawn-ai-chats", async (c) => {
  const { applyAiPlayerThreads } = await import("../messaging/ai-player-spawn");
  const teamId = c.req.query("teamId");
  // `&scenario=coach_relationship_voice` vynutí téma (ukázková hlasovka podle vztahu k trenérovi).
  // `&dryRun=1` jen ukáže a uloží koncept (hráč + text), ostré odeslání ho pak pošle beze změny.
  const manual = teamId
    ? { teamId, forceVoice: c.req.query("voice") === "1", scenarioId: c.req.query("scenario"), dryRun: c.req.query("dryRun") === "1" }
    : undefined;
  const r = await applyAiPlayerThreads(c.env.DB, c.env, manual)
    .catch((e) => { logger.error({ module: "game.ts" }, "manual ai chat spawn", e); return null; });
  if (!r) return c.json({ error: "spawn selhal" }, 500);
  return c.json({ ok: true, ...r });
});

// POST /api/admin/casual-message?teamId=… — zpráva „jen tak" od hráče (jinak hodinový cron, kostka).
// `&topic=casual_pig_slaughter` vynutí téma, `&dryRun=1` jen vrátí koncept (text a fotku) a nic nepošle.
gameRouter.post("/admin/casual-message", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "chybí teamId" }, 400);
  const { spawnCasualMessages } = await import("../messaging/casual-messages");
  const dryRun = c.req.query("dryRun") === "1";
  // `&gemini=1` u náhledu napíše text přes Gemini i na testingu, kde přepínač ai_provider drží
  // slabší workers-ai. Bez KV se přepínač čte jako výchozí „gemini" (lib/ai-provider.ts).
  const env = dryRun && c.req.query("gemini") === "1" ? { ...c.env, CACHE_KV: undefined } : c.env;
  // `&at=2026-11-14T13:00:00Z` u náhledu: jako by hráč psal v tu chvíli (den, hodina, roční doba).
  const at = dryRun && c.req.query("at") ? new Date(String(c.req.query("at"))) : new Date();
  if (Number.isNaN(at.getTime())) return c.json({ error: "neplatné at" }, 400);
  const r = await spawnCasualMessages(c.env.DB, env, at, {
    teamId, topicId: c.req.query("topic") || undefined, dryRun,
  }).catch((e) => { logger.error({ module: "game.ts" }, "ruční zpráva jen tak", e); return null; });
  if (!r) return c.json({ error: "zpráva selhala" }, 500);
  return c.json({ ok: true, ...r });
});

// POST /api/admin/phone-hourly — doručí odložené zprávy hráčů hned (jinak cron 30 * * * *).
gameRouter.post("/admin/phone-hourly", async (c) => {
  const { deliverDueFollowUps } = await import("../messaging/follow-ups");
  const r = await deliverDueFollowUps(c.env.DB, c.env)
    .catch((e) => { logger.error({ module: "game.ts" }, "ruční doručení odložených zpráv", e); return null; });
  if (!r) return c.json({ error: "doručení selhalo" }, 500);
  return c.json({ ok: true, ...r });
});

// POST /api/admin/cup/advance — odsimuluje aktuální kolo poháru.
gameRouter.post("/admin/cup/advance", async (c) => {
  const cup = await c.env.DB.prepare("SELECT id FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1")
    .bind(await activeSeasonNumber(c.env.DB)).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "load active cup", e); return null; });
  if (!cup) return c.json({ error: "Žádný aktivní pohár" }, 404);
  const { simulateCupRound } = await import("../cup/cup");
  const r = await simulateCupRound(c.env.DB, cup.id);
  return c.json(r);
});

// POST /api/admin/cup/backfill-finances — zpětně dopočítá návštěvu + tržby pro už odehrané
// domácí pohárové zápasy reálných týmů (idempotentní: jen zápasy bez uložené návštěvy).
gameRouter.post("/admin/cup/backfill-finances", async (c) => {
  const { backfillCupFinances } = await import("../cup/cup");
  const r = await backfillCupFinances(c.env.DB);
  return c.json({ ok: true, ...r });
});

// POST /api/admin/cup/sync-names — srovná názvy s reálným týmem tam, kde přejmenování
// (naming sponzor / převzetí) nebylo promítnuto: (1) pohár, (2) U21 týmy podle rodiče.
gameRouter.post("/admin/cup/sync-names", async (c) => {
  const cup = await c.env.DB.prepare("SELECT id FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1")
    .bind(await activeSeasonNumber(c.env.DB)).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "sync-names load cup", e); return null; });

  // Pohár — srovnat jméno + barvu se reálným týmem (všechny reální týmy s team_id, kde nesedí).
  let cupUpdated = 0;
  if (cup) {
    const res = await c.env.DB.prepare(
      `UPDATE cup_teams
         SET name = (SELECT t.name FROM teams t WHERE t.id = cup_teams.team_id),
             primary_color = (SELECT t.primary_color FROM teams t WHERE t.id = cup_teams.team_id)
       WHERE cup_id = ?
         AND team_id IS NOT NULL
         AND name != (SELECT t.name FROM teams t WHERE t.id = cup_teams.team_id)`
    ).bind(cup.id).run().catch((e) => { logger.warn({ module: "game.ts" }, "sync cup team names", e); return null; });
    cupUpdated = res?.meta?.changes ?? 0;
  }

  // U21 týmy — jméno má být "<rodič> U21"; přejmenování rodiče se dřív do U21 nepromítlo.
  const u21 = await c.env.DB.prepare(
    `UPDATE teams
       SET name = (SELECT p.name FROM teams p WHERE p.id = teams.parent_team_id) || ' U21'
     WHERE team_type = 'u21' AND parent_team_id IS NOT NULL
       AND name != (SELECT p.name FROM teams p WHERE p.id = teams.parent_team_id) || ' U21'`
  ).run().catch((e) => { logger.warn({ module: "game.ts" }, "sync u21 names", e); return null; });

  return c.json({ ok: true, cupUpdated, u21Updated: u21?.meta?.changes ?? 0 });
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
      excuses: o.excuses.map((e) => e.text).join(" | "),
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
    const { isSponsorType, SPONSOR_TYPES } = await import("../sponsors/types");
    if (!isSponsorType(type)) return c.json({ error: `Neplatný obor sponzora, povolené: ${SPONSOR_TYPES.join(", ")}` }, 400);
    await c.env.DB.prepare("INSERT INTO district_sponsors (district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(district, name, type, monthly_min ?? 500, monthly_max ?? 1500, win_bonus_min ?? 100, win_bonus_max ?? 300).run();
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
  if (table === "district_sponsors" && "type" in body) {
    const { isSponsorType, SPONSOR_TYPES } = await import("../sponsors/types");
    if (!isSponsorType(body.type)) return c.json({ error: `Neplatný obor sponzora, povolené: ${SPONSOR_TYPES.join(", ")}` }, 400);
  }

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
// Reputace klubu
// ─────────────────────────────────────────────────────────────

/** Stupně klubové reputace — jen popisné, engine je nepoužívá. */
const REPUTATION_TIERS = [
  { key: "legenda", min: 85, label: "Legenda okresu", note: "O klubu se mluví i za hranicemi okresu." },
  { key: "respektovany", min: 70, label: "Respektovaný klub", note: "Hráči i sponzoři berou klub vážně." },
  { key: "znamy", min: 55, label: "Známý klub", note: "V okrese se o klubu ví." },
  { key: "prumerny", min: 40, label: "Průměrný klub", note: "Nikdo o klubu nemluví ani špatně, ani dobře." },
  { key: "prehlizeny", min: 25, label: "Přehlížený klub", note: "Hráči zvenku o klub nestojí." },
  { key: "neznamy", min: 0, label: "Neznámý klub", note: "Klub nikdo nezná, sponzoři i hráči chodí jinam." },
] as const;

// GET /api/teams/:id/reputation — co reputace odemyká, co vydělává a jak ji zvednout
gameRouter.get("/teams/:teamId/reputation", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    `SELECT t.reputation, t.name, v.size AS village_size, v.name AS village_name
       FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<{ reputation: number; name: string; village_size: string | null; village_name: string | null }>()
    .catch((e) => { logger.warn({ module: "game" }, "load team for reputation", e); return null; });
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const rep = team.reputation ?? 50;
  const { gainFactor, reputationBaseline } = await import("../lib/reputation");
  const { mapVillageSize, getBaseTicketPrice, computeExternalWeeklyConcession } = await import("../season/finance-processor");
  const category = mapVillageSize(team.village_size ?? "village");

  const [matchRes, seasonRes, stadiumRes, equipRes, favorRes, logRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'").bind(teamId, teamId),
    c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"),
    c.env.DB.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId),
    c.env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(teamId),
    c.env.DB.prepare("SELECT favor FROM village_team_favor WHERE team_id = ? AND official_id IS NULL").bind(teamId),
    c.env.DB.prepare("SELECT delta, raw_delta, new_value, source, description, game_date, created_at FROM reputation_log WHERE team_id = ? ORDER BY id DESC LIMIT 20").bind(teamId),
  ]);

  const matchesPlayed = (matchRes.results[0] as { c: number } | undefined)?.c ?? 0;
  const season = (seasonRes.results[0] as { number: number } | undefined)?.number ?? 1;
  const stadium = (stadiumRes.results[0] as Record<string, number> | undefined) ?? {};
  const equipment = (equipRes.results[0] as Record<string, number> | undefined) ?? {};
  const favor = (favorRes.results[0] as { favor: number } | undefined)?.favor ?? 50;

  // Prahy se IMPORTUJÍ z generátorů — kopie by se při ladění rozešla a stránka
  // by lhala, aniž by cokoli spadlo při buildu.
  const { STADIUM_UNLOCK } = await import("../stadium/stadium-generator");
  const { UNLOCK_REQUIREMENTS } = await import("../equipment/equipment-generator");
  const unlockDefs = [
    { kind: "equipment", level: 2, label: "Vybavení. 2. úroveň", req: UNLOCK_REQUIREMENTS[2] },
    { kind: "stadium", level: 2, label: "Stadion. 2. úroveň", req: STADIUM_UNLOCK[2] },
    { kind: "equipment", level: 3, label: "Vybavení. 3. úroveň", req: UNLOCK_REQUIREMENTS[3] },
    { kind: "stadium", level: 3, label: "Stadion. 3. úroveň", req: STADIUM_UNLOCK[3] },
  ].map((u) => ({
    kind: u.kind,
    level: u.level,
    label: u.label,
    reputation: u.req?.reputation ?? 0,
    matches: u.req?.matchesPlayed ?? 0,
    season: u.req?.season ?? 1,
  }));
  const unlocks = unlockDefs.map((u) => ({
    ...u,
    missingReputation: Math.max(0, u.reputation - rep),
    missingMatches: Math.max(0, u.matches - matchesPlayed),
    missingSeasons: Math.max(0, u.season - season),
    unlocked: rep >= u.reputation && matchesPlayed >= u.matches && season >= u.season,
  }));
  const nextUnlock = unlocks.find((u) => !u.unlocked) ?? null;

  // Co reputace vydělává — počítáno stejnými vzorci jako produkční logika.
  const refreshments = stadium.refreshments ?? 0;
  const earnsAt = (r: number) => ({
    baseSponsorMonthly: r * 100,
    baseSponsorWeekly: Math.round((r * 100) / 4.3),
    sponsorOfferCount: r >= 60 ? 5 : r >= 40 ? 4 : 3,
    sponsorOfferMultiplier: Math.round((r / 50) * 100) / 100,
    concessionWeeklyExternal: computeExternalWeeklyConcession(refreshments, r),
    attendanceBonusPct: Math.round((r / 100) * 0.3 * 100),
    transferInterestScore: Math.round(Math.max(-15, Math.min(25, (r - 30) * 0.5))),
  });

  const tier = REPUTATION_TIERS.find((t) => rep >= t.min) ?? REPUTATION_TIERS[REPUTATION_TIERS.length - 1];

  const history = (logRes.results as Array<Record<string, unknown>>).map((r) => ({
    delta: r.delta as number,
    rawDelta: r.raw_delta as number,
    newValue: r.new_value as number,
    source: r.source as string,
    description: r.description as string,
    gameDate: (r.game_date as string | null) ?? (r.created_at as string),
  }));

  return c.json({
    reputation: rep,
    tier: { key: tier.key, label: tier.label, note: tier.note, min: tier.min },
    gainFactor: gainFactor(rep),
    baseline: reputationBaseline(category),
    matchesPlayed,
    season,
    villageCategory: category,
    baseTicketPrice: getBaseTicketPrice(category),
    unlocks: { next: nextUnlock, all: unlocks },
    earns: earnsAt(rep),
    // Srovnání "teď vs. potom" má smysl jen když je další zámek reputačně VÝŠ.
    // Zámek blokovaný jen počtem zápasů má nižší práh než aktuální reputace a
    // sloupec by ukazoval pokles.
    atNextUnlock: nextUnlock && nextUnlock.missingReputation > 0
      ? { reputation: nextUnlock.reputation, ...earnsAt(nextUnlock.reputation) }
      : null,
    history,
    village: {
      favor,
      // Obec spolufinancuje jen tyhle čtyři cíle — nesmí to slibovat víc, než šablony umí.
      facilities: [
        { key: "pitch", label: "Hřiště", threshold: 55 },
        { key: "showers", label: "Sprchy", threshold: 60 },
        { key: "parking", label: "Parkoviště", threshold: 70 },
        { key: "stands", label: "Tribuny", threshold: 80 },
      ],
    },
  });
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
    "SELECT name, reputation, motivation FROM managers WHERE team_id = ?",
  ).bind(teamId).first<{ name: string; reputation: number; motivation: number }>().catch((e) => {
    logger.warn({ module: "game" }, "load manager for fans", e);
    return null;
  });

  const { managerFansEffect, MANAGER_FANS } = await import("@okresni-masina/shared");
  const { nactiFormuKlubu } = await import("../lib/forma-klubu");
  const formaKlubu = await nactiFormuKlubu(c.env.DB, teamId);
  const mgrFx = mgr ? managerFansEffect(mgr.reputation, mgr.motivation, formaKlubu.skore) : null;
  const odehrano = formaKlubu.vyher + formaKlubu.remiz + formaKlubu.proher;
  const formaKlubuPopis = odehrano === 0
    ? "Sezóna teprve začíná, není z čeho soudit."
    : `${formaKlubu.vyher} výher, ${formaKlubu.remiz} remíz a ${formaKlubu.proher} proher z posledních ${odehrano}`
      + (formaKlubu.pozice ? `, ${formaKlubu.pozice}. místo z ${formaKlubu.tymu}.` : ".");

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
    manager: (mgr && mgrFx)
      ? {
          name: mgr.name,
          reputation: mgr.reputation,
          motivation: mgr.motivation,
          influence: mgrFx.influence,
          neutral: MANAGER_FANS.NEUTRAL,
          repWeight: MANAGER_FANS.REP_WEIGHT,
          motWeight: MANAGER_FANS.MOT_WEIGHT,
          repPoints: mgrFx.repPoints,
          motPoints: mgrFx.motPoints,
          // Aktuální forma je třetí a nejdůležitější složka. Bez ní vzorec
          // nevěděl, jestli se vyhrává, a nováček s vedoucím týmem dostával mínus.
          formWeight: MANAGER_FANS.FORM_WEIGHT,
          forma: mgrFx.forma,
          formPoints: mgrFx.formPoints,
          formaPopis: formaKlubuPopis,
          bandKey: mgrFx.band.key,
          bandLabel: mgrFx.band.label,
          bandFanView: mgrFx.band.fanView,
          matchBoost: mgrFx.matchBoost,
          loyaltyOffset: mgrFx.loyaltyOffset,
          pointsToNext: mgrFx.pointsToNext,
          repPointsToNext: mgrFx.repPointsToNext,
          motPointsToNext: mgrFx.motPointsToNext,
          nextBandLabel: mgrFx.nextBand?.label ?? null,
          nextBandBoost: mgrFx.nextBand?.matchBoost ?? null,
          // DEPRECATED alias — API worker a Pages se deployují zvlášť, starý FE by jinak
          // na jeden release ukázal undefined. Smazat v příštím releasu.
          weeklyLoyaltyBoost: mgrFx.loyaltyOffset,
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
            COALESCE(
              CASE WHEN m.home_team_id = ? THEN at.name ELSE ht.name END,
              cat.name
            ) as opponent_name,
            COALESCE(
              CASE
                WHEN m.home_team_id = ? AND m.home_score > m.away_score THEN 'win'
                WHEN m.away_team_id = ? AND m.away_score > m.home_score THEN 'win'
                WHEN m.home_score = m.away_score THEN 'draw'
                WHEN m.id IS NOT NULL THEN 'loss'
              END,
              -- V poháru se remízou nekončí: když skóre nerozhodlo, rozhodly penalty
              CASE
                WHEN cm.home_score IS NULL THEN NULL
                WHEN cm.home_score > cm.away_score THEN 'win'
                WHEN cm.home_score < cm.away_score THEN 'loss'
                WHEN cm.home_pens > cm.away_pens THEN 'win'
                WHEN cm.home_pens < cm.away_pens THEN 'loss'
                ELSE 'draw'
              END
            ) as result,
            CASE WHEN cm.id IS NOT NULL THEN 1 ELSE 0 END as is_cup
     FROM concession_match_sales s
     LEFT JOIN matches m ON m.id = s.match_id
     LEFT JOIN teams ht ON ht.id = m.home_team_id
     LEFT JOIN teams at ON at.id = m.away_team_id
     -- Občerstvení se prodává jen doma, takže u poháru je soupeř vždy ten hostující
     LEFT JOIN cup_matches cm ON cm.id = s.match_id
     LEFT JOIN cup_teams cat ON cat.id = cm.away_cup_team_id
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
      is_cup: number;
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
      isCup: boolean;
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
        isCup: r.is_cup === 1,
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
  // Pravidla (rozsah ceny, reakce fanoušků) v services/club-settings.ts, sdílí je AI trenér.
  const res = await setTicketPrice(c.env.DB, teamId, body.baseTicketPrice ?? 0);
  return c.json({ ok: true, baseTicketPrice: res.baseTicketPrice });
});

// GET /api/teams/:id/concession — mód + stav produktů (+ katalog pro UI)
gameRouter.get("/teams/:teamId/concession", async (c) => {
  const teamId = c.req.param("teamId");
  const { ensureFansRow } = await import("../season/fans-processor");
  const { CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS, concessionNoSalePrice } = await import("../season/concession-catalog");
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

  const { loadConcessionStock, sellableStock } = await import("../season/concession-stock");
  const productsByKey = new Map((await loadConcessionStock(c.env.DB, teamId)).map((r) => [r.key as string, r]));

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
      qualityLevel: row?.qualityLevel ?? 1,
      sellPrice: row?.sellPrice ?? catalog.tiers[1].defaultSellPrice,
      /** Sklad zvolené kvality — jen ten se v zápase prodává. */
      stockQuantity: row ? sellableStock(row) : 0,
      tiers: catalog.tiers.map((t, i) => ({
        level: i,
        label: t.label,
        wholesalePrice: t.wholesalePrice,
        defaultSellPrice: t.defaultSellPrice,
        /** Od téhle ceny nikdo nekoupí. Null u kvality, která se nenabízí. */
        noSalePrice: concessionNoSalePrice(key, i),
        /** Kolik kusů téhle kvality je na skladě. */
        stock: row?.stockByTier[i] ?? 0,
      })),
    };
  });

  // Předpověď na nejbližší DOMÁCÍ zápas — venku se bufet neprovozuje, takže
  // předpověď na venkovní zápas by manažera jen mátla. Bez ní má kleště (zboží
  // se kazí vs. vyprodáno = −2 spokojenosti), ale nevidí, kam mířit.
  let nextHome: {
    scheduledAt: string; opponent: string; isCup: boolean;
    forecast: { icon: string; expected: string; temperature: number; description: string };
    /**
     * Teplota, ze které se tipy opravdu počítají — měsíční průměr, ne teplota
     * konkrétní předpovědi. Karta bufetu musí ukazovat tuhle, jinak by vedle
     * sebe stálo číslo a rada, které spolu nesouvisí.
     */
    avgTemperature: number | null;
    hints: { key: string; label: string; factor: number; hint: string }[];
  } | null = null;
  try {
    const { findNextHomeMatch } = await import("../season/next-home-match");
    const row = await findNextHomeMatch(c.env.DB, teamId);

    if (row?.scheduledAt) {
      const { forecastForMatch } = await import("../season/season-weather");
      const { concessionDemandHints } = await import("../season/concession-catalog");
      // Předpověď ze stejného zdroje jako simulace i omluvenky hráčů.
      const forecast = await forecastForMatch(c.env.DB, row.calendarId, row.scheduledAt, row.id);
      nextHome = {
        scheduledAt: row.scheduledAt,
        opponent: row.opponent,
        isCup: row.isCup,
        forecast: {
          icon: forecast.icon,
          expected: forecast.expected,
          temperature: forecast.temperature,
          description: forecast.description,
        },
        avgTemperature: forecast.temperature,
        hints: concessionDemandHints(forecast.expected, forecast.temperature),
      };
    }
  } catch (e) {
    logger.warn({ module: "game" }, "predpoved na domaci zapas pro bufet", e);
  }

  return c.json({
    mode,
    canSwitchToSelf,
    refreshmentsLevel,
    externalWeeklyIncome,
    products,
    nextHome,
  });
});

// PATCH /api/teams/:id/concession/mode — přepínání mezi external a self
gameRouter.patch("/teams/:teamId/concession/mode", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ mode: "external" | "self" }>().catch((e) => {
    logger.warn({ module: "game" }, "parse mode body", e);
    return { mode: "external" as const };
  });
  // Pravidla (L1 občerstvení pro vlastní provoz) v services/concessions.ts, sdílí je AI trenér.
  const res = await setConcessionMode(c.env.DB, teamId, body.mode === "self" ? "self" : "external");
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, mode: res.mode });
});

// PATCH /api/teams/:id/concession/products/:key — kvalita + prodejní cena
gameRouter.patch("/teams/:teamId/concession/products/:key", async (c) => {
  const teamId = c.req.param("teamId");
  const key = c.req.param("key");
  const body = await c.req.json<{ qualityLevel?: number; sellPrice?: number }>().catch((e) => {
    logger.warn({ module: "game" }, "parse concession product body", e);
    return {} as { qualityLevel?: number; sellPrice?: number };
  });

  // Meze kvality a ceny v services/concessions.ts, sdílí je AI trenér.
  const res = await setConcessionProduct(c.env.DB, teamId, key, body);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, qualityLevel: res.qualityLevel, sellPrice: res.sellPrice });
});

// POST /api/teams/:id/concession/restock — nákup skladu (strhne wholesale × quantity z rozpočtu)
gameRouter.post("/teams/:teamId/concession/restock", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ productKey: string; quantity: number }>().catch((e) => {
    logger.warn({ module: "game" }, "parse restock body", e);
    return { productKey: "", quantity: 0 };
  });

  // Nákup jde do skladu zvolené kvality (services/concessions.ts, sdílí ho AI trenér).
  const res = await restockConcession(c.env.DB, teamId, body.productKey, body.quantity);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true, newStock: res.newStock, totalCost: res.totalCost });
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
  const { fetchTeamDistrict: fetchDistrictForTrigger } = await import("../events/match-absences");

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
      "SELECT id, scheduled_at FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled'"
    ).bind(leagueId, tStart.toISOString(), tEnd.toISOString()).first<{ id: string; scheduled_at: string }>()
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
      `SELECT p.id, p.first_name, p.last_name, p.nationality, p.age, p.personality, p.life_context, p.physical, p.commute_km, p.is_celebrity, p.suspended_matches
         FROM players p
         LEFT JOIN injuries i ON p.id = i.player_id AND i.days_remaining > 0
         WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
           AND i.player_id IS NULL AND (p.suspended_matches IS NULL OR p.suspended_matches = 0)
         ORDER BY p.overall_rating DESC`
    ).bind(teamId).all();

    const { nactiIncidentniKontext, pridejIncidentniAbsence } = await import("../incidents/absence-hracu");
    const incKontext = await nactiIncidentniKontext(c.env.DB, teamId, tomorrowMatch.scheduled_at);

    const absRng = createRng(absenceSeedForMatch({ matchKey: tomorrowMatch.id, teamId, phase: "day_before" }));
    const { hracProAbsenci } = await import("../events/absence");
    const absSquad = squadRows.results.map((r) => hracProAbsenci(r, incKontext.druhy.get(r.id as string)));

    const triggerDistrict = await fetchDistrictForTrigger(c.env.DB, teamId);
    // Stejný důvod jako u preview: tyhle SMS musí sedět se simulací zápasu.
    const { kontextDojizdeni: kontextDojizdeniTrigger } = await import("../events/match-absences");
    const { resolveRoundWeather: resolveTriggerWeather } = await import("../season/season-weather");
    const { commuteMod: triggerCommuteMod, maDodavku: triggerMaDodavku, isAway: triggerIsAway } = await kontextDojizdeniTrigger(c.env.DB, teamId, tomorrowMatch.id);
    const dayBeforeAbsences = pridejIncidentniAbsence(
      generateAbsences(absRng as any, absSquad, {
        timing: "day_before", district: triggerDistrict, commuteMod: triggerCommuteMod,
        maDodavku: triggerMaDodavku, isAway: triggerIsAway,
        weather: (await resolveTriggerWeather(c.env.DB, tomorrowMatch.id))?.weather,
      }),
      squadRows.results.map((r) => r.id as string), incKontext.absence, "day_before",
    );
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
        brokenCzech(absence ? absence.smsText : msg.body, row.nationality as string | null, `${pid}|${tomorrowMatch.id}`),
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

  const correctionNote = "\n\n— Oprava: Předchozí verze článku chybně upravila záměrné slovní hříčky trenéra jako překlepy. Za nedorozumění se omlouváme, chyba byla na straně redaktora.";
  const newBody = JSON.stringify({ ...body, article: result.body + correctionNote }, );
  const newHeadline = result.headline.replace(/\[oprava\]$/, "").trim() + " [oprava]";

  await c.env.DB.prepare("UPDATE news SET headline = ?, body = ? WHERE id = ?")
    .bind(newHeadline, newBody, newsId)
    .run()
    .catch((e) => { logger.warn({ module: "game" }, "regenerate-interview update", e); });

  return c.json({ ok: true, newsId, headline: newHeadline, articlePreview: result.body.slice(0, 200) });
});

// ═══════════════════════════════════════════════════════════════════════════
// FRONTY — ovládání a diagnostika
//
// Testing nemá crony (`[env.testing.triggers] crons = []`), takže se všechno
// spouští odsud. Viz docs/analyza-fronty-2026-08-16.md, kapitola 6.
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/queue/mode — jaký režim zpracování zápasového ticku je aktivní
gameRouter.get("/admin/queue/mode", async (c) => {
  const { readMatchTickMode, MATCH_TICK_MODE_KEY } = await import("../queue/messages");
  const mode = await readMatchTickMode(c.env.CACHE_KV);
  return c.json({
    ok: true,
    mode,
    key: MATCH_TICK_MODE_KEY,
    matchQueueBound: !!c.env.MATCH_QUEUE,
    reportsQueueBound: !!c.env.REPORTS_QUEUE,
  });
});

// POST /api/admin/queue/mode?mode=queue|loop — přepnutí režimu.
// Rollback frontového režimu = přepnutí zpátky na "loop", bez deploye.
gameRouter.post("/admin/queue/mode", async (c) => {
  const mode = c.req.query("mode");
  if (mode !== "queue" && mode !== "loop") {
    return c.json({ error: "mode musí být 'queue' nebo 'loop'" }, 400);
  }
  const { MATCH_TICK_MODE_KEY } = await import("../queue/messages");
  await c.env.CACHE_KV.put(MATCH_TICK_MODE_KEY, mode);
  logger.info({ module: "game" }, `režim zápasového ticku přepnut na "${mode}"`);
  return c.json({ ok: true, mode });
});

// GET /api/admin/ai-provider — kdo generuje AI texty (gemini | workers-ai | off)
gameRouter.get("/admin/ai-provider", async (c) => {
  const { readAiProvider, AI_PROVIDER_KEY } = await import("../lib/ai-provider");
  const provider = await readAiProvider(c.env.CACHE_KV);
  return c.json({ ok: true, provider, key: AI_PROVIDER_KEY, geminiKeySet: !!c.env.GEMINI_API_KEY });
});

// POST /api/admin/ai-provider?provider=gemini|workers-ai|off
// "off" na testingu chrání produkční Gemini kvótu — obě prostředí sdílejí hodnotu klíče.
gameRouter.post("/admin/ai-provider", async (c) => {
  const provider = c.req.query("provider");
  if (provider !== "gemini" && provider !== "workers-ai" && provider !== "off") {
    return c.json({ error: "provider musí být 'gemini', 'workers-ai' nebo 'off'" }, 400);
  }
  const { AI_PROVIDER_KEY } = await import("../lib/ai-provider");
  await c.env.CACHE_KV.put(AI_PROVIDER_KEY, provider);
  logger.info({ module: "game" }, `AI poskytovatel přepnut na "${provider}"`);
  return c.json({ ok: true, provider });
});

// POST /api/admin/queue/enqueue-match-tick — ruční spuštění producenta zápasového ticku
gameRouter.post("/admin/queue/enqueue-match-tick", async (c) => {
  const { enqueueMatchTick } = await import("../queue/producer");
  const result = await enqueueMatchTick(c.env);
  return c.json({ ok: true, ...result });
});

// POST /api/admin/queue/enqueue-previews — ruční spuštění producenta předzápasových článků
gameRouter.post("/admin/queue/enqueue-previews", async (c) => {
  const { enqueueMatchdayPreviews } = await import("../queue/producer");
  const queued = await enqueueMatchdayPreviews(c.env);
  return c.json({ ok: true, queued });
});

// POST /api/admin/queue/send-duplicate?leagueId=X&times=2
// Pošle TUTÉŽ zprávu vícekrát — přímý test idempotence (fronty doručují "aspoň jednou").
// Očekávané chování: první zpráva kolo odsimuluje, další skončí jako "skipped"
// a finance se NEZDVOJÍ. Regrese na incident 2026-04.
// ?gameDate=... podvrhne herní datum → ověření, že zastaralá zpráva se zahodí (stale).
// ?kind=selftest_fail pošle zprávu, která vždy selže → ověření retry + DLQ.
gameRouter.post("/admin/queue/send-duplicate", async (c) => {
  const leagueId = c.req.query("leagueId");
  const times = Math.min(Number(c.req.query("times") ?? 2), 10);
  const kind = c.req.query("kind") === "selftest_fail" ? "selftest_fail" : "league_round";
  if (!leagueId) return c.json({ error: "leagueId je povinné" }, 400);
  if (!c.env.MATCH_QUEUE) return c.json({ error: "MATCH_QUEUE binding chybí" }, 500);

  const { readLeagueGameDate } = await import("../season/league-round");
  const gameDate = c.req.query("gameDate") ?? (await readLeagueGameDate(c.env.DB, leagueId));
  if (!gameDate) return c.json({ error: "liga nemá herní datum" }, 400);

  const enqueuedAt = new Date().toISOString();
  for (let i = 0; i < times; i++) {
    await c.env.MATCH_QUEUE.send({ kind, leagueId, gameDate, enqueuedAt } as never);
  }
  return c.json({ ok: true, kind, leagueId, gameDate, sent: times });
});

// POST /api/admin/queue/run-league?leagueId=X — synchronní zpracování jedné ligy.
// Obchází frontu, ale volá TUTÉŽ funkci. Slouží k měření (durationMs, queries)
// a k porovnání staré a nové cesty.
gameRouter.post("/admin/queue/run-league", async (c) => {
  const leagueId = c.req.query("leagueId");
  if (!leagueId) return c.json({ error: "leagueId je povinné" }, 400);
  const { processLeagueRound } = await import("../season/league-round");
  const result = await processLeagueRound(c.env, leagueId);
  return c.json({ ok: true, result });
});

// GET /api/admin/queue/runs[?kind=league_round&limit=50] — měření běhů z fronty.
// lag_ms = jak dlouho zpráva čekala ve frontě, duration_ms = jak dlouho trvalo zpracování.
// Bez rozlišení těch dvou se nedá říct, jestli je pomalá fronta nebo samotná práce.
gameRouter.get("/admin/queue/runs", async (c) => {
  const kind = c.req.query("kind");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const base =
    "SELECT kind, league_id, status, matches, queries, duration_ms, attempts, lag_ms, created_at FROM queue_runs";
  const stmt = kind
    ? c.env.DB.prepare(`${base} WHERE kind = ? ORDER BY created_at DESC LIMIT ?`).bind(kind, limit)
    : c.env.DB.prepare(`${base} ORDER BY created_at DESC LIMIT ?`).bind(limit);
  const rows = await stmt.all().catch((e) => {
    logger.warn({ module: "game" }, "queue_runs select", e);
    return { results: [] };
  });

  // Souhrn per typ zprávy — přímý podklad pro tvrzení "práce na ligu je konstantní".
  const summary = await c.env.DB.prepare(
    `SELECT kind, COUNT(*) AS pocet, AVG(duration_ms) AS prumer_ms, MIN(duration_ms) AS min_ms,
            MAX(duration_ms) AS max_ms, AVG(queries) AS prumer_dotazu, AVG(lag_ms) AS prumer_lag_ms
       FROM queue_runs GROUP BY kind`,
  )
    .all()
    .catch((e) => {
      logger.warn({ module: "game" }, "queue_runs summary", e);
      return { results: [] };
    });

  return c.json({ ok: true, summary: summary.results, runs: rows.results });
});

// GET /api/admin/health — jeden pohled na to, jestli je zpracování zdravé.
// Vznikl pro sledování testingu před nasazením front na produkci: bez něj by se
// muselo lovit v pěti tabulkách. Každý signál má vlastní verdikt, ať je vidět CO je špatně.
/**
 * Odkud se berou hráči na trhu.
 *
 * Odpověď na otázku „negeneruje se jich moc", kterou z databáze nešlo dostat:
 * řádek ve `free_agents` po podpisu zmizí, takže počítat to ze zbytku v poolu
 * dává v okrese s hodně manažery nulu, i když se generovalo každý den.
 *
 * Odděluje se to, co vytvořila hra, od toho, co jen pustil klub. Míchat to
 * dohromady je přesně ta chyba, kvůli které trh vypadal přetečený.
 */
gameRouter.get("/admin/market-stats", async (c) => {
  const dnu = Math.max(1, Math.min(90, Number(c.req.query("days") ?? 14)));
  const { prehledTrhu } = await import("../transfers/market-log");
  const radky = await prehledTrhu(c.env.DB, dnu);

  const souhrn = radky.reduce(
    (acc, r) => ({
      vytvorila_hra: acc.vytvorila_hra + r.vytvorila_hra,
      od_manazeru: acc.od_manazeru + r.od_manazeru,
      od_ai: acc.od_ai + r.od_ai,
    }),
    { vytvorila_hra: 0, od_manazeru: 0, od_ai: 0 },
  );

  // Přestupovka historii nese sama, `transfer_listings` se nemaže.
  const inzeraty = await c.env.DB.prepare(
    `SELECT date(tl.created_at) AS den,
            SUM(CASE WHEN COALESCE(t.user_id,'ai') <> 'ai' THEN 1 ELSE 0 END) AS od_manazeru,
            SUM(CASE WHEN COALESCE(t.user_id,'ai') = 'ai' THEN 1 ELSE 0 END) AS od_ai
       FROM transfer_listings tl
       LEFT JOIN teams t ON t.id = tl.team_id
      WHERE tl.created_at >= date('now', ?)
      GROUP BY date(tl.created_at) ORDER BY den DESC`,
  ).bind(`-${dnu} day`).all<{ den: string; od_manazeru: number; od_ai: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "přehled přestupovky", e); return { results: [] as never[] }; });

  return c.json({ ok: true, dnu, souhrn, podleDnu: radky, prestupovka: inzeraty.results ?? [] });
});

/**
 * Propojené kluby a podezřelé dvojice. Propojení se zapisuje ručně do `club_links`,
 * tady je jen přehled: kdo už propojený je a kdo spolu hraje a obchoduje nejvíc.
 */
gameRouter.get("/admin/club-links", async (c) => {
  const { listLinkGroups, suspiciousPairs } = await import("../competition/club-links");
  const [groups, pairs] = await Promise.all([listLinkGroups(c.env.DB), suspiciousPairs(c.env.DB)]);
  return c.json({ ok: true, groups, pairs });
});

gameRouter.get("/admin/health", async (c) => {
  const { readMatchTickMode } = await import("../queue/messages");
  const { readAiProvider } = await import("../lib/ai-provider");

  const one = async <T>(sql: string, popis: string): Promise<T | null> =>
    c.env.DB.prepare(sql).first<T>().catch((e) => {
      logger.warn({ module: "game" }, `health: ${popis}`, e);
      return null;
    });

  const [mode, aiProvider] = await Promise.all([
    readMatchTickMode(c.env.CACHE_KV),
    readAiProvider(c.env.CACHE_KV),
  ]);

  const dlq = await one<{ n: number }>("SELECT COUNT(*) AS n FROM queue_failures WHERE resolved = 0", "dlq");
  const retries = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM queue_runs WHERE attempts > 1 AND created_at > datetime('now', '-3 days')",
    "retries",
  );
  const errors = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM queue_runs WHERE status = 'error' AND created_at > datetime('now', '-3 days')",
    "errors",
  );
  const stuck = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM season_calendar WHERE status = 'lineup_locked'",
    "stuck",
  );
  // Nedohraná kola, jejichž termín už nastal — když tohle roste den po dni, tick nestíhá.
  // JOIN na leagues je nutný: kalendáře osiřelých lig producent nikdy nezařadí
  // (findLeaguesWithDueRound taky joinuje), takže by trvale nafukovaly signál.
  const backlog = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM season_calendar sc
       JOIN leagues l ON l.id = sc.league_id
      WHERE sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)
        AND sc.scheduled_at <= (SELECT MAX(game_date) FROM teams t WHERE t.league_id = sc.league_id)`,
    "backlog",
  );
  // Osiřelé ligy: týmy i kalendáře odkazují na ligu, která v `leagues` neexistuje.
  // Takové týmy dostávají denní tick, ale jejich kola se NIKDY neodehrají.
  const orphans = await one<{ ligy: number; tymy: number; kola: number }>(
    `SELECT
       (SELECT COUNT(DISTINCT league_id) FROM teams WHERE league_id IS NOT NULL AND league_id NOT IN (SELECT id FROM leagues)) AS ligy,
       (SELECT COUNT(*) FROM teams WHERE league_id IS NOT NULL AND league_id NOT IN (SELECT id FROM leagues)) AS tymy,
       (SELECT COUNT(*) FROM season_calendar WHERE league_id NOT IN (SELECT id FROM leagues)) AS kola`,
    "orphans",
  );
  const clock = await one<{ game_date: string | null; offset_days: number | null }>(
    "SELECT (SELECT MAX(game_date) FROM teams) AS game_date, (SELECT offset_days FROM game_clock WHERE id = 1) AS offset_days",
    "clock",
  );
  const lastRound = await one<{ trvani: number | null; kdy: string | null }>(
    "SELECT duration_ms AS trvani, created_at AS kdy FROM queue_runs WHERE kind = 'league_round' AND status = 'done' ORDER BY created_at DESC LIMIT 1",
    "lastRound",
  );
  const rounds24 = await one<{ n: number; prumer: number | null; max: number | null }>(
    "SELECT COUNT(*) AS n, AVG(duration_ms) AS prumer, MAX(duration_ms) AS max FROM queue_runs WHERE kind = 'league_round' AND status = 'done' AND created_at > datetime('now', '-1 day')",
    "rounds24",
  );

  const kontroly = [
    { nazev: "dead-letter fronta", hodnota: dlq?.n ?? -1, ok: (dlq?.n ?? 1) === 0, popis: "zprávy, které selhaly i po retry" },
    { nazev: "retry za 3 dny", hodnota: retries?.n ?? -1, ok: (retries?.n ?? 1) === 0, popis: "opakované doručení = něco padá" },
    { nazev: "chybné běhy za 3 dny", hodnota: errors?.n ?? -1, ok: (errors?.n ?? 1) === 0, popis: "výjimka v konzumeru" },
    { nazev: "zaseklá kola", hodnota: stuck?.n ?? -1, ok: (stuck?.n ?? 1) === 0, popis: "lineup_locked mimo běžící tick" },
    { nazev: "nedohraná splatná kola", hodnota: backlog?.n ?? -1, ok: (backlog?.n ?? 99) < 10, popis: "když roste den po dni, tick nestíhá" },
    { nazev: "osiřelé ligy", hodnota: orphans?.ligy ?? -1, ok: (orphans?.ligy ?? 1) === 0, popis: "týmy bez ligy v `leagues` — dostávají denní tick, ale nikdy nehrají" },
  ];

  const verdikt = kontroly.every((k) => k.ok) ? "ok" : "pozor";
  return c.json({
    ok: true,
    verdikt,
    rezim: { zpracovani: mode, aiPoskytovatel: aiProvider },
    hodiny: { herniDatum: clock?.game_date ?? null, offsetDnu: clock?.offset_days ?? null },
    kola24h: {
      pocet: rounds24?.n ?? 0,
      prumerMs: rounds24?.prumer ? Math.round(rounds24.prumer) : null,
      maxMs: rounds24?.max ?? null,
    },
    posledniKolo: { trvaniMs: lastRound?.trvani ?? null, kdy: lastRound?.kdy ?? null },
    osirele: { ligy: orphans?.ligy ?? 0, tymy: orphans?.tymy ?? 0, kola: orphans?.kola ?? 0 },
    kontroly,
  });
});

// GET /api/admin/queue/profile — kde se utratí dotazy na jedno kolo (průměr přes poslední běhy)
gameRouter.get("/admin/queue/profile", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT phases, queries, duration_ms FROM queue_runs WHERE kind = 'league_round' AND status = 'done' AND phases IS NOT NULL ORDER BY created_at DESC LIMIT 20",
  )
    .all<{ phases: string; queries: number; duration_ms: number }>()
    .catch((e) => {
      logger.warn({ module: "game" }, "queue profile select", e);
      return { results: [] as Array<{ phases: string; queries: number; duration_ms: number }> };
    });

  const soucty = new Map<string, { queries: number; ms: number; n: number }>();
  for (const row of rows.results) {
    let parsed: Array<{ name: string; ms: number; queries: number }>;
    try {
      parsed = JSON.parse(row.phases);
    } catch (e) {
      logger.warn({ module: "game" }, "profile: rozbitý JSON fází", e);
      continue;
    }
    for (const f of parsed) {
      const acc = soucty.get(f.name) ?? { queries: 0, ms: 0, n: 0 };
      acc.queries += f.queries;
      acc.ms += f.ms;
      acc.n += 1;
      soucty.set(f.name, acc);
    }
  }

  const celkemDotazu = [...soucty.values()].reduce((a, v) => a + v.queries, 0) || 1;
  const faze = [...soucty.entries()]
    .map(([name, v]) => ({
      faze: name,
      prumerDotazu: Math.round(v.queries / v.n),
      prumerMs: Math.round(v.ms / v.n),
      podilDotazu: `${Math.round((v.queries / celkemDotazu) * 100)} %`,
    }))
    .sort((a, b) => b.prumerDotazu - a.prumerDotazu);

  return c.json({ ok: true, vzorkuBehu: rows.results.length, faze });
});

// GET /api/admin/watchdog — ruční spuštění hlídače (bez rozesílání notifikací)
gameRouter.get("/admin/watchdog", async (c) => {
  const { runWatchdog } = await import("../lib/watchdog");
  const r = await runWatchdog(c.env);
  return c.json({ zdrave: r.ok, problemy: r.problemy });
});

// POST /api/admin/watchdog/test — hlídač VČETNĚ notifikací, na ověření že alerting funguje
gameRouter.post("/admin/watchdog/test", async (c) => {
  const { runWatchdogAndAlert } = await import("../lib/watchdog");
  const r = await runWatchdogAndAlert(c.env);
  return c.json({ zdrave: r.ok, problemy: r.problemy, notifikaceOdeslany: !r.ok });
});

// GET /api/admin/queue/failures — zprávy, které skončily v dead-letter frontě.
// Bez tohohle liga vypadne potichu a nikdo se to nedozví.
gameRouter.get("/admin/queue/failures", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, queue_name, message_kind, league_id, attempts, substr(payload, 1, 300) AS payload, resolved, created_at FROM queue_failures ORDER BY created_at DESC LIMIT 50",
  )
    .all()
    .catch((e) => {
      logger.warn({ module: "game" }, "queue_failures select", e);
      return { results: [] };
    });
  return c.json({ ok: true, count: rows.results.length, failures: rows.results });
});

export { gameRouter };
