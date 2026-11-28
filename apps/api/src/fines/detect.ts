/**
 * Které prohřešky splnily položku sazebníku: trénink, zápas, hospoda.
 * Vrací kandidáty na pokutu; zapisuje je `recordFines` (store.ts).
 */

import { fineCzkEquivalent } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { classifyTrainingAbsence, matchExcuseConditionMatches, trainingConditionMatches, type TrainingAbsenceCategory } from "./classify";
import {
  activeItemsOn, addDays, recordFines, type FineCandidate, type RecordedFine, type ScheduleItem, type ScheduleRow,
} from "./store";

const M = "fines-detect";

// ── Trénink ─────────────────────────────────────────────────────────────────

export interface TrainingAbsenceInput {
  playerId: string;
  attended: boolean;
  reason?: string;
  restByCoach?: boolean;
  pledge?: string;
}

const CONDITION_SPECIFICITY: Record<string, number> = { slacking: 0, pub: 0, unexcused: 1, any: 2 };

/** Pokuty z jednoho tréninku. Jedna absence = nejvýš jedna pokuta (nejkonkrétnější položka). */
export function trainingFineCandidates(day: string, attendance: readonly TrainingAbsenceInput[], items: readonly ScheduleItem[]): FineCandidate[] {
  const out: FineCandidate[] = [];
  for (const a of attendance) {
    if (a.attended) continue;
    const category = classifyTrainingAbsence(a);
    if (category === "coach_rest") continue;
    const ref = `training|${day}|${a.playerId}`;
    const fact = `Na tréninku chyběl: ${a.reason ?? "bez udání důvodu"}`;
    const boots = items.find((i) => i.itemKey === "training_forgot_boots");
    const pledge = items.find((i) => i.itemKey === "training_broken_pledge");
    // Víc položek „Vynechaný trénink“: platí ta nejkonkrétnější (hospoda před „jakýkoli“).
    const missed = items
      .filter((i) => i.itemKey === "training_missed" && trainingConditionMatches(i.conditionKey, category))
      .sort((a, b) => CONDITION_SPECIFICITY[a.conditionKey] - CONDITION_SPECIFICITY[b.conditionKey])[0];
    const pick = (category === "boots" && boots) || (a.pledge === "attend" && pledge) || missed;
    if (!pick) continue;
    out.push({
      playerId: a.playerId, itemKey: pick.itemKey, conditionKey: pick.conditionKey, sourceRef: ref, source: "auto",
      fact: pick.itemKey === "training_broken_pledge" ? `Slíbil ti, že na trénink přijde, a nepřišel (${a.reason ?? "bez důvodu"})` : fact,
    });
  }
  return out;
}

/**
 * Jak moc sazebník odradí hráče od vynechání tréninku z důvodu, který pokrývá (0–0,4).
 * Disciplinovaný hráč skoro nevynechává, takže se nemění; rebel sazebník ignoruje.
 * Vnucený sazebník (bez kapitána) zabírá slaběji.
 */
export function deterrence(item: ScheduleItem, p: { discipline: number; temper: number }, origin: ScheduleRow["origin"]): number {
  const czk = fineCzkEquivalent(item.valueKind, item.amountCzk);
  const base = czk >= 500 ? 0.4 : czk >= 200 ? 0.36 : czk >= 100 ? 0.3 : czk >= 50 ? 0.22 : 0.1;
  const rebel = p.discipline < 35 && p.temper >= 65;
  const personal = p.discipline >= 70 ? 0.3 : rebel ? 0.2 : 1;
  return Math.min(0.4, base * personal * (origin === "imposed" ? 0.6 : 1));
}

export interface TrainingFineEffects {
  /** Pravděpodobnost, že hráč kvůli sazebníku přijde, i když by jinak z tohohle důvodu chyběl. */
  deterrence: (playerIndex: number, reason: string) => number;
  /** Pravděpodobnost, že hráč přetížený pokutami radši nepřijde (stupeň 2 a 3). */
  skipChance: (playerIndex: number) => number;
}

export const FINE_SKIP_REASONS: readonly string[] = [
  "Vzkázal, že když má platit pokuty, radši nepřijde",
  "Prý dokud platí ten sazebník, chodit nebude",
  "Nepřišel, prý už na pokuty nemá",
  "Napsal klukům, že za tyhle pokuty se mu chodit nechce",
];

/** Účinek sazebníku na docházku pro kádr (indexy = pořadí `players`). */
export async function trainingFineEffects(
  db: D1Database, teamId: string, day: string,
  players: ReadonlyArray<{ id: string; discipline: number; temper: number }>,
): Promise<TrainingFineEffects | undefined> {
  const { items, row } = await activeItemsOn(db, teamId, day);
  const stages = await burdenStagesFor(db, teamId, day);
  if (items.length === 0 && stages.size === 0) return undefined;
  const reasonCategory = new Map<string, TrainingAbsenceCategory>();
  const categoryOf = (reason: string) => {
    let c = reasonCategory.get(reason);
    if (!c) { c = classifyTrainingAbsence({ reason }); reasonCategory.set(reason, c); }
    return c;
  };
  return {
    deterrence: (i, reason) => {
      const p = players[i];
      if (!p || items.length === 0) return 0;
      const cat = categoryOf(reason);
      const item = items.find((it) => (it.itemKey === "training_missed" && trainingConditionMatches(it.conditionKey, cat))
        || (it.itemKey === "training_forgot_boots" && cat === "boots"));
      return item ? deterrence(item, p, row?.origin ?? null) : 0;
    },
    skipChance: (i) => {
      const s = players[i] ? stages.get(players[i].id) ?? 0 : 0;
      return s >= 3 ? 0.2 : s === 2 ? 0.12 : 0;
    },
  };
}

/** Stupeň zátěže hráčů týmu, kteří mají za 4 týdny aspoň jednu pokutu. */
export async function burdenStagesFor(db: D1Database, teamId: string, day: string): Promise<Map<string, number>> {
  const { PLAYER_PROFILE_SQL, profileFromRow, playerBurden } = await import("./store");
  const rows = await db.prepare(
    `${PLAYER_PROFILE_SQL} WHERE team_id = ? AND id IN (SELECT player_id FROM fines WHERE team_id = ? AND status != 'forgiven' AND game_date > ?)`,
  ).bind(teamId, teamId, addDays(day, -28)).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M, teamId }, "zátěž kádru", e); return { results: [] as Record<string, unknown>[] }; });
  const out = new Map<string, number>();
  for (const r of rows.results ?? []) {
    const p = profileFromRow(r);
    out.set(p.id, (await playerBurden(db, p, day)).stage);
  }
  return out;
}

export async function applyTrainingFines(db: D1Database, teamId: string, day: string, attendance: readonly TrainingAbsenceInput[]): Promise<RecordedFine[]> {
  const { items } = await activeItemsOn(db, teamId, day);
  if (items.length === 0) return [];
  return recordFines(db, teamId, day, trainingFineCandidates(day, attendance, items), items);
}

// ── Zápas ───────────────────────────────────────────────────────────────────

export interface MatchEventInput {
  type: string;
  detail?: string;
  description?: string;
  playerId: number;
  teamId: number;
  minute: number;
}

export interface MatchAbsenceInput {
  playerId: string;
  reason: string;
  teamId?: string;
}

export interface MatchFineInput {
  matchId: string;
  calendarId: string;
  day: string;
  side: 1 | 2;
  teamId: string;
  opponentName: string;
  events: readonly MatchEventInput[];
  idMap: ReadonlyMap<number, string>;
  absences: readonly MatchAbsenceInput[];
  /** Hráči, kteří se omluvili až v den zápasu (ze zpráv v kabině). */
  matchDayExcused: ReadonlySet<string>;
  /** Hráči ve stávce kvůli pokutám (za to se nepokutuje, to je jiný problém). */
  strikers: ReadonlySet<string>;
}

function cardKind(e: MatchEventInput): { yellow: "dissent" | "foul" | null; red: "direct" | "second_yellow" | null } {
  if (e.type !== "card") return { yellow: null, red: null };
  const d = e.description ?? "";
  if (e.detail === "red") return { yellow: null, red: /druh[aá] [zž]lut/i.test(d) ? "second_yellow" : "direct" };
  return { yellow: /za protesty/i.test(d) ? "dissent" : "foul", red: null };
}

export function matchFineCandidates(m: MatchFineInput, items: readonly ScheduleItem[]): FineCandidate[] {
  const out: FineCandidate[] = [];
  const vs = `v ligovém zápase (soupeř ${m.opponentName})`;
  const find = (key: string, cond?: (c: string) => boolean) => items.find((i) => i.itemKey === key && (!cond || cond(i.conditionKey)));
  for (const [idx, e] of m.events.entries()) {
    if (e.teamId !== m.side) continue;
    const pid = m.idMap.get(e.playerId);
    if (!pid) continue;
    const ref = `match|${m.matchId}|${idx}`;
    const ck = cardKind(e);
    let item: ScheduleItem | undefined;
    let fact = "";
    if (ck.yellow) {
      item = find("yellow_card", (c) => c === "any" || c === ck.yellow);
      fact = ck.yellow === "dissent" ? `Žlutá karta za protesty ${vs} (${e.minute}. minuta)` : `Žlutá karta za faul ${vs} (${e.minute}. minuta)`;
    } else if (ck.red) {
      item = find("red_card", (c) => c === "any" || c === ck.red);
      fact = ck.red === "second_yellow" ? `Druhá žlutá a červená ${vs} (${e.minute}. minuta)` : `Přímá červená ${vs} (${e.minute}. minuta)`;
    } else if (e.type === "special" && e.detail === "hangover") {
      item = find("match_hangover");
      fact = `Na zápase bylo poznat, že včerejší hospoda se podepsala (soupeř ${m.opponentName})`;
    } else if (e.type === "special" && /^Dorazil a[zž]/i.test(e.detail ?? "")) {
      item = find("match_late");
      fact = `Na ligový zápas (soupeř ${m.opponentName}) dorazil pozdě: ${(e.detail ?? "").toLowerCase()}`;
    } else if (e.type === "chance" && (e.detail === "penalty_missed" || e.detail === "penalty_saved")) {
      item = find("penalty_miss");
      fact = `Neproměnil penaltu ${vs} (${e.minute}. minuta)`;
    }
    if (item) out.push({ playerId: pid, itemKey: item.itemKey, conditionKey: item.conditionKey, sourceRef: ref, source: "auto", fact });
  }
  for (const a of m.absences) {
    if (a.teamId && a.teamId !== m.teamId) continue;
    if (m.strikers.has(a.playerId)) continue;
    const ref = `absence|${m.matchId}|${a.playerId}`;
    if (/^stopka za karty$/i.test(a.reason.trim())) {
      const item = find("suspension");
      if (item) out.push({ playerId: a.playerId, itemKey: item.itemKey, conditionKey: item.conditionKey, sourceRef: ref, source: "auto", fact: `Na ligový zápas (soupeř ${m.opponentName}) nemohl kvůli stopce za karty` });
      continue;
    }
    const item = find("match_excuse", (c) => matchExcuseConditionMatches(c, { reason: a.reason, announcedOnMatchDay: m.matchDayExcused.has(a.playerId) }));
    if (item) {
      const when = m.matchDayExcused.has(a.playerId) ? " až ráno v den zápasu" : "";
      out.push({ playerId: a.playerId, itemKey: item.itemKey, conditionKey: item.conditionKey, sourceRef: ref, source: "auto", fact: `Na ligový zápas (soupeř ${m.opponentName}) se omluvil${when}, důvod: ${a.reason}` });
    }
  }
  return out;
}

/** Kdo se omluvil až v den zápasu a kdo stávkuje (ze zpráv v kabině k zápasu). */
export async function squadChatExcuses(db: D1Database, teamId: string, calendarId: string): Promise<{ matchDay: Set<string>; strikers: Set<string> }> {
  const r = await db.prepare(
    `SELECT m.sender_id, json_extract(m.metadata, '$.timing') AS timing, json_extract(m.metadata, '$.strike') AS strike
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'squad_group' AND m.sender_type = 'player'
        AND json_extract(m.metadata, '$.calendarId') = ? AND json_extract(m.metadata, '$.response') = 'no'`,
  ).bind(teamId, calendarId).all<{ sender_id: string; timing: string | null; strike: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "omluvenky z kabiny pro pokuty", e); return { results: [] as { sender_id: string; timing: string | null; strike: number | null }[] }; });
  const matchDay = new Set<string>();
  const strikers = new Set<string>();
  for (const row of r.results ?? []) {
    if (row.strike) strikers.add(row.sender_id);
    else if (row.timing === "match_day") matchDay.add(row.sender_id);
  }
  return { matchDay, strikers };
}

/**
 * Pokuty z ligového zápasu pro lidské kluby se sazebníkem (volá multiplayer/match-runner.ts).
 * U21 sazebník nemá (patří áčku), runner ho proto volá jen s `clubSideEffects`.
 */
export async function applyMatchFines(
  db: D1Database,
  o: {
    matchId: string; calendarId: string; day: string;
    sides: Array<{ side: 1 | 2; teamId: string; isHuman: boolean; opponentName: string; idMap: ReadonlyMap<number, string> }>;
    events: readonly MatchEventInput[];
    absences: readonly MatchAbsenceInput[];
  },
): Promise<RecordedFine[]> {
  const out: RecordedFine[] = [];
  for (const s of o.sides) {
    if (!s.isHuman) continue;
    try {
      const { items } = await activeItemsOn(db, s.teamId, o.day);
      if (items.length === 0) continue;
      const chat = await squadChatExcuses(db, s.teamId, o.calendarId);
      const cands = matchFineCandidates({
        matchId: o.matchId, calendarId: o.calendarId, day: o.day, side: s.side, teamId: s.teamId, opponentName: s.opponentName,
        events: o.events, idMap: s.idMap, absences: o.absences, matchDayExcused: chat.matchDay, strikers: chat.strikers,
      }, items);
      out.push(...await recordFines(db, s.teamId, o.day, cands, items));
    } catch (e) {
      logger.error({ module: M, teamId: s.teamId }, `pokuty ze zápasu ${o.matchId}`, e);
    }
  }
  return out;
}

// ── Hospoda ─────────────────────────────────────────────────────────────────

/**
 * Pokuty z včerejší hospody: rvačka a sezení večer před dnešním mistrovským zápasem.
 * Volá daily-tick pro lidské kluby (session je „večerní“, proto včerejší).
 */
export async function applyPubFines(db: D1Database, teamId: string, leagueId: string | null, day: string): Promise<RecordedFine[]> {
  const { items } = await activeItemsOn(db, teamId, day);
  const before = items.find((i) => i.itemKey === "pub_before_match");
  const fight = items.find((i) => i.itemKey === "pub_fight");
  if (!before && !fight) return [];
  const yesterday = addDays(day, -1);
  const session = await db.prepare("SELECT attendees, incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?")
    .bind(teamId, yesterday).first<{ attendees: string; incidents: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "včerejší hospoda", e); return null; });
  if (!session) return [];
  const parse = <T>(s: string): T[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (e) { logger.warn({ module: M, teamId }, "JSON hospody", e); return []; } };
  const attendees = parse<{ playerId: string; teamId?: string; isVisitor?: boolean; isCoach?: boolean }>(session.attendees);
  const incidents = parse<{ type: string; playerIds?: string[] }>(session.incidents);
  const cands: FineCandidate[] = [];
  if (fight) {
    for (const inc of incidents) {
      if (!/fight|rva[cč]k|bitk/i.test(inc.type)) continue;
      for (const pid of inc.playerIds ?? []) {
        cands.push({ playerId: pid, itemKey: "pub_fight", conditionKey: fight.conditionKey, sourceRef: `pub_fight|${yesterday}|${pid}`, source: "auto", fact: "Včera se v hospodě popral" });
      }
    }
  }
  if (before && leagueId) {
    const match = await db.prepare(
      `SELECT id FROM season_calendar WHERE league_id = ? AND substr(scheduled_at, 1, 10) = ? LIMIT 1`,
    ).bind(leagueId, day).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "dnešní zápas pro hospodu", e); return null; });
    if (match) {
      for (const a of attendees) {
        if (a.isCoach || a.isVisitor || (a.teamId && a.teamId !== teamId)) continue;
        cands.push({ playerId: a.playerId, itemKey: "pub_before_match", conditionKey: before.conditionKey, sourceRef: `pub_before|${yesterday}|${a.playerId}`, source: "auto", fact: "Večer před zápasem seděl v hospodě" });
      }
    }
  }
  return recordFines(db, teamId, day, cands, items);
}
