/**
 * Random life events — náhodné drobné události ze života vesnice ovlivňující kondici.
 * Aplikují se v daily-tick s ~2% šancí per hráč (po cooldown checku).
 */

import { logConditionStmt } from "../lib/condition-log";
import { logger } from "../lib/logger";

interface LifeEvent {
  description: string;
  /** Range [min, max] inclusive — final delta = randInt(min, max). Záporné = drain, kladné = boost. */
  range: [number, number];
  /** Vyšší = častěji vybráno z poolu. Default 1. */
  weight?: number;
}

const EVENT_POOL: LifeEvent[] = [
  // ── Drsné (vážné) ──
  { description: "Spadl z vlastního traktoru, lámou ho záda", range: [-18, -12] },
  { description: "Probruslil noc s holkou z města", range: [-15, -10] },
  { description: "Zkoušel sníst 2 kg ovaru na sázku", range: [-14, -10] },
  { description: "Pomáhal sousedovi se stěhováním pianína", range: [-10, -6] },
  { description: "Spadl z žebříku při natírání plotu", range: [-12, -8] },
  { description: "Sekal trávu celý den, srpen, 32 °C", range: [-10, -6] },
  { description: "Zkoušel novou pizzu z benzinky, není mu dobře", range: [-12, -7] },
  { description: "Tahal pivo do hospody pro kámoše", range: [-8, -4] },
  { description: "Šel pěšky 10 km do okresního města", range: [-9, -5] },
  { description: "Pojídal klobásy na zabíjačce u Pepy", range: [-10, -5] },
  { description: "Hrál karty s chlapama do tří do rána", range: [-12, -7] },

  // ── Běžné (drobné) ──
  { description: "Naštípal dříví na zimu", range: [-6, -3], weight: 2 },
  { description: "Pomohl mámě v zahradě", range: [-5, -2], weight: 2 },
  { description: "Spravoval auto, ulil se v garáži", range: [-4, -2], weight: 2 },
  { description: "Sekal seno za vsí", range: [-7, -4], weight: 2 },
  { description: "Měl na vesnici pohřeb, dlouhé stání", range: [-6, -3] },

  // ── Pozitivní (vesnické zázraky) ──
  { description: "Babička udělala vepřové se zelím", range: [5, 9], weight: 2 },
  { description: "Vyhrál tombolu na vesnickém plese", range: [3, 6], weight: 2 },
  { description: "Jel na ryby — celý den klid", range: [7, 12] },
  { description: "Manželka odjela k matce, pohoda doma", range: [5, 8] },
  { description: "Zaspal a vyspal se 12 hodin v kuse", range: [6, 10] },
  { description: "Dostal v práci nečekanou prémii", range: [4, 7] },
  { description: "Pomohl vesnickému zvěrolékaři, dostal hovězí", range: [4, 8] },
  { description: "Strejda mu nechal na chatě, fakt si oddechl", range: [6, 10] },

  // ── Vtipné neutrální / mírně záporné ──
  { description: "V lese se ztratil, ale našel hřiby", range: [-3, 2], weight: 2 },
  { description: "Šel na rybu, neulovil nic, ale vychladil pivo", range: [-2, 3], weight: 2 },
  { description: "Pomohl babičce přejít přes silnici, ona ho pak hodinu zdržovala", range: [-4, -1], weight: 2 },
];

function pickWeighted<T extends { weight?: number }>(items: T[], rand: () => number): T {
  const totalWeight = items.reduce((sum, it) => sum + (it.weight ?? 1), 0);
  let roll = rand() * totalWeight;
  for (const it of items) {
    roll -= it.weight ?? 1;
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Aplikuje random life events v rámci daily-tick.
 * Pravidla:
 * - Per hráč 2% šance dostat event
 * - Cooldown 5 dní (pokud hráč v posledních 5 dnech měl source='event' v condition_log, skip)
 * - Hráči zranění/suspendovaní jsou OK pro events (klidně se může dostat domu)
 *
 * Volá se POUZE z daily-tick.ts, který je idempotentní per herní den.
 */
export async function applyRandomLifeEvents(db: D1Database): Promise<{ applied: number }> {
  // Načteme jen aktivní hráče lidských týmů (AI týmů je zbytečné fluffovat)
  const players = await db.prepare(
    `SELECT p.id, p.team_id, p.first_name, p.last_name, json_extract(p.life_context, '$.condition') as cond
     FROM players p JOIN teams t ON p.team_id = t.id
     WHERE (p.status IS NULL OR p.status = 'active') AND t.user_id != 'ai'`,
  ).all<{ id: string; team_id: string; first_name: string; last_name: string; cond: number }>()
    .catch((e) => { logger.warn({ module: "random-events" }, "load players", e); return { results: [] }; });

  if (players.results.length === 0) return { applied: 0 };

  // Player IDs s eventem v posledních 5 dnech (cooldown)
  const playerIds = players.results.map((p) => p.id);
  const placeholders = playerIds.map(() => "?").join(",");
  const recentEvents = await db.prepare(
    `SELECT DISTINCT player_id FROM condition_log
     WHERE source = 'event' AND created_at >= datetime('now', '-5 days')
       AND player_id IN (${placeholders})`,
  ).bind(...playerIds).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: "random-events" }, "load recent events", e); return { results: [] }; });
  const onCooldown = new Set(recentEvents.results.map((r) => r.player_id));

  const stmts: D1PreparedStatement[] = [];
  let applied = 0;

  for (const p of players.results) {
    if (onCooldown.has(p.id)) continue;
    if (Math.random() >= 0.02) continue; // 2 % per den per hráč

    const event = pickWeighted(EVENT_POOL, Math.random);
    const [min, max] = event.range;
    const delta = Math.floor(Math.random() * (max - min + 1)) + min;
    if (delta === 0) continue; // dej tomu šanci dál

    const oldCond = p.cond ?? 100;
    const newCond = Math.max(5, Math.min(100, oldCond + delta));
    const realDelta = newCond - oldCond;
    if (realDelta === 0) continue;

    stmts.push(db.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
    ).bind(newCond, p.id));
    stmts.push(logConditionStmt(db, p.id, p.team_id, oldCond, newCond, "event", event.description));
    applied++;
  }

  if (stmts.length > 0) {
    await db.batch(stmts).catch((e) => logger.error({ module: "random-events" }, "batch apply events", e));
  }

  logger.info({ module: "random-events" }, `applied ${applied} random events (${players.results.length} players, ${onCooldown.size} on cooldown)`);
  return { applied };
}
