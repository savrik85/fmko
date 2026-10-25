/**
 * Sliby hráčům (2026-10-19): co trenér hráči slíbil, aby to manažer viděl a hráč se mohl ozvat.
 *
 * Herní logika slibu běží dál v `life_context.transferUnrest.pledge` (offer-rejection-impact.ts):
 * tam se hlídá, jestli je splněný. Tabulka `player_promises` je jeho viditelná historie
 * (běží / dodržel / porušil / vypršel) a pamatuje si, kdy už hráč připomínal.
 */

import { logger } from "../lib/logger";
import { sendPlayerSMS } from "../messaging/system-sms";

const M = "promises";

export type PromiseType = "minutes" | "transfer" | "release";
export type PromiseStatus = "active" | "kept" | "broken" | "expired";

export interface PlayerPromise {
  id: string;
  playerId: string;
  type: PromiseType;
  status: PromiseStatus;
  madeAt: string;
  deadline: string | null;
  resolvedAt: string | null;
  club: string | null;
}

interface PromiseRow {
  id: string; player_id: string; type: PromiseType; status: PromiseStatus; made_at: string;
  deadline: string | null; resolved_at: string | null; details: string | null;
}

function parseDetails(raw: string | null): { offerId?: string | null; club?: string | null } {
  if (!raw) return {};
  try { return JSON.parse(raw) as { offerId?: string; club?: string }; } catch (e) {
    logger.warn({ module: M }, "nečitelné detaily slibu", e);
    return {};
  }
}

function toPromise(r: PromiseRow): PlayerPromise {
  const d = parseDetails(r.details);
  return {
    id: r.id, playerId: r.player_id, type: r.type, status: r.status, madeAt: r.made_at,
    deadline: r.deadline, resolvedAt: r.resolved_at, club: d.club ?? null,
  };
}

/** Zápis nového slibu (pro batch s ostatními změnami dohody). */
export function promiseInsert(
  db: D1Database,
  p: { clubTeamId: string; playerId: string; type: PromiseType; madeAt: string; deadline: string; offerId?: string | null; club?: string | null },
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO player_promises (id, team_id, player_id, type, status, made_at, deadline, details)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).bind(crypto.randomUUID(), p.clubTeamId, p.playerId, p.type, p.madeAt, p.deadline,
    JSON.stringify({ offerId: p.offerId ?? null, club: p.club ?? null }));
}

/** Vyhodnocení běžících slibů hráče daných druhů. */
export async function resolvePromises(db: D1Database, playerId: string, types: PromiseType[], status: Exclude<PromiseStatus, "active">): Promise<void> {
  await db.prepare(
    `UPDATE player_promises SET status = ?, resolved_at = ?
      WHERE player_id = ? AND status = 'active' AND type IN (${types.map(() => "?").join(",")})`,
  ).bind(status, new Date().toISOString(), playerId, ...types).run()
    .catch((e) => logger.warn({ module: M }, `vyhodnocení slibu ${playerId}`, e));
}

/**
 * Denně: hráč, který z klubu odešel, má slib prodeje (i „pustit ho“) splněný, slib místa
 * v sestavě vypršel. Odchod má víc cest (přestup mezi kluby, prodej do klubu mimo hru,
 * propuštění), proto se to pozná podle toho, kde hráč je, ne v každé z nich.
 */
export async function settleDepartedPromises(db: D1Database): Promise<number> {
  const now = new Date().toISOString();
  const gone = `NOT EXISTS (SELECT 1 FROM players p LEFT JOIN teams t ON t.id = p.team_id
    WHERE p.id = player_promises.player_id AND COALESCE(t.parent_team_id, t.id) = player_promises.team_id)`;
  const kept = await db.prepare(
    `UPDATE player_promises SET status = 'kept', resolved_at = ? WHERE status = 'active' AND type IN ('transfer', 'release') AND ${gone}`,
  ).bind(now).run().catch((e) => { logger.warn({ module: M }, "sliby odešlých hráčů", e); return null; });
  const expired = await db.prepare(
    `UPDATE player_promises SET status = 'expired', resolved_at = ? WHERE status = 'active' AND type = 'minutes' AND ${gone}`,
  ).bind(now).run().catch((e) => { logger.warn({ module: M }, "slib sestavy odešlých hráčů", e); return null; });
  return (kept?.meta?.changes ?? 0) + (expired?.meta?.changes ?? 0);
}

/**
 * Po trvalém přestupu (2026-10-24): truc a slib patří klubu, ze kterého hráč odešel, a s hráčem
 * nikam nejdou. Dřív je nový klub zdědil: porušený slib prodeje ho stál morálku hráče, truc 90
 * a SMS „slíbil jste, že mě pustíte“, slib sestavy se vyhodnocoval nad zápasy nového týmu
 * a `resolvePromises` při tom zavíral i sliby nového klubu.
 *
 * - Sliby ostatních klubů se uzavřou hned, stejně jako u odešlého hráče (settleDepartedPromises):
 *   prodej a „pustit ho“ dodržel, místo v sestavě vypršelo.
 * - Truc z `life_context` zmizí. Slib zůstane, jen když ho dal sám nový klub (hráč u něj hostoval
 *   a klub ho odkoupil), a to už bez trucu kmenového klubu.
 * - Předstírané zranění bylo nástrojem trucu, tak s ním končí.
 *
 * Volat jen po trvalém přestupu, ne po odchodu na hostování ani po návratu z něj: tam hráč
 * pořád patří klubu, kterému truc i slib patří.
 */
export async function clearUnrestAfterTransfer(db: D1Database, playerId: string, newTeamId: string): Promise<void> {
  const club = await db.prepare("SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?")
    .bind(newTeamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "klub po přestupu", e); return null; });
  const newClubTeamId = club?.id ?? newTeamId;

  const ownTypes = await db.prepare(
    "SELECT DISTINCT type FROM player_promises WHERE player_id = ? AND team_id = ? AND status = 'active'",
  ).bind(playerId, newClubTeamId).all<{ type: PromiseType }>()
    .then((r) => new Set(r.results.map((row) => row.type)))
    .catch((e) => { logger.warn({ module: M }, "sliby nového klubu po přestupu", e); return new Set<PromiseType>(); });
  const pledgeRow = await db.prepare("SELECT json_extract(life_context, '$.transferUnrest.pledge') AS pledge FROM players WHERE id = ?")
    .bind(playerId).first<{ pledge: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "slib hráče po přestupu", e); return null; });
  const pledge = (() => {
    if (!pledgeRow?.pledge) return null;
    try { return JSON.parse(pledgeRow.pledge) as { type?: PromiseType }; } catch (e) {
      logger.warn({ module: M }, "nečitelný slib hráče po přestupu", e);
      return null;
    }
  })();

  const keepPledge = pledge?.type != null && ownTypes.has(pledge.type);
  await (keepPledge
    ? db.prepare("UPDATE players SET life_context = json_set(life_context, '$.transferUnrest', json(?)) WHERE id = ?")
      .bind(JSON.stringify({ level: 0, pledge }), playerId)
    : db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.transferUnrest') WHERE id = ?")
      .bind(playerId)
  ).run().catch((e) => logger.warn({ module: M }, `truc po přestupu ${playerId}`, e));

  await db.prepare(
    `UPDATE player_promises SET status = CASE WHEN type = 'minutes' THEN 'expired' ELSE 'kept' END, resolved_at = ?
      WHERE player_id = ? AND status = 'active' AND team_id != ?`,
  ).bind(new Date().toISOString(), playerId, newClubTeamId).run()
    .catch((e) => logger.warn({ module: M }, `sliby starého klubu po přestupu ${playerId}`, e));

  await db.prepare("DELETE FROM injuries WHERE player_id = ? AND is_fake = 1").bind(playerId).run()
    .catch((e) => logger.warn({ module: M }, `předstírané zranění po přestupu ${playerId}`, e));
}

/** Sliby hráče v klubu, běžící první, pak nejnovější. */
export async function listPromises(db: D1Database, playerId: string, clubTeamId: string): Promise<PlayerPromise[]> {
  const rows = await db.prepare(
    `SELECT id, player_id, type, status, made_at, deadline, resolved_at, details FROM player_promises
      WHERE player_id = ? AND team_id = ? ORDER BY status = 'active' DESC, made_at DESC LIMIT 20`,
  ).bind(playerId, clubTeamId).all<PromiseRow>()
    .catch((e) => { logger.warn({ module: M }, "sliby hráče", e); return { results: [] as PromiseRow[] }; });
  return rows.results.map(toPromise);
}

/** Běžící sliby hráčů klubu (pro značku v kádru): hráč → text slibu. */
export async function activePromisesForClub(db: D1Database, clubTeamId: string): Promise<Map<string, string>> {
  const rows = await db.prepare(
    `SELECT id, player_id, type, status, made_at, deadline, resolved_at, details FROM player_promises
      WHERE team_id = ? AND status = 'active' ORDER BY made_at DESC`,
  ).bind(clubTeamId).all<PromiseRow>()
    .catch((e) => { logger.warn({ module: M }, "běžící sliby klubu", e); return { results: [] as PromiseRow[] }; });
  const out = new Map<string, string>();
  for (const r of rows.results) if (!out.has(r.player_id)) out.set(r.player_id, promiseText(toPromise(r)));
  return out;
}

/** Běžící slib prodeje hráče (slib prodeje nebo „pustit ho“), nebo null. */
export async function activeTransferPromise(db: D1Database, playerId: string): Promise<PlayerPromise | null> {
  const r = await db.prepare(
    `SELECT id, player_id, type, status, made_at, deadline, resolved_at, details FROM player_promises
      WHERE player_id = ? AND status = 'active' AND type IN ('transfer', 'release') ORDER BY made_at DESC LIMIT 1`,
  ).bind(playerId).first<PromiseRow>()
    .catch((e) => { logger.warn({ module: M }, "slib prodeje hráče", e); return null; });
  return r ? toPromise(r) : null;
}

const dateCz = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) : "");

/** Co trenér slíbil, česky (bez herních čísel, jen podmínky slibu). */
export function promiseText(p: Pick<PlayerPromise, "type" | "deadline" | "club">): string {
  if (p.type === "minutes") return "Místo v základu ve 2 ze 3 příštích zápasů";
  if (p.type === "transfer") return `Pustit ho při další dobré nabídce${p.deadline ? ` (do ${dateCz(p.deadline)})` : ""}`;
  return `Přijmout nabídku${p.club ? ` od ${p.club}` : ""}${p.deadline ? ` (do ${dateCz(p.deadline)})` : ""}`;
}

export const PROMISE_STATUS_LABELS: Record<PromiseStatus, string> = {
  active: "Platí",
  kept: "Dodržel jsi",
  broken: "Porušil jsi",
  expired: "Vypršel",
};

// ─── Připomínky hráčů ───────────────────────────────────────────────────────

const MINUTES_REMINDERS = [
  "Trenére, zítra hrajeme. Pamatujete, co jste mi slíbil? Počítám, že nastoupím od začátku.",
  "Zítra je zápas. Doufám, že platí, co jsme si řekli, a jdu do základu.",
  "Trenére, jen připomínám: slíbil jste mi základ. Zítra je zápas.",
];

function pick(pool: string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

interface ReminderPlayer { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null }

/** Připomínky jen lidským klubům: AI trenérovi hráči nepíšou (spec AI klubů 3.2), slib platí dál. */
const HUMAN_CLUB_JOIN = "JOIN teams club ON club.id = pr.team_id AND COALESCE(club.user_id, '') != 'ai'";

/**
 * Den před zápasem: hráč se slíbeným místem v sestavě se ozve (jednou na zápas).
 * `rosterTeamId` je kádr, který hraje (áčko nebo U21).
 */
export async function remindMinutesPromises(db: D1Database, rosterTeamId: string, matchKey: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT pr.id AS promise_id, pr.team_id AS club_id, p.id, p.first_name, p.last_name, p.nickname, p.avatar
       FROM player_promises pr JOIN players p ON p.id = pr.player_id ${HUMAN_CLUB_JOIN}
      WHERE p.team_id = ? AND pr.status = 'active' AND pr.type = 'minutes' AND COALESCE(pr.last_reminder_key, '') != ?`,
  ).bind(rosterTeamId, matchKey).all<ReminderPlayer & { promise_id: string; club_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "sliby sestavy před zápasem", e); return { results: [] as Array<ReminderPlayer & { promise_id: string; club_id: string }> }; });
  for (const r of rows.results) {
    await sendPlayerSMS(db, r.club_id, { id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
      pick(MINUTES_REMINDERS, `${r.promise_id}|${matchKey}`));
    await db.prepare("UPDATE player_promises SET last_reminder_key = ? WHERE id = ?").bind(matchKey, r.promise_id).run()
      .catch((e) => logger.warn({ module: M }, "připomínka slibu sestavy", e));
  }
  return rows.results.length;
}

/** Přišla nabídka na hráče, kterému trenér slíbil prodej: hráč mu to připomene (jednou na nabídku). */
export async function remindTransferPromise(db: D1Database, playerId: string, buyerName: string, offerKey: string): Promise<void> {
  const promise = await activeTransferPromise(db, playerId);
  if (!promise || promise.type !== "transfer") return;
  const r = await db.prepare(
    `SELECT pr.team_id AS club_id, pr.last_reminder_key, p.id, p.first_name, p.last_name, p.nickname, p.avatar
       FROM player_promises pr JOIN players p ON p.id = pr.player_id ${HUMAN_CLUB_JOIN} WHERE pr.id = ?`,
  ).bind(promise.id).first<ReminderPlayer & { club_id: string; last_reminder_key: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "hráč se slibem prodeje", e); return null; });
  if (!r || r.last_reminder_key === offerKey) return;
  await sendPlayerSMS(db, r.club_id, { id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
    `Trenére, přišla nabídka od ${buyerName}. Slíbil jste, že mě pustíte, tak doufám, že to platí.`);
  await db.prepare("UPDATE player_promises SET last_reminder_key = ? WHERE id = ?").bind(offerKey, promise.id).run()
    .catch((e) => logger.warn({ module: M }, "připomínka slibu prodeje", e));
}

/** Nabídka, kterou trenér slíbil přijmout („pustit ho“), brzy propadne: hráč se ozve (jednou). */
export async function remindReleasePromise(db: D1Database, offerId: string, buyerName: string): Promise<void> {
  const r = await db.prepare(
    `SELECT pr.id AS promise_id, pr.team_id AS club_id, pr.last_reminder_key, p.id, p.first_name, p.last_name, p.nickname, p.avatar
       FROM player_promises pr JOIN players p ON p.id = pr.player_id ${HUMAN_CLUB_JOIN}
      WHERE pr.status = 'active' AND pr.type = 'release' AND json_extract(pr.details, '$.offerId') = ?`,
  ).bind(offerId).first<ReminderPlayer & { promise_id: string; club_id: string; last_reminder_key: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "slib pustit ho u nabídky", e); return null; });
  if (!r || r.last_reminder_key === `deadline:${offerId}`) return;
  await sendPlayerSMS(db, r.club_id, { id: r.id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar },
    `Trenére, nabídka od ${buyerName} pořád čeká a brzy propadne. Slíbil jste, že mě pustíte.`);
  await db.prepare("UPDATE player_promises SET last_reminder_key = ? WHERE id = ?").bind(`deadline:${offerId}`, r.promise_id).run()
    .catch((e) => logger.warn({ module: M }, "připomínka slibu pustit ho", e));
}
