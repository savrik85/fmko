/**
 * Denní tick — logika extrahovaná z index.ts scheduled handleru.
 * Spouští trénink, recovery kondice, injury healing, pitch degradation, morale drift.
 */

import { managerFansEffect } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { simulateTraining, trainingTypeLabel } from "./training";
import { trainingExperienceChance } from "../skills/training";
import { logger } from "../lib/logger";
import { MEETING_DAY_OF_WEEK } from "../competition/defaults";
import { overallRatingFromFlat } from "../skills/generator";

export interface DailyTickEvent {
  type: "training" | "training_skipped" | "recovery" | "injury_healed" | "pitch" | "morale" | "match" | "day" | "loan_return";
  description: string;
  data?: unknown;
}

export interface DailyTickResult {
  date: string;
  dayOfWeek: number;
  isTrainingDay: boolean;
  events: DailyTickEvent[];
}

/** Povolené typy tréninku — drží sync s TrainingType v season/training.ts. */
const VALID_TRAINING_TYPES = new Set(["conditioning", "technique", "tactics", "match_practice"]);

const VALID_INTENSITIES = new Set(["light", "normal", "hard"]);

export interface TrainingDaySetting { type: string; intensity: "light" | "normal" | "hard" }

/**
 * Týdenní plán tréninku: den v týdnu (1=Po … 5=Pá) → typ a intenzita.
 * Přijímá dva tvary:
 *   {"1":"conditioning"}                              — starší plány bez intenzity
 *   {"1":{"type":"conditioning","intensity":"hard"}}  — s intenzitou
 * Vrací null, když plán není nastavený nebo je poškozený — volající pak použije jednotný
 * training_type (původní chování).
 */
export function parseTrainingPlan(raw: string | null, teamId?: string): Record<number, TrainingDaySetting> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const plan: Record<number, TrainingDaySetting> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;

      if (typeof v === "string" && VALID_TRAINING_TYPES.has(v)) {
        plan[day] = { type: v, intensity: "normal" };
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        const t = (v as Record<string, unknown>).type;
        const i = (v as Record<string, unknown>).intensity;
        if (typeof t === "string" && VALID_TRAINING_TYPES.has(t)) {
          plan[day] = {
            type: t,
            intensity: (typeof i === "string" && VALID_INTENSITIES.has(i) ? i : "normal") as TrainingDaySetting["intensity"],
          };
        }
      }
    }
    return Object.keys(plan).length > 0 ? plan : null;
  } catch (e) {
    logger.warn({ module: "daily-tick", teamId }, "parse training_plan", e);
    return null;
  }
}

/**
 * Execute one day's worth of game simulation.
 */
export async function executeDailyTick(
  env: Bindings,
  gameDate?: Date,
): Promise<DailyTickResult> {
  const now = gameDate ?? new Date();
  // Kanonický herní den ticku = DETERMINISTICKY reálný den (16:00 UTC) + offset (game_clock).
  // MUSÍ se spočítat PŘED KV guardem i posunem game_date — jinak guard keyuje na starou hodnotu,
  // posun ji přepíše na deterministickou a druhý běh ve stejný reálný den keyuje na novou → NEchytí se
  // → dvojité pondělní finance/trénink/kabina. Klíč z deterministického data → všechny běhy dne = stejný klíč.
  const clock = await env.DB.prepare("SELECT offset_days FROM game_clock WHERE id = 1").first<{ offset_days: number }>()
    .catch((e) => { logger.warn({ module: "daily-tick" }, "load game clock", e); return null; });
  let effectiveDate: Date;
  if (clock) {
    const g = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));
    g.setUTCDate(g.getUTCDate() + clock.offset_days);
    effectiveDate = g;
  } else {
    // Chybí seed řádek game_clock → herní čas by se TIŠE zastavil. Doplnit dle migrace 0107.
    logger.error({ module: "daily-tick" }, "CHYBÍ řádek game_clock (id=1) — herní čas se NEPOSOUVÁ. Doplň seed dle migrace 0107.");
    const gameDateRow = await env.DB.prepare("SELECT game_date FROM teams WHERE user_id != 'ai' AND game_date IS NOT NULL LIMIT 1")
      .first<{ game_date: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "load game_date failed", e); return null; });
    effectiveDate = gameDateRow?.game_date ? new Date(gameDateRow.game_date) : now;
  }

  // Idempotency: zabránit dvojitému spuštění pro stejný herní den (klíč z deterministického data výše).
  const todayKey = effectiveDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const alreadyRan = await env.CACHE_KV.get(`daily-tick:${todayKey}`).catch((e) => { logger.warn({ module: "daily-tick" }, "read tick KV flag failed", e); return null; });
  if (alreadyRan) {
    logger.warn({ module: "daily-tick" }, `SKIP — tick for ${todayKey} already ran`);
    return { date: effectiveDate.toISOString(), dayOfWeek: effectiveDate.getUTCDay(), isTrainingDay: false, events: [] };
  }
  // Uložit příznak s TTL 36h (pokryje případ posunu na další den)
  await env.CACHE_KV.put(`daily-tick:${todayKey}`, "1", { expirationTtl: 60 * 60 * 36 }).catch((e) => logger.warn({ module: "daily-tick" }, "set tick KV flag failed", e));

  const dayOfWeek = effectiveDate.getUTCDay();
  // Trénovat jde kterýkoli den v týdnu včetně víkendu — omezuje jen to, co si manažer nastaví.
  const isTrainingDay = dayOfWeek >= 0 && dayOfWeek <= 6;
  const events: DailyTickEvent[] = [];
  const advancedLeagues = new Set<string>();
  const tickStart = Date.now();
  logger.info({ module: "daily-tick" }, `START dayOfWeek=${dayOfWeek} training=${isTrainingDay} date=${now.toISOString()}`);

  // Nový den: vyčistit včerejší absence (jednodenní flag v life_context.absence)
  await env.DB.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.absence') WHERE json_extract(life_context, '$.absence') IS NOT NULL"
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "clear yesterday absences", e));

  // Včerejší kocovina vyprchá — flag se nastavuje v match-runner po výhře, trvá 1 herní den.
  await env.DB.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.hangover') WHERE json_extract(life_context, '$.hangover') IS NOT NULL"
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "clear yesterday hangovers", e));

  // Retention condition_log — udržujeme posledních 60 dní per hráč, jinak by tabulka rostla bez limitu.
  await env.DB.prepare(
    "DELETE FROM condition_log WHERE created_at < datetime('now', '-60 days')",
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "condition_log retention", e));

  // ── Týdenní cyklus obce: vyprší staré brigády a v pondělí se generují nové ──
  try {
    const {
      expireOldBrigades, generateWeeklyBrigades,
      expirePetitions, generateMonthlyPetitions,
      expireInvestments, generateMonthlyInvestments,
      expirePubEncounters, generatePubEncounters,
      processElections, processCrisisEvents,
    } = await import("./village-processor");
    const expired = await expireOldBrigades(env.DB, effectiveDate.toISOString());
    if (expired > 0) {
      logger.info({ module: "daily-tick" }, `${expired} brigád vypršelo`);
    }
    const ignoredPetitions = await expirePetitions(env.DB, effectiveDate.toISOString());
    if (ignoredPetitions > 0) {
      logger.info({ module: "daily-tick" }, `${ignoredPetitions} petic ignorováno`);
    }
    const expiredInv = await expireInvestments(env.DB, effectiveDate.toISOString());
    if (expiredInv > 0) {
      logger.info({ module: "daily-tick" }, `${expiredInv} investic vypršelo`);
    }
    const expiredPub = await expirePubEncounters(env.DB, effectiveDate.toISOString());
    if (expiredPub > 0) {
      logger.info({ module: "daily-tick" }, `${expiredPub} pub encounters vypršelo`);
    }
    if (dayOfWeek === 1) {
      const { generated, skipped } = await generateWeeklyBrigades(env.DB, effectiveDate.toISOString());
      logger.info({ module: "daily-tick" }, `brigády: ${generated} nových, ${skipped} obcí přeskočeno`);
      const petitionRes = await generateMonthlyPetitions(env.DB, effectiveDate.toISOString());
      if (petitionRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `petice: ${petitionRes.generated} nových`);
      }
      const invRes = await generateMonthlyInvestments(env.DB, effectiveDate.toISOString());
      if (invRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `investice: ${invRes.generated} nových`);
      }
      const pubRes = await generatePubEncounters(env.DB, effectiveDate.toISOString());
      if (pubRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `pub encounters: ${pubRes.generated} nových`);
      }
      // Volby: každý zastupitel s prošlým mandátem → šance na výměnu
      const elRes = await processElections(env.DB, effectiveDate.toISOString());
      if (elRes.replaced + elRes.renewed > 0) {
        logger.info({ module: "daily-tick" }, `volby: ${elRes.replaced} vyměněno, ${elRes.renewed} obhájilo`);
      }
      // Krize: pokud favor < 20, generuj hostile event (1× měsíc)
      const crRes = await processCrisisEvents(env.DB, effectiveDate.toISOString());
      if (crRes.generated > 0) {
        logger.info({ module: "daily-tick" }, `krize: ${crRes.generated} hostile events`);
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "village brigade cycle failed", e);
  }

  // ── Training (Mon-Fri, if plan is set) ──
  // U21 týmy zdědí training_type/approach/sessions od parent A-týmu — manažer nastaví trénink
  // pro klub jednou a aplikuje se na obě squady.
  const teams = await env.DB.prepare(
    `SELECT t.id, t.league_id,
            COALESCE(t.training_type, parent.training_type) as training_type,
            COALESCE(t.training_approach, parent.training_approach) as training_approach,
            COALESCE(t.training_sessions, parent.training_sessions) as training_sessions,
            COALESCE(t.training_days, parent.training_days) as training_days,
            COALESCE(t.training_plan, parent.training_plan) as training_plan
       FROM teams t
       LEFT JOIN teams parent ON parent.id = t.parent_team_id
      WHERE t.user_id != 'ai'`
  ).all();

  // Týmy, které dnes hrají — v den zápasu se netrénuje. Jedním dotazem přes
  // všechny soutěže, ať to není per tým: liga a přátelák žijí v matches,
  // pohár v cup_matches přes cup_teams.
  const matchDayTeams = new Set<string>();
  {
    const den = effectiveDate.toISOString().slice(0, 10);
    const rows = await env.DB.prepare(
      `SELECT m.home_team_id AS team_id FROM matches m
         LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE substr(COALESCE(sc.scheduled_at, m.created_at), 1, 10) = ?
       UNION
       SELECT m.away_team_id FROM matches m
         LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE substr(COALESCE(sc.scheduled_at, m.created_at), 1, 10) = ?
       UNION
       SELECT ct.team_id FROM cup_matches cm
         JOIN cup_teams ct ON ct.id IN (cm.home_cup_team_id, cm.away_cup_team_id)
        WHERE ct.team_id IS NOT NULL AND substr(cm.scheduled_at, 1, 10) = ?`
    ).bind(den, den, den).all<{ team_id: string | null }>()
      .catch((e) => { logger.warn({ module: "daily-tick" }, "load match-day teams", e); return { results: [] }; });
    for (const r of rows.results) if (r.team_id) matchDayTeams.add(r.team_id);
    if (matchDayTeams.size > 0) {
      logger.info({ module: "daily-tick" }, `match day: ${matchDayTeams.size} týmů dnes hraje, trénink jim odpadá`);
    }
  }

  for (const team of teams.results) {
    const teamId = team.id as string;

    // Per-team training day check: custom training_days (JSON array) override default mapping.
    // Smart skip: pokud má tým ligový zápas dnes nebo zítra, trénink se přeskočí ("trenér dal volno").
    const trainingDayMap: Record<number, number[]> = {
      1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5],
    };
    const sessionsForTeam = (team.training_sessions as number) ?? 2;
    let customTrainingDays: number[] | null = null;
    if (team.training_days) {
      try {
        const parsed = JSON.parse(team.training_days as string);
        if (Array.isArray(parsed) && parsed.every((d) => typeof d === "number" && d >= 0 && d <= 6)) {
          customTrainingDays = parsed;
        }
      } catch (e) { logger.warn({ module: "daily-tick", teamId }, "parse training_days", e); }
    }
    // Týdenní plán {"1":"conditioning","3":"tactics"} — každý den může mít vlastní typ tréninku.
    // Dny v plánu určují i to, KDY se trénuje (den bez záznamu = volno). Prázdný plán →
    // původní chování: jeden training_type pro dny z training_days.
    const dayPlan = parseTrainingPlan(team.training_plan as string | null, teamId);
    const planDays = dayPlan ? Object.keys(dayPlan).map(Number).filter((d) => d >= 0 && d <= 6) : [];

    const teamTrainingDays = planDays.length > 0
      ? planDays
      : (customTrainingDays && customTrainingDays.length > 0)
        ? customTrainingDays
        : (trainingDayMap[sessionsForTeam] ?? trainingDayMap[2]);
    const isTeamTrainingDay = teamTrainingDays.includes(dayOfWeek);
    // Typ pro DNEŠNÍ den — z plánu, jinak jednotný týmový typ.
    const todayTrainingType = dayPlan?.[dayOfWeek]?.type ?? (team.training_type as string | null);
    const todayIntensity = dayPlan?.[dayOfWeek]?.intensity ?? "normal";
    // Týdenní zátěž pro spokojenost hráčů — tvrdý trénink váží víc než lehký.
    const { INTENSITY } = await import("./training");
    const weeklyLoad = dayPlan
      ? Object.values(dayPlan).reduce((sum, d) => sum + INTENSITY[d.intensity].load, 0)
      : teamTrainingDays.length;

    // V den zápasu se netrénuje — kluci jdou rovnou na hřiště. Dřív odpadal trénink
    // i den PŘED zápasem a při dvou zápasech týdně tím padly dvě třetiny tréninků;
    // proto se ruší jen samotný zápasový den. Šetření sil před zápasem si manažer
    // pořád řídí sám: lehkou intenzitou nebo volnem pro konkrétní hráče.
    const hraseDnesZapas = matchDayTeams.has(teamId);
    if (hraseDnesZapas && isTeamTrainingDay && todayTrainingType) {
      events.push({ type: "training_skipped", description: "Zápasový den — trénink odpadá" });
    }
    if (isTrainingDay && isTeamTrainingDay && todayTrainingType && !hraseDnesZapas) {
      try {
        // Volno od trenéra: hráči s life_context.$.trainingRest tento trénink vynechají
        // (žádný drain kondice, žádná zlepšení, žádné riziko absence). Zranění se nereportují
        // jako "volno" — ti netrénují kvůli zranění tak jako tak.
        const restedResult = await env.DB.prepare(
          `SELECT id, first_name, last_name FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
             AND id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)
             AND json_extract(life_context, '$.trainingRest') = 1`,
        ).bind(teamId).all<{ id: string; first_name: string; last_name: string }>()
          .catch((e) => { logger.warn({ module: "daily-tick", teamId }, "load training rest", e); return { results: [] as Array<{ id: string; first_name: string; last_name: string }> }; });
        const restedPlayers = restedResult.results.map((r) => ({ playerId: r.id, playerName: `${r.first_name} ${r.last_name}` }));

        // Vyloučit zraněné — zraněný hráč netrenuje (předtím byl pre-existing bug, šel do simulátoru).
        const playersResult = await env.DB.prepare(
          `SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
             AND id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)
             AND COALESCE(json_extract(life_context, '$.trainingRest'), 0) != 1
           ORDER BY overall_rating DESC`,
        ).bind(teamId).all();

        // Volno je vyčerpáno tímto tréninkem — smazat flag hned (nepodmíněně, WHERE je no-op
        // bez flagů). Kdyby clear běžel až na konci try bloku, transientní chyba mezi tím
        // by flag nechala žít a hráč by dostal volno opakovaně.
        await env.DB.prepare(
          `UPDATE players SET life_context = json_remove(life_context, '$.trainingRest') WHERE team_id = ? AND json_extract(life_context, '$.trainingRest') IS NOT NULL`,
        ).bind(teamId).run().catch((e) => logger.warn({ module: "daily-tick", teamId }, "clear training rest", e));

        const squad = playersResult.results.map((row) => {
          const skills = JSON.parse(row.skills as string);
          const personality = JSON.parse(row.personality as string);
          const lifeContext = JSON.parse(row.life_context as string);
          const physical = row.physical ? JSON.parse(row.physical as string) : {};
          // Stropy růstu z skills_max ({attr: {current, maxPotential}}) — trénink
          // nesmí atribut přetáhnout přes vygenerovaný potenciál hráče.
          let skillCaps: Record<string, number> | undefined;
          if (row.skills_max) {
            try {
              const sm = JSON.parse(row.skills_max as string) as Record<string, { maxPotential?: number }>;
              skillCaps = {};
              for (const [attr, v] of Object.entries(sm)) {
                if (v && typeof v.maxPotential === "number") skillCaps[attr] = v.maxPotential;
              }
            } catch (e) { logger.warn({ module: "daily-tick", teamId }, "parse skills_max", e); }
          }
          return {
            skillCaps,
            hiddenTalent: (row.hidden_talent as number) ?? 0,
            firstName: row.first_name as string, lastName: row.last_name as string,
            age: row.age as number, position: row.position as "GK" | "DEF" | "MID" | "FWD",
            speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
            passing: skills.passing, heading: skills.heading ?? 0, defense: skills.defense,
            goalkeeping: skills.goalkeeping ?? 0,
            vision: skills.vision ?? 30,
            creativity: skills.creativity ?? 30,
            setPieces: skills.setPieces ?? 30,
            stamina: physical.stamina ?? skills.stamina ?? skills.speed,
            strength: physical.strength ?? skills.strength ?? skills.defense,
            injuryProneness: personality.injuryProneness ?? 50,
            discipline: personality.discipline,
            patriotism: personality.patriotism, alcohol: personality.alcohol,
            temper: personality.temper, occupation: lifeContext.occupation ?? "",
            bodyType: "normal" as const, avatarConfig: {} as any,
            condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
            preferredFoot: "right" as const, preferredSide: "center" as const,
            leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
            aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
            clutch: personality.clutch ?? 50,
            isCelebrity: !!(row.is_celebrity as number), celebrityType: personality.celebrityType,
            transferUnrest: lifeContext.transferUnrest?.level ?? 0,
          };
        });

        const { calculateEffects } = await import("../equipment/equipment-generator");
        const equip = await env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?")
          .bind(teamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "daily-tick" }, "fetch equipment", e); return null; });

        let equipMul = 1.0;
        let equipAttendanceBonus = 0;   // dodávka: lepší docházka na trénink
        let equipYouthMod = 0;          // kamera: rychlejší růst hráčů do 22 let
        let equipChemistryMod = 0;      // rozlišováky + tabule: chemie k taktickému tréninku
        if (equip) {
          const levels: Record<string, number> = {};
          const conditions: Record<string, number> = {};
          for (const [k, v] of Object.entries(equip)) {
            if (k.endsWith("_condition")) conditions[k] = v as number;
            else if (typeof v === "number" && k !== "id") levels[k] = v;
          }
          const eff = calculateEffects(levels, conditions);
          equipMul = eff.trainingMultiplier;
          // Tactics training dostává navíc bonus z bibs + tactics_board (jinak by se nikde neaplikoval)
          if (todayTrainingType === "tactics") {
            equipMul *= 1.0 + eff.tacticsTrainingBonus;
          }
          equipAttendanceBonus = eff.attendanceBonus;
          equipYouthMod = eff.youthTrainingMod;
          equipChemistryMod = eff.teamChemistryMod;
        }

        // Load manager attributes for training bonuses
        const mgr = await env.DB.prepare("SELECT coaching, discipline, youth_development FROM managers WHERE team_id = ?")
          .bind(teamId).first<{ coaching: number; discipline: number; youth_development: number }>().catch((e) => { logger.warn({ module: "daily-tick" }, "load manager for training", e); return null; });
        const mgrBonus = { coaching: mgr?.coaching ?? 40, discipline: mgr?.discipline ?? 40, youthDev: mgr?.youth_development ?? 40 };

        // Staff efekty na trénink (asistent, trenér mládeže, trenér brankářů, kondiční trenér)
        const { calculateStaffEffects } = await import("../staff/staff-effects");
        const staffTrainRows = await env.DB.prepare(
          "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?"
        ).bind(teamId).all<{ role: string; coaching: number; medicine: number; maintenance: number; judgement: number; communication: number; work_rate: number; charm: number }>()
          .catch((e) => { logger.warn({ module: "daily-tick" }, "load staff for training", e); return { results: [] as never[] }; });
        const staffFx = calculateStaffEffects(staffTrainRows.results);
        equipMul *= staffFx.trainingMultiplier;
        equipAttendanceBonus += staffFx.trainingAttendanceBonus;
        equipYouthMod += staffFx.youthTrainingMod;

        const rng = createRng(now.getTime() + teamId.charCodeAt(0));
        const result = simulateTraining(rng, squad, {
          type: (todayTrainingType as any) ?? "conditioning",
          intensity: todayIntensity,
          weeklyLoad,
          approach: (team.training_approach as any) ?? "balanced",
          sessionsPerWeek: (team.training_sessions as number) ?? 2,
        }, undefined, equipMul, mgrBonus, { attendanceBonus: equipAttendanceBonus, youthTrainingMod: equipYouthMod, gkTrainingMul: staffFx.gkTrainingMul });

        const attendanceWithNames = result.attendance.map((a) => ({
          playerId: playersResult.results[a.playerIndex].id as string,
          playerName: `${squad[a.playerIndex].firstName} ${squad[a.playerIndex].lastName}`,
          attended: a.attended,
          reason: a.reason,
        }));
        const improvementsWithNames = result.improvements.map((imp) => ({
          playerId: playersResult.results[imp.playerIndex].id as string,
          playerName: `${squad[imp.playerIndex].firstName} ${squad[imp.playerIndex].lastName}`,
          attribute: imp.attribute,
          change: imp.change,
        }));

        // Reakce hráčů na nastavení tréninku (zátěž, přístup) — simulace je spočítala,
        // ale bez tohohle zápisu by zůstaly jen v paměti a morálka by se nikdy nezměnila.
        const moraleWithNames = result.moraleChanges.map((m) => ({
          playerId: playersResult.results[m.playerIndex].id as string,
          playerName: `${squad[m.playerIndex].firstName} ${squad[m.playerIndex].lastName}`,
          change: m.change,
          reason: m.reason,
        }));
        if (moraleWithNames.length > 0) {
          const moraleStmts = result.moraleChanges.map((m) =>
            env.DB.prepare(
              "UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?",
            ).bind(Math.round(squad[m.playerIndex].morale), playersResult.results[m.playerIndex].id as string),
          );
          for (let i = 0; i < moraleStmts.length; i += 40) {
            await env.DB.batch(moraleStmts.slice(i, i + 40))
              .catch((e) => logger.warn({ module: "daily-tick", teamId }, "save training morale", e));
          }
        }

        const summary = {
          attendance: attendanceWithNames,
          improvements: improvementsWithNames,
          teamChemistry: result.teamChemistry,
          moraleChanges: moraleWithNames,
          attendedCount: attendanceWithNames.filter((a) => a.attended).length,
          totalCount: attendanceWithNames.length,
          rested: restedPlayers,
          day: effectiveDate.toLocaleDateString("cs", { weekday: "long", timeZone: "UTC" }),
        };

        await env.DB.prepare(
          "UPDATE teams SET last_training_at = ?, last_training_result = ? WHERE id = ?"
        ).bind(now.toISOString(), JSON.stringify(summary), teamId).run();

        // Tactics training → +2 pro aktuálně preferovanou formaci (nejnovější uložená lineup)
        if (todayTrainingType === "tactics") {
          try {
            const lastLineup = await env.DB.prepare(
              "SELECT formation FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC, id ASC LIMIT 1"
            ).bind(teamId).first<{ formation: string }>();
            const form = lastLineup?.formation;
            if (form) {
              const { applyTrainingBoost } = await import("../engine/chemistry");
              // Chemie z vybavení (rozlišováky + taktická tabule) — dřív mrtvý efekt, teď reálný boost
              await applyTrainingBoost(env.DB, teamId, form, equipChemistryMod);
            }
          } catch (e) {
            logger.warn({ module: "daily-tick" }, "tactics training boost", e);
          }
        }

        // Persist skill changes to DB + recalculate wages + log training
        // Zkušenost za odtrénovaný den. Sbírá se hlavně v zápasech, tohle je doplněk —
        // šance je řádově menší, aby trénink nenahradil odehrané minuty.
        for (const att of result.attendance) {
          if (!att.attended) continue;
          const row = playersResult.results[att.playerIndex];
          if (!row) continue;
          const age = row.age as number;
          if (rng.random() >= trainingExperienceChance(age)) continue;

          const expSkills = JSON.parse(row.skills as string);
          const current = (expSkills.experience as number) ?? 0;
          if (current >= 100) continue;
          expSkills.experience = current + 1;
          row.skills = JSON.stringify(expSkills); // ať navazující zápisy vychází z aktuální hodnoty
          await env.DB.prepare("UPDATE players SET skills = ? WHERE id = ?")
            .bind(row.skills, row.id as string).run()
            .catch((e) => logger.warn({ module: "daily-tick" }, "gain training experience", e));
        }

        for (const imp of result.improvements) {
          const player = squad[imp.playerIndex];
          const playerId = playersResult.results[imp.playerIndex].id as string;
          const currentSkills = JSON.parse(playersResult.results[imp.playerIndex].skills as string);
          const newValue = player[imp.attribute as keyof typeof player] as number;

          // Always write to skills JSON (ensure attribute exists)
          const oldValue = currentSkills[imp.attribute] ?? 0;
          currentSkills[imp.attribute] = newValue;
          await env.DB.prepare("UPDATE players SET skills = ? WHERE id = ?")
            .bind(JSON.stringify(currentSkills), playerId).run();

          // For stamina/strength: also update physical JSON (read path prefers physical)
          if (imp.attribute === "stamina" || imp.attribute === "strength") {
            const currentPhysical = playersResult.results[imp.playerIndex].physical
              ? JSON.parse(playersResult.results[imp.playerIndex].physical as string) : {};
            currentPhysical[imp.attribute] = newValue;
            await env.DB.prepare("UPDATE players SET physical = ? WHERE id = ?")
              .bind(JSON.stringify(currentPhysical), playerId).run();
          }

          // Přepočítat hodnocení z aktuálních atributů. Dřív se přičítalo ±1 za každý
          // natrénovaný bod, jenže hodnocení je vážený průměr ~10 atributů — jeden bod v něm
          // váží 0,03–0,15. Ratingy tak utíkaly nahoru řádově rychleji než skutečná síla
          // hráče (naměřeno 0,88 bodu na trénink místo ~0,1).
          const row = playersResult.results[imp.playerIndex];
          const physicalForRating = row.physical ? JSON.parse(row.physical as string) : {};
          const skillsMaxForRating = row.skills_max ? JSON.parse(row.skills_max as string) : undefined;
          const computed = overallRatingFromFlat(
            row.position as string,
            currentSkills,
            physicalForRating,
            (row.hidden_talent as number) ?? 0,
            skillsMaxForRating,
          );

          // null = hráč nemá dost vyplněných atributů (část brankářů). Hodnocení ani mzdy
          // se pak nedotýkáme — dřív by tu drift pokračoval, teď se prostě nic nestane.
          if (computed !== null) {
            const newRating = Math.max(1, computed);

            // Mzdu posunout jen v poměru, v jakém se změnilo hodnocení. Přepsat ji holým
            // vzorcem nejde — smazalo by to vyjednané navýšení (unrest „raise_wage" ho
            // slibuje trvale) a hráčům pod vzorcem by naopak samo od sebe přidalo.
            const baseWageFor = (r: number) => Math.round(10 + (r / 100) * 400);
            const oldRating = (row.overall_rating as number) ?? newRating;
            const oldWage = (row.weekly_wage as number) ?? 0;
            const oldBase = baseWageFor(oldRating);
            const newWage = oldWage > 0 && oldBase > 0
              ? Math.round(oldWage * (baseWageFor(newRating) / oldBase))
              : baseWageFor(newRating);

            await env.DB.prepare(
              "UPDATE players SET overall_rating = ?, weekly_wage = ? WHERE id = ?"
            ).bind(newRating, newWage, playerId).run();
          }

          // Log to training_log
          await env.DB.prepare(
            "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(playerId, teamId, imp.attribute, oldValue, newValue, imp.change, todayTrainingType ?? "conditioning", effectiveDate.toISOString()).run().catch((e) => logger.warn({ module: "daily-tick" }, "insert training log", e));
        }

        // Training drains condition for attending players
        // Conditioning = light (builds stamina, low drain), tactical = medium, intense drills = heavy
        const drainMap: Record<string, number> = {
          conditioning: 3,
          passing: 4,
          defense: 5,
          shooting: 5,
          technique: 4,
          tactical: 3,
        };
        // Kondiční trenér snižuje úbytek kondice z tréninku (min 1 bod)
        const baseDrain = (drainMap[todayTrainingType ?? ""] ?? 4) * INTENSITY[todayIntensity].drain;
        const condDrain = Math.max(1, Math.round(baseDrain * (1 - staffFx.conditionDrainReduction)));
        const { logConditionStmt } = await import("../lib/condition-log");
        for (const a of result.attendance) {
          const playerRow = playersResult.results[a.playerIndex];
          const playerId = playerRow.id as string;
          if (a.attended) {
            // Pre-fetch starou condition pro log entry — single round-trip stačí, condDrain je deterministický.
            const oldCondLc = (() => { try { return JSON.parse(playerRow.life_context as string); } catch { return null; } })();
            const oldCond = oldCondLc?.condition ?? 100;
            const newCond = Math.max(5, oldCond - condDrain);
            const stmts: D1PreparedStatement[] = [
              env.DB.prepare(
                `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(5, json_extract(life_context, '$.condition') - ?)) WHERE id = ?`,
              ).bind(condDrain, playerId),
            ];
            if (newCond !== oldCond) {
              stmts.push(logConditionStmt(env.DB, playerId, teamId, oldCond, newCond, "training", `Trénink: ${trainingTypeLabel(todayTrainingType)} (${INTENSITY[todayIntensity].label.toLowerCase()})`));
            }
            await env.DB.batch(stmts).catch((e) => logger.warn({ module: "daily-tick" }, "drain condition after training", e));
          } else if (a.reason) {
            // Neúčast → uložit absence na life_context (vyčistí se následující den)
            const absencePayload = JSON.stringify({ reason: a.reason, category: "training", date: now.toISOString().slice(0, 10) });
            await env.DB.prepare(
              `UPDATE players SET life_context = json_set(life_context, '$.absence', json(?)) WHERE id = ?`
            ).bind(absencePayload, playerId).run().catch((e) => logger.warn({ module: "daily-tick" }, "set training absence", e));
          }
        }

        // Update cumulative training attendance
        try {
          const attRow = await env.DB.prepare("SELECT training_attendance FROM teams WHERE id = ?")
            .bind(teamId).first<{ training_attendance: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "load training_attendance", e); return null; });
          const attData: Record<string, { attended: number; total: number }> = (() => {
            try { return JSON.parse(attRow?.training_attendance ?? "{}"); } catch { return {}; }
          })();
          for (const a of result.attendance) {
            const pid = playersResult.results[a.playerIndex]?.id as string;
            if (!pid) continue;
            if (!attData[pid]) attData[pid] = { attended: 0, total: 0 };
            attData[pid].total++;
            if (a.attended) attData[pid].attended++;
          }
          await env.DB.prepare("UPDATE teams SET training_attendance = ? WHERE id = ?")
            .bind(JSON.stringify(attData), teamId).run();
        } catch (e) {
          logger.warn({ module: "daily-tick" }, "training attendance tracking failed", e);
        }

        events.push({
          type: "training",
          description: `Trénink: ${summary.attendedCount}/${summary.totalCount} hráčů, ${improvementsWithNames.length} zlepšení${restedPlayers.length > 0 ? `, ${restedPlayers.length} volno` : ""}`,
          data: summary,
        });
      } catch (e) {
        logger.error({ module: "daily-tick" }, `training failed for team ${teamId}`, e);
      }
    }
  }

  // ── Global ticks ──

  // Pitch degradation
  // Kluby se sekačkou (mower) jedou vlastním průchodem níž — tady se vynechají,
  // stejný idiom jako u grilu. Bez toho by jim trávník klesal dvakrát.
  await env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MAX(5, pitch_condition - 1) WHERE pitch_type = 'natural' AND team_id NOT IN (SELECT team_id FROM equipment WHERE mower > 0)"
  ).run();
  await env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MAX(10, pitch_condition - 1) WHERE pitch_type = 'hybrid' AND (ABS(RANDOM()) % 2 = 0) AND team_id NOT IN (SELECT team_id FROM equipment WHERE mower > 0)"
  ).run();

  // Sekačka: trávník některé dny nechátrá vůbec. Šance = pitchCareMod (0–90 %),
  // takže Lv3 v dobrém stavu udrží hřiště skoro pořád.
  try {
    const mowers = await env.DB.prepare(
      "SELECT team_id, mower, mower_condition FROM equipment WHERE mower > 0"
    ).all<{ team_id: string; mower: number; mower_condition: number }>();
    for (const row of mowers.results ?? []) {
      const skipPct = Math.round(row.mower * (row.mower_condition / 100) * 30);
      await env.DB.prepare(
        `UPDATE stadiums SET pitch_condition = MAX(5, pitch_condition - 1)
          WHERE team_id = ? AND pitch_type IN ('natural','hybrid') AND (ABS(RANDOM()) % 100) >= ?`
      ).bind(row.team_id, skipPct).run();
    }
  } catch (e) {
    logger.warn({ module: "daily-tick" }, "mower pitch care", e);
  }

  // Equipment condition degradation (slow — 1-2 points per day for used items).
  // team_van ZÁMĚRNĚ vynechán: jeho kondice ovlivňuje commuteMod, který musí zůstat stejný
  // mezi day_before SMS a match_day simulací (jinak divergence absencí). Dodávku „opotřebí" jen zápas/nákup.
  const equipCategories = ["balls", "jerseys", "training_cones", "first_aid", "boots_stock", "bibs", "goalkeeper_gear", "water_bottles", "tactics_board",
    "gym_corner", "training_wall", "club_grill", "fan_drums", "winter_gear", "video_setup", "laundry", "mower", "coffee_maker",
    "sports_drinks", "raffle", "pa_system", "trophy_case"];

  // Pračka snižuje šanci na opotřebení všeho ostatního, takže kluby, co ji mají,
  // se z globálního průchodu vyjmou a dojedou zvlášť nižší pravděpodobností.
  const laundryTeams = await env.DB.prepare(
    "SELECT team_id, laundry, laundry_condition FROM equipment WHERE laundry > 0"
  ).all<{ team_id: string; laundry: number; laundry_condition: number }>()
    .catch((e) => { logger.warn({ module: "daily-tick" }, "fetch laundry teams", e); return { results: [] }; });

  // Šance na -1 bod za den. Při 50 % trvala cesta ze 100 na dno 190 dní, což je
  // půl roku reálného času — vybavení fakticky nechátralo. Na 100 % je to 95 dní
  // a údržba se stává rozhodnutím: buď platíš správce hřiště a pračku, nebo opravy.
  const DAILY_WEAR_CHANCE = 100;

  for (const cat of equipCategories) {
    await env.DB.prepare(
      `UPDATE equipment SET ${cat}_condition = MAX(5, ${cat}_condition - 1)
        WHERE ${cat} > 0 AND (ABS(RANDOM()) % 100) < ${DAILY_WEAR_CHANCE}
          AND team_id NOT IN (SELECT team_id FROM equipment WHERE laundry > 0)`
    ).run().catch((e) => logger.warn({ module: "daily-tick" }, "equipment condition degradation", e));
  }

  for (const row of laundryTeams.results ?? []) {
    const chance = Math.round(DAILY_WEAR_CHANCE * (1 - row.laundry * (row.laundry_condition / 100) * 0.15));
    for (const cat of equipCategories) {
      await env.DB.prepare(
        `UPDATE equipment SET ${cat}_condition = MAX(5, ${cat}_condition - 1)
          WHERE team_id = ? AND ${cat} > 0 AND (ABS(RANDOM()) % 100) < ?`
      ).bind(row.team_id, chance).run()
        .catch((e) => logger.warn({ module: "daily-tick" }, "equipment degradation with laundry", e));
    }
  }

  // Injury recovery
  await env.DB.prepare(
    "UPDATE injuries SET days_remaining = days_remaining - 1 WHERE days_remaining > 0"
  ).run();
  const healed = await env.DB.prepare(
    "SELECT p.first_name, p.last_name FROM injuries i JOIN players p ON i.player_id = p.id WHERE i.days_remaining <= 0"
  ).all().catch((e) => { logger.warn({ module: "daily-tick" }, "fetch healed injuries", e); return { results: [] }; });
  await env.DB.prepare("DELETE FROM injuries WHERE days_remaining <= 0").run();

  if (healed.results.length > 0) {
    events.push({
      type: "injury_healed",
      description: `Vyléčeno: ${healed.results.map((r) => `${r.first_name} ${r.last_name}`).join(", ")}`,
    });
  }

  // Condition recovery: stamina-based + age modifier
  // Young players recover faster, older players slower
  // newCondSql musí být IDENTICKÝ se SQL v UPDATE — log se počítá ze stejného výrazu.
  const recoveryNewCondSql = `MIN(100, json_extract(life_context, '$.condition') +
    (CASE
      WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 75 THEN 20
      WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 50 THEN 16
      WHEN COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 40) >= 25 THEN 13
      ELSE 10
    END)
    +
    (CASE
      WHEN age <= 21 THEN 3
      WHEN age <= 25 THEN 1
      WHEN age <= 30 THEN 0
      WHEN age <= 35 THEN -1
      ELSE -3
    END))`;
  // Log před UPDATE (žádné race v rámci jednoho ticku — daily-tick je idempotentní)
  await env.DB.prepare(
    `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
     SELECT id, team_id,
       json_extract(life_context, '$.condition'),
       ${recoveryNewCondSql},
       ${recoveryNewCondSql} - json_extract(life_context, '$.condition'),
       'recovery', 'Denní regenerace'
     FROM players
     WHERE json_extract(life_context, '$.condition') IS NOT NULL
       AND ${recoveryNewCondSql} != json_extract(life_context, '$.condition')`,
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "log recovery", e));
  await env.DB.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.condition', ${recoveryNewCondSql})`,
  ).run();
  events.push({ type: "recovery", description: "Regenerace kondice (dle staminy a věku)" });

  // Shower facility bonus: extra condition recovery per team
  try {
    const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
    const stadiums = await env.DB.prepare(
      "SELECT team_id, changing_rooms, showers, refreshments, stands, parking, fence FROM stadiums"
    ).all();
    for (const row of stadiums.results) {
      const facilities: Record<string, number> = {};
      for (const key of ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence"]) {
        facilities[key] = (row[key] as number) ?? 0;
      }
      const fx = calculateFacilityEffects(facilities);
      if (fx.conditionRegenBonus > 0) {
        await env.DB.prepare(
          `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
           SELECT id, team_id,
             json_extract(life_context, '$.condition'),
             MIN(100, json_extract(life_context, '$.condition') + ?),
             MIN(100, json_extract(life_context, '$.condition') + ?) - json_extract(life_context, '$.condition'),
             'facility', 'Bonus z vybavení (sprchy)'
           FROM players
           WHERE team_id = ?
             AND json_extract(life_context, '$.condition') IS NOT NULL
             AND MIN(100, json_extract(life_context, '$.condition') + ?) != json_extract(life_context, '$.condition')`,
        ).bind(fx.conditionRegenBonus, fx.conditionRegenBonus, row.team_id, fx.conditionRegenBonus)
          .run().catch((e) => logger.warn({ module: "daily-tick" }, "log facility regen", e));
        await env.DB.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition',
            MIN(100, json_extract(life_context, '$.condition') + ?))
          WHERE team_id = ?`,
        ).bind(fx.conditionRegenBonus, row.team_id).run();
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "shower bonus failed", e);
  }

  // Posilovna v kabině: extra regenerace kondice per tým (stejný vzor jako sprchy)
  try {
    const { calculateEffects } = await import("../equipment/equipment-generator");
    const gyms = await env.DB.prepare(
      "SELECT team_id, gym_corner, gym_corner_condition FROM equipment WHERE gym_corner > 0"
    ).all();
    for (const row of gyms.results) {
      const fx = calculateEffects(
        { gym_corner: row.gym_corner as number },
        { gym_corner_condition: row.gym_corner_condition as number },
      );
      if (fx.conditionRegenBonus <= 0) continue;
      await env.DB.prepare(
        `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
         SELECT id, team_id,
           json_extract(life_context, '$.condition'),
           MIN(100, json_extract(life_context, '$.condition') + ?),
           MIN(100, json_extract(life_context, '$.condition') + ?) - json_extract(life_context, '$.condition'),
           'facility', 'Bonus z vybavení (posilovna)'
         FROM players
         WHERE team_id = ?
           AND json_extract(life_context, '$.condition') IS NOT NULL
           AND MIN(100, json_extract(life_context, '$.condition') + ?) != json_extract(life_context, '$.condition')`,
      ).bind(fx.conditionRegenBonus, fx.conditionRegenBonus, row.team_id, fx.conditionRegenBonus)
        .run().catch((e) => logger.warn({ module: "daily-tick" }, "log gym regen", e));
      await env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition',
          MIN(100, json_extract(life_context, '$.condition') + ?))
        WHERE team_id = ?`,
      ).bind(fx.conditionRegenBonus, row.team_id).run();
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "gym regen failed", e);
  }

  // ── Random life events ── (vesnické +/-, cooldown 5 dní per hráč, ~2% per hráč/den)
  try {
    const { applyRandomLifeEvents } = await import("./random-events");
    const r = await applyRandomLifeEvents(env.DB);
    if (r.applied > 0) events.push({ type: "recovery", description: `Životní události: ${r.applied} hráčů` });
  } catch (e) {
    logger.error({ module: "daily-tick" }, "random life events", e);
  }

  // (AI player chats mají vlastní cron 0 14 * * * v index.ts — nespouštět tady)

  // ── Hospoda U Pralesa ── generuj večerní session pro lidské týmy (idempotentní per game_date)
  try {
    const { generatePubSessionsForAllTeams } = await import("./pub");
    const r = await generatePubSessionsForAllTeams(env.DB, todayKey);
    if (r.sessionsCreated > 0) events.push({ type: "recovery", description: `Hospoda: ${r.sessionsCreated} session` });
  } catch (e) {
    logger.error({ module: "daily-tick" }, "pub sessions", e);
  }

  // ── Naplánované hospodské akce trenérů (posezení, runda) — vyhodnotit po „odehrání" hospody ──
  try {
    const { resolvePlannedSocialEvents } = await import("../community/manager-relations");
    const n = await resolvePlannedSocialEvents(env.DB, todayKey);
    if (n > 0) events.push({ type: "recovery", description: `Hospoda: ${n} trenérských akcí vyhodnoceno` });
  } catch (e) {
    logger.error({ module: "daily-tick" }, "resolve social pub events", e);
  }

  // Morale drift toward 50 — týmy s klubovým grilem mají pásmo posunuté nahoru (nálada drží výš).
  // Základní drift v try/catch s fallbackem: kdyby sloupec club_grill ještě neexistoval (deploy
  // před migrací), nesmí spadnout celý tick — spadne jen na drift bez gril-výjimky.
  try {
    await env.DB.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.morale',
        CASE
          WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
          WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
          ELSE json_extract(life_context, '$.morale')
        END)
      WHERE team_id NOT IN (SELECT team_id FROM equipment WHERE club_grill > 0)`
    ).run();
    const { calculateEffects: calcGrillFx } = await import("../equipment/equipment-generator");
    const grills = await env.DB.prepare(
      "SELECT team_id, club_grill, club_grill_condition FROM equipment WHERE club_grill > 0"
    ).all();
    for (const row of grills.results) {
      const bonus = calcGrillFx(
        { club_grill: row.club_grill as number },
        { club_grill_condition: row.club_grill_condition as number },
      ).moraleTargetBonus;
      await env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
          CASE
            WHEN json_extract(life_context, '$.morale') > 55 + ? THEN json_extract(life_context, '$.morale') - 1
            WHEN json_extract(life_context, '$.morale') < 45 + ? THEN json_extract(life_context, '$.morale') + 1
            ELSE json_extract(life_context, '$.morale')
          END)
        WHERE team_id = ?`
      ).bind(bonus, bonus, row.team_id).run()
        .catch((e) => logger.warn({ module: "daily-tick" }, "grill morale drift", e));
    }
  } catch (e) {
    logger.warn({ module: "daily-tick" }, "grill morale drift failed, fallback to plain drift", e);
    await env.DB.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.morale',
        CASE
          WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
          WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
          ELSE json_extract(life_context, '$.morale')
        END)`
    ).run().catch((e2) => logger.error({ module: "daily-tick" }, "plain morale drift fallback failed", e2));
  }
  events.push({ type: "morale", description: "Morálka se stabilizuje" });

  // Fans satisfaction drift toward loyalty (1 bod denně)
  await env.DB.prepare(
    `UPDATE fans SET satisfaction = CASE
       WHEN satisfaction > loyalty + 1 THEN satisfaction - 1
       WHEN satisfaction < loyalty - 1 THEN satisfaction + 1
       ELSE satisfaction
     END, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
  ).run().catch((e) => logger.warn({ module: "daily-tick" }, "fans satisfaction drift", e));

  // Loajalita míří k rovnovážné hladině = reputace týmu POSUNUTÁ o vliv trenéra (1 bod denně).
  // Posouvá se cíl, ne hodnota — jednorázový bonus by tenhle drift druhý den smazal.
  const loyaltyRows = await env.DB.prepare(
    `SELECT f.team_id, f.loyalty, t.reputation AS team_rep,
            m.reputation AS mgr_rep, m.motivation AS mgr_mot
       FROM fans f
       JOIN teams t ON t.id = f.team_id
       LEFT JOIN managers m ON m.team_id = f.team_id`,
  ).all<{ team_id: string; loyalty: number; team_rep: number | null; mgr_rep: number | null; mgr_mot: number | null }>()
    .catch((e) => {
      logger.warn({ module: "daily-tick" }, "load loyalty targets", e);
      return { results: [] as Array<{ team_id: string; loyalty: number; team_rep: number | null; mgr_rep: number | null; mgr_mot: number | null }> };
    });

  const loyaltyStmts: D1PreparedStatement[] = [];
  for (const row of loyaltyRows.results ?? []) {
    const offset = (row.mgr_rep != null && row.mgr_mot != null)
      ? managerFansEffect(row.mgr_rep, row.mgr_mot).loyaltyOffset
      : 0;
    const target = Math.max(0, Math.min(100, (row.team_rep ?? 50) + offset));
    if (row.loyalty === target) continue;
    loyaltyStmts.push(
      env.DB.prepare("UPDATE fans SET loyalty = ? WHERE team_id = ?")
        .bind(row.loyalty < target ? row.loyalty + 1 : row.loyalty - 1, row.team_id),
    );
  }
  if (loyaltyStmts.length > 0) {
    await env.DB.batch(loyaltyStmts)
      .catch((e) => logger.warn({ module: "daily-tick" }, "fans loyalty drift batch", e));
  }

  logger.info({ module: "daily-tick" }, "reached game date advancement section");
  // ── Advance game date for ALL teams (including AI) ──
  const allTeams = await env.DB.prepare(
    "SELECT t.id, t.user_id, t.league_id, t.game_date, t.training_type, t.training_sessions, t.training_days, t.training_plan, v.size as village_size, v.district as village_district, v.population as village_population FROM teams t LEFT JOIN villages v ON t.village_id = v.id"
  ).all();

  // ── Globální herní den ── clock + effectiveDate jsou spočítané na začátku ticku (deterministicky
  // z reality) a už použité pro KV guard. Tady jen zapíšeme datum do teams + posuneme pohár.
  let globalGameDate: string | null = null;
  if (clock) {
    globalGameDate = effectiveDate.toISOString();
    await env.DB.prepare("UPDATE teams SET game_date = ? WHERE game_date IS NOT NULL").bind(globalGameDate).run()
      .catch((e) => logger.warn({ module: "daily-tick" }, "set global game date", e));

    // Pohár: postup kol podle herního dne (kola padají na soboty, finále na konci ligy).
    try {
      const { maybeAdvanceCup } = await import("../cup/cup");
      await maybeAdvanceCup(env.DB);
    } catch (e) { logger.warn({ module: "daily-tick" }, "cup auto-advance failed", e); }

    // ── Delegace rozhodčích na zápasy za dva herní dny ──
    // Záměrně PŘED per-tým smyčkou: delegace je per liga a musí proběhnout i pro
    // zápasy dvou AI týmů, zatímco smyčka níž běží per tým a lidské trenéry filtruje.
    try {
      const { delegateReferees } = await import("../referees/delegation");
      const delegated = await delegateReferees(env.DB, globalGameDate);
      if (delegated > 0) logger.info({ module: "referees" }, `delegováno ${delegated} zápasů`);
    } catch (e) { logger.error({ module: "referees" }, "delegace rozhodčích selhala", e); }

    // ── Předzápasové výroky AI trenérů ──
    // Stejné okno jako delegace: výrok musí vyjít před zápasem, jinak na něj
    // pozápasový rozhovor nemá jak navázat.
    try {
      const { gameExpiry } = await import("../lib/game-time");
      const { publishAiPreMatchStatements } = await import("../news/ai-prematch-statement");
      const target = new Date(gameExpiry(globalGameDate, 2));
      const from = new Date(target); from.setUTCHours(0, 0, 0, 0);
      const to = new Date(target); to.setUTCHours(23, 59, 59, 999);
      const said = await publishAiPreMatchStatements(env.DB, from.toISOString(), to.toISOString());
      if (said > 0) logger.info({ module: "ai-statement" }, `${said} předzápasových výroků`);
    } catch (e) { logger.warn({ module: "ai-statement" }, "předzápasové výroky selhaly", e); }

    // ── Schůze vedení soutěže (středa) ──
    // Středa je jediný den bez kolize: liga hraje pondělí a čtvrtek, pohár v sobotu
    // (cup.ts snapuje kola na sobotu), vesnický týdenní cyklus běží v pondělí a delegace
    // rozhodčích míří ve středu na pátek, kde se nehraje.
    //
    // Spouštěčem je DEN V TÝDNU, ne uložený timestamp: rollover nuluje game_clock.offset_days
    // a herní datum skočí o desítky dní zpět, takže absolutní „next_meeting_at <= dnes"
    // by po přechodu sezóny nemuselo nikdy nastat.
    if (dayOfWeek === MEETING_DAY_OF_WEEK) {
      try {
        const { runCompetitionMeetings } = await import("../competition/meeting");
        const r = await runCompetitionMeetings(env.DB, globalGameDate);
        if (r.meetings > 0) {
          logger.info({ module: "competition" },
            `schůze: ${r.meetings} soutěží, ${r.closed} bodů projednáno, ${r.passed} přijato`);
        }
      } catch (e) { logger.error({ module: "competition" }, "schůze vedení soutěže selhala", e); }
    }

    // ── Sázková kancelář ──
    // Kurzový lístek se přepisuje jednou za herní den, dokud je kolo 'scheduled'.
    // Vstupy modelu (síla kádru, forma, střelci) se každý den mění, takže lístek
    // musí být čerstvý; podaný tiket to neovlivní, ten si kurz nese ve vlastní kopii.
    try {
      const { generateBoard } = await import("../betting/board");
      const ligy = await env.DB.prepare(
        `SELECT DISTINCT l.id FROM leagues l
           JOIN teams t ON t.league_id = l.id
          WHERE l.league_type = 'senior' AND t.user_id <> 'ai'`
      ).all<{ id: string }>();

      let radku = 0;
      for (const liga of ligy.results) {
        const r = await generateBoard(env.DB, liga.id, globalGameDate);
        radku += r.rows;
      }
      if (radku > 0) logger.info({ module: "betting" }, `kurzový lístek: ${radku} kurzů`);
    } catch (e) { logger.error({ module: "betting" }, "generování kurzového lístku", e); }

    // Záchranná síť: tiket z kola, které dohrál ruční endpoint nebo recovery,
    // by jinak zůstal viset navždy. Zámek na status='open' dělá opakování zdarma.
    try {
      const { settleRound } = await import("../betting/settle");
      const zbyle = await env.DB.prepare(
        `SELECT DISTINCT t.calendar_id FROM bet_tickets t
           JOIN season_calendar sc ON sc.id = t.calendar_id
          WHERE t.status = 'open' AND sc.status = 'simulated'`
      ).all<{ calendar_id: string }>();

      for (const k of zbyle.results) {
        const r = await settleRound(env.DB, k.calendar_id);
        if (r.tickets > 0) {
          logger.warn({ module: "betting" },
            `dovypořádáno ${r.tickets} tiketů kola ${k.calendar_id} — uniklo hlavní cestě`);
        }
      }
    } catch (e) { logger.error({ module: "betting" }, "dovypořádání tiketů", e); }
  }
  // (Chybějící game_clock už je zalogováno jako error na začátku ticku.)

  // ── Per-team zpracování dne ──
  // Dřív tady byla smyčka přes VŠECHNY týmy v DB (včetně AI) v jedné invokaci —
  // pondělní finance, kabina a náklad na trénink běží každému týmu, takže to
  // škálovalo s počtem týmů a narazilo na limit workeru dřív než zápasový tick.
  //
  // Režim "queue": jedna zpráva na ligu, každá liga vlastní invokace.
  // Režim "loop":  inline smyčka jako dosud (jeden sdílený rozpočet).
  const { readMatchTickMode } = await import("../queue/messages");
  const dayMode = await readMatchTickMode(env.CACHE_KV);

  if (dayMode === "queue" && env.MATCH_QUEUE && globalGameDate) {
    const { enqueueTeamDays } = await import("../queue/producer");
    const enq = await enqueueTeamDays(env, globalGameDate, allTeams.results as Array<Record<string, unknown>>);
    logger.info(
      { module: "daily-tick" },
      `per-team den zařazen do fronty: ${enq.leagues} lig, ${enq.looseTeams} týmů bez ligy zpracováno rovnou`,
    );
  } else {
    const { processTeamDay } = await import("./team-day");
    for (const team of allTeams.results) {
      const teamResult = await processTeamDay(env, team as Record<string, unknown>, globalGameDate);
      events.push(...teamResult.events);
    }
  }

  // Úklid nároků na dny — bez něj by team_day_log rostl donekonečna
  // (počet týmů × počet dní). 14 dní zpět bohatě stačí na retry i pozdní doručení.
  if (globalGameDate) {
    const cutoff = new Date(globalGameDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - 14);
    await env.DB.prepare("DELETE FROM team_day_log WHERE game_date < ?")
      .bind(cutoff.toISOString())
      .run()
      .catch((e) => logger.warn({ module: "daily-tick" }, "úklid team_day_log", e));

    // Totéž pro telemetrii běhů z fronty — přibývá jí pár desítek řádků denně,
    // což při delším sledování zbytečně roste. 30 dní historie na analýzu stačí.
    await env.DB.prepare("DELETE FROM queue_runs WHERE created_at < datetime('now', '-30 days')")
      .run()
      .catch((e) => logger.warn({ module: "daily-tick" }, "úklid queue_runs", e));
  }

  // ── Player offer generation (organické nabídky — hospodský, kamarád, dorost, starosta) ──
  try {
    const { generatePlayerOffer } = await import("../events/player-offers");
    const sizeMap: Record<string, string> = { hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto" };
    const humanTeams = allTeams.results.filter((t) => t.user_id !== "ai" && t.game_date && t.village_district);

    for (const team of humanTeams) {
      const teamId = team.id as string;
      const offerRng = createRng(now.getTime() + teamId.charCodeAt(0) + 22222);
      // ~14% per day ≈ 1 nabídka týdně
      if (offerRng.random() > 0.14) continue;

      const district = team.village_district as string;
      const villageInfo = {
        region_code: district,
        category: (sizeMap[(team.village_size as string)] ?? "obec") as "vesnice" | "obec" | "mestys" | "mesto",
        population: (team.village_population as number) ?? 500,
        district,
      };

      await generatePlayerOffer(
        env.DB, offerRng, teamId, district, villageInfo, team.game_date as string,
      ).catch((e) => logger.warn({ module: "daily-tick" }, `player offer gen failed for ${teamId}`, e));
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "player offer generation failed", e);
  }

  // ── Free agent pool maintenance ──
  try {
    const { maintainFreeAgentPool } = await import("../transfers/free-agent-pool");
    const faRng = createRng(now.getTime() + 7777);
    const newFa = await maintainFreeAgentPool(env.DB, faRng, now);
    if (newFa > 0) {
      events.push({ type: "day", description: `${newFa} nových volných hráčů v okresu` });
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "free agent pool failed", e);
  }

  // ── Player quitting check ──
  try {
    const quitRng = createRng(now.getTime() + 9999);
    const activePlayers = await env.DB.prepare(
      "SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.life_context, t.name as team_name, t.league_id FROM players p JOIN teams t ON p.team_id = t.id WHERE p.status = 'active' AND t.user_id != 'ai'"
    ).all().catch((e) => { logger.warn({ module: "daily-tick" }, "fetch active players for quit check", e); return { results: [] }; });

    for (const row of activePlayers.results) {
      const personality = (() => { try { return JSON.parse(row.personality as string); } catch { return {}; } })();
      const lifeContext = (() => { try { return JSON.parse(row.life_context as string); } catch { return {}; } })();
      const patriotism = personality.patriotism ?? 50;
      const morale = lifeContext.morale ?? 50;

      if (patriotism < 25 && morale < 20 && quitRng.random() < 0.05) {
        await env.DB.prepare("UPDATE players SET status = 'quit' WHERE id = ?").bind(row.id).run();
        events.push({ type: "day", description: `${row.first_name} ${row.last_name} přestal chodit na tréninky` });

        // News
        const { createTransferNews } = await import("../transfers/transfer-news");
        await createTransferNews(env.DB, row.league_id as string, null, "player_quit", {
          playerName: `${row.first_name} ${row.last_name}`,
          playerAge: row.age as number,
          playerPosition: "",
          teamName: row.team_name as string,
          reason: quitRng.random() < 0.5 ? "Prý ho to nebaví." : "Spoluhráči říkají, že má jiné priority.",
        }).catch((e) => logger.warn({ module: "daily-tick" }, "player quit news", e));
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "player quit check failed", e);
  }

  // ── Loan returns — hráči vracející se z hostování ──
  // loan_until se zapisuje v HERNÍM čase (game.ts loan accept) → porovnávat proti
  // hernímu datu, ne reálnému. Při offsetu se jinak hráči vraceli špatně (dřív/nikdy).
  try {
    const expiredLoans = await env.DB.prepare(
      "SELECT id, first_name, last_name, team_id, loan_from_team_id FROM players WHERE loan_from_team_id IS NOT NULL AND loan_until <= ?"
    ).bind(effectiveDate.toISOString()).all();
    for (const p of expiredLoans.results) {
      const originalTeamId = p.loan_from_team_id as string;
      const playerId = p.id as string;
      const loanTeamId = p.team_id as string;
      await env.DB.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL WHERE id = ?")
        .bind(originalTeamId, playerId).run();
      // Close loan contract
      await env.DB.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_end' WHERE player_id = ? AND team_id = ? AND join_type = 'loan' AND is_active = 1")
        .bind(now.toISOString(), playerId, loanTeamId).run().catch((e) => logger.warn({ module: "daily-tick" }, "close loan contract", e));
      logger.info({ module: "daily-tick" }, `loan return: ${p.first_name} ${p.last_name} → team ${originalTeamId}`);
      // News about loan return
      try {
        const { createTransferNews } = await import("../transfers/transfer-news");
        const origTeam = await env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(originalTeamId).first<{ name: string; league_id: string }>();
        const loanTeam = await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(loanTeamId).first<{ name: string }>();
        if (origTeam) {
          await createTransferNews(env.DB, origTeam.league_id ?? "", null, "loan_return", {
            playerName: `${p.first_name} ${p.last_name}`, playerAge: 0,
            playerPosition: "", teamName: origTeam.name, fromTeamName: loanTeam?.name,
          });
        }
      } catch (e) { logger.warn({ module: "daily-tick" }, "createTransferNews loan_return", e); }
    }
    if (expiredLoans.results.length > 0) {
      events.push({ type: "loan_return", description: `${expiredLoans.results.length} hráčů se vrátilo z hostování` });
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "loan return check failed", e);
  }

  // Celebrity spawn moved to match tick (index.ts) to avoid D1 query limit in daily tick

  // ── Transfer expiry cleanup ──
  // transfer_offers expirují v transfer pressure ticku (transfers/transfer-pressure-tick.ts),
  // kde se řeší i dopad na morálku hráče, který o přestup stál.
  try {
    // transfer_listings mají expiraci zapsanou v reálném čase (game.ts) → reálné now.
    await env.DB.prepare("UPDATE transfer_listings SET status = 'expired' WHERE status = 'active' AND expires_at < ?")
      .bind(now.toISOString()).run();
    // player_offers + coach_interviews mají expiraci v HERNÍM čase → herní datum,
    // jinak při offsetu nabídky expirují okamžitě/nikdy (stejný vzor jako petice).
    await env.DB.prepare("UPDATE player_offers SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .bind(effectiveDate.toISOString()).run();
    await env.DB.prepare("UPDATE coach_interviews SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .bind(effectiveDate.toISOString()).run()
      .catch((e) => logger.warn({ module: "daily-tick" }, "expire coach_interviews", e));
    await env.DB.prepare("UPDATE transfer_bids SET status = 'withdrawn' WHERE status = 'pending' AND listing_id IN (SELECT id FROM transfer_listings WHERE status != 'active')")
      .run().catch((e) => logger.warn({ module: "daily-tick" }, "withdraw bids for expired listings", e));
  } catch (e) {
    logger.error({ module: "daily-tick" }, "transfer expiry failed", e);
  }

  // ── Expirace inzerátů v bazaru vybavení ──
  // Reálný čas jako u transfer_listings — expires_at zapisuje equipment-market.ts
  // reálným Date. Vybavení se NEVRACÍ: prodávající ho celou dobu měl a používal,
  // inzerát byl jen nabídka. Stačí tedy zavřít status a dát vědět.
  try {
    const expiring = await env.DB.prepare(
      `SELECT el.id, el.team_id, el.category, el.level, el.price
         FROM equipment_listings el JOIN teams t ON el.team_id = t.id
        WHERE el.status = 'active' AND el.expires_at < ? AND t.user_id != 'ai'
        LIMIT 50`
    ).bind(now.toISOString()).all<{ id: string; team_id: string; category: string; level: number; price: number }>()
      .catch((e) => { logger.warn({ module: "daily-tick" }, "fetch expiring equipment listings", e); return { results: [] }; });

    await env.DB.prepare("UPDATE equipment_listings SET status = 'expired', resolved_at = ? WHERE status = 'active' AND expires_at < ?")
      .bind(now.toISOString(), now.toISOString()).run();

    if (expiring.results.length > 0) {
      const { CATEGORY_LABELS } = await import("../equipment/equipment-generator");
      const { sendSystemSMS } = await import("../messaging/system-sms");
      for (const listing of expiring.results) {
        const label = CATEGORY_LABELS[listing.category] ?? listing.category;
        await sendSystemSMS(env.DB, listing.team_id, "Kustod",
          `📦 Inzerát na ${label} (úroveň ${listing.level}) vypršel — za ${listing.price.toLocaleString("cs")} Kč se nikdo neozval. Zkus jít s cenou dolů, nebo to vem do zastavárny.`)
          .catch((e) => logger.warn({ module: "daily-tick" }, "sms expired equipment listing", e));
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "equipment listing expiry failed", e);
  }

  // ── Nabídky vybavení od AI klubů ──
  // Až po expiraci, ať se doplňuje podle skutečného počtu živých nabídek.
  try {
    const { generateAiEquipmentListings } = await import("../equipment/ai-listings");
    const created = await generateAiEquipmentListings(env.DB, now);
    if (created > 0) logger.info({ module: "daily-tick" }, `bazar vybavení: ${created} nových AI nabídek`);
  } catch (e) {
    logger.error({ module: "daily-tick" }, "ai equipment listings failed", e);
  }

  // ── Normalize all leagues to max game_date ──
  // Prevents permanent date offset if leagues were initialized at different times.
  try {
    const leagueDates = await env.DB.prepare(
      "SELECT league_id, MAX(game_date) as max_date FROM teams WHERE league_id IS NOT NULL AND game_date IS NOT NULL GROUP BY league_id"
    ).all<{ league_id: string; max_date: string }>().catch((e) => { logger.warn({ module: "daily-tick" }, "league dates query", e); return { results: [] }; });
    if (leagueDates.results.length > 1) {
      const maxDate = leagueDates.results.map((r) => r.max_date).reduce((a, b) => (a > b ? a : b));
      for (const row of leagueDates.results) {
        if (row.max_date < maxDate) {
          await env.DB.prepare("UPDATE teams SET game_date = ? WHERE league_id = ?")
            .bind(maxDate, row.league_id).run()
            .catch((e) => logger.warn({ module: "daily-tick" }, "normalize league game_date", e));
          logger.info({ module: "daily-tick" }, `normalized league ${row.league_id} from ${row.max_date} to ${maxDate}`);
        }
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "league game_date normalization failed", e);
  }

  // ── Fanbase snapshots + bus streak break ─────────────────────────────────
  // Per team UPSERT do fanbase_snapshots + decay casual_count u obcí, kde nebyl bus
  // už 3+ home zápasy v řadě.
  try {
    const fbTeams = await env.DB.prepare(
      `SELECT t.id as team_id, t.reputation, t.game_date,
              tf.hardcore_count + COALESCE((SELECT SUM(hardcore_count) FROM bus_satellite_fans WHERE team_id = t.id), 0) as hardcore_count,
              tf.regular_count + COALESCE((SELECT SUM(regular_count) FROM bus_satellite_fans WHERE team_id = t.id), 0) as regular_count,
              tf.casual_count + COALESCE(tf.promo_casual_count, 0) + COALESCE((SELECT SUM(casual_count) FROM bus_satellite_fans WHERE team_id = t.id), 0) as casual_count,
              f.satisfaction
       FROM teams t
       LEFT JOIN team_fanbase tf ON tf.team_id = t.id
       LEFT JOIN fans f ON f.team_id = t.id
       WHERE t.user_id != 'ai' AND tf.team_id IS NOT NULL`,
    )
      .all<{
        team_id: string;
        reputation: number;
        game_date: string | null;
        hardcore_count: number;
        regular_count: number;
        casual_count: number;
        satisfaction: number | null;
      }>()
      .catch((e) => {
        logger.warn({ module: "daily-tick" }, "load fanbase teams for snapshot", e);
        return { results: [] as never[] };
      });

    for (const t of fbTeams.results) {
      const gamedate = t.game_date ?? now.toISOString();
      const totalLoyal = t.hardcore_count + t.regular_count + t.casual_count;
      await env.DB.prepare(
        `INSERT INTO fanbase_snapshots
           (id, team_id, gamedate, hardcore_total, regular_total, casual_total,
            total_loyal, reputation_at_time, satisfaction_at_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(team_id, gamedate) DO UPDATE SET
           hardcore_total = excluded.hardcore_total,
           regular_total = excluded.regular_total,
           casual_total = excluded.casual_total,
           total_loyal = excluded.total_loyal,
           reputation_at_time = excluded.reputation_at_time,
           satisfaction_at_time = excluded.satisfaction_at_time`,
      )
        .bind(
          crypto.randomUUID(),
          t.team_id,
          gamedate,
          t.hardcore_count,
          t.regular_count,
          t.casual_count,
          totalLoyal,
          t.reputation,
          t.satisfaction,
        )
        .run()
        .catch((e) => {
          logger.warn({ module: "daily-tick" }, "upsert fanbase snapshot", e);
        });
    }

    // Bus streak break: pro obce kde 3+ home zápasy bez busu po dříve aktivní řadě
    const { BUS_CONFIG } = await import("./fanbase-config");
    const staleSatellites = await env.DB.prepare(
      `SELECT bsf.id, bsf.team_id, bsf.village_id, bsf.casual_count, bsf.consecutive_buses, bsf.last_bus_match_id, v.name as village_name
       FROM bus_satellite_fans bsf
       JOIN villages v ON bsf.village_id = v.id
       WHERE bsf.consecutive_buses >= 3`,
    )
      .all<{
        id: string;
        team_id: string;
        village_id: string;
        casual_count: number;
        consecutive_buses: number;
        last_bus_match_id: string | null;
        village_name: string;
      }>()
      .catch((e) => {
        logger.warn({ module: "daily-tick" }, "load stale satellites", e);
        return { results: [] as never[] };
      });

    for (const s of staleSatellites.results) {
      // Zjisti počet home zápasů (status='simulated') daného týmu PO last_bus_match_id
      if (!s.last_bus_match_id) continue;
      const simulatedAfter = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM matches m1
         WHERE m1.home_team_id = ? AND m1.status = 'simulated'
           AND m1.simulated_at > (SELECT simulated_at FROM matches WHERE id = ?)`,
      )
        .bind(s.team_id, s.last_bus_match_id)
        .first<{ cnt: number }>()
        .catch((e) => {
          logger.warn(
            { module: "daily-tick" },
            "count home matches without bus",
            e,
          );
          return null;
        });
      const matchesWithoutBus = simulatedAfter?.cnt ?? 0;
      if (matchesWithoutBus >= BUS_CONFIG.STREAK_BREAK_AFTER && s.casual_count > 0) {
        const lost = Math.floor(s.casual_count * BUS_CONFIG.STREAK_BREAK_DECAY);
        if (lost > 0) {
          await env.DB.prepare(
            `UPDATE bus_satellite_fans
             SET casual_count = MAX(0, casual_count - ?), consecutive_buses = 0,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(lost, s.id)
            .run()
            .catch((e) => {
              logger.warn(
                { module: "daily-tick" },
                "decay satellite casual",
                e,
              );
            });
          logger.info(
            { module: "daily-tick", teamId: s.team_id },
            `bus streak break: ${s.village_name} ztratil ${lost} casual fans (${matchesWithoutBus} home zápasů bez busu)`,
          );
        }
      }
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "fanbase snapshot + streak break failed", e);
  }

  const duration = ((Date.now() - tickStart) / 1000).toFixed(1);
  logger.info({ module: "daily-tick" }, `DONE events=${events.length} duration=${duration}s`);
  return { date: now.toISOString(), dayOfWeek, isTrainingDay, events };
}
