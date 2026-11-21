/**
 * Výběr okresu.
 *
 * Admin vypíše zápas výběrů dvou okresů (místo, den). OFS každého okresu pošle lidským
 * trenérům 24 kandidátů (nejlepší hráči okresu, nejvýš tři z klubu) a každý trenér napíše
 * až tři jména z cizích klubů. AI kluby volí přes model (při výpadku pravidlo). Dva dny před
 * zápasem se nominace uzavře: 16 nejvíc jmenovaných (aspoň dva brankáři) jede, nominovaní
 * mají lepší náladu, silný opomenutý hráč s horkou hlavou si trenérovi postěžuje.
 *
 * Zápas se hraje v 15:00 v Praze na neutrální půdě. Výběr nemá řádek v `teams`: sestava se
 * skládá přímo z hráčů klubů, takže se výběr neobjeví v tabulkách, na trhu ani v tickách.
 * Zranění z výběru platí v klubu a klub dostane SMS. Po zápase článek a SMS od redakce.
 */

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { simulateMatch } from "../engine/simulation";
import { mapRowToMatchPlayer } from "../engine/lineup-loader";
import type { MatchPlayer, TeamSetup } from "../engine/types";
import { pragueTimeToUtc } from "../hall-cup/format";
import { activeSeasonNumber } from "../transfers/unrest";
import { aiOrNull, askJson, czDate, districtLeagues, pragueNow, replyDueAt, type PollEnv, POLL_PREFIX } from "./district-poll";
import { matchVote, normalize, type VoteCandidate } from "./poll-logic";

const M = "district-selection";
export const SELECTION_KIND = "selection";
export const SELECTION_CANDIDATES = 24;
export const SELECTION_SQUAD = 16;
export const SELECTION_PICKS = 3;
const MAX_CANDIDATES_PER_CLUB = 3;
const KICKOFF_MINUTES = 15 * 60;
const NEWS_DESK = "Redakce Zpravodaje";

export interface SelectionInput {
  homeDistrict: string;
  awayDistrict: string;
  venue: string;
  /** YYYY-MM-DD, aspoň za čtyři dny (nominace trvá do dvou dnů před zápasem). */
  matchDate: string;
}

interface Candidate {
  player_id: string;
  team_id: string;
  name: string;
  team_name: string;
  position: string;
  rank: number;
}

function ofsName(district: string): string {
  return `OFS ${district}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 24 kandidátů: nejlepší zdraví hráči áček okresu, nejvýš tři z klubu, aspoň tři brankáři. */
async function candidatesOf(db: D1Database, district: string): Promise<Candidate[]> {
  const leagues = await districtLeagues(db, district);
  if (!leagues.length) return [];
  const rows = await db.prepare(
    `SELECT p.id, p.team_id, p.first_name || ' ' || p.last_name AS name, t.name AS team_name, p.position, p.overall_rating
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE t.league_id IN (${leagues.map(() => "?").join(",")}) AND t.parent_team_id IS NULL
        AND (p.status IS NULL OR p.status = 'active') AND p.loan_from_team_id IS NULL
      ORDER BY p.overall_rating DESC, p.id`,
  ).bind(...leagues).all<{ id: string; team_id: string; name: string; team_name: string; position: string; overall_rating: number }>();
  const injured = await db.prepare(
    `SELECT i.player_id FROM injuries i JOIN players p ON p.id = i.player_id JOIN teams t ON t.id = p.team_id
      WHERE t.league_id IN (${leagues.map(() => "?").join(",")}) AND i.days_remaining > 0`,
  ).bind(...leagues).all<{ player_id: string }>();
  const hurt = new Set(injured.results.map((r) => r.player_id));
  const perClub = new Map<string, number>();
  const out: Candidate[] = [];
  const take = (r: (typeof rows.results)[number]) => {
    if (hurt.has(r.id) || out.some((c) => c.player_id === r.id)) return;
    if ((perClub.get(r.team_id) ?? 0) >= MAX_CANDIDATES_PER_CLUB) return;
    perClub.set(r.team_id, (perClub.get(r.team_id) ?? 0) + 1);
    out.push({ player_id: r.id, team_id: r.team_id, name: r.name, team_name: r.team_name, position: r.position, rank: 0 });
  };
  for (const r of rows.results.filter((x) => x.position === "GK").slice(0, 6)) {
    if (out.filter((c) => c.position === "GK").length >= 3) break;
    take(r);
  }
  for (const r of rows.results) {
    if (out.length >= SELECTION_CANDIDATES) break;
    take(r);
  }
  return out.map((c, i) => ({ ...c, rank: i + 1 }));
}

export function selectionInvitation(district: string, opponent: string, venue: string, matchDate: string, closesOn: string, candidates: Candidate[]): string {
  const list = candidates.map((c) => `${c.rank}. ${c.name} (${c.team_name})`).join("\n");
  return `Dobrý den, OFS ${district} skládá výběr okresu na zápas s výběrem okresu ${opponent} (${czDate(matchDate)}, ${venue}). `
    + `Napište nám až tři hráče z jiných klubů, které tam chcete mít. Kandidáti:\n${list}\n`
    + `Stačí jména nebo čísla, nominace se uzavírá ${czDate(closesOn)} večer.`;
}

/** Vypíše zápas výběrů a pošle nominace oběma okresům. */
export async function announceDistrictSelection(env: PollEnv, input: SelectionInput, now: Date = new Date()): Promise<string> {
  const db = env.DB;
  if (input.homeDistrict === input.awayDistrict) throw new Error("Výběr hraje proti jinému okresu.");
  const today = pragueNow(now).date;
  if (input.matchDate < addDays(today, 4)) throw new Error("Zápas musí být aspoň za čtyři dny, nominace potřebuje čas.");
  const season = (await activeSeasonNumber(db)) ?? 1;
  const matchId = `sel-${season}-${normalize(input.homeDistrict).replace(/ /g, "-")}-${normalize(input.awayDistrict).replace(/ /g, "-")}-${input.matchDate}`;
  const closesOn = addDays(input.matchDate, -2);
  const pollIds: Record<"home" | "away", string> = { home: `${matchId}-home`, away: `${matchId}-away` };
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO district_selection_matches (id, home_district, away_district, venue, match_date, kickoff_at, season_number, home_poll_id, away_poll_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(matchId, input.homeDistrict, input.awayDistrict, input.venue, input.matchDate, pragueTimeToUtc(input.matchDate, KICKOFF_MINUTES), season, pollIds.home, pollIds.away),
  ];
  const humans: Array<{ teamId: string; convId: string; text: string; sender: string }> = [];
  for (const side of ["home", "away"] as const) {
    const district = side === "home" ? input.homeDistrict : input.awayDistrict;
    const opponent = side === "home" ? input.awayDistrict : input.homeDistrict;
    const candidates = await candidatesOf(db, district);
    if (candidates.length < SELECTION_SQUAD) throw new Error(`V okrese ${district} je málo zdravých hráčů na výběr (${candidates.length}).`);
    const sender = ofsName(district);
    stmts.push(db.prepare("INSERT INTO district_polls (id, district, season_number, kind, editor_name, closes_on) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(pollIds[side], district, season, SELECTION_KIND, sender, closesOn));
    for (const c of candidates) {
      stmts.push(db.prepare(
        "INSERT INTO district_poll_candidates (poll_id, player_id, team_id, name, team_name, position, blurb, rank) VALUES (?, ?, ?, ?, ?, ?, '', ?)",
      ).bind(pollIds[side], c.player_id, c.team_id, c.name, c.team_name, c.position, c.rank));
    }
    const leagues = await districtLeagues(db, district);
    const teams = await db.prepare(
      `SELECT id, user_id FROM teams WHERE league_id IN (${leagues.map(() => "?").join(",")}) AND parent_team_id IS NULL AND user_id IS NOT NULL`,
    ).bind(...leagues).all<{ id: string; user_id: string }>();
    const text = selectionInvitation(district, opponent, input.venue, input.matchDate, closesOn, candidates);
    for (const t of teams.results) {
      if (t.user_id === "ai") {
        stmts.push(db.prepare("INSERT INTO district_poll_ballots (poll_id, voter_kind, voter_id, voter_team_id) VALUES (?, 'team', ?, ?)").bind(pollIds[side], t.id, t.id));
        continue;
      }
      const convId = crypto.randomUUID();
      humans.push({ teamId: t.id, convId, text, sender });
      stmts.push(
        db.prepare(
          `INSERT INTO conversations (id, team_id, type, title, participant_id, ai_thread_active, pinned, unread_count, last_message_text, last_message_at, created_at)
           VALUES (?, ?, 'system', ?, ?, 0, 0, 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
        ).bind(convId, t.id, sender, `${POLL_PREFIX}${pollIds[side]}`, text.slice(0, 100)),
        db.prepare(
          `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
           VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
        ).bind(crypto.randomUUID(), convId, sender, text, JSON.stringify({ type: "district_poll", pollId: pollIds[side] })),
        db.prepare("INSERT INTO district_poll_ballots (poll_id, voter_kind, voter_id, voter_team_id, conv_id) VALUES (?, 'team', ?, ?, ?)").bind(pollIds[side], t.id, t.id, convId),
      );
    }
  }
  await db.batch(stmts);
  logger.info({ module: M }, `výběr ${input.homeDistrict} proti ${input.awayDistrict} ${input.matchDate}: nominace rozeslána ${humans.length} trenérům`);
  return matchId;
}

/** Až tři kandidáti z volného textu: čísla, nebo jména oddělená čárkou, „a“, novým řádkem. */
export function parseSelectionPicks(text: string, candidates: VoteCandidate[]): string[] {
  const picks: string[] = [];
  const numbers = (text.match(/\b\d{1,2}\b/g) ?? []).map(Number).filter((n) => n >= 1 && n <= candidates.length);
  const words = normalize(text).split(" ").filter(Boolean);
  if (numbers.length && numbers.length >= words.filter((w) => /\p{L}/u.test(w)).length / 3) {
    for (const n of numbers) {
      const id = candidates.find((c) => c.rank === n)?.playerId;
      if (id && !picks.includes(id)) picks.push(id);
    }
  } else {
    for (const part of text.split(/[,;\n+]|\s+a\s+|\s+i\s+|\s+plus\s+/i)) {
      const id = matchVote(part, candidates);
      if (id && id !== "ambiguous" && !picks.includes(id)) picks.push(id);
    }
  }
  return picks.slice(0, SELECTION_PICKS);
}

export async function handleSelectionReply(env: PollEnv, pollId: string, status: string, teamId: string, text: string, now: Date): Promise<void> {
  const db = env.DB;
  const due = replyDueAt(now, Math.floor(now.getTime() / 1000)).toISOString();
  const reply = (body: string, picks?: string[]) => db.prepare(
    `UPDATE district_poll_ballots SET pending_reply = ?, reply_due_at = ?${picks ? ", picks = ?, player_id = ?, voted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')" : ""}
      WHERE poll_id = ? AND voter_kind = 'team' AND voter_id = ?`,
  ).bind(...(picks ? [body, due, JSON.stringify(picks), picks[0] ?? null] : [body, due]), pollId, teamId).run();
  if (status !== "voting") {
    await reply("Nominace už je uzavřená, díky.");
    return;
  }
  const rows = (await db.prepare("SELECT player_id, team_id, name, team_name, rank FROM district_poll_candidates WHERE poll_id = ? ORDER BY rank").bind(pollId)
    .all<{ player_id: string; team_id: string; name: string; team_name: string; rank: number }>()).results;
  const candidates: VoteCandidate[] = rows.map((r) => ({ playerId: r.player_id, name: r.name, teamName: r.team_name, rank: r.rank }));
  let picks = parseSelectionPicks(text, candidates);
  if (!picks.length) {
    const ai = await aiOrNull(env);
    const parsed = await askJson(ai, `Trenér posílá OFS nominaci do výběru okresu, až tři hráče. Kandidáti (id | jméno | klub):\n`
      + `${rows.map((r) => `${r.player_id} | ${r.name} | ${r.team_name}`).join("\n")}\nZpráva trenéra: „${text.slice(0, 500)}“\n`
      + `Které kandidáty jmenuje? Odpověz jen JSON {"ids": ["..."]} (prázdné pole, když nikoho).`, 120);
    const ids = Array.isArray(parsed?.ids) ? (parsed!.ids as unknown[]).filter((x): x is string => typeof x === "string" && rows.some((r) => r.player_id === x)) : [];
    picks = [...new Set(ids)].slice(0, SELECTION_PICKS);
  }
  const own = picks.filter((id) => rows.find((r) => r.player_id === id)?.team_id === teamId);
  picks = picks.filter((id) => !own.includes(id));
  if (!picks.length) {
    await reply(own.length ? "Vlastní hráče nominovat nejde, napište prosím hráče z jiných klubů." : "Nerozumím, koho nominujete. Napište jména nebo čísla ze seznamu, nejvýš tři.");
    return;
  }
  const names = picks.map((id) => rows.find((r) => r.player_id === id)?.name ?? "").join(", ");
  await reply(`Zapsáno: ${names}.${own.length ? " Vlastního hráče jsme vynechali." : ""} Díky, nominaci uzavíráme pár dní před zápasem.`, picks);
}

/** Sestava výběru: 16 nejvíc jmenovaných, při shodě lepší kandidát, aspoň dva brankáři. */
export function pickSquad(candidates: Array<{ player_id: string; position: string; rank: number }>, votes: Map<string, number>): string[] {
  const order = [...candidates].sort((a, b) => (votes.get(b.player_id) ?? 0) - (votes.get(a.player_id) ?? 0) || a.rank - b.rank);
  const squad = order.slice(0, SELECTION_SQUAD);
  const keepers = squad.filter((c) => c.position === "GK").length;
  if (keepers < 2) {
    const extra = order.filter((c) => c.position === "GK" && !squad.includes(c)).slice(0, 2 - keepers);
    for (const gk of extra) {
      const drop = [...squad].reverse().find((c) => c.position !== "GK");
      if (drop) squad.splice(squad.indexOf(drop), 1, gk);
    }
  }
  return squad.map((c) => c.player_id);
}

const SNUB_LINES = [
  "Trenére, výběr okresu jede beze mě? Hraju nejlíp v celý soutěži a pozvánku dostanou jiní. To nechápu.",
  "Tak výběr okresu jsem viděl na vývěsce. Moje jméno tam není. Kdo to u OFS skládal, slepej?",
];

/** Uzavře nominaci jednoho okresu: hlasy AI, sestava, nálada, SMS klubům a naštvaný opomenutý. */
export async function closeSelectionPoll(env: PollEnv, pollId: string, opponent: string, matchDate: string): Promise<string[] | null> {
  const db = env.DB;
  const claimed = await db.prepare("UPDATE district_polls SET status = 'closing' WHERE id = ? AND status = 'voting'").bind(pollId).run();
  if (!claimed.meta.changes) return null;
  const poll = await db.prepare("SELECT district, editor_name FROM district_polls WHERE id = ?").bind(pollId).first<{ district: string; editor_name: string }>();
  const candidates = (await db.prepare("SELECT player_id, team_id, name, team_name, position, rank FROM district_poll_candidates WHERE poll_id = ? ORDER BY rank").bind(pollId)
    .all<Candidate>()).results;
  const ballots = (await db.prepare("SELECT voter_id, voter_team_id, conv_id, picks FROM district_poll_ballots WHERE poll_id = ?").bind(pollId)
    .all<{ voter_id: string; voter_team_id: string; conv_id: string | null; picks: string | null }>()).results;
  const ai = await aiOrNull(env);
  const votes = new Map<string, number>();
  const list = candidates.map((c) => `${c.player_id} | ${c.name} | ${c.team_name} | ${c.position}`).join("\n");
  let asked = 0;
  for (const b of ballots) {
    let picks: string[] = [];
    try {
      picks = b.picks ? JSON.parse(b.picks) as string[] : [];
    } catch (e) {
      logger.warn({ module: M }, "nečitelná nominace", e);
    }
    if (!picks.length && !b.conv_id) {
      // AI klub: model, při výpadku tři nejlepší kandidáti z cizích klubů.
      if (ai && asked < 40) {
        asked++;
        const parsed = await askJson(ai, `Jsi trenér klubu v okrese ${poll?.district}. Nominuj do výběru okresu až tři hráče z jiných klubů.\n${list}\n`
          + `Odpověz jen JSON {"ids": ["..."]}.`, 120);
        picks = Array.isArray(parsed?.ids) ? (parsed!.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
      }
      picks = picks.filter((id) => candidates.some((c) => c.player_id === id && c.team_id !== b.voter_team_id)).slice(0, SELECTION_PICKS);
      if (!picks.length) picks = candidates.filter((c) => c.team_id !== b.voter_team_id).slice(0, SELECTION_PICKS).map((c) => c.player_id);
    }
    for (const id of picks) votes.set(id, (votes.get(id) ?? 0) + 1);
  }
  const squad = pickSquad(candidates, votes);
  await db.prepare("UPDATE district_polls SET status = 'closed', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), result = ? WHERE id = ?")
    .bind(JSON.stringify({ squad, votes: Object.fromEntries(votes) }), pollId).run();

  // Nominovaní: lepší nálada. Kluby dostanou SMS od OFS, koho povolali.
  const inSquad = candidates.filter((c) => squad.includes(c.player_id));
  if (inSquad.length) {
    await db.batch(inSquad.map((c) => db.prepare(
      "UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.morale', MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + 5)) WHERE id = ?",
    ).bind(c.player_id)));
  }
  const { sendSystemSMS, sendPlayerSMS } = await import("../messaging/system-sms");
  const byTeam = new Map<string, string[]>();
  for (const c of inSquad) byTeam.set(c.team_id, [...(byTeam.get(c.team_id) ?? []), c.name]);
  for (const [teamId, names] of byTeam) {
    const t = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(teamId).first<{ user_id: string | null }>();
    if (!t?.user_id || t.user_id === "ai") continue;
    await sendSystemSMS(db, teamId, poll?.editor_name ?? "OFS", `Do výběru okresu na zápas s okresem ${opponent} (${czDate(matchDate)}) povoláváme: ${names.join(", ")}. Děkujeme.`)
      .catch((e) => logger.warn({ module: M }, "SMS o nominaci do výběru", e));
  }
  // Opomenutý: nejlepší kandidát mimo sestavu s horkou hlavou z lidského klubu.
  const snubbed = candidates.filter((c) => !squad.includes(c.player_id) && c.rank <= 8);
  for (const c of snubbed.slice(0, 1)) {
    const p = await db.prepare(
      `SELECT p.first_name, p.last_name, p.nickname, p.avatar, t.user_id, json_extract(p.personality, '$.temper') AS temper
         FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = ?`,
    ).bind(c.player_id).first<{ first_name: string; last_name: string; nickname: string | null; avatar: string | null; user_id: string | null; temper: number | null }>();
    if (!p || (p.temper ?? 0) < 60 || !p.user_id || p.user_id === "ai") continue;
    await sendPlayerSMS(db, c.team_id, { id: c.player_id, firstName: p.first_name, lastName: p.last_name, nickname: p.nickname, avatar: p.avatar },
      SNUB_LINES[c.player_id.length % SNUB_LINES.length]).catch((e) => logger.warn({ module: M }, "SMS opomenutého hráče", e));
  }
  return squad;
}

interface SquadRow {
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
  overall_rating: number;
}

/** 4-4-2 z nominovaných, pět na lavičku. Zranění od nominace nejedou. */
async function selectionSide(db: D1Database, engineTeamId: number, name: string, squad: string[]): Promise<{ setup: TeamSetup; idMap: Map<number, string>; rows: Map<string, SquadRow> }> {
  const rows = (await db.prepare(
    `SELECT id, team_id, first_name, last_name, nickname, position, skills, personality, life_context, physical, age, overall_rating FROM players
      WHERE id IN (${squad.map(() => "?").join(",")})`,
  ).bind(...squad).all<SquadRow>()).results;
  const hurt = new Set((await db.prepare(`SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (${squad.map(() => "?").join(",")})`)
    .bind(...squad).all<{ player_id: string }>()).results.map((r) => r.player_id));
  const fit = rows.filter((r) => !hurt.has(r.id)).sort((a, b) => b.overall_rating - a.overall_rating);
  const need: Array<[string, number]> = [["GK", 1], ["DEF", 4], ["MID", 4], ["FWD", 2]];
  const lineup: Array<{ row: SquadRow; slot: string }> = [];
  for (const [pos, n] of need) {
    for (const r of fit.filter((x) => x.position === pos && !lineup.some((l) => l.row.id === x.id)).slice(0, n)) lineup.push({ row: r, slot: pos });
    while (lineup.filter((l) => l.slot === pos).length < n) {
      const fill = fit.find((x) => x.position !== "GK" && !lineup.some((l) => l.row.id === x.id));
      if (!fill) break;
      lineup.push({ row: fill, slot: pos });
    }
  }
  const subs = fit.filter((r) => !lineup.some((l) => l.row.id === r.id)).slice(0, 5);
  const idMap = new Map<number, string>();
  const toEngine = (r: SquadRow, slot?: string): MatchPlayer => {
    const p = mapRowToMatchPlayer(r, slot);
    idMap.set(p.id, r.id);
    return p;
  };
  return {
    setup: { teamId: engineTeamId, teamName: name, lineup: lineup.map((l) => toEngine(l.row, l.slot)), subs: subs.map((r) => toEngine(r)), tactic: "balanced", formation: "4-4-2" },
    idMap,
    rows: new Map(rows.map((r) => [r.id, r])),
  };
}

interface SelectionMatchRow {
  id: string;
  home_district: string;
  away_district: string;
  venue: string;
  match_date: string;
  kickoff_at: string;
  season_number: number;
  status: string;
  home_poll_id: string;
  away_poll_id: string;
}

async function squadOf(db: D1Database, pollId: string): Promise<string[]> {
  const row = await db.prepare("SELECT result FROM district_polls WHERE id = ?").bind(pollId).first<{ result: string | null }>();
  try {
    return row?.result ? (JSON.parse(row.result) as { squad: string[] }).squad ?? [] : [];
  } catch (e) {
    logger.warn({ module: M }, `nečitelná sestava výběru ${pollId}`, e);
    return [];
  }
}

/** Odehraje zápas výběrů. Opakovaný běh nic nezdvojí (stav 'playing' a 'played'). */
export async function playSelectionMatch(env: PollEnv, m: SelectionMatchRow): Promise<boolean> {
  const db = env.DB;
  const claimed = await db.prepare("UPDATE district_selection_matches SET status = 'playing', claimed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND status = 'ready'")
    .bind(m.id).run();
  if (!claimed.meta.changes) return false;
  try {
    const homeName = `Výběr okresu ${m.home_district}`;
    const awayName = `Výběr okresu ${m.away_district}`;
    const home = await selectionSide(db, 1, homeName, await squadOf(db, m.home_poll_id));
    const away = await selectionSide(db, 2, awayName, await squadOf(db, m.away_poll_id));
    const result = simulateMatch(createRng(seedFromString(m.id)), {
      home: home.setup, away: away.setup, weather: "cloudy", isHomeAdvantage: false, stadiumName: m.venue, attendance: 600,
    });
    const nameOf = (side: "home" | "away", engineId: number) => {
      const map = side === "home" ? home : away;
      const id = map.idMap.get(engineId);
      const r = id ? map.rows.get(id) : undefined;
      return { id: id ?? null, name: r ? `${r.first_name} ${r.last_name}` : "", teamId: r?.team_id ?? null };
    };
    const goals = result.events.filter((e) => e.type === "goal").map((e) => {
      const side = e.teamId === 1 ? "home" as const : "away" as const;
      return { minute: e.minute, side, ...nameOf(side, e.playerId), ownGoal: e.detail === "own_goal" };
    });
    // Zranění z výběru platí v klubu (lehké, 3 až 10 dní) a klub dostane SMS.
    const injuries = result.events.filter((e) => e.type === "injury").map((e) => nameOf(e.teamId === 1 ? "home" : "away", e.playerId)).filter((p) => p.id && p.teamId);
    const { sendSystemSMS } = await import("../messaging/system-sms");
    for (const p of injuries) {
      const days = 3 + (p.id!.charCodeAt(0) % 8);
      await db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES (?, ?, ?, 'obecne', ?, 'lehke', ?, ?, NULL)",
      ).bind(`inj-${m.id}-${p.id}`, p.id, p.teamId, `Zranění ve výběru okresu (${m.venue})`, days, days).run()
        .catch((e) => logger.warn({ module: M }, "zranění z výběru", e));
      const t = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(p.teamId).first<{ user_id: string | null }>();
      if (t?.user_id && t.user_id !== "ai") {
        await sendSystemSMS(db, p.teamId!, "Fyzioterapeut", `${p.name} se zranil ve výběru okresu. Lékař odhaduje ${days} dní mimo hru.`)
          .catch((e) => logger.warn({ module: M }, "SMS o zranění ve výběru", e));
      }
    }
    const lineups = {
      home: home.setup.lineup.map((p) => nameOf("home", p.id)),
      away: away.setup.lineup.map((p) => nameOf("away", p.id)),
    };
    await db.prepare(
      "UPDATE district_selection_matches SET status = 'played', home_score = ?, away_score = ?, events = ?, lineups = ? WHERE id = ?",
    ).bind(result.homeScore, result.awayScore, JSON.stringify(goals), JSON.stringify(lineups), m.id).run();

    const scorers = (side: "home" | "away") => goals.filter((g) => g.side === side && !g.ownGoal).map((g) => `${g.name} (${g.minute}.)`).join(", ");
    // Název okresu se neskloňuje („Za Praha“ by bylo špatně), proto „výběru okresu Praha“.
    const goalLine = (side: "home" | "away", district: string) => {
      const n = goals.filter((g) => g.side === side && !g.ownGoal).length;
      return n ? ` ${n === 1 ? "Gól" : "Góly"} výběru okresu ${district}: ${scorers(side)}.` : "";
    };
    const headline = `Výběr okresu ${m.home_district} ${result.homeScore}:${result.awayScore} ${m.away_district}`;
    const body = [
      `Na hřišti ${m.venue} se ${czDate(m.match_date)} potkaly výběry okresů ${m.home_district} a ${m.away_district}. Hráče nominovali trenéři klubů, každý mohl jmenovat tři z cizích klubů.`,
      `Skončilo to ${result.homeScore}:${result.awayScore}.${goalLine("home", m.home_district)}${goalLine("away", m.away_district)}`,
      `Sestava výběru okresu ${m.home_district}: ${lineups.home.map((p) => p.name).join(", ")}.`,
      `Sestava výběru okresu ${m.away_district}: ${lineups.away.map((p) => p.name).join(", ")}.`,
      injuries.length ? `Zranění: ${injuries.map((p) => p.name).join(", ")}.` : "",
    ].filter(Boolean).join("\n\n");
    const newsId = await publishSelectionArticle(db, m, headline, body).catch((e) => { logger.warn({ module: M }, "článek o výběru", e); return null; });
    if (newsId) await db.prepare("UPDATE district_selection_matches SET news_id = ? WHERE id = ?").bind(newsId, m.id).run();
    return true;
  } catch (e) {
    logger.error({ module: M }, `zápas výběrů ${m.id}`, e);
    await db.prepare("UPDATE district_selection_matches SET status = 'ready' WHERE id = ? AND status = 'playing'").bind(m.id).run()
      .catch((err) => logger.warn({ module: M }, `uvolnění zápasu výběrů ${m.id}`, err));
    return false;
  }
}

async function publishSelectionArticle(db: D1Database, m: SelectionMatchRow, headline: string, body: string): Promise<string | null> {
  const leagues = [...await districtLeagues(db, m.home_district), ...await districtLeagues(db, m.away_district)];
  if (!leagues.length) return null;
  const existing = await db.prepare("SELECT id, league_id FROM news WHERE type = 'district_selection' AND headline = ?").bind(headline).all<{ id: string; league_id: string }>();
  const newsByLeague = new Map(existing.results.map((r) => [r.league_id, r.id]));
  const inserts: D1PreparedStatement[] = [];
  for (const l of leagues) {
    if (newsByLeague.has(l)) continue;
    const id = crypto.randomUUID();
    newsByLeague.set(l, id);
    inserts.push(db.prepare(
      `INSERT INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, NULL, 'district_selection', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(id, l, headline, body, m.season_number));
  }
  if (inserts.length) await db.batch(inserts);
  const recipients = await db.prepare(
    `SELECT id, league_id FROM teams WHERE league_id IN (${leagues.map(() => "?").join(",")}) AND parent_team_id IS NULL AND user_id IS NOT NULL AND user_id != 'ai'`,
  ).bind(...leagues).all<{ id: string; league_id: string }>();
  const newsIds = [...newsByLeague.values()];
  const already = await db.prepare(
    `SELECT DISTINCT c.team_id FROM conversations c JOIN messages msg ON msg.conversation_id = c.id
      WHERE c.type = 'system' AND c.title = ? AND json_extract(msg.metadata, '$.newsId') IN (${newsIds.map(() => "?").join(",")})`,
  ).bind(NEWS_DESK, ...newsIds).all<{ team_id: string }>();
  const notified = new Set(already.results.map((r) => r.team_id));
  const { sendSystemSMS } = await import("../messaging/system-sms");
  for (const t of recipients.results) {
    const newsId = newsByLeague.get(t.league_id);
    if (!newsId || notified.has(t.id)) continue;
    await sendSystemSMS(db, t.id, NEWS_DESK, `📰 Výběr okresu: „${headline}“`, { type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId })
      .catch((e) => logger.warn({ module: M, teamId: t.id }, "SMS o výběru okresu", e));
  }
  return newsByLeague.get(leagues[0]) ?? null;
}

/** Hodinový běh: uzávěrka nominací (2 dny před zápasem od 19:00) a zápas v den výkopu. */
export async function tickDistrictSelections(env: PollEnv, now: Date = new Date()): Promise<{ closed: number; played: number }> {
  const db = env.DB;
  const { date, hour } = pragueNow(now);
  const open = await db.prepare("SELECT * FROM district_selection_matches WHERE status IN ('nominating', 'ready')").all<SelectionMatchRow>();
  let closed = 0;
  let played = 0;
  for (const m of open.results) {
    if (m.status === "nominating") {
      const closesOn = addDays(m.match_date, -2);
      if (date > closesOn || (date === closesOn && hour >= 19)) {
        if (await closeSelectionPoll(env, m.home_poll_id, m.away_district, m.match_date)) closed++;
        if (await closeSelectionPoll(env, m.away_poll_id, m.home_district, m.match_date)) closed++;
        const polls = await db.prepare("SELECT COUNT(*) AS n FROM district_polls WHERE id IN (?, ?) AND status = 'closed'").bind(m.home_poll_id, m.away_poll_id).first<{ n: number }>();
        if (polls?.n === 2) await db.prepare("UPDATE district_selection_matches SET status = 'ready' WHERE id = ? AND status = 'nominating'").bind(m.id).run();
      }
      continue;
    }
    if (m.kickoff_at <= now.toISOString() && await playSelectionMatch(env, m)) played++;
  }
  return { closed, played };
}
