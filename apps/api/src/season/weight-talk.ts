/**
 * Domluva o váze přes SMS (postava, část 3; spec docs/superpowers/specs/2026-10-08-player-body-levers-design.md).
 *
 * Trenér hráči napíše do telefonu. Když řeší jeho váhu a hráč má nadváhu nebo přibírá,
 * rozhodne se výsledek tady, deterministicky a bez ohledu na AI: hráč buď slíbí, že dva týdny
 * omezí hospodu, nebo se urazí. AI pak jen odpoví podle výsledku (pokyn v promptu).
 */

import { createRng } from "../generators/rng";
import { playerBodyView } from "../generators/physicals";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { weightTrend } from "./body-drift";

const M = "weight-talk";
const PLEDGE_DAYS = 14;
const TALK_COOLDOWN_DAYS = 14;
const REFUSED_MORALE = 5;
/** Kdo za měsíc přibral aspoň tolik, s tím se o váze dá mluvit i bez nadváhy. */
const TREND_TO_TALK_KG = 1.5;

export type WeightTalkOutcome = "pledge" | "refused";

const WEIGHT_PATTERNS: RegExp[] = [
  /hubn/, /\bvah(a|y|u|ou)\b/, /\bvazi/, /\bkil(o|a|u|ama)?\b/, /bric?h|bris/, /tlust|tloust/, /nadvah/,
  /\bpiv/, /hospod/, /jidelni/, /\bdiet/,
];

/** Řeší trenér v textu váhu, hospodu nebo pivo? Bez diakritiky i s ní. */
export function detectWeightTalk(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return WEIGHT_PATTERNS.some((re) => re.test(normalized));
}

/** Šance, že hráč slíbí: disciplína a nálada pomáhají, vznětlivost škodí. 0,1–0,9. */
export function weightPledgeChance(discipline: number, morale: number, temper: number): number {
  const chance = 0.3 + discipline / 200 + (morale - 50) / 200 - (temper - 50) / 200;
  return Math.max(0.1, Math.min(0.9, chance));
}

/** Pokyn do promptu odpovědi hráče, aby odpověděl podle výsledku. */
export function weightTalkPrompt(outcome: WeightTalkOutcome): string {
  return outcome === "pledge"
    ? "TRENÉR TĚ ŘEŠÍ KVŮLI VÁZE: slíbil jsi mu, že dva týdny omezíš hospodu a pivo a budeš na sobě makat. Odpověz svými slovy, že to bereš vážně."
    : "TRENÉR TĚ ŘEŠÍ KVŮLI VÁZE a tebe to urazilo. Odpověz dotčeně, že tvoje váha je tvoje věc. Nebuď sprostý.";
}

function shiftDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parse(raw: string | null, what: string, playerId: string): Record<string, unknown> | null {
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, playerId }, `parse ${what}`, e);
    return null;
  }
}

/**
 * Vyhodnotí zprávu trenéra hráči. Vrací výsledek, nebo `null`, když zpráva o váze není,
 * hráč váhu řešit nepotřebuje, nebo se o ní mluvilo před méně než 14 dny.
 */
export async function handleWeightTalk(
  db: D1Database,
  opts: { teamId: string; convId: string; playerId: string; text: string },
): Promise<WeightTalkOutcome | null> {
  if (!detectWeightTalk(opts.text)) return null;

  // Jen hráč áčka nebo jeho U21. Konverzace zůstává i po přestupu a zpráva o váze nesmí
  // změnit morálku ani slib hráči, který už hraje za jiný klub.
  const row = await db.prepare(
    `SELECT p.physical, p.personality, p.life_context, t.game_date
       FROM players p JOIN teams t ON t.id = ?1
      WHERE p.id = ?2 AND (p.team_id = ?1 OR p.team_id IN (SELECT id FROM teams WHERE parent_team_id = ?1))`,
  ).bind(opts.teamId, opts.playerId).first<{ physical: string | null; personality: string | null; life_context: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load player", e); return null; });
  if (!row?.game_date) return null;
  const today = row.game_date.slice(0, 10);
  const physical = parse(row.physical, "physical", opts.playerId);
  const personality = parse(row.personality, "personality", opts.playerId);
  const lifeContext = parse(row.life_context, "life_context", opts.playerId);
  if (!physical || !personality || !lifeContext) return null;

  const lastTalk = typeof lifeContext.dietTalkAt === "string" ? lifeContext.dietTalkAt : null;
  if (lastTalk && lastTalk > shiftDate(today, -TALK_COOLDOWN_DAYS)) return null;

  const category = playerBodyView(physical).weightCategory;
  let needsTalk = category === "over" || category === "obese";
  if (!needsTalk && typeof physical.weight === "number") {
    const log = await db.prepare("SELECT game_date, weight FROM weight_log WHERE player_id = ? ORDER BY game_date DESC LIMIT 12")
      .bind(opts.playerId).all<{ game_date: string; weight: number }>()
      .catch((e) => { logger.warn({ module: M }, "load weight log", e); return { results: [] as { game_date: string; weight: number }[] }; });
    const trend = weightTrend(physical.weight, log.results.map((r) => ({ gameDate: r.game_date, weight: r.weight })), today);
    needsTalk = trend !== null && trend >= TREND_TO_TALK_KG;
  }
  if (!needsTalk) return null;

  const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  const morale = num(lifeContext.morale, 50);
  const chance = weightPledgeChance(num(personality.discipline, 50), morale, num(personality.temper, 40));
  const outcome: WeightTalkOutcome = createRng(seedFromString(`${opts.playerId}:${today}:weight-talk`)).random() < chance
    ? "pledge" : "refused";

  const update = outcome === "pledge"
    ? db.prepare("UPDATE players SET life_context = json_set(life_context, '$.dietPledgeUntil', ?, '$.dietTalkAt', ?) WHERE id = ?")
      .bind(shiftDate(today, PLEDGE_DAYS), today, opts.playerId)
    : db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?, '$.dietTalkAt', ?) WHERE id = ?")
      .bind(Math.max(0, morale - REFUSED_MORALE), today, opts.playerId);
  const topic = db.prepare(
    `UPDATE conversations SET ai_thread_state = json_set(
        CASE WHEN json_valid(ai_thread_state) THEN ai_thread_state ELSE '{}' END,
        '$.weightTalk', json_object('outcome', ?, 'den', ?))
      WHERE id = ? AND team_id = ?`,
  ).bind(outcome, today, opts.convId, opts.teamId);
  await db.batch([update, topic]).catch((e) => logger.warn({ module: M }, "save weight talk", e));
  return outcome;
}

/** Výsledek dnešní domluvy o váze ze stavu konverzace, jinak `undefined`. */
export function weightTalkFromState(rawState: string | null | undefined, today: string): WeightTalkOutcome | undefined {
  if (!rawState) return undefined;
  try {
    const state = JSON.parse(rawState) as { weightTalk?: { outcome?: string; den?: string } };
    const talk = state.weightTalk;
    if (!talk || talk.den !== today.slice(0, 10)) return undefined;
    return talk.outcome === "pledge" || talk.outcome === "refused" ? talk.outcome : undefined;
  } catch (e) {
    logger.warn({ module: M }, "parse thread state", e);
    return undefined;
  }
}
