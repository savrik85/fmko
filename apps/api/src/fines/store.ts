/**
 * Sazebník pokut kabiny: uložení sazebníku a zápis pokut (spec
 * docs/superpowers/specs/2026-11-27-fine-schedule-design.md).
 *
 * Pokuta se zapíše hned, když se prohřešek stane (trénink v daily-ticku, zápas v runneru).
 * Hráčova SMS reakce jde zvlášť z hodinového běhu telefonu (fines/reaction.ts): runner
 * zápasu nemá přístup k modelu a jedna SMS za víc pokut najednou je přirozenější.
 */

import {
  fineCzkEquivalent, fineItemDef,
  type FineItemKey, type FineRepeatMode, type FineScheduleItemInput, type FineScope, type FineValueKind,
} from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { BURDEN_WINDOW_DAYS, burdenRatio, burdenStage, fineTolerance, weeklyPocket, type BurdenStage } from "./burden";

const M = "fines";

export interface ScheduleItem extends FineScheduleItemInput {
  id: string;
}

export interface ScheduleRow {
  team_id: string;
  status: "none" | "active";
  origin: "approved" | "imposed" | null;
  proposal_status: "none" | "pending" | "approved" | "reservation" | "rejected";
  proposal_captain_id: string | null;
  proposal_note: string | null;
  proposed_at: string | null;
  decided_at: string | null;
  effective_from: string | null;
  squad_stage: number;
  squad_stage_at: string | null;
  ultimatum_match_id: string | null;
  resentment_until: string | null;
  changes_season: number;
  season_number: number | null;
}

export interface LoadedSchedule {
  row: ScheduleRow | null;
  active: ScheduleItem[];
  draft: ScheduleItem[];
}

/** Herní den (YYYY-MM-DD) z ISO data nebo herního data týmu. */
export function gameDay(d: string | Date): string {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nejbližší pondělí po `day` (sazebník platí až od dalšího týdne). */
export function nextMonday(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  return addDays(day, add);
}

function itemFromRow(r: Record<string, unknown>): ScheduleItem {
  return {
    id: r.id as string,
    itemKey: r.item_key as FineItemKey,
    conditionKey: r.condition_key as string,
    valueKind: r.value_kind as FineValueKind,
    amountCzk: (r.amount_czk as number | null) ?? null,
    repeatMode: r.repeat_mode as FineRepeatMode,
    scope: r.scope as FineScope,
  };
}

export async function loadSchedule(db: D1Database, teamId: string): Promise<LoadedSchedule> {
  const [row, items] = await Promise.all([
    db.prepare("SELECT * FROM fine_schedules WHERE team_id = ?").bind(teamId).first<ScheduleRow>(),
    db.prepare("SELECT * FROM fine_schedule_items WHERE team_id = ? ORDER BY version, sort_order").bind(teamId).all<Record<string, unknown>>(),
  ]);
  const all = items.results ?? [];
  return {
    row: row ?? null,
    active: all.filter((r) => r.version === "active").map(itemFromRow),
    draft: all.filter((r) => r.version === "draft").map(itemFromRow),
  };
}

/** Platný sazebník k hernímu dni, nebo prázdné pole (žádný, zrušený, ještě nezačal platit). */
export async function activeItemsOn(db: D1Database, teamId: string, day: string): Promise<{ items: ScheduleItem[]; row: ScheduleRow | null }> {
  const s = await loadSchedule(db, teamId);
  if (!s.row || s.row.status !== "active") return { items: [], row: s.row };
  if (s.row.effective_from && day < s.row.effective_from) return { items: [], row: s.row };
  return { items: s.active, row: s.row };
}

export function itemStmts(db: D1Database, teamId: string, version: "active" | "draft", items: readonly FineScheduleItemInput[]): D1PreparedStatement[] {
  return [
    db.prepare("DELETE FROM fine_schedule_items WHERE team_id = ? AND version = ?").bind(teamId, version),
    ...items.map((it, i) => db.prepare(
      `INSERT INTO fine_schedule_items (id, team_id, version, item_key, condition_key, value_kind, amount_czk, repeat_mode, scope, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), teamId, version, it.itemKey, it.conditionKey, it.valueKind,
      it.valueKind === "czk" ? it.amountCzk : null, it.repeatMode, it.scope, i)),
  ];
}

export function ensureScheduleRowStmt(db: D1Database, teamId: string): D1PreparedStatement {
  return db.prepare("INSERT OR IGNORE INTO fine_schedules (team_id) VALUES (?)").bind(teamId);
}

// ── Zátěž ───────────────────────────────────────────────────────────────────

export interface PlayerFineProfile {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  age: number;
  weeklyWage: number;
  occupation: string | null;
  temper: number;
  patriotism: number;
  discipline: number;
  alcohol: number;
  leadership: number;
  coachRelationship: number;
  morale: number;
}

export const PLAYER_PROFILE_SQL = `SELECT id, team_id, first_name, last_name, age, weekly_wage, coach_relationship,
  json_extract(life_context, '$.occupation') AS occupation, json_extract(life_context, '$.morale') AS morale,
  json_extract(personality, '$.temper') AS temper, json_extract(personality, '$.patriotism') AS patriotism,
  json_extract(personality, '$.discipline') AS discipline, json_extract(personality, '$.alcohol') AS alcohol,
  json_extract(personality, '$.leadership') AS leadership
  FROM players`;

export function profileFromRow(r: Record<string, unknown>): PlayerFineProfile {
  const n = (v: unknown, d: number) => (typeof v === "number" ? v : v == null ? d : Number(v) || d);
  return {
    id: r.id as string, teamId: r.team_id as string,
    firstName: r.first_name as string, lastName: r.last_name as string,
    age: n(r.age, 25), weeklyWage: n(r.weekly_wage, 0), occupation: (r.occupation as string | null) ?? null,
    temper: n(r.temper, 50), patriotism: n(r.patriotism, 50), discipline: n(r.discipline, 50),
    alcohol: n(r.alcohol, 40), leadership: n(r.leadership, 40),
    coachRelationship: n(r.coach_relationship, 50), morale: n(r.morale, 50),
  };
}

/** Korunový ekvivalent pokut hráče za posledních 28 herních dní (bez prominutých). */
export async function recentFineCzk(db: D1Database, playerId: string, day: string): Promise<number> {
  const r = await db.prepare(
    "SELECT COALESCE(SUM(czk_equivalent), 0) AS s FROM fines WHERE player_id = ? AND status != 'forgiven' AND game_date > ?",
  ).bind(playerId, addDays(day, -BURDEN_WINDOW_DAYS)).first<{ s: number }>();
  return r?.s ?? 0;
}

export async function playerBurden(db: D1Database, p: PlayerFineProfile, day: string, extraCzk = 0): Promise<{ ratio: number; stage: BurdenStage }> {
  const czk = (await recentFineCzk(db, p.id, day)) + extraCzk;
  const ratio = burdenRatio(czk, weeklyPocket({ weeklyWage: p.weeklyWage, age: p.age, occupation: p.occupation }), fineTolerance(p));
  return { ratio, stage: burdenStage(ratio) };
}

// ── Zápis pokut ─────────────────────────────────────────────────────────────

export interface FineCandidate {
  playerId: string;
  itemKey: FineItemKey | null;
  conditionKey: string | null;
  /** Jednoznačný klíč prohřešku (např. `training|2026-11-27|playerId`): stejný prohřešek se zapíše jen jednou. */
  sourceRef: string;
  /** Co se doopravdy stalo, pro reakci hráče. */
  fact: string;
  source: "auto" | "manual" | "sms";
  /** Pokuta z SMS mimo sazebník: částka od trenéra. */
  amountCzk?: number;
}

export interface RecordedFine {
  id: string;
  playerId: string;
  itemKey: string | null;
  valueKind: FineValueKind;
  amountCzk: number | null;
  status: "paid" | "refused" | "forgiven";
  stage: BurdenStage;
}

/** Morálka a vztah podle stupně zátěže, když hráči přibude pokuta (spec bod 4). */
export const STAGE_EFFECT: Record<BurdenStage, { morale: number; relation: number }> = {
  0: { morale: -1, relation: 0 },
  1: { morale: -3, relation: -1 },
  2: { morale: -5, relation: -3 },
  3: { morale: -7, relation: -4 },
};

const MORALE_SQL = `life_context = json_set(COALESCE(life_context, '{}'), '$.morale',
  MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))`;

export function moraleStmt(db: D1Database, playerId: string, delta: number): D1PreparedStatement {
  return db.prepare(`UPDATE players SET ${MORALE_SQL} WHERE id = ?`).bind(Math.round(delta), playerId);
}

/** Kolik pokut za tutéž položku hráč v sezóně už má (bez prominutých). */
async function priorCount(db: D1Database, teamId: string, playerId: string, itemKey: string, seasonNumber: number | null): Promise<number> {
  const r = await db.prepare(
    `SELECT COUNT(*) AS n FROM fines WHERE team_id = ? AND player_id = ? AND item_key = ? AND status != 'forgiven'
       AND (? IS NULL OR season_number = ?)`,
  ).bind(teamId, playerId, itemKey, seasonNumber, seasonNumber).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function currentSeasonNumber(db: D1Database): Promise<number | null> {
  const r = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "aktuální sezóna", e); return null; });
  return r?.number ?? null;
}

/**
 * Zapíše pokuty pro kandidáty. Kandidát z hry (`auto`) musí odpovídat položce platného
 * sazebníku; podmínku už ověřil volající. Pokuta z SMS mimo sazebník má `itemKey` null.
 * Vrací jen nově zapsané (duplicitní `sourceRef` se přeskočí).
 */
export async function recordFines(
  db: D1Database, teamId: string, day: string, candidates: readonly FineCandidate[], items: readonly ScheduleItem[],
): Promise<RecordedFine[]> {
  if (candidates.length === 0) return [];
  const season = await currentSeasonNumber(db);
  const out: RecordedFine[] = [];
  for (const c of candidates) {
    try {
      const item = c.itemKey ? items.find((i) => i.itemKey === c.itemKey && i.conditionKey === c.conditionKey) : undefined;
      if (c.source !== "sms" && !item) continue;
      const profileRow = await db.prepare(`${PLAYER_PROFILE_SQL} WHERE id = ? AND team_id = ?`).bind(c.playerId, teamId).first<Record<string, unknown>>();
      if (!profileRow) continue;
      const p = profileFromRow(profileRow);
      if (item && item.scope === "senior" && p.age <= 19) continue;

      const valueKind: FineValueKind = item?.valueKind ?? "czk";
      let amount: number | null = item ? item.amountCzk : (c.amountCzk ?? 0);
      let free = false;
      if (item && item.repeatMode !== "flat") {
        const prior = await priorCount(db, teamId, c.playerId, item.itemKey, season);
        if (item.repeatMode === "first_free" && prior === 0) free = true;
        if (item.repeatMode === "double_from_second" && prior >= 1 && valueKind === "czk" && amount !== null) amount *= 2;
      }
      const czk = free ? 0 : fineCzkEquivalent(valueKind, amount);
      const { stage } = await playerBurden(db, p, day, czk);
      // Pokutu z SMS strhne klub (coach-commitments.ts) a dopad na vztah už dal slib, tady se jen eviduje.
      const isSms = c.source === "sms";
      const status: RecordedFine["status"] = free ? "forgiven" : isSms ? "paid" : stage >= 2 ? "refused" : "paid";
      const id = crypto.randomUUID();
      const res = await db.prepare(
        `INSERT OR IGNORE INTO fines (id, team_id, player_id, item_key, condition_key, source, source_ref, value_kind, amount_czk,
           czk_equivalent, status, fact, in_schedule, game_date, season_number, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, teamId, c.playerId, item?.itemKey ?? c.itemKey, item?.conditionKey ?? c.conditionKey, c.source, c.sourceRef,
        valueKind, valueKind === "czk" ? amount : null, czk, status, (free ? `${c.fact} (první v sezóně, promíjí se)` : c.fact).slice(0, 300),
        item ? 1 : 0, day, season, status === "paid" ? day : null).run();
      if ((res.meta?.changes ?? 0) === 0) continue;

      const stmts: D1PreparedStatement[] = [];
      if (!free && !isSms) {
        const eff = STAGE_EFFECT[stage];
        stmts.push(moraleStmt(db, c.playerId, eff.morale + (valueKind === "kit_wash" ? -1 : 0)));
        if (eff.relation) {
          const { coachRelationStmts } = await import("../lib/coach-relation");
          stmts.push(...coachRelationStmts(db, { playerId: c.playerId, delta: eff.relation, source: "fine", description: `Pokuta: ${fineItemDef(item?.itemKey ?? "")?.label ?? "od trenéra"}`, gameDate: day }));
        }
        if (status === "paid" && valueKind === "czk" && item && amount) {
          stmts.push(db.prepare("UPDATE teams SET fine_fund_balance = fine_fund_balance + ? WHERE id = ?").bind(amount, teamId));
        }
        if (valueKind === "laps") {
          stmts.push(db.prepare(`UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.condition',
            MAX(0, COALESCE(json_extract(life_context, '$.condition'), 100) - 4)) WHERE id = ?`).bind(c.playerId));
        }
      }
      if (stmts.length > 0) await db.batch(stmts);
      out.push({ id, playerId: c.playerId, itemKey: item?.itemKey ?? c.itemKey, valueKind, amountCzk: valueKind === "czk" ? amount : null, status, stage });
    } catch (e) {
      logger.error({ module: M, teamId }, `zápis pokuty ${c.sourceRef}`, e);
    }
  }
  return out;
}
