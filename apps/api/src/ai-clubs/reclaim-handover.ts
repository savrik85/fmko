/**
 * Předání klubu zpátky majiteli, který se vrátil (ai-clubs/reclaim.ts).
 *
 * AI trenér po sobě nechá rozdělanou práci: inzeráty, poptávky a nabídky čekající na odpověď.
 * Majitel o nich neví a rozhodl by o nich někdo, kdo už klub nevede. Proto se po návratu:
 * - stáhnou inzeráty a poptávky, které AI vypsala,
 * - stáhnou nabídky, které AI poslala a ještě čekají,
 * - majiteli přijde zpráva se souhrnem, co se za jeho nepřítomnosti stalo (prodeje, příchody,
 *   noví sponzoři, větší útraty), z přestupů, smluv a pohybů na účtu od převzetí.
 * Stahuje se stejnými službami jako u člověka. Co AI udělala a nejde vzít zpět (prodej, stavba),
 * zůstává; souhrn to aspoň řekne. Chyba jednoho kroku ostatní nezastaví.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { withdrawListing, withdrawTransferOffer } from "../services/transfer-actions";
import { withdrawDemand } from "../transfers/demands";

const M = "reclaim-handover";
/** Od koho majiteli souhrn přijde. */
export const HANDOVER_SENDER = "Sekretář klubu";
/** Útrata skupiny se do souhrnu dostane od této částky. */
const MIN_SPENDING = 5000;
/** Nejvýš tolik jmen v jedné řádce souhrnu. */
const MAX_NAMES = 6;

/** Pohyby na účtu, které majitele zajímají jako „větší útraty“ (běžné mzdy a provoz ne). */
const SPENDING_GROUPS: Array<{ label: string; types: string[] }> = [
  { label: "stadion a hřiště", types: ["stadium_upgrade", "stadium_visual", "pitch_upgrade", "pitch_repair", "pitch_maintenance"] },
  { label: "vybavení", types: ["equipment_upgrade", "equipment_expense"] },
  { label: "přestupy a podpisy hráčů", types: ["transfer_fee", "transfer_installment", "transfer_installment_settlement", "signing_fee"] },
  { label: "nábor zaměstnanců", types: ["staff_signing"] },
  { label: "cesty skauta", types: ["scout_travel"] },
  { label: "akademie", types: ["youth_academy"] },
];

export interface HandoverSummary {
  listingsWithdrawn: number;
  demandsWithdrawn: number;
  offersWithdrawn: number;
  sold: Array<{ name: string; amount: number }>;
  bought: Array<{ name: string; amount: number }>;
  sponsors: string[];
  spending: Array<{ label: string; total: number }>;
  /** Text zprávy majiteli (česky). */
  message: string;
}

const formatCzk = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/[\u00a0\u202f]/g, " ")} Kč`;

function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

function listNames(items: Array<{ name: string; amount: number }>): string {
  const shown = items.slice(0, MAX_NAMES).map((i) => (i.amount > 0 ? `${i.name} (${formatCzk(i.amount)})` : i.name));
  const rest = items.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ` a ${rest} další` : "");
}

/** Text zprávy majiteli. Bez herních čísel navíc, jen co se stalo. */
export function handoverMessage(s: Omit<HandoverSummary, "message">): string {
  const lines: string[] = ["Trenére, vítejte zpátky. Klub mezitím vedl zastupující trenér. Co se za tu dobu stalo:"];
  if (s.sold.length > 0) lines.push(`Odešli: ${listNames(s.sold)}.`);
  if (s.bought.length > 0) lines.push(`Přišli: ${listNames(s.bought)}.`);
  if (s.sponsors.length > 0) lines.push(`Nové smlouvy se sponzory: ${s.sponsors.slice(0, MAX_NAMES).join(", ")}${s.sponsors.length > MAX_NAMES ? ` a ${s.sponsors.length - MAX_NAMES} další` : ""}.`);
  if (s.spending.length > 0) lines.push(`Větší útraty: ${s.spending.map((g) => `${g.label} ${formatCzk(g.total)}`).join(", ")}.`);
  if (s.sold.length + s.bought.length + s.sponsors.length + s.spending.length === 0) lines.push("V kádru, u sponzorů ani na stadionu se nic velkého nezměnilo.");
  const withdrawn: string[] = [];
  if (s.listingsWithdrawn > 0) withdrawn.push(plural(s.listingsWithdrawn, "inzerát", "inzeráty", "inzerátů"));
  if (s.demandsWithdrawn > 0) withdrawn.push(plural(s.demandsWithdrawn, "poptávku", "poptávky", "poptávek"));
  if (s.offersWithdrawn > 0) withdrawn.push(plural(s.offersWithdrawn, "rozjednanou nabídku", "rozjednané nabídky", "rozjednaných nabídek"));
  if (withdrawn.length > 0) lines.push(`Stáhli jsme ${withdrawn.join(", ")}, které zůstaly otevřené. Dál už rozhodujete vy.`);
  else lines.push("Dál už rozhodujete vy.");
  return lines.join("\n");
}

/**
 * Uklidí rozdělanou práci AI trenéra a pošle majiteli souhrn. `aiSince` je čas převzetí klubu
 * (přečtený před návratem, návrat ho maže); bez něj se bere jen to, co je teď otevřené, a souhrn
 * minulosti se vynechá.
 */
export async function handOverToOwner(env: Bindings, teamId: string, aiSince: string | null): Promise<HandoverSummary> {
  const db = env.DB;
  // Na celé sekundy dolů: smlouvy a pohyby na účtu mají čas bez milisekund (datetime('now')),
  // záznam ze stejné sekundy jako převzetí by jinak ze souhrnu vypadl.
  const since = aiSince ? `${aiSince.slice(0, 19)}Z` : "9999-12-31T00:00:00Z";
  const clubTeams = "(SELECT id FROM teams WHERE id = ?1 OR parent_team_id = ?1)";
  const safe = async <T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      logger.warn({ module: M, teamId }, what, e);
      return fallback;
    }
  };

  // ── Rozdělaná práce: inzeráty, poptávky, odeslané nabídky ──
  let listingsWithdrawn = 0;
  const listings = await safe("inzeráty AI trenéra", async () => (await db.prepare(
    `SELECT id, team_id FROM transfer_listings WHERE team_id IN ${clubTeams} AND status = 'active'`,
  ).bind(teamId).all<{ id: string; team_id: string }>()).results, []);
  for (const l of listings) {
    const res = await safe(`stažení inzerátu ${l.id}`, () => withdrawListing(env, l.team_id, l.id), null);
    if (res?.ok) listingsWithdrawn++;
  }

  let demandsWithdrawn = 0;
  const demands = await safe("poptávky AI trenéra", async () => (await db.prepare(
    "SELECT id FROM transfer_demands WHERE team_id = ? AND status = 'active'",
  ).bind(teamId).all<{ id: string }>()).results, []);
  for (const d of demands) {
    if (await safe(`stažení poptávky ${d.id}`, () => withdrawDemand(db, teamId, d.id), false)) demandsWithdrawn++;
  }

  let offersWithdrawn = 0;
  const offers = await safe("odeslané nabídky AI trenéra", async () => (await db.prepare(
    `SELECT id FROM transfer_offers WHERE from_team_id IN ${clubTeams} AND status IN ('pending', 'countered')`,
  ).bind(teamId).all<{ id: string }>()).results, []);
  for (const o of offers) {
    const res = await safe(`stažení nabídky ${o.id}`, () => withdrawTransferOffer(env, teamId, o.id), null);
    if (res?.ok) offersWithdrawn++;
  }

  // ── Souhrn od převzetí ──
  type Deal = { first_name: string | null; last_name: string | null; amount: number | null };
  const dealName = (r: Deal) => ({ name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "hráč", amount: Number(r.amount) || 0 });
  const sold = (await safe("prodeje AI trenéra", async () => (await db.prepare(
    `SELECT p.first_name, p.last_name, COALESCE(o.counter_amount, o.offer_amount) AS amount
       FROM transfer_offers o LEFT JOIN players p ON p.id = o.player_id
      WHERE o.to_team_id IN ${clubTeams} AND o.status = 'accepted' AND COALESCE(o.offer_type, 'transfer') != 'loan'
        AND julianday(o.resolved_at) >= julianday(?2)
      ORDER BY julianday(o.resolved_at)`,
  ).bind(teamId, since).all<Deal>()).results, [])).map(dealName);
  const boughtOffers = await safe("nákupy AI trenéra", async () => (await db.prepare(
    `SELECT p.first_name, p.last_name, COALESCE(o.counter_amount, o.offer_amount) AS amount
       FROM transfer_offers o LEFT JOIN players p ON p.id = o.player_id
      WHERE o.from_team_id IN ${clubTeams} AND o.status = 'accepted' AND COALESCE(o.offer_type, 'transfer') != 'loan'
        AND julianday(o.resolved_at) >= julianday(?2)
      ORDER BY julianday(o.resolved_at)`,
  ).bind(teamId, since).all<Deal>()).results, []);
  const boughtFree = await safe("podpisy volných hráčů AI trenéra", async () => (await db.prepare(
    `SELECT p.first_name, p.last_name, 0 AS amount
       FROM player_contracts c JOIN players p ON p.id = c.player_id
      WHERE c.team_id IN ${clubTeams} AND c.join_type = 'free_agent' AND julianday(c.joined_at) >= julianday(?2)`,
  ).bind(teamId, since).all<Deal>()).results, []);
  const boughtOutside = await safe("nákupy od klubů mimo hru", async () => (await db.prepare(
    "SELECT player_name AS first_name, '' AS last_name, amount FROM ai_negotiations WHERE team_id = ?1 AND status = 'signed' AND julianday(resolved_at) >= julianday(?2)",
  ).bind(teamId, since).all<Deal>()).results, []);
  const bought = [...boughtOffers, ...boughtOutside, ...boughtFree].map(dealName);

  const sponsors = (await safe("smlouvy se sponzory od převzetí", async () => (await db.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ?1 AND julianday(signed_at) >= julianday(?2) ORDER BY julianday(signed_at)",
  ).bind(teamId, since).all<{ sponsor_name: string | null }>()).results, []))
    .map((r) => r.sponsor_name ?? "").filter(Boolean);

  const spent = await safe("útraty od převzetí", async () => (await db.prepare(
    `SELECT type, -SUM(amount) AS total FROM transactions
      WHERE team_id IN ${clubTeams} AND amount < 0 AND julianday(created_at) >= julianday(?2) GROUP BY type`,
  ).bind(teamId, since).all<{ type: string; total: number }>()).results, []);
  const spending = SPENDING_GROUPS
    .map((g) => ({ label: g.label, total: spent.filter((r) => g.types.includes(r.type)).reduce((sum, r) => sum + (Number(r.total) || 0), 0) }))
    .filter((g) => g.total >= MIN_SPENDING);

  const summary = { listingsWithdrawn, demandsWithdrawn, offersWithdrawn, sold, bought, sponsors, spending };
  const message = handoverMessage(summary);
  await sendSystemSMS(db, teamId, HANDOVER_SENDER, message, { type: "club_handover" })
    .catch((e) => logger.warn({ module: M, teamId }, "souhrn pro vracejícího se majitele", e));
  logger.info({ module: M, teamId }, `předání klubu majiteli: staženo ${listingsWithdrawn} inzerátů, ${demandsWithdrawn} poptávek, ${offersWithdrawn} nabídek`);
  return { ...summary, message };
}
