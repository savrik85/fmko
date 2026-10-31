/**
 * Okresní akce v databázi: ohlášení s pozvánkou do telefonu, odpověď trenéra a vyhodnocení
 * v den akce. Co se na akci stane, vymyslí model (district-event.ts), tady se to jen zapíše:
 * následky hráčům, vztahy trenérů, nálada kabin, reportáž do Zpravodaje všech lig okresu,
 * záznam do Událostí a SMS každému pozvanému klubu.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { aiContextFromEnv, generateText } from "../lib/ai-provider";
import { parseModelJson } from "../ai-coach/llm";
import { createRng, cryptoSeed, type Rng } from "../generators/rng";
import { coachRelationStmts } from "../lib/coach-relation";
import { applyIncidentEffects, type PubEffect, type PubIncident } from "../season/pub";
import { applyRelationEvent, getRelation, shiftSquadMorale } from "../community/manager-relations";
import { activeSeasonNumber } from "../transfers/unrest";
import {
  buildEventPrompt, buildInvitationPrompt, cleanInvitation, classifyEventReply, effectLabel,
  EVENT_CONFIRMATIONS, EVENT_REPLY_OPTIONS, isEventChoice, pickAttendance, plainInvitation, promptKeys,
  sanitizeEventReport, type CoachPairInfo, type EventChoice, type EventPlayer, type EventReport,
  type EventScene, type EventTeamInput,
} from "./district-event";

const M = "district-event";
/** Po tolika nevydařených pokusech o vyhodnocení se akce zruší. */
const MAX_ATTEMPTS = 3;
export const EVENT_PARTICIPANT_PREFIX = "de-";

type Env = Pick<Bindings, "DB" | "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL">;

export interface AnnounceInput {
  district: string;
  title: string;
  place: string;
  description: string;
  /** Herní den akce; bez něj zítřek podle herního data. */
  eventDate?: string;
}

interface InvitedTeam {
  id: string;
  name: string;
  league_id: string | null;
}

/** Lidské kluby okresu (áčka). AI kluby se akcí neúčastní. */
async function humanTeamsOfDistrict(db: D1Database, district: string): Promise<InvitedTeam[]> {
  const rows = await db.prepare(
    `SELECT t.id, t.name, t.league_id FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE v.district = ? AND t.user_id IS NOT NULL AND t.user_id != 'ai'
        AND t.parent_team_id IS NULL AND (t.team_type IS NULL OR t.team_type != 'u21')`,
  ).bind(district).all<InvitedTeam>();
  return rows.results;
}

function nextDay(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Ohlásí akci: pozvánka od pořadatelů do telefonu všem lidským trenérům okresu. */
export async function announceDistrictEvent(env: Env, input: AnnounceInput): Promise<{ eventId: string; invited: number; invitation: string }> {
  const db = env.DB;
  const teams = await humanTeamsOfDistrict(db, input.district);
  if (!teams.length) throw new Error(`V okrese ${input.district} není žádný lidský klub`);

  const gameDate = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teams[0].id)
    .first<{ game_date: string | null }>();
  const eventDate = input.eventDate ?? nextDay(gameDate?.game_date ?? new Date().toISOString());
  const season = (await activeSeasonNumber(db)) ?? 1;

  const ai = await aiContextFromEnv(env);
  const generated = await generateText(ai, buildInvitationPrompt(input.title, input.place, input.description), { maxTokens: 400, temperature: 0.9, module: M })
    .catch((e) => { logger.warn({ module: M }, "pozvánka od modelu", e); return null; });
  const invitation = cleanInvitation(generated) ?? plainInvitation(input.title, input.place, input.description);

  const eventId = crypto.randomUUID();
  const sender = `${input.title}, ${input.place}`;
  const metadata = JSON.stringify({ type: "district_event", eventId, options: EVENT_REPLY_OPTIONS });
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO district_events (id, district, title, place, description, invitation, event_date, season_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(eventId, input.district, input.title, input.place, input.description, invitation, eventDate, season),
  ];
  for (const t of teams) {
    const convId = crypto.randomUUID();
    stmts.push(
      db.prepare(
        `INSERT INTO conversations (id, team_id, type, title, participant_id, ai_thread_active, pinned, unread_count, last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', ?, ?, 1, 0, 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(convId, t.id, sender, `${EVENT_PARTICIPANT_PREFIX}${eventId}`, invitation.slice(0, 100)),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, sender, invitation, metadata),
      db.prepare("INSERT INTO district_event_teams (event_id, team_id, conv_id) VALUES (?, ?, ?)").bind(eventId, t.id, convId),
    );
  }
  await db.batch(stmts);
  logger.info({ module: M }, `ohlášena akce ${sender} (${input.district}) na ${eventDate}, pozváno ${teams.length} klubů`);
  return { eventId, invited: teams.length, invitation };
}

async function postSystemMessage(
  db: D1Database, convId: string, sender: string, body: string, unread: boolean, metadata?: Record<string, unknown>,
): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, sender, body, metadata ? JSON.stringify(metadata) : null),
    db.prepare(
      `UPDATE conversations SET last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
         unread_count = unread_count + ? WHERE id = ?`,
    ).bind(body.slice(0, 100), unread ? 1 : 0, convId),
  ]);
}

/**
 * Odpověď trenéra na pozvánku (tlačítko nebo volný text). Do vyhodnocení se dá
 * rozmyslet, platí poslední odpověď.
 */
export async function handleDistrictEventReply(db: D1Database, convId: string, teamId: string, text: string, optionId: string | null): Promise<void> {
  const row = await db.prepare(
    `SELECT e.id, e.title, e.place, e.status FROM district_event_teams dt JOIN district_events e ON e.id = dt.event_id
      WHERE dt.conv_id = ? AND dt.team_id = ?`,
  ).bind(convId, teamId).first<{ id: string; title: string; place: string; status: string }>();
  if (!row) return;
  const sender = `${row.title}, ${row.place}`;
  if (row.status !== "announced") {
    await postSystemMessage(db, convId, sender, "Akce už proběhla.", true);
    return;
  }
  const choice: EventChoice = isEventChoice(optionId) ? optionId : classifyEventReply(text);
  await db.prepare(
    "UPDATE district_event_teams SET choice = ?, chosen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE event_id = ? AND team_id = ?",
  ).bind(choice, row.id, teamId).run();
  await postSystemMessage(db, convId, sender, EVENT_CONFIRMATIONS[choice], true);
}

interface EventRow {
  id: string;
  district: string;
  title: string;
  place: string;
  description: string;
  event_date: string;
  season_number: number;
  attempts: number;
}

interface PlayerRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  alcohol: number | null;
  temper: number | null;
  discipline: number | null;
  leadership: number | null;
}

/** Hráči klubů, kteří můžou přijít: aktivní, nezranění, bez stopky. */
async function availablePlayers(db: D1Database, teamIds: string[]): Promise<PlayerRow[]> {
  if (!teamIds.length) return [];
  const rows = await db.prepare(
    `SELECT p.id, p.team_id, p.first_name, p.last_name, p.age, p.position,
            json_extract(p.personality, '$.alcohol') AS alcohol, json_extract(p.personality, '$.temper') AS temper,
            json_extract(p.personality, '$.discipline') AS discipline, json_extract(p.personality, '$.leadership') AS leadership
       FROM players p
      WHERE p.team_id IN (${teamIds.map(() => "?").join(",")}) AND (p.status IS NULL OR p.status = 'active')
        AND COALESCE(p.suspended_matches, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0)`,
  ).bind(...teamIds).all<PlayerRow>();
  return rows.results;
}

/** Vztahy a bratrství mezi trenéry, kteří přišli. */
async function coachPairs(db: D1Database, teamIds: string[]): Promise<CoachPairInfo[]> {
  const { familyLineBetweenTeams } = await import("../community/manager-family");
  const out: CoachPairInfo[] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const rel = await getRelation(db, teamIds[i], teamIds[j]);
      const family = await familyLineBetweenTeams(db, teamIds[i], teamIds[j])
        .catch((e) => { logger.warn({ module: M }, "bratři mezi trenéry", e); return null; });
      out.push({ teamA: teamIds[i], teamB: teamIds[j], respect: rel.respect, heat: rel.heat, brothers: !!family });
    }
  }
  return out;
}

/** Následky jedné akce do databáze. */
async function applyReport(db: D1Database, ev: EventRow, report: EventReport, gameDate: string): Promise<void> {
  const label = `${ev.title}, ${ev.place}`;
  const incidents: PubIncident[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const scene of report.scenes) {
    const effects: PubEffect[] = [];
    for (const e of scene.effects) {
      if (e.kind === "condition" || e.kind === "morale") {
        effects.push({ playerId: e.playerId, type: e.kind, delta: e.value, label: effectLabel(e) });
      } else if (e.kind === "hangover") {
        effects.push({ playerId: e.playerId, type: "hangover", label: effectLabel(e) });
      } else if (e.kind === "injury") {
        effects.push({ playerId: e.playerId, type: "injury", injuryDays: e.value, label: effectLabel(e), injuryDescription: `Zranění z akce: ${label}` });
      } else if (e.kind === "coach_bond") {
        stmts.push(...coachRelationStmts(db, { playerId: e.playerId, delta: e.value, source: "district_event", description: label, gameDate }));
      } else if (e.kind === "suspension") {
        stmts.push(db.prepare("UPDATE players SET suspended_matches = COALESCE(suspended_matches, 0) + 1 WHERE id = ?").bind(e.playerId));
      }
    }
    if (effects.length) incidents.push({ type: "district_event", playerIds: [], text: scene.text, effects });
  }
  stmts.push(...await applyIncidentEffects(db, incidents));
  if (stmts.length) await db.batch(stmts);

  for (const scene of report.scenes) {
    for (const r of scene.coachRelations) {
      await applyRelationEvent(db, r.teamA, r.teamB, { respect: r.respect, heat: r.heat, icon: "🎡", text: label })
        .catch((e) => logger.warn({ module: M }, "vztah trenérů po akci", e));
    }
    for (const m of scene.squadMorale) {
      await shiftSquadMorale(db, m.teamId, m.delta).catch((e) => logger.warn({ module: M }, "nálada kabiny po akci", e));
    }
  }
}

/** Co se na akci stalo lidem jednoho klubu: scény a následky vlastních hráčů, po hráčích. */
function teamSummary(scenes: EventScene[], players: Map<string, { name: string; teamId: string }>, teamId: string): { lines: string[]; effects: string[] } {
  const lines = scenes.map((s) => s.text);
  const byPlayer = new Map<string, string[]>();
  for (const s of scenes) {
    for (const e of s.effects) {
      const p = players.get(e.playerId);
      if (!p || p.teamId !== teamId) continue;
      byPlayer.set(p.name, [...(byPlayer.get(p.name) ?? []), effectLabel(e)]);
    }
  }
  const effects = [...byPlayer].map(([name, labels]) => `${name}: ${labels.join(", ")}`);
  return { lines, effects };
}

/**
 * Vyhodnotí jednu akci: přítomní, scény od modelu, následky, Zpravodaj, Události, SMS.
 * Vrací false, když model nic použitelného nevrátil (zkusí se znovu příští den).
 */
export async function resolveDistrictEvent(env: Env, eventId: string, rng: Rng = createRng(cryptoSeed())): Promise<{ ok: boolean; scenes: number; reason?: string }> {
  const db = env.DB;
  const claimed = await db.prepare(
    "UPDATE district_events SET status = 'resolving', attempts = attempts + 1 WHERE id = ? AND status = 'announced'",
  ).bind(eventId).run();
  if (!claimed.meta.changes) return { ok: false, scenes: 0, reason: "akce není ohlášená nebo se už vyhodnocuje" };
  const ev = await db.prepare("SELECT * FROM district_events WHERE id = ?").bind(eventId).first<EventRow>();
  if (!ev) return { ok: false, scenes: 0, reason: "akce nenalezena" };

  const invited = await db.prepare(
    `SELECT dt.team_id, dt.choice, dt.conv_id, t.name, t.league_id, t.game_date,
            (SELECT m.name FROM managers m WHERE m.team_id = t.id LIMIT 1) AS coach
       FROM district_event_teams dt JOIN teams t ON t.id = dt.team_id WHERE dt.event_id = ?`,
  ).bind(eventId).all<{ team_id: string; choice: string | null; conv_id: string; name: string; league_id: string | null; game_date: string | null; coach: string | null }>();

  const players = await availablePlayers(db, invited.results.map((t) => t.team_id));
  const teamName = new Map(invited.results.map((t) => [t.team_id, t.name]));
  const toPlayer = (p: PlayerRow): EventPlayer => ({
    id: p.id, teamId: p.team_id, teamName: teamName.get(p.team_id) ?? "", firstName: p.first_name, lastName: p.last_name,
    age: p.age, position: p.position, alcohol: p.alcohol ?? 50, temper: p.temper ?? 50, discipline: p.discipline ?? 50, leadership: p.leadership ?? 50,
  });
  const teams: EventTeamInput[] = invited.results.map((t) => ({
    teamId: t.team_id, teamName: t.name, coachName: (t.coach ?? "Trenér").split(" ").slice(-1)[0],
    choice: isEventChoice(t.choice) ? t.choice : null,
    squad: players.filter((p) => p.team_id === t.team_id).map(toPlayer),
  }));
  const attendance = pickAttendance(teams, rng);
  const keys = promptKeys(attendance);
  const pairs = await coachPairs(db, attendance.coaches.map((c) => c.teamId));
  const absentTeams = teams.filter((t) => !attendance.coaches.some((c) => c.teamId === t.teamId)).map((t) => t.teamName);

  const prompt = buildEventPrompt({
    title: ev.title, place: ev.place, description: ev.description, district: ev.district, keys, coachPairs: pairs, absentTeams,
  });
  const ai = await aiContextFromEnv(env);
  const raw = attendance.coaches.length + attendance.players.length === 0
    ? null
    : await generateText(ai, prompt, { maxTokens: 6000, temperature: 0.95, json: true, module: M })
      .catch((e) => { logger.warn({ module: M }, "scény akce od modelu", e); return null; });
  const report = sanitizeEventReport(parseModelJson(raw), keys);

  const nobody = attendance.coaches.length + attendance.players.length === 0;
  if (!report && !nobody) {
    const failed = ev.attempts + 1 >= MAX_ATTEMPTS;
    await db.prepare("UPDATE district_events SET status = ? WHERE id = ?").bind(failed ? "failed" : "announced", eventId).run();
    logger.error({ module: M }, `model nevrátil scény akce ${eventId} (pokus ${ev.attempts + 1}): ${(raw ?? "").slice(0, 300)}`);
    return { ok: false, scenes: 0, reason: failed ? "model selhal, akce zrušena" : "model selhal, zkusí se znovu" };
  }

  const gameDate = invited.results.find((t) => t.game_date)?.game_date ?? ev.event_date;
  const label = `${ev.title}, ${ev.place}`;
  if (report) await applyReport(db, ev, report, gameDate);

  // Zpravodaj všech lig, kde hraje pozvaný klub.
  const leagues = [...new Set(invited.results.map((t) => t.league_id).filter((l): l is string => !!l))];
  if (report) {
    const body = [report.body, ...report.scenes.map((s) => s.text)].filter(Boolean).join("\n\n");
    const newsStmts = leagues.map((leagueId) => db.prepare(
      `INSERT INTO news (id, league_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, 'district_event', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), leagueId, report.headline, body, ev.season_number));
    if (newsStmts.length) await db.batch(newsStmts).catch((e) => logger.warn({ module: M }, "reportáž do Zpravodaje", e));
  }

  // Každému klubu: co se stalo jeho lidem (Události + SMS).
  const people = new Map(attendance.players.map((p) => [p.id, { name: `${p.firstName} ${p.lastName}`, teamId: p.teamId }]));
  for (const t of invited.results) {
    const scenes = (report?.scenes ?? []).filter((s) => s.teamIds.includes(t.team_id));
    const came = attendance.coaches.some((c) => c.teamId === t.team_id) || attendance.players.some((p) => p.teamId === t.team_id);
    const { lines, effects } = teamSummary(scenes, people, t.team_id);
    const description = scenes.length
      ? lines.join("\n\n")
      : came ? "Vaši lidé tam byli, ale drželi se stranou. Nic se nestalo." : "Z vašeho klubu nikdo nepřišel.";

    const sms = scenes.length
      ? `Co se dělo: ${lines.join(" ")}${effects.length ? `\n\nNásledky: ${effects.join("; ")}.` : ""}`
      : description;
    // Tlačítko pod zprávou vede na kartu akce s avatary a následky (telefon: metadata.type „guide").
    await postSystemMessage(db, t.conv_id, label, `${sms}\n\nDetail najdeš v Událostech.`, true, { type: "guide", href: "/udalosti", label: "Otevřít Události" })
      .catch((e) => logger.warn({ module: M }, "SMS po akci", e));
    await db.prepare("UPDATE conversations SET ai_thread_active = 0 WHERE id = ?").bind(t.conv_id).run()
      .catch((e) => logger.warn({ module: M }, "zavřít vlákno akce", e));
  }

  await db.prepare("UPDATE district_events SET status = 'done', report = ? WHERE id = ?")
    .bind(JSON.stringify({ attendance: { coaches: attendance.coaches, players: attendance.players.map((p) => p.id) }, report }), eventId).run();
  logger.info({ module: M }, `akce ${label} vyhodnocena: ${report?.scenes.length ?? 0} scén, ${attendance.coaches.length} trenérů, ${attendance.players.length} hráčů`);
  return { ok: true, scenes: report?.scenes.length ?? 0 };
}

/** Denní tick: vyhodnotit akce, jejichž den nastal. */
export async function resolveDueDistrictEvents(env: Env, gameDate: string): Promise<number> {
  const due = await env.DB.prepare("SELECT id FROM district_events WHERE status = 'announced' AND event_date <= ?")
    .bind(gameDate).all<{ id: string }>();
  let done = 0;
  for (const e of due.results) {
    const r = await resolveDistrictEvent(env, e.id)
      .catch((err) => { logger.error({ module: M }, `vyhodnocení akce ${e.id}`, err); return { ok: false }; });
    if (r.ok) done++;
  }
  return done;
}

export interface TeamEventPerson {
  kind: "coach" | "player";
  id: string;
  name: string;
  teamName: string;
  /** Z mého klubu. */
  own: boolean;
  avatar: Record<string, unknown> | null;
  /** Následky (u vlastních hráčů) nebo změna vztahu (u cizího trenéra vůči mému). */
  effects: Array<{ label: string; tone: "good" | "bad" | "neutral" }>;
}

export interface TeamEventView {
  id: string;
  title: string;
  place: string;
  eventDate: string;
  status: string;
  myChoice: EventChoice | null;
  headline: string | null;
  scenes: Array<{ text: string; people: TeamEventPerson[] }>;
}

function parseAvatar(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as Record<string, unknown>;
    return a && Object.keys(a).length > 2 ? a : null;
  } catch (e) {
    logger.warn({ module: M }, "avatar pro okresní akci", e);
    return null;
  }
}

/** Okresní akce klubu pro stránku Události: jen scény, kde byli jeho lidé, s avatary a následky. */
export async function loadTeamDistrictEvents(db: D1Database, teamId: string): Promise<TeamEventView[]> {
  const rows = await db.prepare(
    `SELECT e.id, e.title, e.place, e.event_date, e.status, e.report, dt.choice
       FROM district_event_teams dt JOIN district_events e ON e.id = dt.event_id
      WHERE dt.team_id = ? ORDER BY e.event_date DESC, e.created_at DESC LIMIT 10`,
  ).bind(teamId).all<{ id: string; title: string; place: string; event_date: string; status: string; report: string | null; choice: string | null }>();

  const views: TeamEventView[] = [];
  const playerIds = new Set<string>();
  const teamIds = new Set<string>();
  const parsed = rows.results.map((r) => {
    let report: EventReport | null = null;
    try { report = r.report ? (JSON.parse(r.report) as { report: EventReport | null }).report : null; } catch (e) { logger.warn({ module: M }, "reportáž akce", e); }
    const scenes = (report?.scenes ?? []).filter((s) => s.teamIds.includes(teamId));
    for (const sc of scenes) for (const p of sc.people ?? []) (p.kind === "player" ? playerIds : teamIds).add(p.id);
    for (const sc of scenes) for (const p of sc.people ?? []) teamIds.add(p.teamId);
    return { r, report, scenes };
  });

  const players = new Map<string, { name: string; avatar: string | null }>();
  if (playerIds.size) {
    const res = await db.prepare(`SELECT id, first_name, last_name, avatar FROM players WHERE id IN (${[...playerIds].map(() => "?").join(",")})`)
      .bind(...playerIds).all<{ id: string; first_name: string; last_name: string; avatar: string | null }>();
    for (const p of res.results) players.set(p.id, { name: `${p.first_name} ${p.last_name}`, avatar: p.avatar });
  }
  const clubs = new Map<string, { name: string; coach: string; avatar: string | null }>();
  if (teamIds.size) {
    const res = await db.prepare(
      `SELECT t.id, t.name, m.name AS coach, m.avatar FROM teams t LEFT JOIN managers m ON m.team_id = t.id
        WHERE t.id IN (${[...teamIds].map(() => "?").join(",")})`,
    ).bind(...teamIds).all<{ id: string; name: string; coach: string | null; avatar: string | null }>();
    for (const t of res.results) clubs.set(t.id, { name: t.name, coach: t.coach ?? "Trenér", avatar: t.avatar });
  }

  for (const { r, report, scenes } of parsed) {
    views.push({
      id: r.id, title: r.title, place: r.place, eventDate: r.event_date, status: r.status,
      myChoice: isEventChoice(r.choice) ? r.choice : null,
      headline: report?.headline ?? null,
      scenes: scenes.map((sc) => ({
        text: sc.text,
        people: (sc.people ?? []).map((p): TeamEventPerson => {
          const club = clubs.get(p.teamId);
          const own = p.teamId === teamId;
          const effects: TeamEventPerson["effects"] = [];
          if (p.kind === "player" && own) {
            for (const e of sc.effects.filter((x) => x.playerId === p.id)) {
              const bad = e.kind === "injury" || e.kind === "suspension" || e.kind === "hangover" || e.value < 0;
              effects.push({ label: effectLabel(e), tone: bad ? "bad" : "good" });
            }
          }
          if (p.kind === "player" && !own && sc.transferHint?.playerId === p.id && sc.transferHint.toTeamId === teamId) {
            effects.push({ label: "by šel k tobě", tone: "good" });
          }
          if (p.kind === "coach" && !own) {
            for (const rel of sc.coachRelations.filter((x) => (x.teamA === teamId && x.teamB === p.id) || (x.teamB === teamId && x.teamA === p.id))) {
              if (rel.respect) effects.push({ label: `respekt ${rel.respect > 0 ? "+" : ""}${rel.respect}`, tone: rel.respect > 0 ? "good" : "bad" });
              if (rel.heat) effects.push({ label: `napětí ${rel.heat > 0 ? "+" : ""}${rel.heat}`, tone: rel.heat > 0 ? "bad" : "good" });
            }
          }
          if (p.kind === "coach" && own) {
            for (const m of sc.squadMorale.filter((x) => x.teamId === teamId)) {
              effects.push({ label: `nálada kabiny ${m.delta > 0 ? "+" : ""}${m.delta}`, tone: m.delta > 0 ? "good" : "bad" });
            }
          }
          return p.kind === "player"
            ? { kind: "player", id: p.id, name: players.get(p.id)?.name ?? "Hráč", teamName: club?.name ?? "", own, avatar: parseAvatar(players.get(p.id)?.avatar ?? null), effects }
            : { kind: "coach", id: p.id, name: `trenér ${club?.coach ?? ""}`.trim(), teamName: club?.name ?? "", own, avatar: parseAvatar(club?.avatar ?? null), effects };
        }),
      })),
    });
  }
  return views;
}
