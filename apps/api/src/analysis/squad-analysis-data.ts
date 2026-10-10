/**
 * Načtení dat pro rozbor kádru (záložka Rozbor v Kádru) a jeho sestavení.
 *
 * Rozbor píše asistent trenéra klubu. U21 nemá vlastní zaměstnance, radí jí asistent
 * áčka (zaměstnanci patří klubu, `parent_team_id`). Bez asistenta je záložka zamčená.
 *
 * Vlastní jedenáctka = poslední ručně uložená sestava, jinak nejlepší dostupná 4-4-2
 * stejným pravidlem jako `autoSelectBest11` (engine/lineup-loader.ts). Soupeři v lize
 * se berou stejně (nejlepší dostupná 4-4-2), jako to dělá náhled síly sestavy.
 */

import type { MatchPlayer } from "../engine/types";
import type { Slot } from "../engine/roles";
import { mapRowToMatchPlayer } from "../engine/lineup-loader";
import { applyPositionPenalty } from "../engine/simulation";
import { readFamiliarity } from "../engine/chemistry";
import { playerBodyView } from "../generators/physicals";
import { logger } from "../lib/logger";
import {
  assistantLevel, assistantNote, assistantQuality, buildSquadAnalysis, gameWeekKey,
  type AssistantLevel, type LeagueTeam, type SquadAnalysisInput, type SquadAnalysisReport, type SquadMember,
} from "./squad-analysis";

const M = "squad-analysis";
const SLOTS: readonly Slot[] = ["GK", "DEF", "MID", "FWD"];
/** 4-4-2 jako `autoSelectBest11`. */
const DEFAULT_QUOTAS: Record<Slot, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

/** Počty hráčů v řadách z rozestavění „4-3-3“; null, když to není rozestavění na deset hráčů v poli. */
export function formationQuotas(formation: string): Record<Slot, number> | null {
  const parts = formation.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 1)) return null;
  if (parts[0] + parts[1] + parts[2] !== 10) return null;
  return { GK: 1, DEF: parts[0], MID: parts[1], FWD: parts[2] };
}

export interface AssistantSummary {
  name: string;
  female: boolean;
  level: AssistantLevel;
  note: string;
  /** facesjs konfigurace obličeje (jako u zaměstnanců). */
  avatar: Record<string, unknown> | null;
}

export type SquadAnalysisResult =
  | { status: "locked" }
  | { status: "shortSquad"; assistant: AssistantSummary }
  | { status: "noLeague"; assistant: AssistantSummary }
  | (Omit<SquadAnalysisReport, "assistant"> & { assistant: AssistantSummary });

interface PlayerRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  position: string;
  skills: string;
  personality: string;
  life_context: string;
  physical: string | null;
  age: number;
  overall_rating: number | null;
}

interface StaffRow {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  avatar: string | null;
  role: string | null;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  work_rate: number;
  charm: number;
}

const PLAYER_COLUMNS = "id, team_id, first_name, last_name, nickname, position, skills, personality, life_context, physical, age, overall_rating";

function isSlot(v: unknown): v is Slot {
  return typeof v === "string" && (SLOTS as readonly string[]).includes(v);
}

function parseObject(raw: string | null | undefined, what: string, id: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, id }, `parse ${what}`, e);
    return {};
  }
}

/** Hráč pro engine, nebo null, když má rozbitý záznam (rozbor ho vynechá, nespadne). */
function toMatchPlayer(row: PlayerRow, slot: Slot): MatchPlayer | null {
  try {
    const p = mapRowToMatchPlayer(row, slot);
    // Hráč mimo svůj post ztrácí dovednosti stejně jako v zápase.
    applyPositionPenalty(p);
    return p;
  } catch (e) {
    logger.warn({ module: M, playerId: row.id }, "map player", e);
    return null;
  }
}

/**
 * Nejlepší dostupná jedenáctka podle hodnocení: stejné pravidlo jako `autoSelectBest11`
 * (kvóty řad, chybějící místa doplní nejlepší zbylí), jen nad už načtenými řádky (celá
 * liga jedním dotazem) a s ID hráčů pro odkazy. Soupeři 4-4-2 jako v náhledu sestavy,
 * vlastní tým bez uložené sestavy v rozestavění, které má nejvíc sehrané.
 */
export function pickBestEleven<T extends { id: string; position: string; overall_rating: number | null }>(
  rows: readonly T[],
  quotas: Record<Slot, number> = DEFAULT_QUOTAS,
): Array<{ row: T; slot: Slot }> {
  const sorted = [...rows].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0));
  const picked: Array<{ row: T; slot: Slot }> = [];
  for (const slot of SLOTS) {
    for (const row of sorted.filter((r) => r.position === slot).slice(0, quotas[slot])) picked.push({ row, slot });
  }
  const used = new Set(picked.map((p) => p.row.id));
  for (const row of sorted) {
    if (picked.length >= 11) break;
    if (used.has(row.id) || !isSlot(row.position)) continue;
    picked.push({ row, slot: row.position });
    used.add(row.id);
  }
  return picked;
}

function toMember(row: PlayerRow, slot: Slot, injured: boolean): SquadMember | null {
  const player = toMatchPlayer(row, slot);
  if (!player || !isSlot(row.position)) return null;
  const lifeContext = parseObject(row.life_context, "life_context", row.id);
  const condition = typeof lifeContext.condition === "number" ? lifeContext.condition : 100;
  return {
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    position: row.position,
    player,
    condition,
    weightCategory: playerBodyView(parseObject(row.physical, "physical", row.id)).weightCategory,
    injured,
  };
}

async function loadAssistant(db: D1Database, clubTeamId: string): Promise<StaffRow | null> {
  return db.prepare(
    `SELECT id, first_name, last_name, gender, avatar, role, coaching, medicine, maintenance, judgement, communication, work_rate, charm
       FROM staff_members WHERE team_id = ? AND role = 'asistent' LIMIT 1`,
  ).bind(clubTeamId).first<StaffRow>()
    .catch((e) => { logger.warn({ module: M, teamId: clubTeamId }, "assistant", e); return null; });
}

/** Poslední ručně uložená sestava týmu: formace a kdo kde hraje. */
async function loadSavedLineup(db: D1Database, teamId: string): Promise<{ formation: string; slots: Map<string, Slot> } | null> {
  const row = await db.prepare(
    `SELECT formation, players_data FROM lineups
      WHERE team_id = ? AND is_auto = 0 AND submitted_at IS NOT NULL
      ORDER BY submitted_at DESC LIMIT 1`,
  ).bind(teamId).first<{ formation: string | null; players_data: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "saved lineup", e); return null; });
  if (!row?.players_data) return null;
  let entries: unknown;
  try {
    entries = JSON.parse(row.players_data);
  } catch (e) {
    logger.warn({ module: M, teamId }, "parse lineup players", e);
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const slots = new Map<string, Slot>();
  for (const entry of entries as Array<{ playerId?: unknown; matchPosition?: unknown }>) {
    if (typeof entry?.playerId === "string" && isSlot(entry.matchPosition)) slots.set(entry.playerId, entry.matchPosition);
  }
  return { formation: row.formation ?? "4-4-2", slots };
}

function summary(staff: StaffRow, quality: number): AssistantSummary {
  const level = assistantLevel(quality);
  const avatar = parseObject(staff.avatar, "staff avatar", staff.id);
  return {
    name: `${staff.first_name} ${staff.last_name}`,
    female: staff.gender === "f",
    level,
    note: assistantNote({ firstName: staff.first_name }, level),
    avatar: Object.keys(avatar).length > 0 ? avatar : null,
  };
}

type InputResult =
  | { status: "locked" }
  | { status: "shortSquad" | "noLeague"; assistant: AssistantSummary }
  | { status: "ready"; assistant: AssistantSummary; input: SquadAnalysisInput };

/** Rozbor kádru týmu, nebo null, když tým neexistuje. */
export async function loadSquadAnalysis(db: D1Database, teamId: string): Promise<SquadAnalysisResult | null> {
  const loaded = await loadSquadAnalysisInput(db, teamId);
  if (!loaded || loaded.status !== "ready") return loaded;
  return { ...buildSquadAnalysis(loaded.input), assistant: loaded.assistant };
}

/** Vstup rozboru z DB (a co ukázat, když rozbor udělat nejde). */
export async function loadSquadAnalysisInput(db: D1Database, teamId: string): Promise<InputResult | null> {
  const team = await db.prepare("SELECT id, league_id, parent_team_id, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ id: string; league_id: string | null; parent_team_id: string | null; game_date: string | null }>();
  if (!team) return null;

  const staff = await loadAssistant(db, team.parent_team_id ?? team.id);
  if (!staff) return { status: "locked" };
  const quality = assistantQuality(staff);
  const assistantSummary = summary(staff, quality);

  const [ownRows, leagueTeams, leagueRows, injuries, saved, familiarity] = await Promise.all([
    db.prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`)
      .bind(teamId).all<PlayerRow>()
      .catch((e) => { logger.warn({ module: M, teamId }, "own players", e); return { results: [] as PlayerRow[] }; }),
    team.league_id
      ? db.prepare("SELECT id, name FROM teams WHERE league_id = ? AND id != ?").bind(team.league_id, teamId).all<{ id: string; name: string }>()
        .catch((e) => { logger.warn({ module: M, teamId }, "league teams", e); return { results: [] as Array<{ id: string; name: string }> }; })
      : Promise.resolve({ results: [] as Array<{ id: string; name: string }> }),
    team.league_id
      ? db.prepare(
        `SELECT ${PLAYER_COLUMNS} FROM players
          WHERE team_id IN (SELECT id FROM teams WHERE league_id = ? AND id != ?) AND (status IS NULL OR status = 'active')`,
      ).bind(team.league_id, teamId).all<PlayerRow>()
        .catch((e) => { logger.warn({ module: M, teamId }, "league players", e); return { results: [] as PlayerRow[] }; })
      : Promise.resolve({ results: [] as PlayerRow[] }),
    db.prepare(
      `SELECT DISTINCT player_id FROM injuries
        WHERE days_remaining > 0 AND COALESCE(osobni_volno, 0) = 0
          AND (team_id = ? OR team_id IN (SELECT id FROM teams WHERE league_id = ?))`,
    ).bind(teamId, team.league_id ?? "").all<{ player_id: string }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "injuries", e); return { results: [] as Array<{ player_id: string }> }; }),
    loadSavedLineup(db, teamId),
    readFamiliarity(db, teamId),
  ]);
  // Kdo roste: přírůstek dovedností z tréninku za poslední čtyři týdny.
  const growthRows = await db.prepare(
    `SELECT player_id, SUM(change) AS gain FROM training_log
      WHERE team_id = ? AND change > 0 AND created_at > datetime('now', '-28 days')
      GROUP BY player_id`,
  ).bind(teamId).all<{ player_id: string; gain: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "training growth", e); return { results: [] as Array<{ player_id: string; gain: number }> }; });
  const growth: Record<string, number> = {};
  for (const r of growthRows.results) growth[r.player_id] = r.gain;
  const injured = new Set(injuries.results.map((r) => r.player_id));

  // Vlastní jedenáctka: uložená sestava, když z ní je v kádru pořád aspoň jedenáct hráčů.
  const byId = new Map(ownRows.results.map((r) => [r.id, r]));
  let lineupSource: "lineup" | "best11" = "best11";
  let formation = "4-4-2";
  let elevenPicks: Array<{ row: PlayerRow; slot: Slot }> = [];
  if (saved) {
    const picks = [...saved.slots.entries()]
      .map(([id, slot]) => ({ row: byId.get(id), slot }))
      .filter((p): p is { row: PlayerRow; slot: Slot } => !!p.row);
    if (picks.length >= 11) {
      elevenPicks = picks.slice(0, 11);
      lineupSource = "lineup";
      formation = saved.formation;
    }
  }
  if (lineupSource === "best11") {
    const familiar = Object.entries(familiarity.formation)
      .filter(([f]) => formationQuotas(f) !== null)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    formation = familiar ?? "4-4-2";
    elevenPicks = pickBestEleven(ownRows.results.filter((r) => !injured.has(r.id)), formationQuotas(formation) ?? DEFAULT_QUOTAS);
  }

  const eleven = elevenPicks
    .map((p) => toMember(p.row, p.slot, injured.has(p.row.id)))
    .filter((m): m is SquadMember => m !== null);
  if (eleven.length < 11) return { status: "shortSquad", assistant: assistantSummary };

  const inEleven = new Set(eleven.map((m) => m.id));
  const others = ownRows.results
    .filter((r) => !inEleven.has(r.id) && isSlot(r.position))
    .map((r) => toMember(r, r.position as Slot, injured.has(r.id)))
    .filter((m): m is SquadMember => m !== null);

  const rowsByTeam = new Map<string, PlayerRow[]>();
  for (const r of leagueRows.results) rowsByTeam.set(r.team_id, [...(rowsByTeam.get(r.team_id) ?? []), r]);
  const opponents: LeagueTeam[] = [];
  for (const t of leagueTeams.results) {
    const picks = pickBestEleven((rowsByTeam.get(t.id) ?? []).filter((r) => !injured.has(r.id)));
    const players = picks.map((p) => toMatchPlayer(p.row, p.slot)).filter((p): p is MatchPlayer => p !== null);
    if (players.length >= 11) opponents.push({ id: t.id, name: t.name, eleven: players });
  }
  if (opponents.length === 0) return { status: "noLeague", assistant: assistantSummary };

  const input: SquadAnalysisInput = {
    teamId,
    eleven,
    others,
    lineupSource,
    formation,
    formationFamiliarity: familiarity.formation,
    opponents,
    growth,
    assistant: {
      id: staff.id,
      name: assistantSummary.name,
      firstName: staff.first_name,
      female: assistantSummary.female,
      quality,
    },
    week: gameWeekKey(team.game_date),
  };
  return { status: "ready", assistant: assistantSummary, input };
}
