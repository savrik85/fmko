/**
 * Proslovy AI trenérů (messaging/match-speech.ts). Proslov má v zápase skutečný dopad (forma
 * dne), takže ho AI kluby píšou taky, jinak by lidské kluby měly výhodu zadarmo.
 *
 * AI trenér napíše proslov přes model a hodnotí ho stejný posudek jako proslov člověka
 * (`judgeSpeech`, `judgePostSpeech`). Bez modelu (režim off nebo shadow, výpadek) rozhodne
 * pravidlo: slušná motivace, +1. Proslov se zapíše jednou na zápas (unikátní index).
 */
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import {
  judgePostSpeech, lastFinishedMatch, postMoraleDelta, postSpeechInWindow, recordSpeech, type FinishedMatch,
} from "../messaging/match-speech";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel } from "./llm";
import type { CoachFixture } from "./match";
import { readCoachMode } from "./mode";

const M = "ai-coach-speech";
/** Hodnocení proslovu AI klubu bez modelu: slušná motivace. */
export const AI_RULE_SPEECH_SCORE = 1;
const MODEL_TIMEOUT_MS = 20_000;

const SPEECH_SYSTEM = "Jsi trenér amatérského vesnického fotbalového klubu. Píšeš krátkou zprávu do skupinového chatu kabiny, česky, "
  + "dvě až čtyři věty, jako obyčejný člověk z vesnice, bez dlouhých pomlček. Odpověz jen JSON {\"text\": \"...\"}.";

async function writeSpeech(env: Bindings, user: string): Promise<string | null> {
  const res = await callCoachModel(env, {
    system: SPEECH_SYSTEM, user, maxTokens: 300, temperature: 0.8, timeoutMs: MODEL_TIMEOUT_MS,
    schema: { name: "speech", schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  });
  const text = (res.json as { text?: unknown } | null)?.text;
  return typeof text === "string" && text.trim().length >= 40 ? text.trim().slice(0, 600) : null;
}

/** Soupeř v zápase AI klubu (liga podle kola, přátelák podle id zápasu). */
async function opponentOf(db: D1Database, teamId: string, fixture: CoachFixture): Promise<string | null> {
  const row = await db.prepare(
    `SELECT CASE WHEN m.home_team_id = ?1 THEN a.name ELSE h.name END AS opponent
       FROM matches m LEFT JOIN teams h ON h.id = m.home_team_id LEFT JOIN teams a ON a.id = m.away_team_id
      WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND (m.calendar_id = ?2 OR m.id = ?2) LIMIT 1`,
  ).bind(teamId, fixture.calendarId).first<{ opponent: string | null }>();
  return row?.opponent ?? null;
}

/**
 * Proslov AI trenéra před dnešním zápasem (úloha `match` z ai-coach/jobs.ts). Pohár proslov
 * nemá (runner poháru ho nečte). Nikdy nehází, chyba jde do logu.
 */
export async function prepareAiPreSpeech(env: Bindings, teamId: string, fixture: CoachFixture): Promise<void> {
  try {
    if (fixture.kind === "cup") return;
    const db = env.DB;
    const done = await db.prepare("SELECT 1 FROM match_speeches WHERE team_id = ? AND kind = 'pre' AND match_key = ? LIMIT 1")
      .bind(teamId, fixture.calendarId).first();
    if (done) return;
    const team = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>();
    const opponent = await opponentOf(db, teamId, fixture);
    let score = AI_RULE_SPEECH_SCORE;
    let author: "ai" | "rule" = "rule";
    let mood: string | null = null;
    if (await readCoachMode(env.CACHE_KV, "match") === "on") {
      const text = await writeSpeech(env, `Klub: ${team?.name ?? "náš klub"}. Dnes večer hrajete s ${opponent ?? "soupeřem"}. `
        + "Napiš proslov do kabiny před zápasem, ať kluky nabudíš.")
        .catch((e) => { logger.warn({ module: M, teamId }, "proslov AI trenéra před zápasem", e); return null; });
      if (text) {
        const { judgeSpeech } = await import("../messaging/squad-talk");
        const verdict = await judgeSpeech(env, text, `DNES s ${opponent ?? "soupeřem"}`)
          .catch((e) => { logger.warn({ module: M, teamId }, "hodnocení proslovu AI trenéra", e); return null; });
        if (verdict) { score = verdict.delta; author = "ai"; mood = verdict.mood; }
      }
    }
    await recordSpeech(db, { teamId, kind: "pre", matchKey: fixture.calendarId, author, score, mood });
  } catch (e) {
    logger.warn({ module: M, teamId }, `proslov AI klubu před zápasem ${fixture.calendarId}`, e);
  }
}

/** Proslov AI trenéra po zápase: model ho napíše, posudek ohodnotí, kabině se pohne nálada. */
async function aiPostSpeech(env: Bindings, teamId: string, match: FinishedMatch): Promise<void> {
  const db = env.DB;
  let score = AI_RULE_SPEECH_SCORE;
  let author: "ai" | "rule" = "rule";
  let mood: string | null = null;
  if (await readCoachMode(env.CACHE_KV, "match") === "on") {
    const result = match.ownScore > match.oppScore ? "vyhráli" : match.ownScore < match.oppScore ? "prohráli" : "remizovali";
    const text = await writeSpeech(env, `Právě jste s ${match.opponentName} ${result} ${match.ownScore}:${match.oppScore}. `
      + "Napiš kabině, co si o zápase myslíš a co čekáš příště.")
      .catch((e) => { logger.warn({ module: M, teamId }, "proslov AI trenéra po zápase", e); return null; });
    if (text) {
      const verdict = await judgePostSpeech(env, text, { match, roster: [] })
        .catch((e) => { logger.warn({ module: M, teamId }, "hodnocení proslovu AI trenéra po zápase", e); return null; });
      if (verdict) { score = verdict.delta; author = "ai"; mood = verdict.mood; }
    }
  }
  const moraleDelta = postMoraleDelta(score);
  const id = await recordSpeech(db, { teamId, kind: "post", matchKey: match.matchKey, author, score, mood, moraleDelta });
  if (id && moraleDelta !== 0) {
    await db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(moraleDelta, teamId).run();
  }
}

/** Hodinová práce AI trenéra: do 12 hodin po zápase proslov kabině (jednou na zápas). */
export const postMatchSpeechHourlyHook: HourlyHook = async (env, teamId, _profile, now) => {
  const db = env.DB;
  const team = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(teamId).first<{ user_id: string | null }>();
  if (team?.user_id !== "ai") return;
  const match = await lastFinishedMatch(db, teamId);
  if (!match || !postSpeechInWindow(match.simulatedAt, now)) return;
  const done = await db.prepare("SELECT 1 FROM match_speeches WHERE team_id = ? AND kind = 'post' AND match_key = ? LIMIT 1")
    .bind(teamId, match.matchKey).first();
  if (done) return;
  await aiPostSpeech(env, teamId, match);
};
