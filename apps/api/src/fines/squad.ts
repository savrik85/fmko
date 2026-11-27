/**
 * Odpor kabiny proti sazebníku (spec bod 4): přehnané pokuty tvrdě narazí.
 *
 * Stupně: 0 klid, 1 kapitán trenérovi napíše „tohle je moc“, 2 ultimátum v Kabině
 * („buď to stáhnete, nebo v sobotu nehrajeme“), 3 stávka: na zápas z ultimáta se
 * hromadně omluví hráči nejvíc přetížení pokutami. Stupeň se počítá denně z toho, kolik
 * kabina doopravdy platí (zátěž hráčů), jestli byl sazebník vnucený a jak často se měnil.
 * Zmírnění nebo zrušení sazebníku ultimátum ruší, paměť kabiny (resentment_until) zůstává.
 */

import type { ChatEnv } from "../messaging/ai-player-chat";
import { logger } from "../lib/logger";
import { currentSeasonSql } from "../lib/season";
import { captainOf } from "./captain";
import { scheduleHarshness } from "./harshness";
import { addDays, loadSchedule, moraleStmt, PLAYER_PROFILE_SQL, playerBurden, profileFromRow, type PlayerFineProfile, type ScheduleRow } from "./store";

const M = "fines-squad";

export interface SquadPressureInput {
  ratios: number[];
  origin: ScheduleRow["origin"];
  changesSeason: number;
  resentful: boolean;
  /** Tvrdost platného sazebníku (harshness.ts). Kabinu štve, i než se první pokuta zaplatí. */
  harshness: number;
}

/** Tlak kabiny z průměrné zátěže, podílu přetížených, tvrdosti a okolností sazebníku. */
export function squadPressure(i: SquadPressureInput): number {
  if (i.ratios.length === 0) return 0;
  const avg = i.ratios.reduce((s, r) => s + r, 0) / i.ratios.length;
  const overloaded = i.ratios.filter((r) => r >= 1).length / i.ratios.length;
  return avg + overloaded * 1.5 + Math.max(0, i.harshness - 1) * 0.35
    + (i.origin === "imposed" ? 0.25 : 0) + (i.changesSeason >= 3 ? 0.2 : 0) + (i.resentful ? 0.1 : 0);
}

export function targetStage(pressure: number): 0 | 1 | 2 {
  if (pressure >= 0.9) return 2;
  if (pressure >= 0.45) return 1;
  return 0;
}

const STAGE1_INSTRUCTION = [
  "Jsi kapitán. Kluci v kabině si stěžují, že pokut ze sazebníku je moc a některé to už bolí v kapse.",
  "Napiš trenérovi za kabinu, že tohle je moc a ať se nad tím zamyslí. Zatím slušně, bez vyhrožování.",
  "Piš krátce, jako SMS. Žádná čísla.",
].join("\n");

const STAGE1_REPLIES = [
  "Trenére, kluci si stěžujou, že těch pokut je moc. Zamyslete se nad tím.",
  "Za kabinu: ten sazebník už některý fakt bolí. Šlo by to ubrat?",
  "Trenére, v kabině je kvůli pokutám dusno. Říkám to dopředu.",
  "Kluci remcají, že platí víc, než hrajou. Tohle je moc.",
  "Trenére, jako kapitán musím říct, že ty pokuty kabinu štvou.",
  "Pokut je na kluky moc, trenére. Chtělo by to přibrzdit.",
  "Za kabinu vzkazuju: s pokutami to přeháníte.",
  "Trenére, kluci mě poslali. Pokuty jsou přes čáru.",
];

function ultimatumInstruction(when: string | null): string {
  return [
    "Jsi kapitán a píšeš do skupinového chatu Kabina, kde je i trenér. Kabina má sazebníku pokut dost.",
    `Za celou kabinu dej trenérovi ultimátum: buď sazebník stáhne nebo zmírní, nebo na ${when ?? "příští zápas"} kluci nepřijdou.`,
    "Piš rozhodně, ale bez sprostých slov. Krátce.",
  ].join("\n");
}

const ULTIMATUM_REPLIES = [
  "Trenére, za kabinu: buď ten sazebník stáhnete, nebo na příští zápas nepřijdem.",
  "Domluvili jsme se. Dokud platí tyhle pokuty, na zápas nejdem.",
  "Ultimátum, trenére. Zmírněte pokuty, nebo v sobotu hrajete sám.",
  "Kluci řekli dost. Buď sazebník změníte, nebo na zápas nedorazíme.",
  "Trenére, tohle je vzkaz celé kabiny: pokuty dolů, jinak nehrajem.",
  "Dáváme vám čas do zápasu. Pak bez nás.",
  "Takhle ne. Stáhněte to, nebo příště nastoupíte bez nás.",
  "Kabina se dohodla: se sazebníkem v téhle podobě na zápas nejdem.",
];

const STRIKE_TEXTS = [
  "Dokud platí ten sazebník, nehraju.",
  "Řekli jsme to. Bez změny pokut nepřijdu.",
  "Jsem s klukama. Dneska nejdu.",
  "Za tyhle pokuty dneska nehraju.",
  "Ultimátum platí. Nepřijdu.",
  "Nehraju, dokud se ty pokuty nezmění.",
];

async function nextLeagueMatch(db: D1Database, teamId: string, day: string): Promise<{ id: string; scheduled_at: string } | null> {
  return db.prepare(
    `SELECT sc.id, sc.scheduled_at FROM season_calendar sc JOIN teams t ON t.league_id = sc.league_id
      WHERE t.id = ? AND sc.status = 'scheduled' AND substr(sc.scheduled_at, 1, 10) > ? AND ${currentSeasonSql("sc")}
      ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId, day).first<{ id: string; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "příští zápas pro ultimátum", e); return null; });
}

function czechDay(iso: string): string {
  const days = ["neděli", "pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu"];
  return days[new Date(iso).getUTCDay()] ?? "příští zápas";
}

/** Kapitán napíše trenérovi (stupeň 1) nebo dá ultimátum v Kabině (stupeň 2). */
export async function announceSquadStage(db: D1Database, env: ChatEnv | undefined, teamId: string, stage: number, day: string): Promise<void> {
  const { clubReceivesMessages } = await import("../incidents/club-messages");
  if (!(await clubReceivesMessages(db, teamId))) return;
  const captain = await captainOf(db, teamId);
  if (!captain) return;
  const { sendEventSms } = await import("../messaging/event-sms");
  const player = { id: captain.id, firstName: captain.firstName, lastName: captain.lastName };
  if (stage <= 1) {
    await sendEventSms(db, env, {
      clubTeamId: teamId, player, instruction: STAGE1_INSTRUCTION, fallback: STAGE1_REPLIES,
      seed: `sazebnik-moc|${teamId}|${day}`, scenarioId: "fine_squad_complaint", metadata: { type: "fine_squad", stage: 1 },
    });
    return;
  }
  const match = await nextLeagueMatch(db, teamId, day);
  await db.prepare("UPDATE fine_schedules SET ultimatum_match_id = ? WHERE team_id = ?").bind(match?.id ?? null, teamId).run();
  const { kabinaConversationId } = await import("../messaging/coach-rules");
  const convId = await kabinaConversationId(db, teamId);
  await sendEventSms(db, env, {
    clubTeamId: teamId, player, convId, instruction: ultimatumInstruction(match ? czechDay(match.scheduled_at) : null),
    fallback: ULTIMATUM_REPLIES, seed: `sazebnik-ultimatum|${teamId}|${day}`, scenarioId: "fine_squad_ultimatum",
    // Ne `calendarId`: podle něj ranní omluvenky hledají konverzaci zápasu (season/team-day.ts)
    // a ultimátum v Kabině by ji přebilo.
    metadata: { type: "fine_squad", stage: 2, kabina: true, ultimatumMatchId: match?.id ?? null },
  });
}

/**
 * Denně pro lidský klub se sazebníkem: spočítá tlak kabiny, posune stupeň a pošle zprávy.
 * Přetíženým hráčům (stupeň 3) přidá nespokojenost, kvůli které chtějí pryč.
 */
export async function evaluateSquadFines(db: D1Database, env: ChatEnv | undefined, teamId: string, day: string): Promise<number> {
  const s = await loadSchedule(db, teamId);
  if (!s.row) return 0;
  const active = s.row.status === "active" && s.active.length > 0;
  const rows = await db.prepare(`${PLAYER_PROFILE_SQL} WHERE team_id = ? AND (status IS NULL OR status = 'active') AND age > 19`)
    .bind(teamId).all<Record<string, unknown>>();
  const players = (rows.results ?? []).map(profileFromRow);
  const burdens = await Promise.all(players.map(async (p) => ({ p, b: await playerBurden(db, p, day) })));
  const pressure = active ? squadPressure({
    ratios: burdens.map((x) => x.b.ratio), origin: s.row.origin, changesSeason: s.row.changes_season,
    resentful: !!s.row.resentment_until && s.row.resentment_until >= day,
    harshness: scheduleHarshness(s.active).score,
  }) : 0;
  const current = s.row.squad_stage;
  const target = targetStage(pressure);

  for (const { p, b } of burdens) {
    if (b.stage === 3) await addFineUnrest(db, p, day).catch((e) => logger.warn({ module: M, teamId }, `nespokojenost z pokut ${p.id}`, e));
  }

  // Stávka (3) trvá, dokud tlak neklesne (zmírnění ji ruší hned, captain.ts), nejdřív ale za týden.
  if (current >= 3) {
    if (target < 2 && s.row.squad_stage_at && s.row.squad_stage_at <= addDays(day, -7)) {
      await db.prepare("UPDATE fine_schedules SET squad_stage = 1, squad_stage_at = ?, ultimatum_match_id = NULL WHERE team_id = ?").bind(day, teamId).run();
    } else if (target >= 2 && !(await ultimatumStillPending(db, s.row.ultimatum_match_id, day))) {
      // Po stávce se nic nezměnilo: kapitán vyhlásí ultimátum na další zápas.
      await announceSquadStage(db, env, teamId, 2, day);
    }
    return pressure;
  }
  if (target > current) {
    await db.prepare("UPDATE fine_schedules SET squad_stage = ?, squad_stage_at = ? WHERE team_id = ?").bind(target, day, teamId).run();
    if (target >= 1) await db.batch(players.map((p) => moraleStmt(db, p.id, -1)));
    await announceSquadStage(db, env, teamId, target, day);
  } else if (target < current && s.row.squad_stage_at && s.row.squad_stage_at <= addDays(day, -7)) {
    await db.prepare("UPDATE fine_schedules SET squad_stage = ?, squad_stage_at = ?, ultimatum_match_id = CASE WHEN ? < 2 THEN NULL ELSE ultimatum_match_id END WHERE team_id = ?")
      .bind(current - 1, day, current - 1, teamId).run();
  }
  return pressure;
}

/** Zápas z ultimáta se ještě nehrál. */
async function ultimatumStillPending(db: D1Database, calendarId: string | null, day: string): Promise<boolean> {
  if (!calendarId) return false;
  const r = await db.prepare("SELECT status, scheduled_at FROM season_calendar WHERE id = ?").bind(calendarId).first<{ status: string; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: M }, `stav zápasu z ultimáta ${calendarId}`, e); return null; });
  return r?.status === "scheduled" && r.scheduled_at.slice(0, 10) >= day;
}

/** Hráč přetížený pokutami chce pryč: nespokojenost s důvodem „trenér“ (transfers/unrest). */
async function addFineUnrest(db: D1Database, p: PlayerFineProfile, day: string): Promise<void> {
  const row = await db.prepare("SELECT json_extract(life_context, '$.transferUnrest') AS u, json_extract(life_context, '$.fineUnrestAt') AS at FROM players WHERE id = ?")
    .bind(p.id).first<{ u: string | null; at: string | null }>();
  if (row?.at && row.at > addDays(day, -28)) return;
  let unrest: Record<string, unknown> = {};
  if (row?.u) {
    try { unrest = JSON.parse(row.u) as Record<string, unknown>; } catch (e) { logger.warn({ module: M }, `nespokojenost hráče ${p.id}`, e); }
  }
  const reasons = Array.isArray(unrest.reasons) ? (unrest.reasons as string[]) : [];
  const next = {
    ...unrest,
    level: Math.max(Number(unrest.level ?? 0) || 0, 50),
    reason: (unrest.reason as string | undefined) ?? "coach",
    reasons: reasons.includes("coach") ? reasons : ["coach", ...reasons],
    since: (unrest.since as string | undefined) ?? new Date().toISOString(),
    lastImpactAt: new Date().toISOString(),
  };
  await db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.transferUnrest', json(?), '$.fineUnrestAt', ?) WHERE id = ?")
    .bind(JSON.stringify(next), day, p.id).run();
}

/**
 * Ráno v den zápasu z ultimáta: stávkující se omluví do kabinové konverzace zápasu.
 * Volá season/team-day.ts po běžných omluvenkách. Vrací počet stávkujících.
 */
export async function strikeForMatch(
  db: D1Database, o: { teamId: string; calendarId: string; convId: string; day: string; skipIds: ReadonlySet<string> },
): Promise<number> {
  const s = await loadSchedule(db, o.teamId);
  if (!s.row || s.row.status !== "active" || s.row.squad_stage < 2 || s.row.ultimatum_match_id !== o.calendarId) return 0;
  const rows = await db.prepare(
    `${PLAYER_PROFILE_SQL} WHERE team_id = ? AND (status IS NULL OR status = 'active') AND age > 19
      AND (suspended_matches IS NULL OR suspended_matches = 0)
      AND id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)`,
  ).bind(o.teamId).all<Record<string, unknown>>();
  const candidates = [];
  for (const p of (rows.results ?? []).map(profileFromRow)) {
    if (o.skipIds.has(p.id)) continue;
    const b = await playerBurden(db, p, o.day);
    if (b.stage >= 1 || p.coachRelationship < 55 || p.temper >= 65) candidates.push({ p, ratio: b.ratio });
  }
  candidates.sort((a, b) => b.ratio - a.ratio || b.p.temper - a.p.temper);
  const count = Math.min(5, Math.max(3, Math.round(candidates.length / 3)));
  const strikers = candidates.slice(0, count);
  if (strikers.length === 0) return 0;
  const { brokenCzech } = await import("../messaging/foreign-speech");
  let i = 1;
  for (const { p } of strikers) {
    const nat = await db.prepare("SELECT nationality FROM players WHERE id = ?").bind(p.id).first<{ nationality: string | null }>();
    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'player', ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'))`,
    ).bind(crypto.randomUUID(), o.convId, p.id, `${p.firstName} ${p.lastName}`,
      brokenCzech(STRIKE_TEXTS[(i - 1) % STRIKE_TEXTS.length], nat?.nationality ?? null, `${p.id}|${o.calendarId}|strike`),
      JSON.stringify({ type: "attendance", response: "no", timing: "match_day", calendarId: o.calendarId, strike: true }), 200 + i * 10).run();
    i++;
  }
  await db.batch([
    db.prepare("UPDATE conversations SET unread_count = unread_count + ?, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
      .bind(strikers.length, `✊ ${strikers.length} hráčů stávkuje kvůli pokutám`, o.convId),
    db.prepare("UPDATE fine_schedules SET squad_stage = 3, squad_stage_at = ?, resentment_until = ? WHERE team_id = ?").bind(o.day, addDays(o.day, 60), o.teamId),
    ...strikers.map(({ p }) => moraleStmt(db, p.id, -3)),
  ]);
  const { coachRelationStmts } = await import("../lib/coach-relation");
  await db.batch(strikers.flatMap(({ p }) => coachRelationStmts(db, { playerId: p.id, delta: -3, source: "fine", description: "Stávka kabiny kvůli pokutám", gameDate: o.day })))
    .catch((e) => logger.warn({ module: M, teamId: o.teamId }, "vztah po stávce", e));
  logger.info({ module: M, teamId: o.teamId }, `stávka kvůli pokutám: ${strikers.length} hráčů na ${o.calendarId}`);
  return strikers.length;
}
