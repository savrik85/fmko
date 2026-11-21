/**
 * Šíření „kdo co ví“ po vazbách (spec část 2).
 *
 * Každou hodinu (7–22 h v Praze) může každý, kdo věc ví, předat ji spoluhráči. Šance roste
 * s vazbou (bratr, táta, parťák od piva…), její silou, ukecaností předávajícího a hospodou,
 * kde spolu seděli. Rival nese kritiku dotčenému rád, pochvalu skoro ne. Pochvala a kritika
 * mají stejnou základní šanci (spec, anti-cíl „šíření jako trest za psaní“).
 * Rozhodnutí na úkor se šíří víc, týká se sestavy a mluví se o něm.
 */
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { createRng } from "../generators/rng";
import { learningEffectStmts } from "./effects";
import { knowledgeStmts, loadClubHearsay } from "./store";
import { DAY_MS, SPREAD_WINDOW_DAYS, SPREADABLE_KINDS, type HearsayItem, type HearsayKind, type HearsayKnowledge, type KnowledgeVia } from "./types";

const M = "hearsay-spread";

export interface SpreadPlayer { id: string; temper: number; discipline: number; leadership: number }
export interface SpreadTie { a: string; b: string; type: string; strength: number }
export interface SpreadInput {
  items: HearsayItem[];
  knowledge: HearsayKnowledge[];
  /** Kádr klubu (áčko + U21, aktivní): jen oni věc šíří a jen oni se ji dozvídají. */
  players: SpreadPlayer[];
  ties: SpreadTie[];
  /** „idA|idB“ seřazeně: seděli spolu v hospodě za posledních 24 h. */
  pubPairs: Set<string>;
  /** Hodina běhu „YYYY-MM-DDTHH“ (UTC): součást seedu i čas, od kterého se počítá stáří věci. */
  hourKey: string;
}

/**
 * Kalibrace 2026-11-21 (scripts/hearsay-sim.ts, SMS trenérů z produ 7.–21. 11., 12 klubů):
 * k dotčenému dojde 82 % věcí (pochvaly 89 %, kritiky 77 %), ~0,5 zprávy „slyšel jsem“
 * na klub a týden, strop 2 za den se nenaplní. Četnost zpráv neomezuje šíření, ale to,
 * jak často trenéři o spoluhráčích píšou; HOURLY_BASE proto beze změny.
 */
export const HOURLY_BASE = 0.05;
const KIND_FACTOR: Record<HearsayKind, number> = {
  praise: 1, criticism: 1, decision_for: 1, decision_against: 1.4,
  // Přestup ví všichni hned, nešíří se.
  teammate_left: 0, teammate_arrived: 0,
};
const TIE_FACTOR: Record<string, number> = {
  brothers: 1, father_son: 1, drinking_buddies: 0.8, mentor_pupil: 0.6, in_laws: 0.5, neighbors: 0.5, classmates: 0.5, coworkers: 0.3,
};
const TEAMMATE_FACTOR = 0.12;
const RIVAL_CARRIES = 0.9;
const RIVAL_OTHERWISE = 0.1;
const PUB_FACTOR = 2;
const MAX_CHANCE = 0.9;
const MAX_NEW_PER_ITEM = 3;

const NEGATIVE = new Set<HearsayKind>(["criticism", "decision_against"]);

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Ukecanost: 0,6 (zakřiknutý, ukázněný) až 1,6 (vzteklý, neukázněný). Tahoun kritiku drží u sebe. */
function talkFactor(p: SpreadPlayer, kind: HearsayKind): number {
  const base = 0.6 + 0.6 * (p.temper / 100) + 0.4 * ((100 - p.discipline) / 100);
  return p.leadership >= 70 && NEGATIVE.has(kind) ? base * 0.6 : base;
}

function tieFactor(type: string, kind: HearsayKind, toSubject: boolean): number {
  if (type === "rivals") return toSubject && NEGATIVE.has(kind) ? RIVAL_CARRIES : RIVAL_OTHERWISE;
  return TIE_FACTOR[type] ?? TEAMMATE_FACTOR;
}

export function spreadStep(input: SpreadInput): HearsayKnowledge[] {
  const at = Date.parse(`${input.hourKey}:00:00Z`);
  const learnedAt = new Date(at).toISOString();
  const roster = new Map(input.players.map((p) => [p.id, p]));
  const ties = new Map<string, SpreadTie[]>();
  for (const t of input.ties) {
    const k = pairKey(t.a, t.b);
    ties.set(k, [...(ties.get(k) ?? []), t]);
  }
  const out: HearsayKnowledge[] = [];

  for (const item of input.items) {
    if (!SPREADABLE_KINDS.has(item.kind)) continue;
    if (Date.parse(item.expiresAt) <= at || at - Date.parse(item.createdAt) > SPREAD_WINDOW_DAYS * DAY_MS) continue;
    const known = new Set(input.knowledge.filter((k) => k.hearsayId === item.id).map((k) => k.playerId));
    const knowers = [...known].filter((id) => id !== item.subjectPlayerId && roster.has(id)).sort();
    let added = 0;
    for (const fromId of knowers) {
      const from = roster.get(fromId)!;
      for (const to of input.players) {
        if (added >= MAX_NEW_PER_ITEM) break;
        if (to.id === fromId || known.has(to.id)) continue;
        const toSubject = to.id === item.subjectPlayerId;
        // Nejsilnější vazba dvojice pro tuhle věc (bratr je i soused: počítá se bratr).
        let best = { via: "teammate" as KnowledgeVia, factor: TEAMMATE_FACTOR };
        for (const t of ties.get(pairKey(fromId, to.id)) ?? []) {
          const f = tieFactor(t.type, item.kind, toSubject) * ((t.strength ?? 50) / 50);
          if (f > best.factor) best = { via: t.type as KnowledgeVia, factor: f };
        }
        const chance = HOURLY_BASE * KIND_FACTOR[item.kind] * best.factor * talkFactor(from, item.kind);
        const inPub = input.pubPairs.has(pairKey(fromId, to.id));
        const roll = createRng(seedFromString(`${item.id}:${fromId}:${to.id}:${input.hourKey}`)).random();
        const plain = Math.min(MAX_CHANCE, chance);
        const withPub = Math.min(MAX_CHANCE, chance * (inPub ? PUB_FACTOR : 1));
        if (roll >= withPub) continue;
        out.push({
          hearsayId: item.id, playerId: to.id, via: roll < plain ? best.via : "pub", fromPlayerId: fromId,
          learnedAt, messageState: "none", messagedAt: null,
        });
        known.add(to.id);
        added++;
      }
    }
  }
  return out;
}

function pragueHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now);
  return Number(h) % 24;
}

function parsePersonality(raw: string | null): { temper: number; discipline: number; leadership: number } {
  try {
    const p = raw ? JSON.parse(raw) as Record<string, number> : {};
    return { temper: p.temper ?? 40, discipline: p.discipline ?? 50, leadership: p.leadership ?? 30 };
  } catch (e) {
    logger.warn({ module: M }, "povaha hráče", e);
    return { temper: 40, discipline: 50, leadership: 30 };
  }
}

/** Hodinový běh: rozšíří věci ve všech klubech, které vede člověk, a zapíše dopady dotčeným. */
export async function spreadHearsay(db: D1Database, now: Date = new Date()): Promise<{ learned: number; clubs: number }> {
  const hour = pragueHour(now);
  if (hour < 7 || hour >= 22) return { learned: 0, clubs: 0 };
  const at = now.toISOString();
  const clubs = await db.prepare(
    `SELECT DISTINCT h.club_team_id AS id, t.game_date FROM squad_hearsay h JOIN teams t ON t.id = h.club_team_id
      WHERE h.expires_at > ? AND julianday(h.created_at) > julianday(?) - ? AND t.user_id IS NOT NULL AND t.user_id != 'ai'`,
  ).bind(at, at, SPREAD_WINDOW_DAYS).all<{ id: string; game_date: string | null }>();

  let learned = 0;
  for (const club of clubs.results) {
    try {
      const teamIds = (await db.prepare("SELECT id FROM teams WHERE id = ? OR parent_team_id = ?").bind(club.id, club.id).all<{ id: string }>())
        .results.map((t) => t.id);
      const ph = teamIds.map(() => "?").join(",");
      const [state, players, ties, pubs] = await Promise.all([
        loadClubHearsay(db, club.id, now),
        db.prepare(`SELECT id, personality FROM players WHERE team_id IN (${ph}) AND (status IS NULL OR status = 'active')`)
          .bind(...teamIds).all<{ id: string; personality: string | null }>(),
        db.prepare(
          `SELECT player_a_id AS a, player_b_id AS b, type, strength FROM relationships
            WHERE player_a_id IN (SELECT id FROM players WHERE team_id IN (${ph}))
              AND player_b_id IN (SELECT id FROM players WHERE team_id IN (${ph}))`,
        ).bind(...teamIds, ...teamIds).all<SpreadTie>(),
        db.prepare(`SELECT attendees FROM pub_sessions WHERE team_id IN (${ph}) AND julianday(created_at) > julianday(?) - 1`)
          .bind(...teamIds, at).all<{ attendees: string }>(),
      ]);
      const pubPairs = new Set<string>();
      for (const s of pubs.results) {
        let ids: string[] = [];
        try { ids = (JSON.parse(s.attendees) as Array<{ playerId?: string }>).map((a) => a.playerId).filter((x): x is string => !!x); }
        catch (e) { logger.warn({ module: M, teamId: club.id }, "účastníci hospody", e); }
        for (const a of ids) for (const b of ids) if (a < b) pubPairs.add(`${a}|${b}`);
      }
      const fresh = spreadStep({
        items: state.items, knowledge: state.knowledge, ties: ties.results, pubPairs, hourKey: at.slice(0, 13),
        players: players.results.map((p) => ({ id: p.id, ...parsePersonality(p.personality) })),
      });
      if (fresh.length === 0) continue;

      const items = new Map(state.items.map((i) => [i.id, i]));
      const stmts: D1PreparedStatement[] = [];
      const rows: HearsayKnowledge[] = [];
      for (const k of fresh) {
        const item = items.get(k.hearsayId)!;
        if (k.playerId === item.subjectPlayerId) {
          const effect = await learningEffectStmts(db, { item, playerId: k.playerId, via: k.via, gameDay: club.game_date ?? at.slice(0, 10), now });
          stmts.push(...effect.stmts);
          rows.push(effect.message ? { ...k, messageState: "pending" } : k);
        } else {
          rows.push(k);
        }
      }
      await db.batch([...stmts, ...knowledgeStmts(db, rows)]);
      learned += fresh.length;
    } catch (e) {
      logger.warn({ module: M, teamId: club.id }, "šíření v klubu", e);
    }
  }
  if (learned > 0) logger.info({ module: M }, `šíření: ${learned} hráčů se něco dozvědělo v ${clubs.results.length} klubech`);
  return { learned, clubs: clubs.results.length };
}
