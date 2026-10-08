/**
 * Váha v čase a růst dorostu (postava, část 2).
 * Spec: docs/superpowers/specs/2026-10-08-player-body-drift-design.md
 *
 * Váha se denně hýbe podle toho, co hráč dělal: hospoda přidává, trénink ubírá, zranění přidává
 * a tělo táhne zpátky k přirozené váze podle postavy a věku. Přes léto se posune podle chování,
 * dorost do 18 let roste. Z váhy pak část 1 (generators/physicals.ts) počítá úpravy vlastností.
 */

import type { Rng } from "../generators/rng";
import { createRng } from "../generators/rng";
import { BODY_WEIGHT_FACTOR, idealWeight, isBodyType } from "../generators/physicals";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";

/** Jakou část rozdílu k přirozené váze tělo za den srovná. */
const NATURAL_PULL = 0.006;
/** Večer v hospodě, násobí se (0,5 + alkohol / 100). */
const PUB_VISIT_KG = 0.08;
const TRAINING_KG = -0.03;
const CONDITIONING_KG = -0.07;
const INJURED_KG = 0.03;
const MIN_WEIGHT = 50;
const MAX_WEIGHT = 140;
/** Od kolika let přirozená váha roste a o kolik za rok. */
const AGE_GAIN_FROM = 28;
const AGE_GAIN_PER_YEAR = 0.005;
const SUMMER_CAP = 3;
/** Nárůst za ~4 týdny, od kterého štáb napíše SMS, a pauza mezi SMS o stejném hráči. */
export const WEIGHT_ALERT_KG = 3;
const WEIGHT_SMS_COOLDOWN_DAYS = 30;

export type TrainingToday = "conditioning" | "other" | null;
export type SummerEvent = "fit" | "rusty" | "injury" | null;
export type WeightSmsCause = "pub" | "idle" | "injury";

export interface DailyBodyInput {
  weight: number;
  /** Přirozená váha, null = chybí výška nebo postava, tělo pak netáhne nikam. */
  natural: number | null;
  pubVisit: boolean;
  alcohol: number;
  training: TrainingToday;
  injured: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Přirozená váha: ideál podle výšky × postava, od 28 let mírně roste. */
export function naturalWeight(heightCm: unknown, bodyType: unknown, age: number): number | null {
  if (typeof heightCm !== "number" || !(heightCm > 0) || !isBodyType(bodyType)) return null;
  const ageMul = 1 + Math.max(0, age - AGE_GAIN_FROM) * AGE_GAIN_PER_YEAR;
  return idealWeight(heightCm) * BODY_WEIGHT_FACTOR[bodyType] * ageMul;
}

/** Změna váhy za jeden herní den (kg, nezaokrouhlená). */
export function dailyWeightChange(input: DailyBodyInput): number {
  let change = input.natural === null ? 0 : NATURAL_PULL * (input.natural - input.weight);
  if (input.pubVisit) change += PUB_VISIT_KG * (0.5 + input.alcohol / 100);
  if (input.training === "conditioning") change += CONDITIONING_KG;
  else if (input.training === "other") change += TRAINING_KG;
  if (input.injured) change += INJURED_KG;
  return change;
}

/** Nová váha: na setiny kg, v rozsahu 50–140. */
export function applyDailyWeight(weight: number, change: number): number {
  return round2(Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weight + change)));
}

/** Změna váhy přes léto podle chování a letního příběhu, nejvýš ±3 kg. */
export function summerWeightChange(input: { alcohol: number; age: number; event: SummerEvent }): number {
  let change = 1;
  if (input.alcohol > 60) change += 1;
  if (input.age >= 30) change += 0.5;
  if (input.event === "fit") change -= 2.5;
  else if (input.event === "rusty" || input.event === "injury") change += 1;
  return Math.max(-SUMMER_CAP, Math.min(SUMMER_CAP, change));
}

/** O kolik cm hráč vyroste, když dosáhne věku `newAge`. */
export function youthGrowthCm(rng: Rng, newAge: number): number {
  if (newAge <= 17) return rng.int(2, 4);
  if (newAge === 18) return rng.int(1, 2);
  return 0;
}

/** Váha po růstu se stejným BMI. */
export function grownWeight(weight: number, oldHeightCm: number, newHeightCm: number): number {
  return round2(weight * (newHeightCm / oldHeightCm) ** 2);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86400000);
}

/**
 * Změna proti záznamu nejbližšímu 28 dnům zpět, bere se jen záznam starý `minDays`–`maxDays` dní.
 * Na desetiny kg, null bez vhodného záznamu.
 */
export function weightTrend(
  current: number,
  entries: ReadonlyArray<{ gameDate: string; weight: number }>,
  today: string,
  minDays = 14,
  maxDays = 42,
): number | null {
  let best: { weight: number; distance: number } | null = null;
  for (const e of entries) {
    const age = daysBetween(e.gameDate, today);
    if (age < minDays || age > maxDays) continue;
    const distance = Math.abs(age - 28);
    if (!best || distance < best.distance) best = { weight: e.weight, distance };
  }
  return best ? round1(current - best.weight) : null;
}

/** Má štáb poslat SMS? Nárůst aspoň 3 kg a od poslední takové SMS aspoň 30 dní. */
export function weightAlertDue(input: { gain: number | null; lastSmsAt: string | null; today: string }): boolean {
  if (input.gain === null || input.gain < WEIGHT_ALERT_KG) return false;
  return !input.lastSmsAt || daysBetween(input.lastSmsAt, input.today) >= WEIGHT_SMS_COOLDOWN_DAYS;
}

/** Hlavní příčina přibírání pro text SMS. */
export function weightSmsCause(input: { injured: boolean; pubVisits28d: number }): WeightSmsCause {
  if (input.injured) return "injury";
  if (input.pubVisits28d >= 6) return "pub";
  return "idle";
}

const WEIGHT_SMS_TEXTS: Record<WeightSmsCause, string[]> = {
  pub: [
    "Trenére, {name} za poslední měsíc přibral {kg} kg. V hospodě sedí skoro každý večer a na tréninku pak funí.",
    "{name} je o {kg} kg těžší než před měsícem. Štamgast U Pralesa, to je na něm vidět.",
    "Trenére, {name} nabral za měsíc {kg} kg. Pivo mu chutná víc než běhání, chtělo by to s ním promluvit.",
  ],
  idle: [
    "{name} přibral za měsíc {kg} kg. Na tréninky skoro nechodí a je to na něm vidět.",
    "Trenére, {name} má za poslední měsíc {kg} kg navíc. Kdo netrénuje, ten roste do šířky.",
    "{name} je o {kg} kg těžší. Tréninky vynechává a v souboji už nestíhá.",
  ],
  injury: [
    "{name} je po zranění o {kg} kg těžší. Až se dá dohromady, chtělo by to s ním zabrat.",
    "Trenére, {name} za měsíc na marodce přibral {kg} kg. Po návratu ho čeká pořádná dřina.",
    "{name} sedí doma se zraněním a nabral {kg} kg. Hlídejte mu to, ať se vrátí v kondici.",
  ],
};

/** Text SMS od štábu o přibírání. Kila s desetinnou čárkou. */
export function weightSmsText(rng: Rng, cause: WeightSmsCause, name: string, kg: number): string {
  const template = rng.pick(WEIGHT_SMS_TEXTS[cause]);
  return template.replace("{name}", name).replace("{kg}", kg.toFixed(1).replace(".", ","));
}

// ── Orchestrace nad D1 ──────────────────────────────────────────────────────────

const M = "body-drift";

function parseJson(raw: unknown, what: string, playerId: string): Record<string, unknown> | null {
  try {
    return raw ? JSON.parse(raw as string) as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, playerId }, `parse ${what}`, e);
    return null;
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function shiftDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DriftPlayerRow {
  id: string; team_id: string; first_name: string; last_name: string; age: number;
  physical: string | null; personality: string | null; life_context: string | null;
}

/**
 * Denní změna váhy hráčů týmů, které denní tick trénuje. Volá se po vygenerování dnešní
 * hospody. V pondělí navíc týdenní záznam do `weight_log`, úklid záznamů starších než rok
 * a SMS od štábu o hráčích, kteří za ~4 týdny přibrali 3 kg a víc.
 */
export async function processDailyBodyDrift(
  db: D1Database,
  opts: { teamIds: readonly string[]; trainedToday: ReadonlyMap<string, "conditioning" | "other">; gameDate: string; isMonday: boolean },
): Promise<{ updated: number; logged: number; sms: number }> {
  const result = { updated: 0, logged: 0, sms: 0 };
  if (opts.teamIds.length === 0) return result;
  const gameDate = opts.gameDate.slice(0, 10);

  for (const teamIds of chunks(opts.teamIds, 40)) {
    const ph = teamIds.map(() => "?").join(",");
    const players = await db.prepare(
      `SELECT id, team_id, first_name, last_name, age, physical, personality, life_context FROM players
        WHERE team_id IN (${ph}) AND (status IS NULL OR status = 'active')`,
    ).bind(...teamIds).all<DriftPlayerRow>()
      .catch((e) => { logger.warn({ module: M }, "load players", e); return { results: [] as DriftPlayerRow[] }; });

    const pubToday = new Set<string>();
    const pubRows = await db.prepare(`SELECT attendees FROM pub_sessions WHERE game_date = ? AND team_id IN (${ph})`)
      .bind(gameDate, ...teamIds).all<{ attendees: string }>()
      .catch((e) => { logger.warn({ module: M }, "load pub sessions", e); return { results: [] as { attendees: string }[] }; });
    for (const r of pubRows.results) {
      try {
        for (const a of JSON.parse(r.attendees) as Array<{ playerId?: string }>) if (a.playerId) pubToday.add(a.playerId);
      } catch (e) {
        logger.warn({ module: M }, "parse pub attendees", e);
      }
    }

    const injuredRows = await db.prepare(
      `SELECT DISTINCT player_id FROM injuries WHERE days_remaining > 0 AND COALESCE(osobni_volno, 0) = 0 AND team_id IN (${ph})`,
    ).bind(...teamIds).all<{ player_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "load injuries", e); return { results: [] as { player_id: string }[] }; });
    const injured = new Set(injuredRows.results.map((r) => r.player_id));

    const updates: D1PreparedStatement[] = [];
    const newWeights = new Map<string, number>();
    for (const p of players.results) {
      const physical = parseJson(p.physical, "physical", p.id);
      const personality = parseJson(p.personality, "personality", p.id);
      if (!physical || !personality) continue;
      const weight = physical.weight;
      if (typeof weight !== "number" || !(weight > 0)) continue;
      const alcohol = typeof personality.alcohol === "number" ? personality.alcohol : 30;
      const next = applyDailyWeight(weight, dailyWeightChange({
        weight,
        natural: naturalWeight(physical.height, physical.bodyType, p.age ?? 25),
        pubVisit: pubToday.has(p.id),
        alcohol,
        training: opts.trainedToday.get(p.id) ?? null,
        injured: injured.has(p.id),
      }));
      newWeights.set(p.id, next);
      if (next !== weight) {
        updates.push(db.prepare("UPDATE players SET physical = json_set(physical, '$.weight', ?) WHERE id = ?").bind(next, p.id));
      }
    }
    for (const batch of chunks(updates, 100)) {
      await db.batch(batch).then(() => { result.updated += batch.length; })
        .catch((e) => logger.warn({ module: M }, "update weights", e));
    }

    if (!opts.isMonday) continue;

    const logs: D1PreparedStatement[] = [];
    for (const p of players.results) {
      const w = newWeights.get(p.id);
      if (w === undefined) continue;
      logs.push(db.prepare(
        `INSERT INTO weight_log (player_id, team_id, game_date, weight, source)
         SELECT ?1, ?2, ?3, ?4, 'weekly'
          WHERE NOT EXISTS (SELECT 1 FROM weight_log WHERE player_id = ?1 AND game_date = ?3 AND source = 'weekly')`,
      ).bind(p.id, p.team_id, gameDate, w));
    }
    for (const batch of chunks(logs, 100)) {
      await db.batch(batch).then((rs) => { result.logged += rs.reduce((s, r) => s + (r.meta?.changes ?? 0), 0); })
        .catch((e) => logger.warn({ module: M }, "insert weight log", e));
    }
    await db.prepare(`DELETE FROM weight_log WHERE game_date < ? AND team_id IN (${ph})`)
      .bind(shiftDate(gameDate, -365), ...teamIds).run()
      .catch((e) => logger.warn({ module: M }, "prune weight log", e));

    result.sms += await sendWeightAlerts(db, players.results, newWeights, injured, gameDate, ph, teamIds);
  }
  return result;
}

async function sendWeightAlerts(
  db: D1Database,
  players: readonly DriftPlayerRow[],
  newWeights: ReadonlyMap<string, number>,
  injured: ReadonlySet<string>,
  gameDate: string,
  ph: string,
  teamIds: readonly string[],
): Promise<number> {
  const history = await db.prepare(
    `SELECT player_id, game_date, weight FROM weight_log WHERE team_id IN (${ph}) AND game_date BETWEEN ? AND ?`,
  ).bind(...teamIds, shiftDate(gameDate, -35), shiftDate(gameDate, -21)).all<{ player_id: string; game_date: string; weight: number }>()
    .catch((e) => { logger.warn({ module: M }, "load weight history", e); return { results: [] as { player_id: string; game_date: string; weight: number }[] }; });
  const byPlayer = new Map<string, { gameDate: string; weight: number }[]>();
  for (const h of history.results) {
    const list = byPlayer.get(h.player_id) ?? [];
    list.push({ gameDate: h.game_date, weight: h.weight });
    byPlayer.set(h.player_id, list);
  }

  let sent = 0;
  for (const p of players) {
    const current = newWeights.get(p.id);
    const entries = byPlayer.get(p.id);
    if (current === undefined || !entries) continue;
    const lifeContext = parseJson(p.life_context, "life_context", p.id);
    if (!lifeContext) continue;
    const gain = weightTrend(current, entries, gameDate, 21, 35);
    const lastSmsAt = typeof lifeContext.weightSmsAt === "string" ? lifeContext.weightSmsAt : null;
    if (!weightAlertDue({ gain, lastSmsAt, today: gameDate })) continue;

    const team = await db.prepare("SELECT team_type, parent_team_id FROM teams WHERE id = ?").bind(p.team_id)
      .first<{ team_type: string | null; parent_team_id: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "load team", e); return null; });
    const recipient = team?.team_type === "u21" && team.parent_team_id ? team.parent_team_id : p.team_id;
    const roles = await db.prepare("SELECT role FROM staff_members WHERE team_id = ? AND role IN ('kondicni_trener', 'maser')")
      .bind(recipient).all<{ role: string }>()
      .catch((e) => { logger.warn({ module: M }, "load staff", e); return { results: [] as { role: string }[] }; });
    const hasRole = (r: string) => roles.results.some((x) => x.role === r);
    const sender = hasRole("kondicni_trener") ? "Kondiční trenér" : hasRole("maser") ? "Masér" : "Kapitán";

    const pubRows = await db.prepare("SELECT attendees FROM pub_sessions WHERE team_id = ? AND game_date > ?")
      .bind(p.team_id, shiftDate(gameDate, -28)).all<{ attendees: string }>()
      .catch((e) => { logger.warn({ module: M }, "load pub history", e); return { results: [] as { attendees: string }[] }; });
    let pubVisits28d = 0;
    for (const r of pubRows.results) {
      try {
        if ((JSON.parse(r.attendees) as Array<{ playerId?: string }>).some((a) => a.playerId === p.id)) pubVisits28d++;
      } catch (e) {
        logger.warn({ module: M }, "parse pub history", e);
      }
    }

    const rng = createRng(seedFromString(`${p.id}:${gameDate}:weight-sms`));
    const text = weightSmsText(rng, weightSmsCause({ injured: injured.has(p.id), pubVisits28d }), `${p.first_name} ${p.last_name}`, gain!);
    await sendSystemSMS(db, recipient, sender, text);
    await db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.weightSmsAt', ?) WHERE id = ?")
      .bind(gameDate, p.id).run()
      .catch((e) => logger.warn({ module: M }, "mark weight sms", e));
    sent++;
  }
  return sent;
}

/**
 * Zápisy změny váhy přes léto pro kádr jednoho týmu (letní souhrn, jednou za sezónu).
 * Vrací příkazy, volající je provede dávkou spolu s ostatními letními efekty.
 */
export function summerWeightStatements(
  db: D1Database,
  input: {
    teamId: string;
    gameDate: string;
    players: ReadonlyArray<{ id: string; age: number; alcohol: number; weight: number | null }>;
    events: ReadonlyMap<string, SummerEvent>;
  },
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const p of input.players) {
    if (p.weight === null || !(p.weight > 0)) continue;
    const next = applyDailyWeight(p.weight, summerWeightChange({ alcohol: p.alcohol, age: p.age, event: input.events.get(p.id) ?? null }));
    stmts.push(
      db.prepare("UPDATE players SET physical = json_set(physical, '$.weight', ?) WHERE id = ?").bind(next, p.id),
      db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES (?, ?, ?, ?, 'summer')")
        .bind(p.id, input.teamId, input.gameDate.slice(0, 10), next),
    );
  }
  return stmts;
}

/**
 * Růst dorostu po zestárnutí na konci sezóny: do 18 let výška roste, váha se stejným BMI.
 * Volá se hned za dospíváním (`dospejMladeHrace`). Vrací počet hráčů, kteří vyrostli.
 */
export async function growYoungPlayers(db: D1Database, teamId: string, gameDate: string): Promise<number> {
  const rows = await db.prepare(
    "SELECT id, age, physical FROM players WHERE team_id = ? AND age <= 18 AND (status IS NULL OR status = 'active')",
  ).bind(teamId).all<{ id: string; age: number; physical: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load young players", e); return { results: [] as { id: string; age: number; physical: string | null }[] }; });

  const stmts: D1PreparedStatement[] = [];
  let grown = 0;
  for (const r of rows.results) {
    const physical = parseJson(r.physical, "physical", r.id);
    if (!physical) continue;
    const height = physical.height;
    if (typeof height !== "number" || !(height > 0)) continue;
    const cm = youthGrowthCm(createRng(seedFromString(`${r.id}:growth:${r.age}`)), r.age);
    if (cm === 0) continue;
    const newHeight = height + cm;
    const weight = typeof physical.weight === "number" && physical.weight > 0 ? grownWeight(physical.weight, height, newHeight) : null;
    stmts.push(weight === null
      ? db.prepare("UPDATE players SET physical = json_set(physical, '$.height', ?) WHERE id = ?").bind(newHeight, r.id)
      : db.prepare("UPDATE players SET physical = json_set(physical, '$.height', ?, '$.weight', ?) WHERE id = ?").bind(newHeight, weight, r.id));
    if (weight !== null) {
      stmts.push(db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES (?, ?, ?, ?, 'growth')")
        .bind(r.id, teamId, gameDate.slice(0, 10), weight));
    }
    grown++;
  }
  for (const batch of chunks(stmts, 100)) {
    await db.batch(batch).catch((e) => logger.warn({ module: M, teamId }, "apply youth growth", e));
  }
  return grown;
}
