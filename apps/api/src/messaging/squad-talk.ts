/**
 * Kabina jako parta (bod 3 rozboru SMS z produ, docs/analyza-sms-manazeru-2026-11-18.md).
 *
 * Dřív na každou zprávu trenéra do kabiny odpověděl jeden náhodně vylosovaný hráč a nic
 * dalšího se nestalo. Hráč v kabině hlásil nabídku z Krumlova, trenér ho přemlouval
 * a odpovídali jen ostatní („nikam nechoď 🍺“); manažer: „vážně mi odepíše jeden člověk?“.
 *
 * - kdo se ozve: oslovený hráč (jméno, přezdívka, příjmení), pak ten, komu trenér odpovídá,
 *   pak ostatní podle povahy (`pickResponders`); u důležité zprávy dva až tři (`responderCount`)
 * - proslov před zápasem jednou za zápas pohne náladou kabiny (`judgeSpeech`)
 * - „když vyhrajeme, platím hospodu“ je sázka celé kabiny (coach-commitments.ts, `squad`)
 * - „žádné omluvenky, chci tam všechny“ může omluvené přemluvit (`persuadeAbsentees`)
 */

import { logger } from "../lib/logger";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import type { ChatEnv } from "./ai-player-chat";

const M = "squad-talk";

/** Malá písmena bez diakritiky, slova oddělená mezerou. */
export function plainWords(s: string): string[] {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Pasuje slovo zprávy na jméno i se skloňováním („Honzo“, „Nováku“, „Pepovi“)? Krátká jména
 * jen přesně nebo s koncovkou, delší podle kmene; jinak by „pět“ oslovilo Petra.
 */
export function wordMatchesName(word: string, name: string): boolean {
  const n = plainWords(name)[0];
  if (!n || n.length < 3) return false;
  if (word === n) return true;
  if (n.length <= 4) return word.length <= n.length + 3 && ["o", "e", "i", "u", "a", "ovi", "em", "ou"].some((end) => word === n + end || word === n.slice(0, -1) + end);
  const stem = n.slice(0, n.length >= 6 ? -2 : -1);
  return word.startsWith(stem) && word.length <= n.length + 3;
}

export interface Addressable { id: string; firstName: string; lastName: string; nickname?: string | null }

/**
 * Koho trenér ve zprávě oslovil. Přezdívka a příjmení stačí samy, křestní jméno jen
 * když ho v kádru nemá nikdo jiný (dva Honzové = nikdo).
 */
export function addressedPlayers<T extends Addressable>(players: readonly T[], message: string): T[] {
  const words = plainWords(message);
  const hits = (name: string | null | undefined) => !!name && words.some((w) => wordMatchesName(w, name));
  const strong = players.filter((p) => hits(p.nickname) || hits(p.lastName));
  const byFirst = players.filter((p) => !strong.includes(p) && hits(p.firstName));
  const uniqueFirst = byFirst.filter((p) => players.filter((q) => plainWords(q.firstName)[0] === plainWords(p.firstName)[0]).length === 1);
  return [...strong, ...uniqueFirst];
}

/** Zpráva celé kabině nebo dlouhý proslov: ozve se víc lidí. */
const WHOLE_SQUAD_RE = /\b(kluci|hosi|panove|vsichni|chlapi|borci|parto|mansaft|kdo|lidi|kabino|hosani)\b/;

/** Kolik hráčů na zprávu odpoví (1–3). */
export function responderCount(message: string, addressed: number): number {
  const len = message.trim().length;
  const toAll = WHOLE_SQUAD_RE.test(plainWords(message).join(" "));
  let n = 1;
  if (len >= 100 || toAll) n++;
  if (len >= 250) n++;
  return Math.min(3, Math.max(n, Math.min(2, addressed)));
}

/**
 * Pořadí, ve kterém se hráči ozvou: oslovení, pak ten, komu trenér odpovídá (psal poslední,
 * nejvýš před dvěma hodinami), pak podle povahy (`weightedPick`).
 */
export function pickResponders<T extends Addressable>(
  candidates: readonly T[],
  message: string,
  lastSpeaker: { id: string; at: string } | null,
  weightedPick: (pool: readonly T[]) => T | null,
  now: Date = new Date(),
): T[] {
  const addressed = addressedPlayers(candidates, message).slice(0, 2);
  const count = responderCount(message, addressed.length);
  const out: T[] = [...addressed];
  const recent = lastSpeaker && now.getTime() - Date.parse(lastSpeaker.at) < 2 * 3600 * 1000
    ? candidates.find((p) => p.id === lastSpeaker.id) : undefined;
  if (recent && addressed.length === 0 && out.length < count) out.push(recent);
  while (out.length < count) {
    const next = weightedPick(candidates.filter((p) => !out.includes(p)));
    if (!next) break;
    out.push(next);
  }
  return out.slice(0, count);
}

// ─── Proslov před zápasem ───────────────────────────────────────────────────

export interface SpeechVerdict {
  /** Změna nálady kabiny, −2 až +3 (morálka 0–100). */
  delta: number;
  /** Jak to kabina vzala, jednou větou pro hráče, kteří reagují. */
  mood: string;
}

/** Proslov se hodnotí, jen když je zápas dnes nebo zítra a zpráva je delší. */
export function speechEligible(message: string, nextMatch: string | undefined): boolean {
  return message.trim().length >= 80 && !!nextMatch && /^(DNES|zítra)/.test(nextMatch);
}

export async function judgeSpeech(env: ChatEnv, message: string, nextMatch: string): Promise<SpeechVerdict | null> {
  const chat = await import("./ai-player-chat");
  const parsed = await chat.askModelJson<{ delta?: unknown; mood?: unknown }>(env, [
    chat.COACH_TEXT_RULE,
    `Trenér vesnického fotbalového týmu napsal do skupinového chatu kabiny před zápasem (${nextMatch}):`,
    chat.coachQuote(message),
    "",
    "Jak to kabinu nabudí? delta: −2 (urazil je, zesměšnil, vyhrožoval), −1 (otrávil, odbyl), 0 (nic moc, prázdné fráze),",
    "+1 (slušná motivace), +2 (dobrý proslov, konkrétní, osobní), +3 (výjimečný, kabina by za něj dýchala).",
    "Buď přísný, většina zpráv je 0 nebo +1. mood: jedna krátká věta česky, jak to kluci vzali, bez čísel.",
    "Vrať POUZE JSON: {\"delta\": číslo, \"mood\": \"...\"}, delta celé číslo bez znaménka plus (např. 2, ne +2).",
  ].join("\n"), 100);
  const delta = Math.round(Number(parsed?.delta));
  if (!parsed || !Number.isFinite(delta)) return null;
  return {
    delta: Math.max(-2, Math.min(3, delta)),
    mood: typeof parsed.mood === "string" ? parsed.mood.replace(/\s+/g, " ").trim().slice(0, 140) : "",
  };
}

/**
 * Proslov se počítá jednou za zápas: zapíše se do `match_speeches` (messaging/match-speech.ts)
 * a v zápase posune formu dne. Fráze, které kabina slyšela minule, nezaberou. Vrací verdikt,
 * nebo null.
 */
export async function applySpeech(
  db: D1Database,
  env: ChatEnv,
  o: { teamId: string; convId: string; message: string; nextMatch: string | undefined },
): Promise<SpeechVerdict | null> {
  if (!speechEligible(o.message, o.nextMatch)) return null;
  const { findUpcomingMatchContext } = await import("../events/match-absences");
  const ctx = await findUpcomingMatchContext(db, o.teamId);
  if (!ctx) return null;
  const done = await db.prepare("SELECT 1 FROM match_speeches WHERE team_id = ? AND kind = 'pre' AND match_key = ? LIMIT 1")
    .bind(o.teamId, ctx.matchKey).first()
    .catch((e) => { logger.warn({ module: M }, "proslov k zápasu už byl", e); return null; });
  if (done) return null;
  const verdict = await judgeSpeech(env, o.message, o.nextMatch ?? "").catch((e) => {
    logger.warn({ module: M, teamId: o.teamId }, "hodnocení proslovu", e);
    return null;
  });
  if (!verdict) return null;
  const coachMsg = await db.prepare(
    "SELECT id FROM messages WHERE conversation_id = ? AND sender_type = 'user' ORDER BY sent_at DESC LIMIT 1",
  ).bind(o.convId).first<{ id: string }>();
  if (!coachMsg) return null;
  const { recentSpeechTexts, recordSpeech, tooSimilar } = await import("./match-speech");
  if (verdict.delta > 0 && (await recentSpeechTexts(db, o.teamId)).some((p) => tooSimilar(p, o.message))) {
    verdict.delta = 0;
    verdict.mood = "Kluci to od trenéra slyšeli už minule, moc to s nimi nehnulo.";
  }
  // Zámek: druhý proslov k témuž zápasu (souběžný požadavek) nic nezapíše ani nepohne náladou.
  const speechId = await recordSpeech(db, {
    teamId: o.teamId, kind: "pre", matchKey: ctx.matchKey, author: "coach", score: verdict.delta, mood: verdict.mood,
    moraleDelta: verdict.delta, messageId: coachMsg.id,
  });
  if (!speechId) return null;
  await db.batch([
    db.prepare("UPDATE messages SET metadata = json_set(COALESCE(metadata, '{}'), '$.speechFor', ?, '$.speechDelta', ?) WHERE id = ?")
      .bind(ctx.matchKey, verdict.delta, coachMsg.id),
    ...(verdict.delta !== 0 ? [db.prepare(
      `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END,
         '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(verdict.delta, o.teamId)] : []),
  ]);
  logger.info({ module: M, teamId: o.teamId }, `proslov před zápasem ${ctx.matchKey}: ${verdict.delta}`);
  return verdict;
}

// ─── Přemlouvání omluvených ─────────────────────────────────────────────────

/** Trenér chce na zápase všechny („žádné omluvenky“, „chci tam všechny“, „dorazte“). */
const ATTENDANCE_PUSH_RE = /\b(zadne omluvenky|zadna omluvenka|bez omluvenek|zadne vymluvy|chci tam vsechny|chci vas tam vsechny|musite (prijit|dorazit)|dorazte|nikdo nechybi|at nikdo nechybi|potrebuju vas vsechny|potrebuju tam kazdeho|prijdte vsichni|vsichni na zapas)\b/;

export function isAttendancePush(message: string): boolean {
  return ATTENDANCE_PUSH_RE.test(plainWords(message).join(" "));
}

/** Šance, že omluvenku daného druhu trenér rozmluví (zranění, incident ani životní situace ne). */
const PERSUADE_BASE: Record<string, number> = {
  absurd: 0.6, hangover: 0.45, commute: 0.4, professional: 0.25, personal: 0.2,
};

export function persuadeChance(category: string, p: Pick<PlayerSnapshot, "coachRelationship" | "discipline">): number {
  const base = PERSUADE_BASE[category] ?? 0;
  if (base === 0) return 0;
  return Math.max(0, Math.min(0.85, base + (p.coachRelationship - 50) / 200 + (p.discipline - 50) / 250));
}

const PERSUADED_SMS: Record<string, string[]> = {
  absurd: ["Dobře, trenére, nějak to vyřeším a přijdu.", "Tak jo, beru zpátky. Budu tam."],
  hangover: ["Hlava třeští, ale přijdu, trenére.", "Dobře, rozchodím to a dorazím."],
  commute: ["Seženu nějaký odvoz, trenére, budu tam.", "Někdo mě hodí, přijdu."],
  professional: ["Vyměnil jsem si šichtu, trenére. Přijdu.", "Domluvil jsem se v práci, budu tam."],
  personal: ["Doma jsem to nějak ukecal, přijdu.", "Dobře, trenére, zařídím to a dorazím."],
};

/**
 * Trenér v kabině zápasu („⚽ vs …“) chce všechny: každý omluvený s měkkou výmluvou si to
 * může rozmyslet. Rozmyšlení je jeho nová odpověď „přijdu“ do kabiny zápasu; omluvenky
 * se berou z kabiny a platí ta poslední (`recordedExcuses`), takže hraje. Jednou za zápas.
 */
export async function persuadeAbsentees(
  db: D1Database,
  o: { teamId: string; convId: string; message: string; squad: readonly PlayerSnapshot[]; rng?: () => number; now?: Date },
): Promise<string[]> {
  if (!isAttendancePush(o.message)) return [];
  const rng = o.rng ?? Math.random;
  const cal = await db.prepare(
    `SELECT json_extract(metadata, '$.calendarId') AS cal FROM messages
      WHERE conversation_id = ? AND json_extract(metadata, '$.calendarId') IS NOT NULL LIMIT 1`,
  ).bind(o.convId).first<{ cal: string }>()
    .catch((e) => { logger.warn({ module: M }, "zápas kabiny", e); return null; });
  if (!cal?.cal) return [];
  // Jednou za zápas: trenér, který to píše pořád dokola, už nikoho dalšího nepřemluví.
  const already = await db.prepare(
    "SELECT 1 FROM messages WHERE conversation_id = ? AND json_extract(metadata, '$.persuaded') = 1 LIMIT 1",
  ).bind(o.convId).first()
    .catch((e) => { logger.warn({ module: M }, "přemlouvání už bylo", e); return null; });
  const pushed = await db.prepare(
    "SELECT 1 FROM messages WHERE conversation_id = ? AND json_extract(metadata, '$.attendancePush') = 1 LIMIT 1",
  ).bind(o.convId).first()
    .catch((e) => { logger.warn({ module: M }, "výzva už byla", e); return null; });
  if (already || pushed) return [];
  await db.prepare(
    `UPDATE messages SET metadata = json_set(COALESCE(metadata, '{}'), '$.attendancePush', 1)
      WHERE id = (SELECT id FROM messages WHERE conversation_id = ? AND sender_type = 'user' ORDER BY sent_at DESC LIMIT 1)`,
  ).bind(o.convId).run().catch((e) => logger.warn({ module: M }, "značka výzvy", e));

  // Omluvení podle kabiny (poslední odpověď hráče) a druh výmluvy z losu zápasu.
  const { recordedExcuses, findUpcomingMatchContext, getAbsentPlayersMap, settleAbsences } = await import("../events/match-absences");
  const recorded = await recordedExcuses(db, o.teamId, cal.cal);
  if (!recorded || recorded.size === 0) return [];
  const ctx = await findUpcomingMatchContext(db, o.teamId);
  if (!ctx || ctx.matchKey !== cal.cal) return [];
  const settled = settleAbsences(await getAbsentPlayersMap(db, o.teamId, ctx), recorded, o.squad.map((p) => p.id));

  const now = o.now ?? new Date();
  const persuaded: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const p of o.squad) {
    const a = settled.get(p.id);
    if (!a || !recorded.has(p.id) || rng() >= persuadeChance(a.category, p)) continue;
    persuaded.push(p.id);
    const pool = PERSUADED_SMS[a.category] ?? PERSUADED_SMS.personal;
    stmts.push(db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
       VALUES (?, ?, 'player', ?, ?, ?, ?, ?, 0)`,
    ).bind(crypto.randomUUID(), o.convId, p.id, `${p.firstName} ${p.lastName}`, pool[Math.floor(rng() * pool.length)],
      JSON.stringify({ type: "attendance", response: "yes", persuaded: 1, calendarId: cal.cal, timing: "persuaded" }),
      new Date(now.getTime() + (persuaded.length + 3) * 4000).toISOString()));
  }
  if (stmts.length > 0) await db.batch(stmts);
  if (persuaded.length > 0) logger.info({ module: M, teamId: o.teamId }, `trenér přemluvil ${persuaded.length} omluvených na ${cal.cal}`);
  return persuaded;
}
