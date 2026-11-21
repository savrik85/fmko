/**
 * Vánoční sálovka v databázi: založení ročníku, pozvánky od haly, přihlášky přes SMS,
 * los, odehrání zápasů v den turnaje, play-off, výplata banku, trofej a článek.
 *
 * Všechno pouští hodinový běh Telefonu (`tickHallCup`). Každý krok je idempotentní:
 * stav se posouvá podmíněným UPDATE, zápasy mají unikátní pozici, platby referenci.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { pushEnvOf, type OptionalPushKeys } from "../community/phone-push";
import { aiContextFromEnv, generateText } from "../lib/ai-provider";
import { parseModelJson } from "../ai-coach/llm";
import { activeSeasonNumber } from "../transfers/unrest";
import { recordTransaction } from "../season/finance-processor";
import { drawGroups, groupCode, type DrawTeam, type PlayedMatch } from "../tournament/draw";
import {
  classifyHallReply, ENTRY_FEE, firstKnockoutPairs, groupCountFor, groupTables, knockoutSlots, MAX_ENTRANTS,
  MIN_ENTRANTS, nextKnockoutPairs, scheduleGroupStage, slotClock, slotKickoff, splitPot,
  type GroupTeam, type KnockoutStage, type PlannedMatch,
} from "./format";
import { buildHallSide, hallCandidates, matchRng, playHallMatch, type HallEvent } from "./match";

const M = "hall-cup";
export const HALL_PARTICIPANT_PREFIX = "hc-";
export const HALL_HOST_DISTRICT = "Prachatice";
export const HALL_VENUE = "Sportovní hala Prachatice";
export const HALL_TITLE = "Vánoční sálovka";
const NEWS_DESK = "Redakce Zpravodaje";
/** Hala posílá pozvánky a los až od rána, ne v půl jedné v noci. */
const OFFICE_HOUR = 9;
const CLAIM_TTL_MS = 15 * 60 * 1000;
const MAX_MATCHES_PER_RUN = 40;

type Env = Pick<Bindings, "DB" | "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL"> & OptionalPushKeys;

export interface HallCupRow {
  id: string;
  district: string;
  season_number: number;
  year: number;
  title: string;
  venue: string;
  invite_on: string;
  registration_deadline: string;
  plays_on: string;
  entry_fee: number;
  status: "planned" | "registration" | "drawing" | "drawn" | "finished" | "cancelled";
  invited_at: string | null;
  drawn_at: string | null;
  finished_at: string | null;
  winner_team_id: string | null;
}

export function hallCupDates(year: number): { inviteOn: string; deadline: string; playsOn: string } {
  return { inviteOn: `${year}-12-01`, deadline: `${year}-12-20`, playsOn: `${year}-12-27` };
}

/** Datum a hodina v Praze. */
export function pragueNow(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** „27. 12.“ z YYYY-MM-DD. Končí tečkou, takže za ním na konci věty druhá tečka nepatří. */
function czDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}

function money(n: number): string {
  return `${n.toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
}

/** Ročník sálovky daného roku; založí se od 25. 11. do dne turnaje. */
export async function ensureHallCup(db: D1Database, today: string): Promise<HallCupRow | null> {
  const year = Number(today.slice(0, 4));
  const dates = hallCupDates(year);
  const existing = await db.prepare("SELECT * FROM hall_cups WHERE district = ? AND year = ?")
    .bind(HALL_HOST_DISTRICT, year).first<HallCupRow>();
  if (existing) return existing;
  if (today < `${year}-11-25` || today > dates.playsOn) return null;
  const season = (await activeSeasonNumber(db)) ?? 1;
  await db.prepare(
    `INSERT OR IGNORE INTO hall_cups (id, district, season_number, year, title, venue, invite_on, registration_deadline, plays_on, entry_fee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), HALL_HOST_DISTRICT, season, year, HALL_TITLE, HALL_VENUE, dates.inviteOn, dates.deadline, dates.playsOn, ENTRY_FEE).run();
  return db.prepare("SELECT * FROM hall_cups WHERE district = ? AND year = ?").bind(HALL_HOST_DISTRICT, year).first<HallCupRow>();
}

interface InvitableTeam {
  id: string;
  name: string;
  user_id: string | null;
  budget: number;
  reputation: number;
}

/**
 * Áčka v hrajících soutěžích (čekající IV. třída ne): lidské kluby ze všech okresů
 * (ostatní okresy podle zájmu, místa jsou kdo dřív přijde), AI kluby jen z pořádajícího okresu.
 */
async function invitableTeams(db: D1Database, district: string): Promise<InvitableTeam[]> {
  const rows = await db.prepare(
    `SELECT t.id, t.name, t.user_id, t.budget, COALESCE(t.reputation, 50) AS reputation
       FROM teams t JOIN villages v ON v.id = t.village_id JOIN leagues l ON l.id = t.league_id
      WHERE t.user_id IS NOT NULL AND t.parent_team_id IS NULL
        AND (t.team_type IS NULL OR t.team_type = 'senior') AND COALESCE(l.waiting, 0) = 0
        AND (t.user_id != 'ai' OR v.district = ?)`,
  ).bind(district).all<InvitableTeam>();
  return rows.results;
}

export function invitationText(cup: Pick<HallCupRow, "title" | "venue" | "registration_deadline" | "plays_on" | "entry_fee">): string {
  return `Dobrý den, v neděli ${czDate(cup.plays_on)} pořádáme v hale v Prachaticích ${cup.title.toLowerCase()}: malá kopaná 5+1, `
    + `2 × 10 minut, hraje se od 9:00 na dvou hřištích. Startovné ${money(cup.entry_fee)}, celý bank dostanou první tři `
    + `(50, 30 a 20 %). Vejde se nás 16 týmů, kdo dřív přijde. Přihlášky do ${czDate(cup.registration_deadline)}, `
    + `stačí odepsat. Los bude ${czDate(nextDate(cup.registration_deadline))}`;
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const REPLY_OPTIONS = [
  { id: "register", label: "Přihlásit se", text: "Hlásíme se, počítejte s námi." },
  { id: "decline", label: "Letos ne", text: "Letos bez nás, díky." },
];

/** Pozvánky: lidským trenérům SMS od haly, AI kluby se rozhodnou přes model. */
export async function inviteHallCup(env: Env, cup: HallCupRow): Promise<number> {
  const db = env.DB;
  const claimed = await db.prepare(
    "UPDATE hall_cups SET status = 'registration', invited_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND status = 'planned'",
  ).bind(cup.id).run();
  if (!claimed.meta.changes) return 0;
  const teams = await invitableTeams(db, cup.district);
  const text = invitationText(cup);
  const metadata = JSON.stringify({ type: "hall_cup", cupId: cup.id, options: REPLY_OPTIONS });
  const stmts: D1PreparedStatement[] = [];
  const convIds = new Map<string, string>();
  const humans = teams.filter((t) => t.user_id !== "ai");
  // ai_thread_active = 1 jako u okresních akcí: Telefon pak pod pozvánkou ukáže hotové odpovědi.
  for (const t of humans) {
    const convId = crypto.randomUUID();
    convIds.set(t.id, convId);
    stmts.push(
      db.prepare(
        `INSERT INTO conversations (id, team_id, type, title, participant_id, ai_thread_active, pinned, unread_count, last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', ?, ?, 1, 0, 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(convId, t.id, cup.venue, `${HALL_PARTICIPANT_PREFIX}${cup.id}`, text.slice(0, 100)),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, cup.venue, text, metadata),
      db.prepare("INSERT OR IGNORE INTO hall_cup_entries (cup_id, team_id, conv_id) VALUES (?, ?, ?)").bind(cup.id, t.id, convId),
    );
  }
  if (stmts.length) await db.batch(stmts);

  const ai = teams.filter((t) => t.user_id === "ai");
  if (ai.length) await decideAiEntries(env, cup, ai);

  const { createNotification } = await import("../community/notifications");
  const pushEnv = pushEnvOf(db, env);
  for (const t of humans) {
    await createNotification(db, t.id, "event", `⚽ ${cup.title}`,
      `Pozvánka z haly je v Telefonu. Přihlášky do ${czDate(cup.registration_deadline)}`, `/telefon/${convIds.get(t.id)}`, pushEnv,
    ).catch((e) => logger.warn({ module: M, teamId: t.id }, "upozornění na sálovku", e));
  }
  logger.info({ module: M }, `pozvánky na sálovku ${cup.year}: ${humans.length} lidských klubů, ${ai.length} AI`);
  return humans.length + ai.length;
}

/** Pravidlo, když model mlčí: klub s penězi na startovné jede, chudý ne. */
export function fallbackAiEntry(team: Pick<InvitableTeam, "budget" | "reputation">, fee: number): boolean {
  return team.budget >= fee * 8 && team.reputation >= 35;
}

/** AI kluby: rozhodnutí přes model, kód hlídá jen peníze na startovné. */
async function decideAiEntries(env: Env, cup: HallCupRow, teams: InvitableTeam[]): Promise<void> {
  const ai = await aiContextFromEnv(env).catch((e) => { logger.warn({ module: M }, "AI kontext pro sálovku", e); return null; });
  const stmts: D1PreparedStatement[] = [];
  for (const t of teams) {
    let join: boolean | null = null;
    if (ai && t.budget >= cup.entry_fee) {
      const prompt = `Jsi trenér amatérského fotbalového klubu ${t.name} z okresu ${cup.district}. Hala pořádá ${cup.title.toLowerCase()} `
        + `(malá kopaná 5+1, neděle ${czDate(cup.plays_on)}, startovné ${cup.entry_fee} Kč, bank pro první tři). `
        + `Klub má na účtu ${t.budget} Kč, reputace ${t.reputation}/100. Přihlásíš se? `
        + `Odpověz jen JSON {"join": true|false, "reason": "krátce česky"}.`;
      const raw = await generateText(ai, prompt, { maxTokens: 120, temperature: 0.7, module: M })
        .catch((e) => { logger.warn({ module: M, teamId: t.id }, "rozhodnutí AI klubu o sálovce", e); return null; });
      const parsed = raw ? parseModelJson(raw) : null;
      if (parsed && typeof parsed.join === "boolean") join = parsed.join;
    }
    if (join === null) {
      join = t.budget >= cup.entry_fee && fallbackAiEntry(t, cup.entry_fee);
      logger.warn({ module: M, teamId: t.id }, `AI klub o sálovce rozhodl pravidlem (model nevrátil odpověď): ${join ? "jede" : "nejede"}`);
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO hall_cup_entries (cup_id, team_id, status, answered_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT (cup_id, team_id) DO NOTHING`,
    ).bind(cup.id, t.id, join ? "registered" : "declined"));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

async function postHallMessage(dbx: D1Database, convId: string, venue: string, body: string, metadata?: Record<string, unknown>): Promise<void> {
  await dbx.batch([
    dbx.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, venue, body, metadata ? JSON.stringify(metadata) : null),
    dbx.prepare(
      `UPDATE conversations SET last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
         unread_count = unread_count + 1 WHERE id = ?`,
    ).bind(body.slice(0, 100), convId),
  ]);
}

export const HALL_REPLIES = {
  registered: (fee: number, drawOn: string) =>
    `Máte to, počítáme s vámi. Startovné ${money(fee)} strhneme při losu ${czDate(drawOn)} `
    + "Soupisku (brankář, pět do pole a čtyři náhradníci) si nastavte na stránce Sálovka. Kdo ji nenastaví, přiveze nejlepší zdravé.",
  alreadyRegistered: "Vy už jste přihlášení, máme vás zapsané.",
  declined: "Škoda. Kdybyste si to rozmysleli, napište do uzávěrky.",
  full: `Je plno, ${MAX_ENTRANTS} týmů už máme. Kdyby někdo odřekl, napište znovu.`,
  noMoney: (fee: number) => `Na startovné ${money(fee)} teď na účtu nemáte. Až budete mít, napište znovu.`,
  unclear: (deadline: string) => `Přihlásíte se? Stačí napsat ano, nebo ne. Přihlášky beru do ${czDate(deadline)}`,
  closed: "Přihlášky jsou uzavřené, los už proběhl.",
  over: "Letošní turnaj už skončil. Díky a zase za rok!",
  cancelled: "Turnaj se letos nekoná, sešlo se málo přihlášek.",
};

/** Odpověď trenéra hale (tlačítko nebo volný text). Do uzávěrky se dá rozmyslet. */
export async function handleHallCupReply(dbx: D1Database, convId: string, teamId: string, text: string, optionId: string | null): Promise<void> {
  const row = await dbx.prepare(
    `SELECT c.*, e.status AS entry_status FROM hall_cup_entries e JOIN hall_cups c ON c.id = e.cup_id
      WHERE e.conv_id = ? AND e.team_id = ?`,
  ).bind(convId, teamId).first<HallCupRow & { entry_status: string }>();
  if (!row) return;
  const reply = (body: string, metadata?: Record<string, unknown>) => postHallMessage(dbx, convId, row.venue, body, metadata);
  if (row.status === "finished") return reply(HALL_REPLIES.over);
  if (row.status === "cancelled") return reply(HALL_REPLIES.cancelled);
  if (row.status !== "registration") return reply(HALL_REPLIES.closed, { type: "guide", href: "/salovka", label: "Otevřít Sálovku" });

  const choice = optionId === "register" || optionId === "decline" ? optionId : classifyHallReply(text);
  if (!choice) return reply(HALL_REPLIES.unclear(row.registration_deadline));
  if (choice === "decline") {
    await dbx.prepare("UPDATE hall_cup_entries SET status = 'declined', answered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE cup_id = ? AND team_id = ?")
      .bind(row.id, teamId).run();
    return reply(HALL_REPLIES.declined);
  }
  if (row.entry_status === "registered") return reply(HALL_REPLIES.alreadyRegistered);
  const team = await dbx.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
  if ((team?.budget ?? 0) < row.entry_fee) return reply(HALL_REPLIES.noMoney(row.entry_fee));
  // Místo se zabere jen tehdy, když je ještě volno: počet a zápis v jednom příkazu.
  const res = await dbx.prepare(
    `UPDATE hall_cup_entries SET status = 'registered', answered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE cup_id = ? AND team_id = ? AND status != 'registered'
        AND (SELECT COUNT(*) FROM hall_cup_entries WHERE cup_id = ? AND status = 'registered') < ?`,
  ).bind(row.id, teamId, row.id, MAX_ENTRANTS).run();
  if (!res.meta.changes) return reply(HALL_REPLIES.full);
  return reply(HALL_REPLIES.registered(row.entry_fee, nextDate(row.registration_deadline)), { type: "guide", href: "/salovka", label: "Otevřít Sálovku" });
}

function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface EntryTeam {
  team_id: string;
  conv_id: string | null;
  name: string;
  reputation: number;
  village_id: string | null;
  user_id: string | null;
}

async function registeredTeams(dbx: D1Database, cupId: string): Promise<EntryTeam[]> {
  const rows = await dbx.prepare(
    `SELECT e.team_id, e.conv_id, t.name, COALESCE(t.reputation, 50) AS reputation, t.village_id, t.user_id
       FROM hall_cup_entries e JOIN teams t ON t.id = e.team_id
      WHERE e.cup_id = ? AND e.status = 'registered' ORDER BY e.answered_at, e.team_id`,
  ).bind(cupId).all<EntryTeam>();
  return rows.results;
}

/** Zpráva haly klubu: do vlákna s pozvánkou, AI klubům nic. */
async function messageEntrant(dbx: D1Database, cup: HallCupRow, t: Pick<EntryTeam, "conv_id" | "user_id">, body: string): Promise<void> {
  if (!t.conv_id || t.user_id === "ai") return;
  await postHallMessage(dbx, t.conv_id, cup.venue, body, { type: "guide", href: "/salovka", label: "Otevřít Sálovku" })
    .catch((e) => logger.warn({ module: M }, "SMS haly klubu", e));
}

async function payOnce(dbx: D1Database, teamId: string, type: "hall_cup_fee" | "hall_cup_prize", amount: number, description: string, referenceId: string, gameDate: string): Promise<boolean> {
  const done = await dbx.prepare("SELECT 1 FROM transactions WHERE team_id = ? AND reference_id = ? LIMIT 1").bind(teamId, referenceId).first();
  if (done) return false;
  await recordTransaction(dbx, teamId, type, amount, description, gameDate, referenceId, { allowNegative: true });
  return true;
}

/** Los den po uzávěrce: skupiny, časový plán, startovné, SMS. Málo přihlášek = turnaj se ruší. */
export async function drawHallCup(env: Env, cup: HallCupRow, today: string): Promise<{ drawn: boolean; teams: number }> {
  const dbx = env.DB;
  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const claimed = await dbx.prepare(
    `UPDATE hall_cups SET status = 'drawing', drawn_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ? AND (status = 'registration' OR (status = 'drawing' AND drawn_at < ?))`,
  ).bind(cup.id, stale).run();
  if (!claimed.meta.changes) return { drawn: false, teams: 0 };
  const teams = await registeredTeams(dbx, cup.id);
  if (teams.length < MIN_ENTRANTS) {
    await dbx.prepare("UPDATE hall_cups SET status = 'cancelled' WHERE id = ?").bind(cup.id).run();
    for (const t of teams) {
      await messageEntrant(dbx, cup, t, `Sešly se jen ${teams.length} přihlášky, takže turnaj letos ruším. Startovné se nestrhává. Snad za rok.`);
    }
    logger.info({ module: M }, `sálovka ${cup.year} zrušena, přihlášek ${teams.length}`);
    return { drawn: false, teams: teams.length };
  }

  const villages = await dbx.prepare(
    `SELECT id, district FROM villages WHERE id IN (${teams.map(() => "?").join(",")})`,
  ).bind(...teams.map((t) => t.village_id ?? "")).all<{ id: string; district: string | null }>();
  const districtOf = new Map(villages.results.map((v) => [v.id, v.district]));
  const drawTeams: DrawTeam[] = teams.map((t) => ({ id: t.team_id, reputation: t.reputation, village: t.village_id, district: districtOf.get(t.village_id ?? "") ?? null }));
  const seed = seedOf(cup.id);
  const groups = drawGroups(drawTeams, seed, groupCountFor(teams.length), 500);
  const plan = scheduleGroupStage(groups, seed);

  const stmts: D1PreparedStatement[] = plan.map((m) => insertMatch(dbx, cup, m));
  groups.forEach((g, i) => g.forEach((teamId) => stmts.push(
    dbx.prepare("UPDATE hall_cup_entries SET group_code = ? WHERE cup_id = ? AND team_id = ?").bind(groupCode(i), cup.id, teamId),
  )));
  await dbx.batch(stmts);

  const nameOf = new Map(teams.map((t) => [t.team_id, t.name]));
  for (const t of teams) {
    await payOnce(dbx, t.team_id, "hall_cup_fee", -cup.entry_fee, `${cup.title}: startovné`, `hallcup-${cup.id}-fee`, today)
      .catch((e) => logger.error({ module: M, teamId: t.team_id }, "startovné sálovky", e));
    const gi = groups.findIndex((g) => g.includes(t.team_id));
    const rivals = groups[gi].filter((id) => id !== t.team_id).map((id) => nameOf.get(id)).join(", ");
    const first = plan.find((m) => m.home === t.team_id || m.away === t.team_id);
    await messageEntrant(dbx, cup, t,
      `Los je hotový. Hrajete ve skupině ${groupCode(gi)} (${rivals}). První zápas v ${first ? slotClock(first.slot) : "9:00"}`
      + `${first ? ` na hřišti ${first.court}` : ""}. Startovné ${money(cup.entry_fee)} jsme strhli. Soupisku můžete měnit do začátku turnaje na stránce Sálovka.`);
  }
  await dbx.prepare("UPDATE hall_cups SET status = 'drawn' WHERE id = ?").bind(cup.id).run();
  logger.info({ module: M }, `sálovka ${cup.year} vylosována: ${teams.length} týmů, ${groups.length} skupiny, ${plan.length} zápasů ve skupinách`);
  return { drawn: true, teams: teams.length };
}

function insertMatch(dbx: D1Database, cup: HallCupRow, m: PlannedMatch): D1PreparedStatement {
  return dbx.prepare(
    `INSERT OR IGNORE INTO hall_cup_matches (id, cup_id, stage, group_code, bracket_pos, slot, court, kickoff_at, home_team_id, away_team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`${cup.id}-${m.stage}-${m.bracketPos}`, cup.id, m.stage, m.groupCode, m.bracketPos, m.slot, m.court, slotKickoff(cup.plays_on, m.slot), m.home, m.away);
}

interface MatchRow {
  id: string;
  stage: string;
  group_code: string | null;
  bracket_pos: number;
  slot: number;
  court: number;
  kickoff_at: string;
  home_team_id: string;
  away_team_id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
  winner_team_id: string | null;
  events: string | null;
}

async function loadMatches(dbx: D1Database, cupId: string): Promise<MatchRow[]> {
  const rows = await dbx.prepare("SELECT * FROM hall_cup_matches WHERE cup_id = ? ORDER BY slot, court").bind(cupId).all<MatchRow>();
  return rows.results;
}

/** Odehraje jeden zápas, pokud ho nikdo jiný právě nehraje. */
async function playOne(dbx: D1Database, cup: HallCupRow, m: MatchRow, rosters: Map<string, string[] | null>, names: Map<string, string>): Promise<boolean> {
  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const claimed = await dbx.prepare(
    `UPDATE hall_cup_matches SET status = 'playing', claimed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ? AND (status = 'scheduled' OR (status = 'playing' AND claimed_at < ?))`,
  ).bind(m.id, stale).run();
  if (!claimed.meta.changes) return false;
  try {
    const [homeCands, awayCands] = await Promise.all([hallCandidates(dbx, m.home_team_id), hallCandidates(dbx, m.away_team_id)]);
    const home = buildHallSide(1, names.get(m.home_team_id) ?? "Domácí", homeCands, rosters.get(m.home_team_id) ?? null);
    const away = buildHallSide(2, names.get(m.away_team_id) ?? "Hosté", awayCands, rosters.get(m.away_team_id) ?? null);
    const rng = matchRng(m.id);
    // Hala bere kolem tří set lidí, na finále se nacpe víc.
    const attendance = m.stage === "final" ? 450 : m.stage === "group" ? 120 + Math.floor(rng.random() * 120) : 250 + Math.floor(rng.random() * 120);
    const out = playHallMatch(rng, { id: m.home_team_id, side: home }, { id: m.away_team_id, side: away }, m.stage !== "group", attendance);
    await dbx.prepare(
      `UPDATE hall_cup_matches SET status = 'played', home_score = ?, away_score = ?, home_pens = ?, away_pens = ?, winner_team_id = ?,
              events = ?, lineups = ?, played_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    ).bind(out.homeScore, out.awayScore, out.homePens, out.awayPens, out.winner, JSON.stringify(out.events),
      JSON.stringify({ home: home.names, away: away.names, forfeit: out.forfeit }), m.id).run();
    return true;
  } catch (e) {
    logger.error({ module: M }, `zápas sálovky ${m.id}`, e);
    await dbx.prepare("UPDATE hall_cup_matches SET status = 'scheduled', claimed_at = NULL WHERE id = ? AND status = 'playing'").bind(m.id).run()
      .catch((err) => logger.warn({ module: M }, `uvolnění zápasu ${m.id}`, err));
    return false;
  }
}

/**
 * Další fáze, když je předchozí dohraná. Vrací true, když přibyly zápasy.
 * Opakovaný běh nic nezdvojí (INSERT OR IGNORE na pozici ve fázi).
 */
export async function progressHallCup(dbx: D1Database, cup: HallCupRow, matches: MatchRow[]): Promise<boolean> {
  const byStage = (s: string) => matches.filter((m) => m.stage === s);
  const done = (list: MatchRow[]) => list.length > 0 && list.every((m) => m.status === "played");
  const group = byStage("group");
  if (!done(group)) return false;
  const teams = await registeredTeams(dbx, cup.id);
  const lastGroupSlot = Math.max(...group.map((m) => m.slot));
  const slots = knockoutSlots(teams.length, lastGroupSlot);
  const toPlanned = (stage: KnockoutStage, pairs: Array<{ home: string; away: string }>): PlannedMatch[] =>
    pairs.map((p, i) => ({ stage, groupCode: null, bracketPos: i, slot: slots[stage][i].slot, court: slots[stage][i].court, home: p.home, away: p.away }));

  let next: Array<{ stage: KnockoutStage; pairs: Array<{ home: string; away: string }> }> = [];
  const qf = byStage("qf");
  const sf = byStage("sf");
  if (!qf.length && !sf.length && !byStage("final").length) {
    const entries = await dbx.prepare("SELECT team_id, group_code FROM hall_cup_entries WHERE cup_id = ? AND status = 'registered'")
      .bind(cup.id).all<{ team_id: string; group_code: string | null }>();
    const codes = [...new Set(entries.results.map((e) => e.group_code ?? "A"))].sort();
    const meta = new Map(teams.map((t) => [t.team_id, t]));
    const groups: GroupTeam[][] = codes.map((code) => entries.results.filter((e) => (e.group_code ?? "A") === code)
      .map((e) => ({ id: e.team_id, name: meta.get(e.team_id)?.name ?? "", reputation: meta.get(e.team_id)?.reputation ?? 0 })));
    const played: PlayedMatch[] = group.map((m) => ({ home: m.home_team_id, away: m.away_team_id, homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0 }));
    const reputationOrder = [...teams].sort((a, b) => b.reputation - a.reputation).map((t) => t.team_id);
    next = firstKnockoutPairs(groupTables(groups, played), reputationOrder);
  } else if (done(qf) && !sf.length) {
    next = nextKnockoutPairs("qf", qf.map(tie));
  } else if (done(sf) && !byStage("final").length) {
    next = nextKnockoutPairs("sf", sf.map(tie));
  }
  if (!next.length) return false;
  await dbx.batch(next.flatMap((n) => toPlanned(n.stage, n.pairs)).map((m) => insertMatch(dbx, cup, m)));
  return true;
}

function tie(m: MatchRow): { bracketPos: number; winner: string; loser: string } {
  const winner = m.winner_team_id ?? m.home_team_id;
  return { bracketPos: m.bracket_pos, winner, loser: winner === m.home_team_id ? m.away_team_id : m.home_team_id };
}

/** Den turnaje: odehraje splatné zápasy, založí play-off, po finále turnaj uzavře. */
export async function playDueHallCupMatches(env: Env, cup: HallCupRow, now: Date): Promise<number> {
  const dbx = env.DB;
  const entries = await dbx.prepare(
    `SELECT e.team_id, e.roster, t.name FROM hall_cup_entries e JOIN teams t ON t.id = e.team_id WHERE e.cup_id = ? AND e.status = 'registered'`,
  ).bind(cup.id).all<{ team_id: string; roster: string | null; name: string }>();
  const rosters = new Map(entries.results.map((e) => [e.team_id, parseRoster(e.roster)]));
  const names = new Map(entries.results.map((e) => [e.team_id, e.name]));
  let played = 0;
  for (let round = 0; round < 8 && played < MAX_MATCHES_PER_RUN; round++) {
    const matches = await loadMatches(dbx, cup.id);
    const due = matches.filter((m) => m.status !== "played" && m.kickoff_at <= now.toISOString());
    for (const m of due) {
      if (played >= MAX_MATCHES_PER_RUN) break;
      if (await playOne(dbx, cup, m, rosters, names)) played++;
    }
    const fresh = await loadMatches(dbx, cup.id);
    const final = fresh.find((m) => m.stage === "final");
    const third = fresh.find((m) => m.stage === "third");
    if (final?.status === "played" && (!third || third.status === "played")) {
      await finishHallCup(env, cup, fresh);
      break;
    }
    const added = await progressHallCup(dbx, cup, fresh);
    if (!added && !due.length) break;
  }
  return played;
}

export function parseRoster(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : null;
  } catch (e) {
    logger.warn({ module: M }, "nečitelná soupiska sálovky", e);
    return null;
  }
}

/** Nejlepší střelec turnaje (bez vlastních gólů); při shodě ten, kdo dal první. */
export function topScorer(matches: Array<Pick<MatchRow, "events" | "home_team_id" | "away_team_id">>): { name: string; teamId: string; goals: number } | null {
  const tally = new Map<string, { name: string; teamId: string; goals: number; order: number }>();
  let order = 0;
  for (const m of matches) {
    let events: HallEvent[] = [];
    try {
      events = m.events ? JSON.parse(m.events) as HallEvent[] : [];
    } catch (e) {
      logger.warn({ module: M }, "nečitelné události zápasu sálovky", e);
    }
    for (const e of events) {
      if (e.type !== "goal" || !e.playerId || e.detail === "own_goal") continue;
      const teamId = e.side === "home" ? m.home_team_id : m.away_team_id;
      const cur = tally.get(e.playerId) ?? { name: e.name, teamId, goals: 0, order: order++ };
      cur.goals++;
      tally.set(e.playerId, cur);
    }
  }
  const best = [...tally.values()].sort((a, b) => b.goals - a.goals || a.order - b.order)[0];
  return best ? { name: best.name, teamId: best.teamId, goals: best.goals } : null;
}

function scoreLine(m: MatchRow): string {
  const pens = m.home_pens != null && m.away_pens != null ? ` (na penalty ${m.home_pens}:${m.away_pens})` : "";
  return `${m.home_score ?? 0}:${m.away_score ?? 0}${pens}`;
}

/** Po finále: umístění, bank, trofej, článek do Zpravodaje okresu a SMS od redakce. */
export async function finishHallCup(env: Env, cup: HallCupRow, matches: MatchRow[]): Promise<boolean> {
  const dbx = env.DB;
  const final = matches.find((m) => m.stage === "final");
  const third = matches.find((m) => m.stage === "third");
  if (!final || final.status !== "played") return false;
  const claimed = await dbx.prepare(
    "UPDATE hall_cups SET status = 'finished', finished_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), winner_team_id = ? WHERE id = ? AND status = 'drawn'",
  ).bind(final.winner_team_id, cup.id).run();
  if (!claimed.meta.changes) return false;

  const teams = await registeredTeams(dbx, cup.id);
  const nameOf = new Map(teams.map((t) => [t.team_id, t.name]));
  const winner = tie(final);
  const podium = [winner.winner, winner.loser, third ? tie(third).winner : null];
  const prizes = splitPot(cup.entry_fee * teams.length);
  const placeLabel = ["vítězství", "2. místo", "3. místo"];
  for (let i = 0; i < 3; i++) {
    const teamId = podium[i];
    if (!teamId) continue;
    await dbx.prepare("UPDATE hall_cup_entries SET final_place = ? WHERE cup_id = ? AND team_id = ?").bind(i + 1, cup.id, teamId).run();
    await payOnce(dbx, teamId, "hall_cup_prize", prizes[i], `${cup.title}: ${placeLabel[i]}`, `hallcup-${cup.id}-prize`, cup.plays_on)
      .catch((e) => logger.error({ module: M, teamId }, "výhra ze sálovky", e));
  }
  await awardHallTrophy(dbx, cup, winner.winner).catch((e) => logger.warn({ module: M }, "trofej sálovky", e));

  const scorer = topScorer(matches);
  const headline = `${cup.title}: vyhrál ${nameOf.get(winner.winner) ?? "?"}`;
  const body = [
    `Sportovní hala v Prachaticích zažila v neděli ${czDate(cup.plays_on)} sváteční fotbal. Na palubovku vyběhlo ${teams.length} týmů`
    + " a hrálo se od devíti ráno až do odpoledne na dvou hřištích.",
    `Ve finále porazil ${nameOf.get(winner.winner)} tým ${nameOf.get(winner.loser)} ${scoreLine(final)} a odváží si pohár i ${money(prizes[0])} z banku.`
    + ` Poražený finalista ${nameOf.get(winner.loser)} bere ${money(prizes[1])}.`,
    third ? `O třetí místo hráli ${nameOf.get(third.home_team_id)} a ${nameOf.get(third.away_team_id)}, skončilo to ${scoreLine(third)}.`
      + ` Bronz a ${money(prizes[2])} bere ${nameOf.get(tie(third).winner)}.` : "",
    scorer ? `Nejlepším střelcem turnaje je ${scorer.name} (${nameOf.get(scorer.teamId)}) s ${scorer.goals} ${scorer.goals === 1 ? "gólem" : "góly"}.` : "",
    "Pořadatelé děkují všem, kdo dorazili, a slibují, že za rok se hraje znovu.",
  ].filter(Boolean).join("\n\n");
  await publishArticle(dbx, cup, headline, body).catch((e) => logger.warn({ module: M }, "článek o sálovce", e));
  logger.info({ module: M }, `sálovka ${cup.year} dohrána, vítěz ${winner.winner}`);
  return true;
}

async function awardHallTrophy(dbx: D1Database, cup: HallCupRow, teamId: string): Promise<void> {
  const row = await dbx.prepare("SELECT trophies FROM teams WHERE id = ?").bind(teamId).first<{ trophies: string | null }>();
  let list: Array<Record<string, unknown>> = [];
  try {
    list = JSON.parse(row?.trophies ?? "[]") as Array<Record<string, unknown>>;
  } catch (e) {
    logger.warn({ module: M }, `nečitelné trofeje týmu ${teamId}`, e);
  }
  const leagueId = `hall-cup-${cup.id}`;
  if (list.some((x) => x.leagueId === leagueId)) return;
  list.push({ seasonNumber: cup.season_number, leagueId, leagueName: `${cup.title} ${cup.year}`, place: 1, title: `Vítěz: ${cup.title} ${cup.year}` });
  await dbx.prepare("UPDATE teams SET trophies = ? WHERE id = ?").bind(JSON.stringify(list), teamId).run();
}

/**
 * Článek do hrajících soutěží pořádajícího okresu a do soutěží všech účastníků, SMS od redakce
 * lidským klubům těch soutěží. Podruhé nic.
 */
async function publishArticle(dbx: D1Database, cup: HallCupRow, headline: string, body: string): Promise<void> {
  const leagues = await dbx.prepare(
    `SELECT DISTINCT l.id FROM leagues l JOIN teams t ON t.league_id = l.id JOIN villages v ON v.id = t.village_id
      WHERE COALESCE(l.waiting, 0) = 0 AND t.parent_team_id IS NULL
        AND (v.district = ? OR t.id IN (SELECT team_id FROM hall_cup_entries WHERE cup_id = ? AND status = 'registered'))`,
  ).bind(cup.district, cup.id).all<{ id: string }>();
  const existing = await dbx.prepare("SELECT id, league_id FROM news WHERE type = 'hall_cup' AND headline = ?").bind(headline).all<{ id: string; league_id: string }>();
  const newsByLeague = new Map(existing.results.map((r) => [r.league_id, r.id]));
  const inserts: D1PreparedStatement[] = [];
  for (const l of leagues.results) {
    if (newsByLeague.has(l.id)) continue;
    const id = crypto.randomUUID();
    newsByLeague.set(l.id, id);
    inserts.push(dbx.prepare(
      `INSERT INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, ?, 'hall_cup', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(id, l.id, cup.winner_team_id, headline, body, cup.season_number));
  }
  if (inserts.length) await dbx.batch(inserts);

  const recipients = await dbx.prepare(
    `SELECT id, league_id FROM teams WHERE league_id IN (${leagues.results.map(() => "?").join(",") || "''"})
       AND parent_team_id IS NULL AND user_id IS NOT NULL AND user_id != 'ai'`,
  ).bind(...leagues.results.map((l) => l.id)).all<{ id: string; league_id: string }>();
  const newsIds = [...newsByLeague.values()];
  const already = newsIds.length ? await dbx.prepare(
    `SELECT DISTINCT c.team_id FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.type = 'system' AND c.title = ? AND json_extract(m.metadata, '$.newsId') IN (${newsIds.map(() => "?").join(",")})`,
  ).bind(NEWS_DESK, ...newsIds).all<{ team_id: string }>() : { results: [] as Array<{ team_id: string }> };
  const notified = new Set(already.results.map((r) => r.team_id));
  const { sendSystemSMS } = await import("../messaging/system-sms");
  for (const t of recipients.results) {
    const newsId = newsByLeague.get(t.league_id);
    if (!newsId || notified.has(t.id)) continue;
    await sendSystemSMS(dbx, t.id, NEWS_DESK, `📰 Ve Zpravodaji vyšla reportáž ze sálovky: „${headline}“`,
      { type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId })
      .catch((e) => logger.warn({ module: M, teamId: t.id }, "SMS o článku ze sálovky", e));
  }
}

/**
 * Hodinový běh: založit ročník, poslat pozvánky (od 1. 12. v 9:00), vylosovat
 * (den po uzávěrce od 9:00) a v den turnaje hrát splatné zápasy.
 */
export async function tickHallCup(env: Env, now: Date = new Date()): Promise<{ status: string; played: number }> {
  const { date, hour } = pragueNow(now);
  const cup = await ensureHallCup(env.DB, date);
  if (!cup) return { status: "none", played: 0 };
  if (cup.status === "planned" && date >= cup.invite_on && hour >= OFFICE_HOUR) {
    await inviteHallCup(env, cup);
    return { status: "invited", played: 0 };
  }
  if ((cup.status === "registration" || cup.status === "drawing") && date > cup.registration_deadline && hour >= OFFICE_HOUR) {
    const res = await drawHallCup(env, cup, date);
    return { status: res.drawn ? "drawn" : "draw_skipped", played: 0 };
  }
  if (cup.status === "drawn" && date >= cup.plays_on) {
    const played = await playDueHallCupMatches(env, cup, now);
    return { status: "playing", played };
  }
  return { status: cup.status, played: 0 };
}

/** Nejnovější ročník (stránka Sálovka). Zvaní jsou kluby ze všech okresů, proto bez filtru. */
export async function loadHallCupForTeam(dbx: D1Database, _teamId: string): Promise<HallCupRow | null> {
  return dbx.prepare("SELECT * FROM hall_cups ORDER BY year DESC LIMIT 1").first<HallCupRow>();
}

export { loadMatches as loadHallCupMatches, registeredTeams as loadHallCupEntrants };
export type { MatchRow as HallCupMatchRow };
