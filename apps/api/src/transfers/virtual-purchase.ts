/**
 * Koupě hráče od cizího klubu: z hráče, který zatím žije jen jako JSON (inzerát na trhu
 * nebo hlášení skauta), se stane skutečný hráč v kádru kupujícího.
 *
 * Vytaženo z dřívějšího okamžitého nákupu z trhu (routes/game.ts), aby inzeráty i hlášení
 * skauta kupovaly stejně. Pořadí kroků hlídá souběh: nejdřív se zabere zdroj (inzerát nebo
 * hlášení), pak se atomicky strhne záloha a teprve potom vznikne hráč, splátková dohoda,
 * smlouva a transakce jedním batchem. Když batch selže, peníze i zdroj se vrátí.
 */

import { CPU_CLUB_ID, transferSchedule, type TransferTerms } from "@okresni-masina/shared";
import { createRng, cryptoSeed } from "../generators/rng";
import { stropyZDovednosti, talentPodleVeku } from "../skills/stropy-z-dovednosti";
import { logger } from "../lib/logger";

/** Hráč cizího klubu, jak ho ukládá `transfer_listings.ai_player_data` i `scout_reports.player_data`. */
export interface VirtualPlayerData {
  firstName: string;
  lastName: string;
  age: number;
  position: string;
  overallRating: number;
  skills: Record<string, number>;
  physical: Record<string, unknown>;
  personality: Record<string, number>;
  weeklyWage?: number;
  avatar?: Record<string, unknown>;
  nationality?: string;
  fromTeam?: string;
  fromCity?: string;
  fromDistrict?: string;
  skillCaps?: Record<string, { current: number; maxPotential: number }>;
  hiddenTalent?: number;
  occupation?: string;
}

export interface VirtualPurchase {
  db: D1Database;
  /** Budoucí `players.id` (id inzerátu nebo hlášení). */
  playerId: string;
  player: VirtualPlayerData;
  /** Klub, který platí (áčko). */
  buyerClubTeamId: string;
  /** Kádr, kam hráč přijde (áčko nebo jeho U21). */
  destTeamId: string;
  sellerName: string;
  terms: TransferTerms;
  /** Klíč dohody ve `transfer_installments.offer_id`. */
  dealId: string;
  /** Zabere zdroj (inzerát / hlášení). `false` = někdo byl rychlejší. */
  claimSource: () => Promise<boolean>;
  /** Vrátí zdroj, když nákup nedoběhl. */
  releaseSource: () => Promise<void>;
  /** Bydliště: obec hráče a vzdálenost, kterou dojíždí. Bez ní se vylosuje kolem obce kupujícího. */
  residence?: { name: string; commuteKm: number };
  /** Popis transakce, bez ceny (cenu doplní funkce). */
  description: string;
}

export type VirtualPurchaseResult =
  | { ok: true; playerId: string; upfront: number }
  | { ok: false; status: 400 | 409 | 500; error: string };

export async function purchaseVirtualPlayer(p: VirtualPurchase): Promise<VirtualPurchaseResult> {
  const { db, player } = p;
  const schedule = transferSchedule(p.terms);

  const gameDate = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(p.buyerClubTeamId)
    .first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "virtual-purchase" }, "game date", e); return null; }))?.game_date ?? new Date().toISOString();
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "virtual-purchase" }, "active season", e); return null; });

  // Stropy a talent MUSÍ do zápisu. Sloupce mají DEFAULT '{}' a 0, takže bez nich hráč tiše
  // vznikne bez potenciálu. Starší inzeráty je v JSON nemají, proto se dopočítají.
  const rngCaps = createRng(cryptoSeed());
  const skillsMax = JSON.stringify(player.skillCaps ?? stropyZDovednosti(rngCaps, player.skills ?? {}, player.age ?? 25));
  const hiddenTalent = player.hiddenTalent ?? talentPodleVeku(rngCaps, player.age ?? 25);
  const weeklyWage = player.weeklyWage ?? Math.round(10 + ((player.overallRating ?? 40) / 100) * 400);
  const lifeContext = JSON.stringify({ occupation: player.occupation ?? "Fotbalista", condition: 80, morale: 55 });

  const writes: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality,
         life_context, avatar, weekly_wage, status, nationality, skills_max, hidden_talent, residence, commute_km)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    ).bind(
      p.playerId, p.destTeamId, player.firstName, player.lastName, player.age, player.position, player.overallRating,
      JSON.stringify(player.skills ?? {}), JSON.stringify(player.physical ?? {}), JSON.stringify(player.personality ?? {}),
      lifeContext, JSON.stringify(player.avatar ?? {}), weeklyWage, player.nationality ?? "CZ", skillsMax, hiddenTalent,
      p.residence?.name ?? null, p.residence?.commuteKm ?? null,
    ),
    db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
      .bind(crypto.randomUUID(), p.playerId, p.destTeamId, season?.id ?? "unknown", p.terms.amount),
  ];
  if (p.terms.installments > 0) {
    writes.push(db.prepare(
      `INSERT INTO transfer_installments (id, offer_id, player_id, player_name, buyer_team_id, seller_team_id, seller_name, total_amount,
         upfront_amount, installment_amount, installments_total, remaining, created_game_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), p.dealId, p.playerId, `${player.firstName} ${player.lastName}`, p.buyerClubTeamId, CPU_CLUB_ID,
      p.sellerName, p.terms.amount, schedule.upfront, schedule.installmentAmount, schedule.installments,
      schedule.remainingAfterUpfront, gameDate));
  }

  if (!await p.claimSource()) return { ok: false, status: 409, error: "Hráče mezitím koupil jiný klub." };

  const paid = await db.prepare("UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ? RETURNING budget")
    .bind(schedule.upfront, p.buyerClubTeamId, schedule.upfront).first<{ budget: number }>();
  if (!paid) {
    await p.releaseSource();
    return { ok: false, status: 400, error: p.terms.installments > 0 ? "Nedostatek peněz na zálohu." : "Nedostatek peněz." };
  }

  try {
    await db.batch(writes);
  } catch (e) {
    logger.error({ module: "virtual-purchase" }, "zápis hráče od cizího klubu", e);
    await db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(schedule.upfront, p.buyerClubTeamId).run()
      .catch((e2) => logger.error({ module: "virtual-purchase" }, "vrácení zálohy po nezdařeném nákupu", e2));
    await p.releaseSource();
    return { ok: false, status: 500, error: "Přestup se nepodařilo dokončit, peníze jsou zpátky." };
  }

  const priceText = p.terms.installments > 0
    ? ` (záloha ${p.terms.upfrontPct} %, zbytek ${p.terms.installments}× týdně)`
    : "";
  await db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), p.buyerClubTeamId, -schedule.upfront, paid.budget, `${p.description}${priceText}`, gameDate)
    .run().catch((e) => logger.warn({ module: "virtual-purchase" }, "transakce nákupu od cizího klubu", e));

  // Bydliště: hráč z hlášení zůstává bydlet ve své obci a dojíždí. U inzerátu se vylosuje
  // kolem obce kupujícího jako dřív.
  if (!p.residence) {
    const village = await db.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
      .bind(p.destTeamId).first<{ name: string; size: string; district: string }>()
      .catch((e) => { logger.warn({ module: "virtual-purchase" }, "obec kupujícího", e); return null; });
    if (village) {
      const { generateResidence } = await import("../generators/residence");
      const res = generateResidence(createRng(cryptoSeed()), village.name, village.size, village.district);
      await db.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
        .bind(res.residence, res.commuteKm, p.playerId).run()
        .catch((e) => logger.warn({ module: "virtual-purchase" }, "bydliště hráče", e));
    }
  }

  // Vazby na spoluhráče a trenéra (až po bydlišti — sousedství se odvozuje z něj).
  try {
    const { attachNewcomerRelations } = await import("./attach-relations");
    await attachNewcomerRelations(db, p.destTeamId, p.playerId);
    const { initNewcomerCoachRelation } = await import("../lib/coach-relation");
    await initNewcomerCoachRelation(db, p.destTeamId, p.playerId);
  } catch (e) {
    logger.warn({ module: "virtual-purchase" }, "vazby nového hráče", e);
  }

  const teamRow = await db.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(p.buyerClubTeamId)
    .first<{ name: string; league_id: string }>()
    .catch((e) => { logger.warn({ module: "virtual-purchase" }, "tým pro zprávu", e); return null; });
  if (teamRow) {
    const { createTransferNews } = await import("./transfer-news");
    await createTransferNews(db, teamRow.league_id, p.buyerClubTeamId, "transfer_completed", {
      playerName: `${player.firstName} ${player.lastName}`, playerAge: player.age,
      playerPosition: player.position, teamName: teamRow.name, toTeamName: teamRow.name, fromTeamName: p.sellerName,
      fee: p.terms.amount, isCrossDistrict: true,
    }).catch((e) => logger.warn({ module: "virtual-purchase" }, "zpráva o přestupu", e));
  }

  return { ok: true, playerId: p.playerId, upfront: schedule.upfront };
}
