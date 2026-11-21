/**
 * Dražba hráčů z opuštěných klubů.
 *
 * Když nová registrace přepíše AI klub (ai-clubs/overwrite.ts), nejlepších pět hráčů se
 * nesmaže: přes `removePlayer` jdou mezi volné hráče a na 48 hodin do dražby. Během dražby
 * je volný hráč skrytý z běžného trhu a podepsat ho nejde. Start 50 % tržní ceny, příhoz
 * aspoň +10 %, příhoz v posledních 10 minutách dražbu prodlouží na 10 minut od příhozu.
 *
 * Po skončení (hodinový běh) bere nejvyšší příhoz, kdo má peníze a místo v kádru; když
 * nemá, bere další. Neprodaný hráč zůstane mezi volnými. AI kluby přihazují přes model
 * s rozpočtovou mezí, při výpadku podle pravidla.
 */

import { marketValue } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import { removePlayer } from "./remove-player";
import { aiContextFromEnv, generateText, type AiContext } from "../lib/ai-provider";
import { parseModelJson } from "../ai-coach/llm";

const M = "auctions";
export const AUCTION_LOTS = 5;
export const AUCTION_HOURS = 48;
export const START_SHARE = 0.5;
export const MIN_RAISE = 0.1;
export const EXTEND_MINUTES = 10;
const MAX_SQUAD = 30;
const SMS_ROLE = "Sportovní ředitel";

type Env = Pick<Bindings, "DB"> & Partial<Pick<Bindings, "CACHE_KV" | "GEMINI_API_KEY" | "AI" | "AI_GATEWAY_URL">>;

export interface AuctionRow {
  id: string;
  free_agent_id: string;
  source_team_id: string;
  source_team_name: string;
  district: string;
  player_name: string;
  position: string;
  age: number;
  start_price: number;
  current_bid: number | null;
  current_team_id: string | null;
  ends_at: string;
  status: "open" | "closing" | "sold" | "unsold";
  winner_team_id: string | null;
  sold_price: number | null;
}

/** Start dražby: polovina tržní ceny zaokrouhlená na stovky, aspoň 1 000 Kč. */
export function startPrice(rating: number, age: number, position: string | null): number {
  return Math.max(1000, Math.round((marketValue(rating, age, position) * START_SHARE) / 100) * 100);
}

/** Nejnižší další příhoz: start, nebo o 10 % víc než současný (nahoru na stovky). */
export function minNextBid(a: Pick<AuctionRow, "start_price" | "current_bid">): number {
  if (a.current_bid == null) return a.start_price;
  return Math.ceil((a.current_bid * (1 + MIN_RAISE)) / 100) * 100;
}

/** Konec po příhozu: v posledních 10 minutách se posune na 10 minut od příhozu. */
export function extendedEnd(endsAt: string, now: Date): string {
  const left = Date.parse(endsAt) - now.getTime();
  if (left > EXTEND_MINUTES * 60_000) return endsAt;
  return new Date(now.getTime() + EXTEND_MINUTES * 60_000).toISOString();
}

function money(n: number): string {
  return `${n.toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
}

/**
 * Před smazáním hráčů přepsaného AI klubu: nejlepších pět jde do dražby. Vrací počet
 * vydražovaných hráčů. Chyba u jednoho hráče nezastaví ostatní (ten se pak smaže s klubem).
 */
export async function auctionTopPlayers(db: D1Database, teamId: string, teamName: string, now: Date): Promise<number> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, v.district
       FROM players p JOIN teams t ON t.id = p.team_id JOIN villages v ON v.id = t.village_id
      WHERE p.team_id = ? AND p.loan_from_team_id IS NULL ORDER BY p.overall_rating DESC LIMIT ?`,
  ).bind(teamId, AUCTION_LOTS).all<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number; district: string }>();
  const endsAt = new Date(now.getTime() + AUCTION_HOURS * 3600_000).toISOString();
  // Volný hráč vydrží týden po dražbě, ať ho neprodaného ještě někdo podepíše.
  const faExpiresAt = new Date(now.getTime() + (AUCTION_HOURS + 7 * 24) * 3600_000).toISOString();
  let started = 0;
  for (const p of rows.results) {
    try {
      const removed = await removePlayer(db, p.id, "released", { toFreeAgent: true, teamId, faExpiresAt });
      if (!removed.ok || !removed.freeAgentId) continue;
      await db.prepare(
        `INSERT OR IGNORE INTO player_auctions (id, free_agent_id, source_team_id, source_team_name, district, player_name, position, age, start_price, ends_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(`auc-${removed.freeAgentId}`, removed.freeAgentId, teamId, teamName, p.district, `${p.first_name} ${p.last_name}`, p.position, p.age,
        startPrice(p.overall_rating, p.age, p.position), endsAt).run();
      started++;
      if (removed.watcherTeamIds?.length) {
        const { createNotification } = await import("../community/notifications");
        for (const w of removed.watcherTeamIds) {
          await createNotification(db, w, "transfer", "🔨 Dražba hráče",
            `${p.first_name} ${p.last_name}, kterého sledujete, jde do dražby. Končí za dva dny.`, "/prestupy?tab=hledat&hledat=drazba")
            .catch((e) => logger.warn({ module: M, teamId: w }, "upozornění sledujícího na dražbu", e));
        }
      }
    } catch (e) {
      logger.warn({ module: M, teamId }, `hráč ${p.id} do dražby`, e);
    }
  }
  if (started) logger.info({ module: M }, `dražba: ${started} hráčů z přepsaného klubu ${teamName}`);
  return started;
}

export class BidError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

/** Příhoz. Kód hlídá minimum, konec, peníze a souběh (podmíněný UPDATE na současný příhoz). */
export async function placeBid(db: D1Database, teamId: string, auctionId: string, amount: number, now: Date = new Date()): Promise<AuctionRow> {
  const a = await db.prepare("SELECT * FROM player_auctions WHERE id = ?").bind(auctionId).first<AuctionRow>();
  if (!a) throw new BidError("Dražba nenalezena.", 404);
  if (a.status !== "open" || Date.parse(a.ends_at) <= now.getTime()) throw new BidError("Dražba už skončila.", 409);
  if (!Number.isInteger(amount) || amount <= 0) throw new BidError("Příhoz musí být celé číslo v korunách.");
  if (a.current_team_id === teamId) throw new BidError("Nejvyšší příhoz už je váš.", 409);
  const min = minNextBid(a);
  if (amount < min) throw new BidError(`Nejmenší příhoz je teď ${money(min)}.`);
  const team = await db.prepare("SELECT budget, user_id, parent_team_id FROM teams WHERE id = ?").bind(teamId)
    .first<{ budget: number; user_id: string | null; parent_team_id: string | null }>();
  if (!team || team.parent_team_id) throw new BidError("Přihazovat může jen áčko klubu.");
  if (team.budget < amount) throw new BidError(`Na příhoz ${money(amount)} nemáte peníze.`);
  const endsAt = extendedEnd(a.ends_at, now);
  const res = await db.prepare(
    `UPDATE player_auctions SET current_bid = ?, current_team_id = ?, ends_at = ?
      WHERE id = ? AND status = 'open' AND COALESCE(current_bid, -1) = ?`,
  ).bind(amount, teamId, endsAt, auctionId, a.current_bid ?? -1).run();
  if (!res.meta.changes) throw new BidError("Mezitím přihodil někdo jiný, zkuste to znovu.", 409);
  await db.prepare("INSERT INTO auction_bids (id, auction_id, team_id, amount) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auctionId, teamId, amount).run();
  if (a.current_team_id && a.current_team_id !== teamId) {
    const { sendSystemSMS } = await import("../messaging/system-sms");
    await sendSystemSMS(db, a.current_team_id, SMS_ROLE, `🔨 V dražbě o hráče ${a.player_name} vás někdo přehodil, teď je na ${money(amount)}.`,
      { type: "guide", href: "/prestupy?tab=hledat&hledat=drazba", label: "Otevřít dražbu" })
      .catch((e) => logger.warn({ module: M }, "SMS o přehození v dražbě", e));
  }
  return { ...a, current_bid: amount, current_team_id: teamId, ends_at: endsAt };
}

/** Vítěz v pořadí příhozů: kdo má na zaplacení a místo v kádru. */
async function settleAuction(db: D1Database, a: AuctionRow, now: Date): Promise<"sold" | "unsold"> {
  const bids = await db.prepare(
    `SELECT b.team_id, MAX(b.amount) AS amount FROM auction_bids b WHERE b.auction_id = ? GROUP BY b.team_id ORDER BY amount DESC`,
  ).bind(a.id).all<{ team_id: string; amount: number }>();
  const fa = await db.prepare("SELECT * FROM free_agents WHERE id = ?").bind(a.free_agent_id).first<Record<string, unknown>>();
  if (!fa) return "unsold";
  const { materializeFreeAgent } = await import("../services/transfer-actions");
  const { placeInSeniorSquad } = await import("./senior-age");
  const { sendSystemSMS } = await import("../messaging/system-sms");
  for (const b of bids.results) {
    const team = await db.prepare("SELECT budget, user_id, game_date FROM teams WHERE id = ?").bind(b.team_id)
      .first<{ budget: number; user_id: string | null; game_date: string | null }>();
    const squad = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = ?").bind(b.team_id).first<{ n: number }>();
    const human = team?.user_id && team.user_id !== "ai";
    const skip = async (why: string) => {
      if (human) {
        await sendSystemSMS(db, b.team_id, SMS_ROLE, `🔨 Dražbu o hráče ${a.player_name} jste vyhráli, ale ${why}. Hráč jde dalšímu v pořadí.`)
          .catch((e) => logger.warn({ module: M }, "SMS o propadlé výhře v dražbě", e));
      }
    };
    if (!team || team.budget < b.amount) { await skip("na zaplacení nemáte peníze"); continue; }
    if ((squad?.n ?? 0) >= MAX_SQUAD) { await skip("kádr je plný"); continue; }
    const placement = await placeInSeniorSquad(db, b.team_id, Number(fa.age), a.player_name);
    if (!placement.ok) { await skip("hráč je moc mladý a klub nemá dorost"); continue; }
    const made = await materializeFreeAgent(db, {
      teamId: b.team_id, rosterTeamId: placement.squad === "u21" ? placement.teamId : b.team_id, fa, faId: a.free_agent_id,
      wage: Number(fa.weekly_wage ?? 0), joinType: "transfer", fee: b.amount,
    });
    if (!made.ok) return "unsold";
    await recordTransaction(db, b.team_id, "auction_purchase", -b.amount, `Dražba: ${a.player_name} (z klubu ${a.source_team_name})`,
      team.game_date ?? now.toISOString().slice(0, 10), `auction-${a.id}`, { allowNegative: true });
    await db.prepare("UPDATE player_auctions SET winner_team_id = ?, sold_price = ? WHERE id = ?").bind(b.team_id, b.amount, a.id).run();
    if (human) {
      await sendSystemSMS(db, b.team_id, SMS_ROLE, `🔨 Vydraženo: ${a.player_name} je váš za ${money(b.amount)}. Už je v kádru.`,
        { type: "guide", href: "/kadr", label: "Otevřít kádr" })
        .catch((e) => logger.warn({ module: M }, "SMS o vítězství v dražbě", e));
    }
    for (const other of bids.results) {
      if (other.team_id === b.team_id) continue;
      const o = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(other.team_id).first<{ user_id: string | null }>();
      if (!o?.user_id || o.user_id === "ai") continue;
      await sendSystemSMS(db, other.team_id, SMS_ROLE, `🔨 Dražba o hráče ${a.player_name} skončila, vzal ho jiný klub za ${money(b.amount)}.`)
        .catch((e) => logger.warn({ module: M }, "SMS poraženým v dražbě", e));
    }
    return "sold";
  }
  return "unsold";
}

/** Uzavře skončené dražby. Opakovaný běh nic nezdvojí (zabrání stavem 'closing'). */
export async function closeDueAuctions(db: D1Database, now: Date = new Date()): Promise<{ sold: number; unsold: number }> {
  const due = await db.prepare("SELECT * FROM player_auctions WHERE status = 'open' AND ends_at <= ? LIMIT 20")
    .bind(now.toISOString()).all<AuctionRow>();
  let sold = 0;
  let unsold = 0;
  for (const a of due.results) {
    const claimed = await db.prepare("UPDATE player_auctions SET status = 'closing' WHERE id = ? AND status = 'open' AND ends_at <= ?")
      .bind(a.id, now.toISOString()).run();
    if (!claimed.meta.changes) continue;
    try {
      const outcome = await settleAuction(db, a, now);
      await db.prepare("UPDATE player_auctions SET status = ?, closed_at = ? WHERE id = ?").bind(outcome, now.toISOString(), a.id).run();
      if (outcome === "sold") sold++; else unsold++;
    } catch (e) {
      logger.error({ module: M }, `uzavření dražby ${a.id}`, e);
      await db.prepare("UPDATE player_auctions SET status = 'open' WHERE id = ? AND status = 'closing'").bind(a.id).run()
        .catch((err) => logger.warn({ module: M }, `uvolnění dražby ${a.id}`, err));
    }
  }
  return { sold, unsold };
}

/** Pravidlo, když model mlčí: přihodí jen bohatý klub a nejvýš do 1,2 × tržní ceny. */
export function fallbackAiBid(budget: number, min: number, value: number): number | null {
  if (budget < min * 5) return null;
  const cap = Math.min(Math.round(value * 1.2), Math.floor(budget / 4));
  return min <= cap ? min : null;
}

/**
 * AI kluby okresu dražby přihazují přes model. Kód hlídá mez (nejvýš čtvrtina rozpočtu
 * a 1,5 × tržní ceny) a minimum příhozu. Jeden pokus na dražbu a hodinu.
 */
export async function aiAuctionBids(env: Env, now: Date = new Date()): Promise<number> {
  const db = env.DB;
  const open = await db.prepare("SELECT a.*, fa.overall_rating FROM player_auctions a JOIN free_agents fa ON fa.id = a.free_agent_id WHERE a.status = 'open' AND a.ends_at > ?")
    .bind(now.toISOString()).all<AuctionRow & { overall_rating: number }>();
  if (!open.results.length) return 0;
  let ai: AiContext | null = null;
  if (env.CACHE_KV) {
    ai = await aiContextFromEnv(env as Parameters<typeof aiContextFromEnv>[0]).catch((e) => { logger.warn({ module: M }, "AI kontext pro dražbu", e); return null; });
  }
  let bids = 0;
  for (const a of open.results) {
    const min = minNextBid(a);
    const value = marketValue(a.overall_rating, a.age, a.position);
    const club = await db.prepare(
      `SELECT t.id, t.name, t.budget FROM teams t JOIN villages v ON v.id = t.village_id JOIN leagues l ON l.id = t.league_id
        WHERE t.user_id = 'ai' AND t.parent_team_id IS NULL AND v.district = ? AND COALESCE(l.waiting, 0) = 0
          AND t.id != COALESCE(?, '') AND t.budget >= ? ORDER BY t.budget DESC LIMIT 1`,
    ).bind(a.district, a.current_team_id, min * 3).first<{ id: string; name: string; budget: number }>();
    if (!club) continue;
    const cap = Math.min(Math.floor(club.budget / 4), Math.round(value * 1.5));
    if (min > cap) continue;
    let amount: number | null = null;
    if (ai) {
      const prompt = `Jsi trenér amatérského klubu ${club.name}, na účtu máš ${club.budget} Kč. V dražbě je hráč ${a.player_name} `
        + `(${a.position}, ${a.age} let, hodnocení ${a.overall_rating}, tržní cena asi ${value} Kč). Nejmenší příhoz je ${min} Kč, `
        + `víc než ${cap} Kč dát nesmíš. Přihodíš? Odpověz jen JSON {"bid": číslo v Kč nebo null}.`;
      const raw = await generateText(ai, prompt, { maxTokens: 60, temperature: 0.6, module: M })
        .catch((e) => { logger.warn({ module: M }, "rozhodnutí AI klubu v dražbě", e); return null; });
      const parsed = raw ? parseModelJson(raw) : null;
      if (parsed && "bid" in parsed) {
        const n = Number(parsed.bid);
        amount = parsed.bid === null || !Number.isFinite(n) ? null : Math.min(cap, Math.max(min, Math.round(n / 100) * 100));
      } else {
        amount = fallbackAiBid(club.budget, min, value);
        logger.warn({ module: M }, `AI klub ${club.id} v dražbě rozhodl pravidlem (model nevrátil odpověď)`);
      }
    } else {
      amount = fallbackAiBid(club.budget, min, value);
    }
    if (amount == null) continue;
    try {
      await placeBid(db, club.id, a.id, amount, now);
      bids++;
    } catch (e) {
      logger.warn({ module: M }, `příhoz AI klubu ${club.id}`, e);
    }
  }
  return bids;
}

export interface AuctionView {
  open: Array<AuctionRow & { overall_rating: number; minNext: number; leading: boolean; leaderName: string | null; myBid: number | null }>;
  closed: Array<Pick<AuctionRow, "id" | "player_name" | "position" | "age" | "source_team_name" | "status" | "sold_price"> & { winnerName: string | null }>;
}

export async function loadAuctions(db: D1Database, teamId: string, now: Date = new Date()): Promise<AuctionView> {
  const open = await db.prepare(
    `SELECT a.*, fa.overall_rating, t.name AS leader_name,
            (SELECT MAX(amount) FROM auction_bids b WHERE b.auction_id = a.id AND b.team_id = ?) AS my_bid
       FROM player_auctions a JOIN free_agents fa ON fa.id = a.free_agent_id LEFT JOIN teams t ON t.id = a.current_team_id
      WHERE a.status = 'open' AND a.ends_at > ? ORDER BY a.ends_at`,
  ).bind(teamId, now.toISOString()).all<AuctionRow & { overall_rating: number; leader_name: string | null; my_bid: number | null }>();
  const closed = await db.prepare(
    `SELECT a.id, a.player_name, a.position, a.age, a.source_team_name, a.status, a.sold_price, t.name AS winner_name
       FROM player_auctions a LEFT JOIN teams t ON t.id = a.winner_team_id
      WHERE a.status IN ('sold', 'unsold') ORDER BY a.closed_at DESC LIMIT 10`,
  ).all<{ id: string; player_name: string; position: string; age: number; source_team_name: string; status: AuctionRow["status"]; sold_price: number | null; winner_name: string | null }>();
  return {
    open: open.results.map((a) => ({ ...a, minNext: minNextBid(a), leading: a.current_team_id === teamId, leaderName: a.leader_name, myBid: a.my_bid })),
    closed: closed.results.map((c) => ({ id: c.id, player_name: c.player_name, position: c.position, age: c.age, source_team_name: c.source_team_name, status: c.status, sold_price: c.sold_price, winnerName: c.winner_name })),
  };
}
