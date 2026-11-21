/**
 * Sežeň mu práci (F8): DB vrstva (vzorce v player-jobs.ts, texty v job-texts.ts).
 *
 * Tři cesty ke stejnému rozhodnutí (`requestPlayerJob`):
 *  - trenér napíše majiteli firmy „máte u vás místo pro Nováka?" (`handleOwnerJobText`,
 *    volá ho `handleOwnerText` v requests-db.ts),
 *  - hráč, který přišel o práci, se ptá sám (casual_job_tip) a trenér slíbí, že se poptá
 *    (messaging/job-tip.ts),
 *  - dohoda s nespokojeným hráčem, kterého soupeř lákal prací (transfers/unrest.ts `find_job`).
 *
 * Zápis žádosti, povolání, uzavření situace „přišel o práci" a nálada jdou v jedné dávce
 * hlídané existencí nového řádku `sponsor_jobs`. Unikátní index (klub, firma, hráč, den) je
 * zámek: opakovaná zpráva, dvojklik nebo druhý běh fronty nic nezapíšou ani nepošlou.
 * Za týden si majitel řekne o protislužbu (SMS `job_favor`, vzor slibu pořadatelské služby).
 */
import { applyCoachRelationDelta } from "../lib/coach-relation";
import { logger } from "../lib/logger";
import { postOwnerMessages, sendPlayerSMS, type OwnerIdentity } from "../messaging/system-sms";
import { ensureSponsorOwner, getFavor, type SponsorOwner } from "./favor";
import { findRosterPlayer, jobHint, parseJobAsk, type RosterPlayer } from "./job-parse";
import {
  jobAskWhoText, jobDuplicateText, jobHiredText, jobInstruction, jobPlayerThanksText, jobRefusedText,
} from "./job-texts";
import {
  activeSeason, loadNegotiationSponsor, loadNegotiationTeam, type NegotiationSponsor, type NegotiationTeam,
} from "./negotiation-db";
import { extractJobAsk, writeOwnerReply, type OwnerChatEnv, type OwnerChatFacts } from "./owner-chat";
import { enqueueOwnerSms, loadRelationshipOwners } from "./owner-sms";
import { addDays, dayDiff, pickRelationshipOwner } from "./owner-sms-rules";
import {
  decideJob, JOB_ASK_META, JOB_FAVOR_AFTER_DAYS, jobPlayerEffect, SPONSOR_HELP_CONDITION_DROP, type JobDecision, type JobRefusal, type JobSource, type SponsorJob,
} from "./player-jobs";
import { seedFromString } from "../lib/seed";
import { normalize } from "./request-parse";
import type { RequestRelation } from "./requests";

const M = "sponsor-jobs";

interface JobPlayerRow {
  id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null;
  age: number | null; life_context: string | null;
}

interface JobContext {
  team: NegotiationTeam;
  isAi: boolean;
  sponsor: NegotiationSponsor;
  owner: SponsorOwner;
  favor: number;
  relation: RequestRelation;
  /** Herní den klubu YYYY-MM-DD. */
  day: string;
  season: number;
  player: JobPlayerRow;
  lc: Record<string, unknown>;
  occupation: string;
  /** Bez práce: běží mu „přišel o práci", nebo je nezaměstnaný. */
  unemployed: boolean;
  hiredThisSeason: number;
  lastRefusedDay: string | null;
}

type Fail = { kind: "error"; error: string; status: 400 | 404 };

const RELATION_ORDER: Record<string, number> = { main: 0, stadium: 1, banner: 2 };

function parseObject(raw: string | null, what: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${what})`, e);
    return {};
  }
}

async function loadJobContext(db: D1Database, teamId: string, sponsorId: number, playerId: string): Promise<JobContext | Fail> {
  const [team, sponsor, owner, season, owned] = await Promise.all([
    loadNegotiationTeam(db, teamId), loadNegotiationSponsor(db, sponsorId), ensureSponsorOwner(db, sponsorId), activeSeason(db),
    db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(teamId).first<{ user_id: string | null }>(),
  ]);
  if (!team || !sponsor || !owner) return { kind: "error", error: "Firma nenalezena", status: 404 };
  if (team.district !== sponsor.district) return { kind: "error", error: "Firma není z tvého okresu", status: 400 };
  const day = (team.game_date ?? new Date().toISOString()).slice(0, 10);

  const [player, favor, contracts, lostJob, hired, refused] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.age, p.life_context
       FROM players p JOIN teams t ON t.id = p.team_id
       WHERE p.id = ? AND COALESCE(t.parent_team_id, t.id) = ? AND (p.status IS NULL OR p.status = 'active')`,
    ).bind(playerId, teamId).first<JobPlayerRow>(),
    getFavor(db, sponsorId, teamId),
    db.prepare("SELECT category FROM sponsor_contracts WHERE team_id = ? AND sponsor_id = ? AND status = 'active'")
      .bind(teamId, sponsorId).all<{ category: string | null }>(),
    db.prepare("SELECT 1 AS x FROM club_incidents WHERE subject_player_id = ? AND kind = 'prisel_o_praci' AND status = 'probiha' LIMIT 1")
      .bind(playerId).first<{ x: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM sponsor_jobs WHERE sponsor_id = ? AND status = 'hired' AND season IS ?")
      .bind(sponsorId, season).first<{ n: number }>(),
    // Rollover vrací herní čas zpátky: odmítnutí „v budoucnu" je ze staré osy a nepočítá se.
    db.prepare(
      `SELECT MAX(request_day) AS day FROM sponsor_jobs
       WHERE team_id = ? AND sponsor_id = ? AND player_id = ? AND status = 'refused' AND request_day <= ?`,
    ).bind(teamId, sponsorId, playerId, day).first<{ day: string | null }>(),
  ]);
  if (!player) return { kind: "error", error: "Hráč nenalezen", status: 404 };

  const relation = (contracts.results
    .map((c) => c.category ?? "main")
    .filter((c) => c in RELATION_ORDER)
    .sort((a, b) => RELATION_ORDER[a] - RELATION_ORDER[b])[0] ?? "none") as RequestRelation;
  const lc = parseObject(player.life_context, `life_context hráče ${playerId}`);
  const occupation = typeof lc.occupation === "string" ? lc.occupation : "";
  return {
    team, isAi: owned?.user_id === "ai", sponsor, owner, favor, relation, day, season, player, lc, occupation,
    unemployed: !!lostJob || occupation === "Nezaměstnaný",
    hiredThisSeason: hired?.n ?? 0, lastRefusedDay: refused?.day ?? null,
  };
}

function decisionOf(ctx: JobContext): JobDecision {
  const current = ctx.lc.sponsorJob as Partial<SponsorJob> | undefined;
  return decideJob({
    favor: ctx.favor, relation: ctx.relation, personality: ctx.owner.personality, sponsorType: ctx.sponsor.type,
    playerAge: ctx.player.age ?? 25, playerOccupation: ctx.occupation, alreadyAtFirm: current?.sponsorId === ctx.sponsor.id,
    hiredThisSeason: ctx.hiredThisSeason, lastRefusedDaysAgo: ctx.lastRefusedDay ? dayDiff(ctx.lastRefusedDay, ctx.day) : null,
  });
}

export interface JobPlayerRef { id: string; firstName: string; lastName: string; nickname: string | null; avatar: string | null }

interface JobOutcomeBase {
  id: string;
  teamId: string;
  teamName: string;
  isAi: boolean;
  owner: OwnerIdentity;
  player: JobPlayerRef;
  /** „Jan Novák" (1. pád). */
  playerName: string;
}

export type JobOutcome =
  | (JobOutcomeBase & { kind: "hired"; occupation: string; unemployed: boolean; sponsorJob: SponsorJob })
  | (JobOutcomeBase & { kind: "refused"; refusal: JobRefusal })
  | { kind: "duplicate"; playerName: string }
  | Fail;

/** Jak by firma o hráči rozhodla, bez zápisu. null = firmu nebo hráče nejde posoudit. */
export async function previewJob(db: D1Database, teamId: string, sponsorId: number, playerId: string): Promise<JobDecision | null> {
  const ctx = await loadJobContext(db, teamId, sponsorId, playerId)
    .catch((e) => { logger.warn({ module: M, teamId }, `posouzení práce u firmy ${sponsorId}`, e); return null; });
  return ctx && !("error" in ctx) ? decisionOf(ctx) : null;
}

/**
 * Zapíše žádost o práci a její dopad. `playerEffects: false` (dohoda s nespokojeným) vynechá
 * náladu a vztah k trenérovi, ty řeší dohoda sama. Texty posílá volající.
 */
export async function requestPlayerJob(
  db: D1Database, r: { teamId: string; sponsorId: number; playerId: string; source: JobSource },
  opts: { playerEffects?: boolean } = {},
): Promise<JobOutcome> {
  const playerEffects = opts.playerEffects ?? true;
  const ctx = await loadJobContext(db, r.teamId, r.sponsorId, r.playerId);
  if ("error" in ctx) return ctx;
  const decision = decisionOf(ctx);
  const id = crypto.randomUUID();
  const playerName = `${ctx.player.first_name} ${ctx.player.last_name}`;
  const guard = "EXISTS (SELECT 1 FROM sponsor_jobs WHERE id = ?)";

  const stmts: D1PreparedStatement[] = [db.prepare(
    `INSERT INTO sponsor_jobs (id, team_id, sponsor_id, player_id, source, status, refusal, occupation, previous_occupation, request_day, season)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM sponsor_jobs WHERE team_id = ? AND sponsor_id = ? AND player_id = ? AND request_day = ?)`,
  ).bind(
    id, r.teamId, r.sponsorId, r.playerId, r.source, decision.kind, decision.kind === "refused" ? decision.refusal : null,
    decision.kind === "hired" ? decision.occupation : null, ctx.occupation || null, ctx.day, ctx.season,
    r.teamId, r.sponsorId, r.playerId, ctx.day,
  )];

  const effect = jobPlayerEffect(ctx.unemployed);
  const clubTeams = await db.prepare("SELECT id FROM teams WHERE id = ?1 OR parent_team_id = ?1").bind(r.teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId: r.teamId }, "týmy klubu pro práci u sponzora", e); return { results: [{ id: r.teamId }] }; });
  const sponsorJob: SponsorJob = {
    sponsorId: ctx.sponsor.id, firm: ctx.sponsor.name, since: ctx.day, previous: ctx.occupation,
    teamIds: clubTeams.results.map((t) => t.id),
  };
  if (decision.kind === "hired") {
    stmts.push(playerEffects
      ? db.prepare(
        `UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.occupation', ?, '$.sponsorJob', json(?),
           '$.morale', MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
         WHERE id = ? AND ${guard}`,
      ).bind(decision.occupation, JSON.stringify(sponsorJob), effect.morale, r.playerId, id)
      : db.prepare(
        `UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.occupation', ?, '$.sponsorJob', json(?))
         WHERE id = ? AND ${guard}`,
      ).bind(decision.occupation, JSON.stringify(sponsorJob), r.playerId, id));
    // Situace „přišel o práci" končí: práci má. Konec i v `ends_on`, jinak by omluvenky
    // (incidents/absence-hracu.ts čte okno) dál tvrdily, že práci nemá.
    stmts.push(db.prepare(
      `UPDATE club_incidents SET status = 'uzavreny', resolution = 'found_job', resolved_on = ?1, ends_on = ?2
       WHERE subject_player_id = ?3 AND kind = 'prisel_o_praci' AND status = 'probiha' AND EXISTS (SELECT 1 FROM sponsor_jobs WHERE id = ?4)`,
    ).bind(ctx.team.game_date ?? ctx.day, ctx.day, r.playerId, id));
  }

  let inserted = false;
  try {
    const results = await db.batch(stmts);
    inserted = (results[0]?.meta?.changes ?? 0) === 1;
  } catch (e) {
    // Souběžný běh, který prošel NOT EXISTS ve stejnou chvíli, zastaví unikátní index.
    if (!/UNIQUE constraint failed: sponsor_jobs/i.test(e instanceof Error ? e.message : String(e))) throw e;
  }
  if (!inserted) return { kind: "duplicate", playerName };

  const base: JobOutcomeBase = {
    id, teamId: r.teamId, teamName: ctx.team.name, isAi: ctx.isAi, playerName,
    owner: {
      sponsorId: ctx.owner.sponsorId, name: `${ctx.owner.firstName} ${ctx.owner.lastName}`, firmName: ctx.sponsor.name,
      avatar: JSON.stringify(ctx.owner.faceConfig),
    },
    player: {
      id: ctx.player.id, firstName: ctx.player.first_name, lastName: ctx.player.last_name,
      nickname: ctx.player.nickname, avatar: ctx.player.avatar,
    },
  };
  logger.info({ module: M, teamId: r.teamId }, `práce pro hráče ${r.playerId} u firmy ${r.sponsorId} (${r.source}): ${decision.kind === "hired" ? decision.occupation : decision.refusal}`);
  if (decision.kind === "refused") return { ...base, kind: "refused", refusal: decision.refusal };

  if (playerEffects) {
    await applyCoachRelationDelta(db, {
      playerId: r.playerId, delta: effect.relation, source: "job", description: "Přes sponzora ti sehnal práci",
      gameDate: ctx.day, referenceId: `sponsor-job-${id}`,
    }).catch((e) => logger.warn({ module: M, teamId: r.teamId }, `vztah po práci pro hráče ${r.playerId}`, e));
  }
  // Protislužba za týden (fronta SMS majitelů, jen lidský klub, reference = jedna SMS na žádost).
  await enqueueOwnerSms(db, {
    sponsorId: r.sponsorId, teamId: r.teamId, occasion: "job_favor", referenceId: `job-favor:${id}`,
    day: addDays(ctx.day, JOB_FAVOR_AFTER_DAYS), vars: { player: playerName },
  }).catch((e) => logger.warn({ module: M, teamId: r.teamId }, `protislužba za práci ${id}`, e));
  return { ...base, kind: "hired", occupation: decision.occupation, unemployed: ctx.unemployed, sponsorJob };
}

/**
 * Trenér kývl na protislužbu (SMS `job_favor`): zaměstnaný hráč a jeden další z áčka jdou firmě
 * pomoct dopoledne v den nejbližšího zápasu. Ten den ráno přijdou o kondici (`applySponsorHelpDay`),
 * v kabině se to trenér dozví. Vrací jména pomocníků, nebo prázdné pole (není zápas ani hráč).
 */
export async function scheduleSponsorHelp(db: D1Database, referenceId: string, seed: string): Promise<string[]> {
  const jobId = referenceId.startsWith("job-favor:") ? referenceId.slice("job-favor:".length) : null;
  if (!jobId) return [];
  const job = await db.prepare(
    `SELECT j.team_id, j.player_id, s.name AS firm FROM sponsor_jobs j LEFT JOIN district_sponsors s ON s.id = j.sponsor_id
      WHERE j.id = ? AND j.status = 'hired'`,
  ).bind(jobId).first<{ team_id: string; player_id: string; firm: string | null }>();
  if (!job) return [];
  const next = await db.prepare(
    `SELECT substr(sc.scheduled_at, 1, 10) AS day FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND m.status IN ('scheduled', 'lineups_open')
        AND sc.scheduled_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ORDER BY sc.scheduled_at LIMIT 1`,
  ).bind(job.team_id).first<{ day: string }>();
  if (!next?.day) return [];
  const squad = (await db.prepare(
    `SELECT p.id, p.first_name, p.last_name FROM players p
      WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') AND p.loan_from_team_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0)
      ORDER BY p.id`,
  ).bind(job.team_id).all<{ id: string; first_name: string; last_name: string }>()).results;
  const worker = squad.find((p) => p.id === job.player_id);
  const others = squad.filter((p) => p.id !== job.player_id);
  const second = others.length ? others[Math.abs(seedFromString(seed)) % others.length] : undefined;
  const helpers = [worker, second].filter((p): p is { id: string; first_name: string; last_name: string } => !!p);
  if (helpers.length === 0) return [];
  const help = JSON.stringify({ day: next.day, firm: job.firm ?? "firma sponzora" });
  const names = helpers.map((p) => `${p.first_name} ${p.last_name}`);
  const squadChat = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group' AND title = 'Kabina' LIMIT 1")
    .bind(job.team_id).first<{ id: string }>();
  const note = `📝 ${names.join(" a ")} ${helpers.length > 1 ? "jdou" : "jde"} pomáhat firmě ${job.firm ?? "sponzora"}. `
    + `V den zápasu (${czDay(next.day)}) ${helpers.length > 1 ? "budou" : "bude"} unavenější.`;
  await db.batch([
    ...helpers.map((p) => db.prepare(
      "UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.sponsorHelp', json(?)) WHERE id = ?",
    ).bind(help, p.id)),
    ...(squadChat ? [
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at, read)
         VALUES (?, ?, 'system', 'system', 'Kabina', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0)`,
      ).bind(crypto.randomUUID(), squadChat.id, note, JSON.stringify({ type: "sponsor_help", day: next.day })),
      db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(note.slice(0, 100), squadChat.id),
    ] : []),
  ]);
  return names;
}

/** „pondělí 23. 11.“ pro poznámku v kabině. */
function czDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const names = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  return `${names[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/**
 * Denní krok klubu: kdo dnes dopoledne pomáhá sponzorovi, přijde o kondici (po ranní regeneraci,
 * takže to platí na dnešní zápas). Vrací počet hráčů.
 */
export async function applySponsorHelpDay(db: D1Database, clubTeamId: string, day: string): Promise<number> {
  const res = await db.prepare(
    `UPDATE players SET life_context = json_remove(json_set(life_context, '$.condition',
       MAX(15, COALESCE(json_extract(life_context, '$.condition'), 100) - ?1)), '$.sponsorHelp')
     WHERE team_id IN (SELECT id FROM teams WHERE id = ?2 OR parent_team_id = ?2)
       AND json_valid(life_context) AND json_extract(life_context, '$.sponsorHelp.day') = ?3`,
  ).bind(SPONSOR_HELP_CONDITION_DROP, clubTeamId, day).run();
  return res.meta?.changes ?? 0;
}

/** Hráč poděkuje trenérovi za práci. AI klubu se nepíše. */
export async function thankHiredPlayer(db: D1Database, out: Extract<JobOutcome, { kind: "hired" }>): Promise<void> {
  if (out.isAi) return;
  const body = jobPlayerThanksText(out.unemployed, { player: out.playerName, firm: out.owner.firmName ?? "" }, `job-thanks|${out.id}`);
  await sendPlayerSMS(db, out.teamId, out.player, body)
    .catch((e) => logger.warn({ module: M, teamId: out.teamId }, `poděkování za práci ${out.id}`, e));
}

/**
 * Vlákno s majitelem, když se trenér neptal SMS (hráč se ptal sám, dohoda s nespokojeným):
 * trenérova otázka a odpověď majitele, jako by si zavolali. AI klubu se nepíše.
 */
export async function postJobExchange(db: D1Database, out: Extract<JobOutcome, { kind: "hired" | "refused" }>): Promise<void> {
  if (out.isAi) return;
  const vars = { player: out.playerName, job: out.kind === "hired" ? out.occupation : undefined };
  const reply = out.kind === "hired" ? jobHiredText(vars, `job|${out.id}`) : jobRefusedText(out.refusal, vars, `job|${out.id}`);
  await postOwnerMessages(db, out.teamId, out.owner, [
    { from: "coach", body: `Dobrý den, nevzal byste u vás do práce ${out.playerName}? Potřebuje se chytit, je to spolehlivý kluk.` },
    { from: "owner", body: reply },
  ], { coachName: out.teamName, unread: true });
}

/** Firmy, se kterými má klub vztah, od nejbližší (hlavní sponzor, smlouva, oblíbenost). */
async function rankedJobSponsors(db: D1Database, teamId: string): Promise<number[]> {
  const owners = await loadRelationshipOwners(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "firmy se vztahem ke klubu", e); return []; });
  const out: number[] = [];
  let rest = [...owners];
  while (rest.length > 0) {
    const next = pickRelationshipOwner(rest);
    if (!next) break;
    out.push(next.sponsorId);
    rest = rest.filter((o) => o.sponsorId !== next.sponsorId);
  }
  return out;
}

/** První firma, která by hráče vzala, nebo null. */
export async function bestHiringSponsor(db: D1Database, teamId: string, playerId: string): Promise<number | null> {
  for (const sponsorId of await rankedJobSponsors(db, teamId)) {
    if ((await previewJob(db, teamId, sponsorId, playerId))?.kind === "hired") return sponsorId;
  }
  return null;
}

/**
 * Hráč se ptal sám (casual_job_tip) a trenér slíbil, že se poptá: firma jmenovaná ve zprávě,
 * jinak ta, která by ho vzala, jinak nejbližší firma (odmítne). Bez vztahu k firmě nic.
 */
export async function pickTipSponsor(db: D1Database, teamId: string, playerId: string, namedSponsorId: number | null): Promise<number | null> {
  if (namedSponsorId !== null) return namedSponsorId;
  return (await bestHiringSponsor(db, teamId, playerId)) ?? (await rankedJobSponsors(db, teamId))[0] ?? null;
}

/** Hráči klubu (áčko i U21) pro poznání jména ve zprávě. */
export async function loadClubRoster(db: D1Database, teamId: string): Promise<RosterPlayer[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname,
            EXISTS (SELECT 1 FROM club_incidents i WHERE i.subject_player_id = p.id AND i.kind = 'prisel_o_praci' AND i.status = 'probiha') AS lost_job
     FROM players p JOIN teams t ON t.id = p.team_id
     WHERE COALESCE(t.parent_team_id, t.id) = ? AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; nickname: string | null; lost_job: number }>();
  return rows.results.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, lostJob: r.lost_job === 1 }));
}

/** Kmen příjmení pro kontrolu, že model v odpovědi hráče jmenoval („Černý" → „cern"). */
function surnameStem(lastName: string): string {
  return normalize(lastName).replace(/[^a-z]/g, "").slice(0, 4);
}

/**
 * SMS trenéra majiteli: shání práci pro hráče? Model (bez něj pravidla z job-parse.ts) pozná
 * záměr a hráče, hra rozhodne, model napíše odpověď. Vrací false, když o práci nejde (pak ji
 * vyřídí prosba o peníze nebo odpověď na SMS majitele).
 */
export async function handleOwnerJobText(
  db: D1Database, env: OwnerChatEnv,
  i: {
    teamId: string; sponsorId: number; convId: string; text: string; facts: OwnerChatFacts; pendingJob: boolean;
    say: (body: string, meta?: Record<string, unknown>) => Promise<void>;
  },
): Promise<boolean> {
  if (!i.pendingJob && !jobHint(i.text)) return false;
  const roster = await loadClubRoster(db, i.teamId);
  const ai = await extractJobAsk(env, i.facts, roster.map((p) => `${p.firstName} ${p.lastName}${p.nickname ? ` (${p.nickname})` : ""}`))
    .catch((e) => { logger.warn({ module: M, teamId: i.teamId }, `vyčtení práce pro hráče u majitele ${i.sponsorId}`, e); return null; });
  const fromAi = ai?.playerName ? findRosterPlayer(ai.playerName, roster) : null;
  const found = fromAi?.player ? fromAi : findRosterPlayer(i.text, roster);
  const wants = (ai ? ai.wantsJob : parseJobAsk(i.text).intent) || (i.pendingJob && !!found.player);
  if (!wants) return false;

  const allowed = [i.facts.given];
  let player = found.player;
  // „Máte místo pro jednoho kluka, co přišel o práci?" bez jména: když je takový jeden, je to on.
  const lost = roster.filter((p) => p.lostJob);
  if (!player && !found.ambiguous && lost.length === 1) player = lost[0];
  if (!player) {
    const body = await writeOwnerReply(env, i.facts,
      found.ambiguous ? "Trenér shání práci pro hráče, ale hráčů s tím jménem má víc. Zeptej se, kterého myslí. Nic neslibuj."
        : "Trenér shání práci pro hráče, ale nevíš pro koho. Zeptej se na jméno. Nic neslibuj.", { allowed })
      ?? jobAskWhoText(found.ambiguous, `job-ask|${i.convId}|${i.text}`);
    await i.say(body, { type: JOB_ASK_META });
    return true;
  }

  const out = await requestPlayerJob(db, { teamId: i.teamId, sponsorId: i.sponsorId, playerId: player.id, source: "coach_sms" });
  const playerName = `${player.firstName} ${player.lastName}`;
  if (out.kind === "error") {
    logger.warn({ module: M, teamId: i.teamId }, `práce pro hráče ${player.id} u firmy ${i.sponsorId}: ${out.error}`);
    await i.say(jobAskWhoText(false, `job-ask|${i.convId}|${i.text}`), { type: JOB_ASK_META });
    return true;
  }
  if (out.kind === "duplicate") {
    await i.say(await writeOwnerReply(env, i.facts, jobInstruction({ kind: "duplicate" }, playerName), { allowed })
      ?? jobDuplicateText(`job-dup|${i.convId}|${i.text}`));
    return true;
  }
  const instruction = out.kind === "hired"
    ? jobInstruction({ kind: "hired", job: out.occupation }, playerName)
    : jobInstruction({ kind: "refused", refusal: out.refusal }, playerName);
  const fallback = out.kind === "hired"
    ? jobHiredText({ player: playerName, job: out.occupation }, `job|${out.id}`)
    : jobRefusedText(out.refusal, { player: playerName }, `job|${out.id}`);
  const body = await writeOwnerReply(env, i.facts, instruction, {
    allowed, words: out.kind === "hired" ? [surnameStem(player.lastName)] : [],
  }) ?? fallback;
  await i.say(body);
  if (out.kind === "hired") await thankHiredPlayer(db, out);
  return true;
}
