/**
 * Proslovy trenéra v kabině před zápasem a po něm. Mají skutečný dopad na zápas:
 *
 *  - Před zápasem (squad-talk.ts `applySpeech`): model proslov ohodnotí −2 až +3 a hodnocení
 *    posune formu dne v tom zápase (engine/form.ts `speechAdjustedRoll`). Výborný proslov
 *    zvedne šanci na výhru zhruba o 3 až 4 body, urážka ji o 3 body sníží
 *    (engine/speech-shift.test.ts).
 *  - Po zápase (`applyPostSpeech`): model posoudí, jestli tón sedí k výsledku. Hodnocení
 *    změní náladu celé kabiny (čte ji engine, omluvenky i nespokojenost), jmenovaní hráči
 *    dostanou pochvalu nebo výtku do vztahu k trenérovi a v dalším zápase se posune forma
 *    dne o menší kus.
 *
 * Jeden proslov každého druhu na zápas (unikátní index v `match_speeches`). Fráze, které
 * kabina slyšela minule, nezaberou. AI kluby píšou proslov přes model (ai-coach/speech.ts).
 */
import { applyCoachRelationDelta } from "../lib/coach-relation";
import { logger } from "../lib/logger";
import type { ChatEnv } from "./ai-player-chat";

const M = "match-speech";

export type SpeechKind = "pre" | "post";
export type SpeechAuthor = "coach" | "ai" | "rule";

/** Kratší zpráva do kabiny není proslov, jen hláška. */
export const MIN_SPEECH_CHARS = 80;
/** Posun formy dne za bod hodnocení (engine/speech-shift.test.ts měří dopad na výsledky). */
export const PRE_SHIFT_PER_POINT = 0.12;
export const POST_SHIFT_PER_POINT = 0.05;
/** Strop součtu posunů v jednom zápase (proslov před zápasem a po minulém). */
export const MAX_TOTAL_SHIFT = 0.5;
/** Proslov po zápase se počítá do 12 hodin od konce zápasu (večer nebo ráno po zápase). */
export const POST_WINDOW_MS = 12 * 3600_000;
/** Změna nálady kabiny za bod hodnocení proslovu po zápase (morálka 0–100). */
export const POST_MORALE_PER_POINT = 2;
/** Jmenovaný hráč: změna vztahu k trenérovi a vlastní nálady. */
export const NAMED_EFFECT = { praise: { relation: 4, morale: 3 }, criticism: { relation: -4, morale: -3 } } as const;

export function clampScore(score: number): number {
  return Math.max(-2, Math.min(3, Math.round(score)));
}

export function speechFormShift(kind: SpeechKind, score: number): number {
  const per = kind === "pre" ? PRE_SHIFT_PER_POINT : POST_SHIFT_PER_POINT;
  return Math.round(clampScore(score) * per * 1000) / 1000;
}

export function postMoraleDelta(score: number): number {
  return clampScore(score) * POST_MORALE_PER_POINT;
}

/** Slova bez diakritiky, delší než tři znaky (na porovnání frází). */
function words(text: string): Set<string> {
  return new Set(text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3));
}

/** Stejné fráze jako minule (shoda slov aspoň 60 %): kluci to už slyšeli, nezabere to. */
export function tooSimilar(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size) >= 0.6;
}

export function postSpeechInWindow(simulatedAt: string, now: Date): boolean {
  const t = Date.parse(simulatedAt);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= POST_WINDOW_MS;
}

/** Jak proslov zabral, slovy pro detail zápasu (čísla hráč nevidí). */
export function speechSummary(kind: SpeechKind, score: number): string {
  const s = clampScore(score);
  if (kind === "pre") {
    return [
      "Proslov před zápasem kabinu urazil, kluci šli na hřiště naštvaní.",
      "Proslov před zápasem kabinu otrávil.",
      "Proslov před zápasem nic nezměnil.",
      "Proslov před zápasem kluky trochu nakopl.",
      "Proslov před zápasem kabinu nabudil.",
      "Po proslovu před zápasem by kluci za trenéra dýchali.",
    ][s + 2];
  }
  return [
    "Proslov po minulém zápase kabinu urazil a táhlo se to s nimi.",
    "Proslov po minulém zápase kluky otrávil.",
    "Proslov po minulém zápase nic nezměnil.",
    "Proslov po minulém zápase kabině pomohl.",
    "Proslov po minulém zápase kabinu postavil na nohy.",
    "Proslov po minulém zápase kabinu semkl, šli do dalšího jako jeden muž.",
  ][s + 2];
}

export interface FinishedMatch {
  matchId: string;
  /** season_calendar.id (liga) nebo matches.id (přátelák): klíč proslovu. */
  matchKey: string;
  simulatedAt: string;
  ownScore: number;
  oppScore: number;
  opponentName: string;
}

/** Poslední odehraný zápas klubu (liga nebo přátelák). */
export async function lastFinishedMatch(db: D1Database, teamId: string): Promise<FinishedMatch | null> {
  const row = await db.prepare(
    `SELECT m.id, COALESCE(m.calendar_id, m.id) AS match_key, m.simulated_at, m.home_team_id, m.home_score, m.away_score,
            h.name AS home_name, a.name AS away_name
       FROM matches m LEFT JOIN teams h ON h.id = m.home_team_id LEFT JOIN teams a ON a.id = m.away_team_id
      WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND m.status = 'simulated' AND m.simulated_at IS NOT NULL
      ORDER BY m.simulated_at DESC LIMIT 1`,
  ).bind(teamId).first<{
    id: string; match_key: string; simulated_at: string; home_team_id: string; home_score: number | null; away_score: number | null;
    home_name: string | null; away_name: string | null;
  }>();
  if (!row) return null;
  const isHome = row.home_team_id === teamId;
  return {
    matchId: row.id, matchKey: row.match_key, simulatedAt: row.simulated_at,
    ownScore: (isHome ? row.home_score : row.away_score) ?? 0,
    oppScore: (isHome ? row.away_score : row.home_score) ?? 0,
    opponentName: (isHome ? row.away_name : row.home_name) ?? "soupeř",
  };
}

export interface PostSpeechVerdict {
  delta: number;
  mood: string;
  named: Array<{ id: string; stance: "praise" | "criticism" }>;
}

/** Model posoudí proslov po zápase: sedí tón k výsledku? A koho trenér jmenoval. */
export async function judgePostSpeech(
  env: ChatEnv, message: string, ctx: { match: FinishedMatch; roster: Array<{ id: string; name: string }> },
): Promise<PostSpeechVerdict | null> {
  const chat = await import("./ai-player-chat");
  const { match } = ctx;
  const result = match.ownScore > match.oppScore ? "výhra" : match.ownScore < match.oppScore ? "prohra" : "remíza";
  const parsed = await chat.askModelJson<{ delta?: unknown; mood?: unknown; named?: unknown }>(env, [
    chat.COACH_TEXT_RULE,
    `Trenér vesnického fotbalového týmu napsal do skupinového chatu kabiny po zápase s ${match.opponentName}`
      + ` (${result} ${match.ownScore}:${match.oppScore}):`,
    chat.coachQuote(message),
    "",
    "Sedí tón k výsledku a pomůže to kabině do dalšího zápasu? delta: −2 (po prohře je zesměšnil, po výhře se vytahoval nebo je ponížil),",
    "−1 (nefér, otrávené, výčitky bez důvodu), 0 (prázdné fráze), +1 (slušné, k věci), +2 (konkrétní, osobní, správný tón:",
    "pochvala po výhře, uklidnění po smolné prohře, oprávněná výtka po ostudě), +3 (výjimečný, kabina by za něj dýchala).",
    "Buď přísný, většina zpráv je 0 nebo +1. mood: jedna krátká věta česky, jak to kluci vzali, bez čísel.",
    `named: hráči, které trenér jmenovitě pochválil nebo zkritizoval, jen z tohoto seznamu (id | jméno):`,
    ...ctx.roster.map((p) => `${p.id} | ${p.name}`),
    "Vrať POUZE JSON: {\"delta\": číslo, \"mood\": \"...\", \"named\": [{\"id\": \"...\", \"stance\": \"praise\" nebo \"criticism\"}]},"
      + " delta celé číslo bez znaménka plus (např. 2, ne +2).",
  ].join("\n"), 260);
  const delta = Math.round(Number(parsed?.delta));
  if (!parsed || !Number.isFinite(delta)) return null;
  const valid = new Set(ctx.roster.map((p) => p.id));
  const named = Array.isArray(parsed.named)
    ? (parsed.named as Array<{ id?: unknown; stance?: unknown }>)
      .filter((n) => typeof n.id === "string" && valid.has(n.id) && (n.stance === "praise" || n.stance === "criticism"))
      .map((n) => ({ id: n.id as string, stance: n.stance as "praise" | "criticism" }))
      .filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i)
      .slice(0, 3)
    : [];
  return {
    delta: clampScore(delta),
    mood: typeof parsed.mood === "string" ? parsed.mood.replace(/\s+/g, " ").trim().slice(0, 140) : "",
    named,
  };
}

export interface SpeechRecord {
  teamId: string;
  kind: SpeechKind;
  matchKey: string;
  author: SpeechAuthor;
  score: number;
  mood?: string | null;
  moraleDelta?: number;
  named?: PostSpeechVerdict["named"];
  messageId?: string | null;
}

/** Zapíše proslov. Vrací id, nebo null, když proslov tohoto druhu k zápasu už je. */
export async function recordSpeech(db: D1Database, r: SpeechRecord): Promise<string | null> {
  const id = crypto.randomUUID();
  const res = await db.prepare(
    `INSERT OR IGNORE INTO match_speeches (id, team_id, kind, match_key, author, score, form_shift, morale_delta, mood, named, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, r.teamId, r.kind, r.matchKey, r.author, clampScore(r.score), speechFormShift(r.kind, r.score), r.moraleDelta ?? 0,
    r.mood ?? null, r.named?.length ? JSON.stringify(r.named) : null, r.messageId ?? null,
  ).run();
  return res.meta?.changes ? id : null;
}

/** Texty posledních proslovů trenéra (na hlídání opakovaných frází). */
export async function recentSpeechTexts(db: D1Database, teamId: string, limit = 3): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT m.body FROM match_speeches s JOIN messages m ON m.id = s.message_id
      WHERE s.team_id = ? AND s.author = 'coach' ORDER BY s.created_at DESC LIMIT ?`,
  ).bind(teamId, limit).all<{ body: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "minulé proslovy", e); return { results: [] as Array<{ body: string }> }; });
  return rows.results.map((r) => r.body);
}

/** Poslední zpráva trenéra v konverzaci (k ní se proslov váže). */
async function latestCoachMessageId(db: D1Database, convId: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT id FROM messages WHERE conversation_id = ? AND sender_type = 'user' ORDER BY sent_at DESC LIMIT 1",
  ).bind(convId).first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Proslov po zápase: do 12 hodin od konce posledního zápasu, delší zpráva do kabiny, jeden na
 * zápas. Změní náladu kabiny a vztah jmenovaných, posun formy dne se uplatní v dalším zápase.
 * Vrací verdikt (nálada pro reakce kabiny), nebo null, když to proslov po zápase není.
 */
/**
 * Je zpráva do kabiny kandidát na proslov po zápase (dost dlouhá, v okně po odehraném zápase)?
 * Jmenovaným hráčům pak dopad dává proslov (`applyPostSpeech`), hearsay jen zapíše, kdo co ví,
 * ať se pochvala nebo výtka nezapočítá dvakrát (závěrečná kontrola Kabina má uši).
 */
export async function isPostSpeechWindow(db: D1Database, teamId: string, message: string, now: Date = new Date()): Promise<boolean> {
  if (message.trim().length < MIN_SPEECH_CHARS) return false;
  const match = await lastFinishedMatch(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "poslední zápas pro okno proslovu", e); return null; });
  return !!match && postSpeechInWindow(match.simulatedAt, now);
}

export async function applyPostSpeech(
  db: D1Database, env: ChatEnv, o: { teamId: string; convId: string; message: string; now?: Date },
): Promise<PostSpeechVerdict | null> {
  if (o.message.trim().length < MIN_SPEECH_CHARS) return null;
  const now = o.now ?? new Date();
  const match = await lastFinishedMatch(db, o.teamId);
  if (!match || !postSpeechInWindow(match.simulatedAt, now)) return null;
  const done = await db.prepare("SELECT 1 FROM match_speeches WHERE team_id = ? AND kind = 'post' AND match_key = ? LIMIT 1")
    .bind(o.teamId, match.matchKey).first();
  if (done) return null;

  const roster = (await db.prepare(
    "SELECT id, first_name || ' ' || last_name AS name FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(o.teamId).all<{ id: string; name: string }>()).results;
  const verdict = await judgePostSpeech(env, o.message, { match, roster })
    .catch((e) => { logger.warn({ module: M, teamId: o.teamId }, "hodnocení proslovu po zápase", e); return null; });
  if (!verdict) return null;
  const previous = await recentSpeechTexts(db, o.teamId);
  if (verdict.delta > 0 && previous.some((p) => tooSimilar(p, o.message))) {
    verdict.delta = 0;
    verdict.mood = "Kluci to od trenéra slyšeli už minule, moc to s nimi nehnulo.";
  }

  const moraleDelta = postMoraleDelta(verdict.delta);
  const id = await recordSpeech(db, {
    teamId: o.teamId, kind: "post", matchKey: match.matchKey, author: "coach", score: verdict.delta,
    mood: verdict.mood, moraleDelta, named: verdict.named, messageId: await latestCoachMessageId(db, o.convId),
  });
  if (!id) return null;

  const stmts: D1PreparedStatement[] = [];
  if (moraleDelta !== 0) {
    stmts.push(db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(moraleDelta, o.teamId));
  }
  for (const n of verdict.named) {
    stmts.push(db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
        WHERE id = ? AND team_id = ?`,
    ).bind(NAMED_EFFECT[n.stance].morale, n.id, o.teamId));
  }
  if (stmts.length) await db.batch(stmts);
  for (const n of verdict.named) {
    await applyCoachRelationDelta(db, {
      playerId: n.id, delta: NAMED_EFFECT[n.stance].relation, source: "speech",
      description: n.stance === "praise" ? "Pochválil ho před celou kabinou" : "Zkritizoval ho před celou kabinou",
      referenceId: `speech-${id}-${n.id}`,
    }).catch((e) => logger.warn({ module: M, teamId: o.teamId }, `vztah jmenovaného hráče ${n.id}`, e));
  }
  logger.info({ module: M, teamId: o.teamId }, `proslov po zápase ${match.matchKey}: ${verdict.delta}, jmenováno ${verdict.named.length}`);
  return verdict;
}

/**
 * Posun formy dne pro zápas: proslov před tímto zápasem a proslov po minulém, který se ještě
 * neuplatnil. Součet má strop. `ids` se po zápase označí (`markSpeechesApplied`).
 */
export async function loadSpeechShift(
  db: D1Database, teamId: string, matchKey: string, kickoffIso: string,
): Promise<{ shift: number; ids: string[] }> {
  const rows = await db.prepare(
    `SELECT id, form_shift FROM match_speeches WHERE team_id = ?1 AND applied_match_id IS NULL AND (
       (kind = 'pre' AND match_key = ?2)
       OR (kind = 'post' AND match_key != ?2 AND created_at <= ?3 AND id = (
         SELECT id FROM match_speeches WHERE team_id = ?1 AND kind = 'post' AND applied_match_id IS NULL AND match_key != ?2 AND created_at <= ?3
         ORDER BY created_at DESC LIMIT 1)))`,
  ).bind(teamId, matchKey, kickoffIso).all<{ id: string; form_shift: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "proslovy k zápasu", e); return { results: [] as Array<{ id: string; form_shift: number }> }; });
  const sum = rows.results.reduce((s, r) => s + (Number(r.form_shift) || 0), 0);
  return { shift: Math.max(-MAX_TOTAL_SHIFT, Math.min(MAX_TOTAL_SHIFT, sum)), ids: rows.results.map((r) => r.id) };
}

export async function markSpeechesApplied(db: D1Database, ids: string[], matchId: string): Promise<void> {
  if (ids.length === 0) return;
  await db.batch(ids.map((id) => db.prepare(
    "UPDATE match_speeches SET applied_match_id = ?, applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND applied_match_id IS NULL",
  ).bind(matchId, id)));
}

/** Proslovy, které se v zápase uplatnily, slovy pro detail zápasu. */
export async function loadMatchSpeeches(db: D1Database, matchId: string): Promise<Array<{ teamId: string; kind: SpeechKind; summary: string }>> {
  const rows = await db.prepare("SELECT team_id, kind, score FROM match_speeches WHERE applied_match_id = ? ORDER BY kind DESC")
    .bind(matchId).all<{ team_id: string; kind: SpeechKind; score: number }>()
    .catch((e) => { logger.warn({ module: M }, `proslovy v zápase ${matchId}`, e); return { results: [] as Array<{ team_id: string; kind: SpeechKind; score: number }> }; });
  return rows.results.map((r) => ({ teamId: r.team_id, kind: r.kind, summary: speechSummary(r.kind, r.score) }));
}
