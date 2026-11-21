/**
 * Anketa Fotbalista okresu v databázi.
 *
 * 24 dní před posledním kolem redaktor (model, pravidlo jako záloha) vybere deset hráčů
 * z odehrané sezóny okresu a pošle lidským trenérům SMS. Trenér odpoví volně („dávám
 * Horáka“), redaktor s prodlevou potvrdí. Pro vlastního hráče hlasovat nejde, druhý hlas
 * přepíše první. Den před posledním kolem večer se anketa uzavře: AI kluby a kotle (váha
 * polovina) hlasují přes model, vítěz dostane náladu, vyjde článek i s tím, kdo koho volil,
 * a SMS od redakce. Kandidát s horkou hlavou, který skončil těsně za vítězem, se ozve trenérovi.
 *
 * Pouští to hodinový běh Telefonu (`tickDistrictPolls`), konec sezóny ve fázi ocenění
 * uzavře, co ještě běží (`closeOpenPollsForSeason`).
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import type { OptionalPushKeys } from "../community/phone-push";
import { aiContextFromEnv, generateText, type AiContext } from "../lib/ai-provider";
import { parseModelJson } from "../ai-coach/llm";
import { activeSeasonNumber } from "../transfers/unrest";
import { pragueTimeToUtc } from "../hall-cup/format";
import {
  CLOSE_HOUR, fallbackVote, FAN_GROUP_WEIGHT, matchVote, pickNominees, plainBlurb, pollSchedule, rankPlayers, SHORTLIST,
  tallyBallots, type SeasonPlayer, type VoteCandidate,
} from "./poll-logic";

const M = "district-poll";
export const POLL_PREFIX = "po-";
export const POLL_KIND = "player_of_district";
const NEWS_DESK = "Redakce Zpravodaje";
const OFFICE_HOUR = 9;
/** Kolik hlasů AI klubů a kotlů se při uzávěrce zeptá modelu, zbytek rozhodne pravidlo. */
const MAX_MODEL_VOTES = 60;

type FullEnv = Pick<Bindings, "DB" | "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL"> & OptionalPushKeys;
/** Konec sezóny má jen DB a klíč, AI kontext tam není: hlasy pak rozhodne pravidlo. */
export type PollEnv = Pick<Bindings, "DB"> & Partial<FullEnv>;
type Env = PollEnv;

export interface PollRow {
  id: string;
  district: string;
  season_number: number;
  kind: string;
  status: "voting" | "closing" | "closed";
  editor_name: string;
  closes_on: string;
  winner_player_id: string | null;
  news_id: string | null;
}

interface CandidateRow {
  player_id: string;
  team_id: string;
  name: string;
  team_name: string;
  position: string;
  blurb: string;
  rank: number;
}

export function pragueNow(now: Date): { date: string; hour: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minutes: Number(get("minute")) };
}

export function czDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}

function slug(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function aiOrNull(env: Env): Promise<AiContext | null> {
  if (!env.CACHE_KV) return null;
  return aiContextFromEnv(env as FullEnv).catch((e) => { logger.warn({ module: M }, "AI kontext pro anketu", e); return null; });
}

export async function askJson(ai: AiContext | null, prompt: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  if (!ai) return null;
  const raw = await generateText(ai, prompt, { maxTokens, temperature: 0.6, module: M })
    .catch((e) => { logger.warn({ module: M }, "odpověď modelu pro anketu", e); return null; });
  return raw ? parseModelJson(raw) : null;
}

/** Hrající seniorské soutěže okresu (čekající ne). */
export async function districtLeagues(db: D1Database, district: string): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT id FROM leagues WHERE district = ? AND league_type = 'senior' AND COALESCE(waiting, 0) = 0",
  ).bind(district).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

async function lastRoundDate(db: D1Database, leagueIds: string[], season: number): Promise<string | null> {
  if (!leagueIds.length) return null;
  const row = await db.prepare(
    `SELECT MAX(scheduled_at) AS last FROM season_calendar WHERE season_number = ? AND league_id IN (${leagueIds.map(() => "?").join(",")})`,
  ).bind(season, ...leagueIds).first<{ last: string | null }>();
  if (!row?.last) return null;
  return pragueNow(new Date(row.last)).date;
}

/** Statistiky sezóny hráčů, kteří v okrese hrají (odešlí hráči ne: anketa je o aktivních). */
async function seasonPlayers(db: D1Database, leagueIds: string[], season: number): Promise<SeasonPlayer[]> {
  const rows = await db.prepare(
    `SELECT mps.player_id, p.first_name, p.last_name, p.nickname, p.position, p.team_id, t.name AS team_name,
            SUM(mps.goals) AS goals, SUM(mps.assists) AS assists, AVG(mps.rating) AS avg_rating, COUNT(*) AS apps
       FROM match_player_stats mps
       JOIN matches m ON m.id = mps.match_id
       JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN players p ON p.id = mps.player_id
       JOIN teams t ON t.id = p.team_id
      WHERE m.league_id IN (${leagueIds.map(() => "?").join(",")}) AND m.status = 'simulated' AND sc.season_number = ?
        AND t.parent_team_id IS NULL
      GROUP BY mps.player_id
      HAVING apps >= 5`,
  ).bind(...leagueIds, season).all<Record<string, unknown>>();
  return rows.results.map((r) => ({
    playerId: r.player_id as string,
    name: `${r.first_name} ${r.last_name}`,
    nickname: (r.nickname as string | null) ?? null,
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    position: (r.position as string) ?? "MID",
    goals: Number(r.goals ?? 0),
    assists: Number(r.assists ?? 0),
    avgRating: Math.round(Number(r.avg_rating ?? 6) * 100) / 100,
    apps: Number(r.apps ?? 0),
  }));
}

async function editorOf(db: D1Database, leagueIds: string[]): Promise<string> {
  if (!leagueIds.length) return NEWS_DESK;
  const j = await db.prepare(
    `SELECT first_name, last_name, nickname FROM journalists WHERE league_id IN (${leagueIds.map(() => "?").join(",")})
      ORDER BY CASE style WHEN 'seriozni' THEN 0 WHEN 'patriot' THEN 1 ELSE 2 END, id LIMIT 1`,
  ).bind(...leagueIds).first<{ first_name: string; last_name: string; nickname: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "redaktor ankety", e); return null; });
  return j ? `${j.first_name} ${j.last_name}` : NEWS_DESK;
}

/**
 * Redaktor vybere deset z užšího výběru. Neplatné odpovědi doplní pravidlo. Popisek kandidáta
 * píše kód (`plainBlurb`), model by čísla jen opsal bez správných tvarů.
 */
async function editorPicks(ai: AiContext | null, district: string, shortlist: SeasonPlayer[]): Promise<{ ids: string[] }> {
  const lines = shortlist.map((p) => `${p.playerId} | ${p.name} | ${p.teamName} | ${p.position} | ${plainBlurb(p)}`);
  const prompt = `Jsi sportovní redaktor okresního zpravodaje (okres ${district}). Vyber 10 kandidátů do ankety Fotbalista okresu `
    + `z tohoto seznamu. Nejvýš 2 hráči z jednoho klubu.\n`
    + `${lines.join("\n")}\n`
    + `Odpověz jen JSON {"picks": [{"id": "..."}]}.`;
  const parsed = await askJson(ai, prompt, 600);
  const picks = Array.isArray(parsed?.picks) ? parsed!.picks as Array<{ id?: unknown } | string> : [];
  const valid = new Set(shortlist.map((p) => p.playerId));
  const ids: string[] = [];
  for (const p of picks) {
    const id = typeof p === "string" ? p : p?.id;
    if (typeof id !== "string" || !valid.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  if (!ids.length) logger.warn({ module: M }, `nominace okresu ${district} bez modelu, pravidlo podle sezóny`);
  return { ids };
}

function cleanText(text: string): string {
  return text.replace(/[—–]/g, ",").replace(/\s+/g, " ").trim();
}

export function invitationSms(editor: string, closesOn: string, candidates: Array<Pick<CandidateRow, "rank" | "name" | "team_name" | "blurb">>): string {
  const list = candidates.map((c) => `${c.rank}. ${c.name} (${c.team_name}): ${c.blurb}`).join("\n");
  return `Dobrý den, tady ${editor} ze Zpravodaje. Vyhlašujeme anketu Fotbalista okresu a trenéři mají hlas. Kandidáti:\n${list}\n`
    + `Odepište jméno nebo číslo, koho volíte. Pro vlastního hráče hlasovat nejde, hlas můžete změnit do ${czDate(closesOn)} večer.`;
}

/** Založí anketu okresu, pokud nastal den nominace. Vrací id nebo null. */
export async function openDistrictPoll(env: Env, district: string, season: number, closesOn: string): Promise<string | null> {
  const db = env.DB;
  const pollId = `${POLL_KIND}-${season}-${slug(district)}`;
  const exists = await db.prepare("SELECT 1 FROM district_polls WHERE id = ?").bind(pollId).first();
  if (exists) return null;
  const leagues = await districtLeagues(db, district);
  const players = rankPlayers(await seasonPlayers(db, leagues, season));
  if (players.length < 10) {
    logger.warn({ module: M }, `anketa okresu ${district}: málo hráčů s pěti zápasy (${players.length}), nezakládám`);
    return null;
  }
  const shortlist = players.slice(0, SHORTLIST);
  const ai = await aiOrNull(env);
  const picks = await editorPicks(ai, district, shortlist);
  const nominees = pickNominees(shortlist, picks.ids);
  const editor = await editorOf(db, leagues);
  const candidates: CandidateRow[] = nominees.map((p, i) => ({
    player_id: p.playerId, team_id: p.teamId, name: p.name, team_name: p.teamName, position: p.position,
    blurb: plainBlurb(p), rank: i + 1,
  }));

  const teams = await db.prepare(
    `SELECT id, user_id FROM teams WHERE league_id IN (${leagues.map(() => "?").join(",")}) AND parent_team_id IS NULL AND user_id IS NOT NULL`,
  ).bind(...leagues).all<{ id: string; user_id: string }>();
  const kotle = await db.prepare(
    `SELECT g.id, g.team_id FROM fan_groups g JOIN teams t ON t.id = g.team_id
      WHERE g.kind = 'kotel' AND t.league_id IN (${leagues.map(() => "?").join(",")}) AND t.parent_team_id IS NULL`,
  ).bind(...leagues).all<{ id: string; team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "kotle okresu pro anketu", e); return { results: [] as Array<{ id: string; team_id: string }> }; });

  const text = invitationSms(editor, closesOn, candidates);
  const metadata = JSON.stringify({ type: "district_poll", pollId });
  // Anketa je první příkaz dávky: souběžný druhý běh narazí na unikátní id a celá dávka se vrátí.
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO district_polls (id, district, season_number, kind, editor_name, closes_on) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(pollId, district, season, POLL_KIND, editor, closesOn),
    ...candidates.map((c) => db.prepare(
      "INSERT INTO district_poll_candidates (poll_id, player_id, team_id, name, team_name, position, blurb, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(pollId, c.player_id, c.team_id, c.name, c.team_name, c.position, c.blurb, c.rank)),
  ];
  for (const t of teams.results) {
    if (t.user_id === "ai") {
      stmts.push(db.prepare("INSERT INTO district_poll_ballots (poll_id, voter_kind, voter_id, voter_team_id) VALUES (?, 'team', ?, ?)").bind(pollId, t.id, t.id));
      continue;
    }
    const convId = crypto.randomUUID();
    stmts.push(
      db.prepare(
        `INSERT INTO conversations (id, team_id, type, title, participant_id, ai_thread_active, pinned, unread_count, last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', ?, ?, 0, 0, 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(convId, t.id, editor, `${POLL_PREFIX}${pollId}`, text.slice(0, 100)),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, editor, text, metadata),
      db.prepare("INSERT INTO district_poll_ballots (poll_id, voter_kind, voter_id, voter_team_id, conv_id) VALUES (?, 'team', ?, ?, ?)").bind(pollId, t.id, t.id, convId),
    );
  }
  for (const k of kotle.results) {
    stmts.push(db.prepare("INSERT INTO district_poll_ballots (poll_id, voter_kind, voter_id, voter_team_id, weight) VALUES (?, 'fan_group', ?, ?, ?)")
      .bind(pollId, k.id, k.team_id, FAN_GROUP_WEIGHT));
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    logger.warn({ module: M }, `anketa okresu ${district} už založená souběžným během`, e);
    return null;
  }
  logger.info({ module: M }, `anketa Fotbalista okresu ${district} (sezóna ${season}): ${candidates.length} kandidátů, ${teams.results.length} klubů, ${kotle.results.length} kotlů`);
  return pollId;
}

/** Kdy redaktor odpoví: za 5 až 40 minut, v noci (22 až 7) v půl osmé ráno. */
export function replyDueAt(now: Date, seed: number): Date {
  const { date, hour } = pragueNow(now);
  if (hour >= 22 || hour < 7) {
    const day = hour >= 22 ? pragueNow(new Date(now.getTime() + 12 * 3600 * 1000)).date : date;
    return new Date(pragueTimeToUtc(day, 7 * 60 + 30));
  }
  return new Date(now.getTime() + (5 + (seed % 36)) * 60 * 1000);
}

export const POLL_REPLIES = {
  voted: (name: string, team: string) => `Zapsáno, váš hlas má ${name} (${team}). Díky!`,
  changed: (name: string, team: string) => `Přepisuji. Teď máte ${name} (${team}), předchozí hlas neplatí.`,
  own: "Pro vlastního hráče hlasovat nejde, to by volil každý svého. Vyberte někoho z jiného klubu.",
  unclear: "Nerozumím, koho volíte. Napište prosím jméno nebo číslo ze seznamu.",
  ambiguous: "Takových máme v seznamu víc. Napište i křestní jméno nebo klub, ať to zapíšu správně.",
  closed: "Anketa už je uzavřená, výsledky jsou ve Zpravodaji.",
};

/** Hlas trenéra z volné SMS. Vlastní hráč odmítnut, druhý hlas přepíše první. */
export async function handlePollReply(env: Env, convId: string, teamId: string, text: string, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const ballot = await db.prepare(
    `SELECT b.poll_id, b.player_id, p.status, p.editor_name, p.kind FROM district_poll_ballots b JOIN district_polls p ON p.id = b.poll_id
      WHERE b.conv_id = ? AND b.voter_team_id = ?`,
  ).bind(convId, teamId).first<{ poll_id: string; player_id: string | null; status: string; editor_name: string; kind: string }>();
  if (!ballot) return;
  if (ballot.kind === "selection") {
    // Nominace do výběru okresu: až tři jména (polls/district-selection.ts).
    const { handleSelectionReply } = await import("./district-selection");
    await handleSelectionReply(env, ballot.poll_id, ballot.status, teamId, text, now);
    return;
  }
  const due = replyDueAt(now, Math.floor(now.getTime() / 1000));
  const queueReply = (body: string) => db.prepare(
    "UPDATE district_poll_ballots SET pending_reply = ?, reply_due_at = ? WHERE poll_id = ? AND voter_kind = 'team' AND voter_id = ?",
  ).bind(body, due.toISOString(), ballot.poll_id, teamId).run();
  if (ballot.status !== "voting") {
    await queueReply(POLL_REPLIES.closed);
    return;
  }
  const rows = await db.prepare("SELECT * FROM district_poll_candidates WHERE poll_id = ? ORDER BY rank").bind(ballot.poll_id).all<CandidateRow>();
  const candidates: VoteCandidate[] = rows.results.map((c) => ({ playerId: c.player_id, name: c.name, teamName: c.team_name, rank: c.rank }));
  let pick = matchVote(text, candidates);
  if (pick === null || pick === "ambiguous") {
    const ai = await aiOrNull(env);
    const prompt = `Trenér fotbalového klubu odpověděl v anketě Fotbalista okresu. Kandidáti (id | jméno | klub):\n`
      + `${rows.results.map((c) => `${c.player_id} | ${c.name} | ${c.team_name}`).join("\n")}\n`
      + `Zpráva trenéra: „${text.slice(0, 500)}“\nKoho volí? Když z textu nejde poznat jednoho kandidáta, vrať null. `
      + `Odpověz jen JSON {"id": "..." | null}.`;
    const parsed = await askJson(ai, prompt, 80);
    const id = typeof parsed?.id === "string" ? parsed.id : null;
    if (id && candidates.some((c) => c.playerId === id)) pick = id;
  }
  if (pick === null || pick === "ambiguous") {
    await queueReply(pick === "ambiguous" ? POLL_REPLIES.ambiguous : POLL_REPLIES.unclear);
    return;
  }
  const chosen = rows.results.find((c) => c.player_id === pick)!;
  if (chosen.team_id === teamId) {
    await queueReply(POLL_REPLIES.own);
    return;
  }
  const changed = !!ballot.player_id && ballot.player_id !== pick;
  await db.prepare(
    `UPDATE district_poll_ballots SET player_id = ?, voted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), pending_reply = ?, reply_due_at = ?
      WHERE poll_id = ? AND voter_kind = 'team' AND voter_id = ?`,
  ).bind(pick, changed ? POLL_REPLIES.changed(chosen.name, chosen.team_name) : POLL_REPLIES.voted(chosen.name, chosen.team_name),
    due.toISOString(), ballot.poll_id, teamId).run();
}

/** Doručí odpovědi redaktora, kterým uplynula prodleva. */
export async function deliverPollReplies(db: D1Database, now: Date): Promise<number> {
  const due = await db.prepare(
    `SELECT b.poll_id, b.voter_id, b.conv_id, b.pending_reply, p.editor_name FROM district_poll_ballots b JOIN district_polls p ON p.id = b.poll_id
      WHERE b.pending_reply IS NOT NULL AND b.reply_due_at <= ? AND b.conv_id IS NOT NULL LIMIT 100`,
  ).bind(now.toISOString()).all<{ poll_id: string; voter_id: string; conv_id: string; pending_reply: string; editor_name: string }>();
  let sent = 0;
  for (const r of due.results) {
    // Nejdřív smazat čekající odpověď (podmíněně), ať ji souběžný běh nepošle podruhé.
    const claimed = await db.prepare(
      "UPDATE district_poll_ballots SET pending_reply = NULL, reply_due_at = NULL WHERE poll_id = ? AND voter_kind = 'team' AND voter_id = ? AND pending_reply = ?",
    ).bind(r.poll_id, r.voter_id, r.pending_reply).run();
    if (!claimed.meta.changes) continue;
    await db.batch([
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'system', ?, ?, NULL, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), r.conv_id, r.editor_name, r.pending_reply),
      db.prepare(
        `UPDATE conversations SET last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
           unread_count = unread_count + 1 WHERE id = ?`,
      ).bind(r.pending_reply.slice(0, 100), r.conv_id),
    ]);
    sent++;
  }
  return sent;
}

/** Hlasy AI klubů a kotlů: model, při výpadku nebo nad limitem pravidlo. */
async function modelVotes(env: Env, poll: PollRow, candidates: CandidateRow[]): Promise<void> {
  const db = env.DB;
  const open = await db.prepare(
    "SELECT voter_kind, voter_id, voter_team_id FROM district_poll_ballots WHERE poll_id = ? AND player_id IS NULL AND conv_id IS NULL",
  ).bind(poll.id).all<{ voter_kind: "team" | "fan_group"; voter_id: string; voter_team_id: string }>();
  if (!open.results.length) return;
  const ai = await aiOrNull(env);
  const names = await db.prepare(
    `SELECT id, name FROM teams WHERE id IN (${open.results.map(() => "?").join(",")})`,
  ).bind(...open.results.map((v) => v.voter_team_id)).all<{ id: string; name: string }>();
  const teamName = new Map(names.results.map((n) => [n.id, n.name]));
  const list = candidates.map((c) => `${c.player_id} | ${c.name} | ${c.team_name} | ${c.blurb}`).join("\n");
  const stmts: D1PreparedStatement[] = [];
  let asked = 0;
  for (const v of open.results) {
    let pick: string | null = null;
    if (ai && asked < MAX_MODEL_VOTES) {
      asked++;
      const who = v.voter_kind === "fan_group"
        ? `Jsi vůdce kotle fanoušků klubu ${teamName.get(v.voter_team_id) ?? ""}. Smíš volit i hráče svého klubu.`
        : `Jsi trenér klubu ${teamName.get(v.voter_team_id) ?? ""}. Hráče svého klubu volit nesmíš.`;
      const parsed = await askJson(ai, `${who} V anketě Fotbalista okresu vyber jednoho kandidáta (id | jméno | klub | proč):\n${list}\n`
        + `Odpověz jen JSON {"id": "..."}.`, 60);
      const id = typeof parsed?.id === "string" ? parsed.id : null;
      const cand = candidates.find((c) => c.player_id === id);
      if (cand && (v.voter_kind === "fan_group" || cand.team_id !== v.voter_team_id)) pick = cand.player_id;
    }
    if (!pick) {
      pick = fallbackVote({ kind: v.voter_kind, teamId: v.voter_team_id }, candidates.map((c) => ({ playerId: c.player_id, teamId: c.team_id, rank: c.rank })));
      if (ai && asked <= MAX_MODEL_VOTES) logger.warn({ module: M }, `hlas ${v.voter_kind} ${v.voter_id} v anketě rozhodlo pravidlo (model nevrátil platného kandidáta)`);
    }
    if (pick) {
      stmts.push(db.prepare(
        "UPDATE district_poll_ballots SET player_id = ?, voted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE poll_id = ? AND voter_kind = ? AND voter_id = ? AND player_id IS NULL",
      ).bind(pick, poll.id, v.voter_kind, v.voter_id));
    }
  }
  if (stmts.length) await db.batch(stmts);
}

const ANGRY_LOSER_LINES = [
  "Trenére, četl jste Zpravodaj? Fotbalista okresu je {winner}. Já jsem tu sezónu odmakal víc než kdokoli, tak mi vysvětlete, proč ne já.",
  "Tak {winner}. Fakt? Celou sezónu dřu jak kůň a stačí mít známý v redakci. Proč ne já, trenére?",
  "Viděl jste to vyhlášení? {winner}... Mně to teda hlava nebere. Kdo za mě vůbec hlasoval?",
];

/** Uzavře anketu: hlasy AI a kotlů, vítěz, nálada, článek, SMS od redakce a naštvaný druhý. */
export async function closePoll(env: Env, pollId: string): Promise<boolean> {
  const db = env.DB;
  const claimed = await db.prepare(
    "UPDATE district_polls SET status = 'closing' WHERE id = ? AND status = 'voting'",
  ).bind(pollId).run();
  if (!claimed.meta.changes) return false;
  const poll = await db.prepare("SELECT * FROM district_polls WHERE id = ?").bind(pollId).first<PollRow>();
  if (!poll) return false;
  const candidates = (await db.prepare("SELECT * FROM district_poll_candidates WHERE poll_id = ? ORDER BY rank").bind(pollId).all<CandidateRow>()).results;
  await modelVotes(env, poll, candidates);

  const ballots = (await db.prepare(
    "SELECT b.voter_kind, b.voter_id, b.voter_team_id, b.player_id, b.weight, b.conv_id, t.name AS voter_team FROM district_poll_ballots b LEFT JOIN teams t ON t.id = b.voter_team_id WHERE b.poll_id = ?",
  ).bind(pollId).all<{ voter_kind: "team" | "fan_group"; voter_id: string; voter_team_id: string; player_id: string | null; weight: number; conv_id: string | null; voter_team: string | null }>()).results;
  const tally = tallyBallots(
    ballots.map((b) => ({ voterKind: b.voter_kind, voterId: b.voter_id, playerId: b.player_id, weight: b.weight })),
    candidates.map((c) => ({ playerId: c.player_id, rank: c.rank })),
  );
  const winner = candidates.find((c) => c.player_id === tally[0]?.playerId) ?? candidates[0];
  const byId = new Map(candidates.map((c) => [c.player_id, c]));

  // Vítěz: lepší nálada (víc slovy v Telefonu, číslo se nikde neukazuje).
  await db.prepare(
    "UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.morale', MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + 15)) WHERE id = ?",
  ).bind(winner.player_id).run().catch((e) => logger.warn({ module: M }, "nálada vítěze ankety", e));

  const points = (n: number) => (Number.isInteger(n) ? `${n}` : n.toLocaleString("cs-CZ"));
  const humanVotes = ballots.filter((b) => b.voter_kind === "team" && b.conv_id && b.player_id)
    .map((b) => `${b.voter_team}: ${byId.get(b.player_id!)?.name ?? "?"}.`);
  const headline = `Fotbalistou okresu ${poll.district} je ${winner.name}`;
  // Jména jen v 1. pádu (generovaný text neumí skloňovat), za položkou pořadí „b.“ už tečka nejde.
  const lines = [
    `Anketa Zpravodaje má vítěze. Trenéři klubů a kotle (jejich hlas váží polovinu) rozhodli: Fotbalistou okresu je ${winner.name} z klubu ${winner.team_name}. Za sezónu ${winner.blurb}.`,
    `Pořadí: ${tally.slice(0, 5).map((r, i) => `${i + 1}. ${byId.get(r.playerId)?.name} (${byId.get(r.playerId)?.team_name}) ${points(r.points)} b.`).join(", ")}`,
    humanVotes.length ? `Kdo koho volil. ${humanVotes.join(" ")}` : "",
    poll.editor_name && poll.editor_name !== NEWS_DESK ? `Za redakci: ${poll.editor_name}` : "",
  ].filter(Boolean);
  const newsId = await publishPollArticle(db, poll, winner.team_id, headline, lines.map(cleanText).join("\n\n"))
    .catch((e) => { logger.warn({ module: M }, "článek ankety", e); return null; });
  await db.prepare("UPDATE district_polls SET status = 'closed', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), winner_player_id = ?, news_id = ? WHERE id = ?")
    .bind(winner.player_id, newsId, pollId).run();

  // Druhý s horkou hlavou se ozve svému trenérovi (jen lidský klub).
  const runnerUp = tally[1] ? byId.get(tally[1].playerId) : undefined;
  if (runnerUp) {
    const p = await db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, t.user_id, json_extract(p.personality, '$.temper') AS temper
         FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = ?`,
    ).bind(runnerUp.player_id).first<{ id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null; user_id: string | null; temper: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "druhý v anketě", e); return null; });
    if (p && (p.temper ?? 0) >= 65 && p.user_id && p.user_id !== "ai") {
      const { sendPlayerSMS } = await import("../messaging/system-sms");
      const line = ANGRY_LOSER_LINES[p.id.length % ANGRY_LOSER_LINES.length].replace("{winner}", winner.name);
      await sendPlayerSMS(db, runnerUp.team_id, { id: p.id, firstName: p.first_name, lastName: p.last_name, nickname: p.nickname, avatar: p.avatar }, line)
        .catch((e) => logger.warn({ module: M }, "SMS naštvaného druhého", e));
    }
  }
  logger.info({ module: M }, `anketa ${pollId} uzavřena, vítěz ${winner.player_id}`);
  return true;
}

/** Článek do soutěží okresu a SMS od redakce lidským klubům. Vrací id článku první soutěže. */
async function publishPollArticle(db: D1Database, poll: PollRow, winnerTeamId: string, headline: string, body: string): Promise<string | null> {
  const leagues = await districtLeagues(db, poll.district);
  const existing = await db.prepare("SELECT id, league_id FROM news WHERE type = 'player_of_district' AND headline = ? AND season_number = ?")
    .bind(headline, poll.season_number).all<{ id: string; league_id: string }>();
  const newsByLeague = new Map(existing.results.map((r) => [r.league_id, r.id]));
  const inserts: D1PreparedStatement[] = [];
  for (const l of leagues) {
    if (newsByLeague.has(l)) continue;
    const id = crypto.randomUUID();
    newsByLeague.set(l, id);
    inserts.push(db.prepare(
      `INSERT INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, ?, 'player_of_district', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(id, l, winnerTeamId, headline, body, poll.season_number));
  }
  if (inserts.length) await db.batch(inserts);
  if (!leagues.length) return null;
  const recipients = await db.prepare(
    `SELECT id, league_id FROM teams WHERE league_id IN (${leagues.map(() => "?").join(",")}) AND parent_team_id IS NULL AND user_id IS NOT NULL AND user_id != 'ai'`,
  ).bind(...leagues).all<{ id: string; league_id: string }>();
  const newsIds = [...newsByLeague.values()];
  const already = await db.prepare(
    `SELECT DISTINCT c.team_id FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.type = 'system' AND c.title = ? AND json_extract(m.metadata, '$.newsId') IN (${newsIds.map(() => "?").join(",")})`,
  ).bind(NEWS_DESK, ...newsIds).all<{ team_id: string }>();
  const notified = new Set(already.results.map((r) => r.team_id));
  const { sendSystemSMS } = await import("../messaging/system-sms");
  for (const t of recipients.results) {
    const newsId = newsByLeague.get(t.league_id);
    if (!newsId || notified.has(t.id)) continue;
    await sendSystemSMS(db, t.id, NEWS_DESK, `📰 Anketa Fotbalista okresu má vítěze: „${headline}“`,
      { type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId })
      .catch((e) => logger.warn({ module: M, teamId: t.id }, "SMS o anketě", e));
  }
  return newsByLeague.get(leagues[0]) ?? null;
}

/** Konec sezóny ve fázi ocenění: uzavřít ankety sezóny, které ještě běží. */
export async function closeOpenPollsForSeason(env: Env, season: number): Promise<number> {
  const open = await env.DB.prepare("SELECT id FROM district_polls WHERE season_number = ? AND status = 'voting' AND kind = ?")
    .bind(season, POLL_KIND).all<{ id: string }>();
  let closed = 0;
  for (const p of open.results) if (await closePoll(env, p.id)) closed++;
  return closed;
}

/**
 * Hodinový běh: odpovědi redaktora, nominace (od 9:00 v den nominace), uzávěrka
 * (v den uzávěrky od 19:00).
 */
export async function tickDistrictPolls(env: Env, now: Date = new Date()): Promise<{ opened: number; closed: number; replies: number }> {
  const db = env.DB;
  const replies = await deliverPollReplies(db, now);
  const season = await activeSeasonNumber(db);
  if (!season) return { opened: 0, closed: 0, replies };
  const { date, hour } = pragueNow(now);
  let opened = 0;
  let closed = 0;
  const districts = await db.prepare(
    "SELECT DISTINCT district FROM leagues WHERE league_type = 'senior' AND COALESCE(waiting, 0) = 0 AND district IS NOT NULL",
  ).all<{ district: string }>();
  for (const { district } of districts.results) {
    const leagues = await districtLeagues(db, district);
    const last = await lastRoundDate(db, leagues, season);
    if (!last) continue;
    const { nominateOn, closeOn } = pollSchedule(last);
    if (date >= nominateOn && date < closeOn && hour >= OFFICE_HOUR) {
      if (await openDistrictPoll(env, district, season, closeOn)) opened++;
    }
  }
  const due = await db.prepare("SELECT id, closes_on FROM district_polls WHERE status = 'voting' AND season_number = ? AND kind = ?")
    .bind(season, POLL_KIND).all<{ id: string; closes_on: string }>();
  for (const p of due.results) {
    if (date > p.closes_on || (date === p.closes_on && hour >= CLOSE_HOUR)) {
      if (await closePoll(env, p.id)) closed++;
    }
  }
  return { opened, closed, replies };
}
