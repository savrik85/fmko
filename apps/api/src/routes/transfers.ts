/**
 * Přestupový systém — propuštění, volní hráči, trh, nabídky mezi týmy.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { recordTransaction } from "../season/finance-processor";
import { createTransferNews } from "../transfers/transfer-news";
import { evaluateSigningChance, haversineKm } from "../transfers/player-agency";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";

const transfersRouter = new Hono<{ Bindings: Bindings }>();

// ═══ PROPUŠTĚNÍ HRÁČE ═══

transfersRouter.post("/teams/:teamId/players/:playerId/release", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");

  const player = await c.env.DB.prepare(
    "SELECT p.*, t.name as team_name, t.league_id, v.district FROM players p JOIN teams t ON p.team_id = t.id JOIN villages v ON t.village_id = v.id WHERE p.id = ? AND p.team_id = ?"
  ).bind(playerId, teamId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  // Create free agent from player data
  const faId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO free_agents (id, district, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, source, released_from_team_id, village_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, (SELECT village_id FROM teams WHERE id = ?), ?)`
  ).bind(
    faId, player.district, player.first_name, player.last_name, player.nickname ?? null,
    player.age, player.position, player.overall_rating,
    player.skills, player.physical ?? "{}", player.personality ?? "{}", player.life_context ?? "{}",
    player.avatar ?? "{}", player.hidden_talent ?? 0, player.weekly_wage ?? 0,
    teamId, teamId, expiresAt.toISOString(),
  ).run();

  // Update contract
  await c.env.DB.prepare(
    "UPDATE player_contracts SET leave_type = 'released', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1"
  ).bind(playerId, teamId).run().catch((e) => logger.warn({ module: "transfers" }, "update contract on release", e));

  // Remove from listings/offers
  await c.env.DB.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE player_id = ? AND status = 'active'").bind(playerId).run().catch((e) => logger.warn({ module: "transfers" }, "withdraw listings on release", e));
  await c.env.DB.prepare("UPDATE transfer_offers SET status = 'withdrawn' WHERE player_id = ? AND status = 'pending'").bind(playerId).run().catch((e) => logger.warn({ module: "transfers" }, "withdraw offers on release", e));

  // Delete player
  await c.env.DB.prepare("DELETE FROM players WHERE id = ?").bind(playerId).run();

  // News
  await createTransferNews(c.env.DB, player.league_id as string, teamId, "player_released", {
    playerName: `${player.first_name} ${player.last_name}`,
    playerAge: player.age as number,
    playerPosition: player.position as string,
    teamName: player.team_name as string,
  });

  return c.json({ ok: true });
});

// ═══ VOLNÍ HRÁČI ═══

transfersRouter.get("/teams/:teamId/free-agents", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare(
    "SELECT t.reputation, v.district, v.latitude, v.longitude FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ reputation: number; district: string; latitude: number; longitude: number }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const agents = await c.env.DB.prepare(
    "SELECT fa.*, v.latitude as v_lat, v.longitude as v_lon, v.name as village_name FROM free_agents fa LEFT JOIN villages v ON fa.village_id = v.id WHERE fa.district = ? AND fa.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY fa.overall_rating DESC"
  ).bind(team.district).all();

  const result = agents.results.map((fa) => {
    const distKm = fa.v_lat && fa.v_lon
      ? Math.round(haversineKm(team.latitude, team.longitude, fa.v_lat as number, fa.v_lon as number))
      : null;
    return {
      id: fa.id,
      firstName: fa.first_name,
      lastName: fa.last_name,
      nickname: fa.nickname,
      age: fa.age,
      position: fa.position,
      overallRating: fa.overall_rating,
      weeklyWage: fa.weekly_wage,
      occupation: (() => { try { return JSON.parse(fa.life_context as string)?.occupation ?? ""; } catch (e) { logger.warn({ module: "transfers" }, `parse fa life_context: ${e}`); return ""; } })(),
      source: fa.source,
      releasedFromTeamId: fa.released_from_team_id,
      villageName: fa.village_name ?? null,
      distanceKm: distKm,
      expiresAt: fa.expires_at,
      avatar: (() => { try { return JSON.parse(fa.avatar as string); } catch (e) { logger.warn({ module: "transfers" }, `parse fa avatar: ${e}`); return {}; } })(),
      skills: (() => { try { return JSON.parse(fa.skills as string); } catch (e) { logger.warn({ module: "transfers" }, `parse fa skills: ${e}`); return {}; } })(),
      physical: (() => { try { return JSON.parse(fa.physical as string); } catch (e) { logger.warn({ module: "transfers" }, `parse fa physical: ${e}`); return {}; } })(),
      personality: (() => { try { return JSON.parse(fa.personality as string); } catch (e) { logger.warn({ module: "transfers" }, `parse fa personality: ${e}`); return {}; } })(),
    };
  });

  return c.json({ freeAgents: result });
});

transfersRouter.post("/teams/:teamId/free-agents/:faId/sign", async (c) => {
  const teamId = c.req.param("teamId");
  const faId = c.req.param("faId");
  const body = await c.req.json<{ offeredWage: number }>();

  const team = await c.env.DB.prepare(
    "SELECT t.*, v.latitude, v.longitude, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const fa = await c.env.DB.prepare("SELECT * FROM free_agents WHERE id = ?").bind(faId).first<Record<string, unknown>>();
  if (!fa) return c.json({ error: "Volný hráč nenalezen" }, 404);

  // Get agent's village coords
  let agentVillage: { lat: number; lng: number } | null = null;
  if (fa.village_id) {
    agentVillage = await c.env.DB.prepare("SELECT latitude as lat, longitude as lng FROM villages WHERE id = ?")
      .bind(fa.village_id).first<{ lat: number; lng: number }>().catch((e) => { logger.warn({ module: "transfers" }, "fetch agent village coords", e); return null; });
  }

  // Count squad
  const squadCount = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?")
    .bind(teamId).first<{ cnt: number }>();

  const personality = (() => { try { return JSON.parse(fa.personality as string); } catch (e) { logger.warn({ module: "transfers" }, `parse sign personality: ${e}`); return {}; } })();
  const rng = createRng(Date.now() + faId.charCodeAt(0));

  const decision = evaluateSigningChance(
    { weekly_wage: fa.weekly_wage as number, personality, village_id: fa.village_id as string | null, district: fa.district as string | null },
    { reputation: team.reputation as number, villageLat: team.latitude as number, villageLon: team.longitude as number, squadSize: squadCount?.cnt ?? 15, district: team.district as string | null },
    agentVillage,
    body.offeredWage,
    rng,
  );

  if (!decision.accepted) {
    // News about failed signing
    await createTransferNews(c.env.DB, team.league_id as string, teamId, "player_signed", {
      playerName: `${fa.first_name} ${fa.last_name}`,
      playerAge: fa.age as number,
      playerPosition: fa.position as string,
      teamName: team.name as string,
    }).catch((e) => logger.warn({ module: "transfers" }, "news for failed signing", e));
    return c.json({ success: false, decision });
  }

  // Create player from free agent
  const playerId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).bind(
    playerId, teamId, fa.first_name, fa.last_name, fa.nickname ?? null,
    fa.age, fa.position, fa.overall_rating,
    fa.skills, fa.physical, fa.personality, fa.life_context, fa.avatar,
    fa.hidden_talent ?? 0, body.offeredWage,
  ).run();

  // Create contract
  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>().catch((e) => { logger.warn({ module: "transfers" }, "fetch active season for signing", e); return null; });
  const contractId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'free_agent', 0, 1)"
  ).bind(contractId, playerId, teamId, season?.id ?? "unknown").run().catch((e) => logger.warn({ module: "transfers" }, "insert contract for signing", e));

  // Signing fee (registration)
  const signingFee = 500;
  const gameDate = (team.game_date as string) ?? new Date().toISOString();
  await recordTransaction(c.env.DB, teamId, "signing_fee", -signingFee, `Registrace: ${fa.first_name} ${fa.last_name}`, gameDate);

  // Remove from free agents
  await c.env.DB.prepare("DELETE FROM free_agents WHERE id = ?").bind(faId).run();

  // News
  await createTransferNews(c.env.DB, team.league_id as string, teamId, "player_signed", {
    playerName: `${fa.first_name} ${fa.last_name}`,
    playerAge: fa.age as number,
    playerPosition: fa.position as string,
    teamName: team.name as string,
  });

  return c.json({ success: true, decision, playerId });
});

// ═══ TRANSFER MARKET — VYSTAVENÍ ═══

transfersRouter.post("/teams/:teamId/players/:playerId/list", async (c) => {
  const teamId = c.req.param("teamId");
  const playerId = c.req.param("playerId");
  const body = await c.req.json<{ askingPrice: number }>();

  const player = await c.env.DB.prepare(
    "SELECT p.first_name, p.last_name, p.age, p.position, t.league_id, t.name as team_name FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ? AND p.team_id = ?"
  ).bind(playerId, teamId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, playerId, teamId, body.askingPrice, player.league_id, expiresAt.toISOString()).run();

  // News
  await createTransferNews(c.env.DB, player.league_id as string, teamId, "player_listed", {
    playerName: `${player.first_name} ${player.last_name}`,
    playerAge: player.age as number,
    playerPosition: player.position as string,
    teamName: player.team_name as string,
    fee: body.askingPrice,
  });

  return c.json({ ok: true, listingId: id });
});

transfersRouter.delete("/teams/:teamId/listings/:listingId", async (c) => {
  const teamId = c.req.param("teamId");
  const listingId = c.req.param("listingId");
  await c.env.DB.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE id = ? AND team_id = ?")
    .bind(listingId, teamId).run();
  // Also reject all pending bids
  await c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND status = 'pending'")
    .bind(listingId).run().catch((e) => logger.warn({ module: "transfers" }, "reject bids on listing withdrawal", e));
  return c.json({ ok: true });
});

// ═══ TRANSFER MARKET — PROHLÍŽENÍ ═══

transfersRouter.get("/teams/:teamId/market", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  // Listings from other teams in same league
  const listings = await c.env.DB.prepare(
    `SELECT tl.id, tl.player_id, tl.asking_price, tl.expires_at,
     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar,
     t.name as team_name
     FROM transfer_listings tl
     JOIN players p ON tl.player_id = p.id
     JOIN teams t ON tl.team_id = t.id
     WHERE tl.league_id = ? AND tl.status = 'active' AND tl.team_id != ?
     ORDER BY tl.created_at DESC`
  ).bind(team.league_id, teamId).all();

  // My listings with bids
  const myListings = await c.env.DB.prepare(
    `SELECT tl.id, tl.player_id, tl.asking_price, tl.expires_at,
     p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar
     FROM transfer_listings tl JOIN players p ON tl.player_id = p.id
     WHERE tl.team_id = ? AND tl.status = 'active'`
  ).bind(teamId).all();

  // Bids on my listings
  const myListingIds = myListings.results.map((l) => l.id as string);
  let bids: Record<string, unknown>[] = [];
  if (myListingIds.length > 0) {
    const bidsResult = await c.env.DB.prepare(
      `SELECT tb.*, t.name as bidder_name FROM transfer_bids tb JOIN teams t ON tb.team_id = t.id
       WHERE tb.listing_id IN (${myListingIds.map(() => "?").join(",")}) AND tb.status = 'pending'`
    ).bind(...myListingIds).all().catch((e) => { logger.warn({ module: "transfers" }, "fetch bids on my listings", e); return { results: [] }; });
    bids = bidsResult.results;
  }

  return c.json({
    listings: listings.results.map((l) => ({
      id: l.id, playerId: l.player_id, askingPrice: l.asking_price,
      playerName: `${l.first_name} ${l.last_name}`, playerAge: l.age, position: l.position,
      overallRating: l.overall_rating, teamName: l.team_name, expiresAt: l.expires_at,
      avatar: (() => { try { return JSON.parse(l.player_avatar as string); } catch (e) { logger.warn({ module: "transfers" }, `parse listing avatar: ${e}`); return {}; } })(),
    })),
    myListings: myListings.results.map((l) => ({
      id: l.id, playerId: l.player_id, askingPrice: l.asking_price,
      playerName: `${l.first_name} ${l.last_name}`, playerAge: l.age, position: l.position,
      overallRating: l.overall_rating, expiresAt: l.expires_at,
      avatar: (() => { try { return JSON.parse(l.player_avatar as string); } catch (e) { logger.warn({ module: "transfers" }, `parse myListing avatar: ${e}`); return {}; } })(),
      bids: bids.filter((b) => b.listing_id === l.id).map((b) => ({
        id: b.id, amount: b.amount, bidderName: b.bidder_name, teamId: b.team_id,
      })),
    })),
  });
});

// ═══ BIDY ═══

transfersRouter.post("/teams/:teamId/market/:listingId/bid", async (c) => {
  const teamId = c.req.param("teamId");
  const listingId = c.req.param("listingId");
  const body = await c.req.json<{ amount: number }>();

  const listing = await c.env.DB.prepare("SELECT * FROM transfer_listings WHERE id = ? AND status = 'active'")
    .bind(listingId).first<Record<string, unknown>>();
  if (!listing) return c.json({ error: "Inzerát nenalezen" }, 404);
  if (listing.team_id === teamId) return c.json({ error: "Nemůžeš bidovat na vlastního hráče" }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO transfer_bids (id, listing_id, team_id, amount) VALUES (?, ?, ?, ?)"
  ).bind(id, listingId, teamId, body.amount).run();

  return c.json({ ok: true, bidId: id });
});

transfersRouter.post("/teams/:teamId/bids/:bidId/accept", async (c) => {
  const teamId = c.req.param("teamId");
  const bidId = c.req.param("bidId");

  const bid = await c.env.DB.prepare(
    "SELECT tb.*, tl.player_id, tl.team_id as seller_team_id FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id WHERE tb.id = ? AND tl.team_id = ? AND tb.status = 'pending'"
  ).bind(bidId, teamId).first<Record<string, unknown>>();
  if (!bid) return c.json({ error: "Nabídka nenalezena" }, 404);

  const buyerTeamId = bid.team_id as string;
  const playerId = bid.player_id as string;
  const amount = bid.amount as number;

  // Check buyer budget
  const buyer = await c.env.DB.prepare("SELECT budget, name, game_date, league_id FROM teams WHERE id = ?")
    .bind(buyerTeamId).first<{ budget: number; name: string; game_date: string; league_id: string }>();
  if (!buyer) return c.json({ error: "Kupující nenalezen" }, 400);

  const seller = await c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; league_id: string }>();
  const player = await c.env.DB.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?")
    .bind(playerId).first<Record<string, unknown>>();

  const gameDate = buyer.game_date ?? new Date().toISOString();

  // Cross-league admin fee (15%)
  const isCrossLeague = seller?.league_id && buyer.league_id && seller.league_id !== buyer.league_id;
  const adminFee = isCrossLeague ? Math.round(amount * 0.20) : 0;
  const totalCost = amount + adminFee;

  if (buyer.budget < totalCost) {
    return c.json({ error: isCrossLeague ? `Nedostatek prostředků (cena ${amount} Kč + administrační poplatek ${adminFee} Kč)` : "Kupující nemá dostatek prostředků" }, 400);
  }

  // Transfer money
  await recordTransaction(c.env.DB, buyerTeamId, "transfer_fee", -amount, `Přestup: ${player?.first_name} ${player?.last_name}`, gameDate);
  if (adminFee > 0) {
    await recordTransaction(c.env.DB, buyerTeamId, "transfer_admin_fee", -adminFee, `Administrační poplatek za meziligový přestup`, gameDate);
  }
  await recordTransaction(c.env.DB, teamId, "transfer_income", amount, `Prodej: ${player?.first_name} ${player?.last_name}`, gameDate);

  // Transfer player
  await c.env.DB.prepare("UPDATE players SET team_id = ?, weekly_wage = ROUND(10 + (overall_rating / 100.0) * 400) WHERE id = ?")
    .bind(buyerTeamId, playerId).run();

  // Contracts
  await c.env.DB.prepare("UPDATE player_contracts SET leave_type = 'transfer', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1")
    .bind(playerId, teamId).run().catch((e) => logger.warn({ module: "transfers" }, "deactivate seller contract on bid accept", e));
  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "transfers" }, "fetch active season for bid accept", e); return null; });
  await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
    .bind(crypto.randomUUID(), playerId, buyerTeamId, season?.id ?? "unknown", amount).run().catch((e) => logger.warn({ module: "transfers" }, "insert buyer contract on bid accept", e));

  // Update listing + bids
  await c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ?").bind(bid.listing_id).run();
  await c.env.DB.prepare("UPDATE transfer_bids SET status = 'accepted' WHERE id = ?").bind(bidId).run();
  await c.env.DB.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND id != ? AND status = 'pending'")
    .bind(bid.listing_id, bidId).run().catch((e) => logger.warn({ module: "transfers" }, "reject other bids on accept", e));

  // News
  await createTransferNews(c.env.DB, seller?.league_id ?? "", null, "transfer_completed", {
    playerName: `${player?.first_name} ${player?.last_name}`,
    playerAge: player?.age as number,
    playerPosition: player?.position as string,
    teamName: seller?.name ?? "",
    fromTeamName: seller?.name,
    toTeamName: buyer.name,
    fee: amount,
  });

  return c.json({ ok: true });
});

transfersRouter.post("/teams/:teamId/bids/:bidId/reject", async (c) => {
  const teamId = c.req.param("teamId");
  const bidId = c.req.param("bidId");
  await c.env.DB.prepare(
    "UPDATE transfer_bids SET status = 'rejected' WHERE id = ? AND listing_id IN (SELECT id FROM transfer_listings WHERE team_id = ?)"
  ).bind(bidId, teamId).run();
  return c.json({ ok: true });
});

// ═══ NABÍDKY MEZI TÝMY ═══

transfersRouter.post("/teams/:teamId/offers", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ playerId: string; amount: number; message?: string }>();

  // Check player belongs to another human team
  const player = await c.env.DB.prepare(
    "SELECT p.*, t.user_id, t.name as team_name FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ?"
  ).bind(body.playerId).first<Record<string, unknown>>();
  if (!player) return c.json({ error: "Hráč nenalezen" }, 404);
  if (player.team_id === teamId) return c.json({ error: "Nemůžeš nabídnout na vlastního hráče" }, 400);
  if (player.user_id === "ai") return c.json({ error: "Nabídky lze posílat jen lidským týmům" }, 400);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, message, expires_at, last_action_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, body.playerId, teamId, player.team_id, body.amount, body.message ?? null, expiresAt.toISOString(), teamId).run();

  return c.json({ ok: true, offerId: id });
});

transfersRouter.get("/teams/:teamId/offers", async (c) => {
  const teamId = c.req.param("teamId");

  // Incoming offers (for my players) — include buyer's league for cross-league fee display
  const incoming = await c.env.DB.prepare(
    `SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.avatar as player_avatar,
     t.name as from_team_name, t.league_id as from_league_id
     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id JOIN teams t ON to2.from_team_id = t.id
     WHERE to2.to_team_id = ? AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC`
  ).bind(teamId).all();

  // Outgoing offers (from me) — include seller's league for cross-league fee display
  const myTeam = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string }>();
  const outgoing = await c.env.DB.prepare(
    `SELECT to2.*, p.first_name, p.last_name, p.age, p.position, p.avatar as player_avatar,
     t.name as to_team_name, t.league_id as to_league_id
     FROM transfer_offers to2 JOIN players p ON to2.player_id = p.id JOIN teams t ON to2.to_team_id = t.id
     WHERE to2.from_team_id = ? AND to2.status IN ('pending','countered') ORDER BY to2.created_at DESC`
  ).bind(teamId).all();

  // Přidat onTurn flag — true pokud jsem na tahu (poslední akce nebyla moje)
  const addOnTurn = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({ ...r, on_turn: r.last_action_by !== teamId }));

  return c.json({
    incoming: addOnTurn(incoming.results as Record<string, unknown>[]),
    outgoing: addOnTurn(outgoing.results as Record<string, unknown>[]),
    myLeagueId: myTeam?.league_id ?? null,
  });
});

transfersRouter.post("/teams/:teamId/offers/:offerId/accept", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");

  // Accept je povolen tomu kdo je na tahu — tj. NEUDĚLAL poslední akci
  // (původní from_team_id při pending, nebo to_team_id při counter-counter)
  const offer = await c.env.DB.prepare(
    "SELECT * FROM transfer_offers WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered') AND last_action_by != ?"
  ).bind(offerId, teamId, teamId, teamId).first<Record<string, unknown>>();
  if (!offer) return c.json({ error: "Nabídka nenalezena nebo nejsi na tahu" }, 404);

  // Kupující je vždy from_team_id (nemění se mezi counterama)
  const amount = (offer.counter_amount as number) ?? (offer.offer_amount as number);
  const buyerTeamId = offer.from_team_id as string;
  const sellerTeamId = offer.to_team_id as string;
  const playerId = offer.player_id as string;

  // Check buyer budget
  const buyer = await c.env.DB.prepare("SELECT budget, name, game_date, league_id FROM teams WHERE id = ?")
    .bind(buyerTeamId).first<{ budget: number; name: string; game_date: string; league_id: string }>();
  if (!buyer) return c.json({ error: "Kupující nenalezen" }, 400);

  const seller = await c.env.DB.prepare("SELECT name, league_id FROM teams WHERE id = ?").bind(sellerTeamId).first<{ name: string; league_id: string }>();
  const player = await c.env.DB.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const gameDate = buyer.game_date ?? new Date().toISOString();

  // Cross-league admin fee (15%)
  const isCrossLeague = seller?.league_id && buyer.league_id && seller.league_id !== buyer.league_id;
  const adminFee = isCrossLeague ? Math.round(amount * 0.20) : 0;
  const totalCost = amount + adminFee;

  if (buyer.budget < totalCost) {
    return c.json({ error: isCrossLeague ? `Nedostatek prostředků (cena ${amount} Kč + administrační poplatek ${adminFee} Kč)` : "Kupující nemá dostatek prostředků" }, 400);
  }

  // Transfer
  await recordTransaction(c.env.DB, buyerTeamId, "transfer_fee", -amount, `Přestup: ${player?.first_name} ${player?.last_name}`, gameDate);
  if (adminFee > 0) {
    await recordTransaction(c.env.DB, buyerTeamId, "transfer_admin_fee", -adminFee, `Administrační poplatek za meziligový přestup`, gameDate);
  }
  await recordTransaction(c.env.DB, sellerTeamId, "transfer_income", amount, `Prodej: ${player?.first_name} ${player?.last_name}`, gameDate);
  await c.env.DB.prepare("UPDATE players SET team_id = ? WHERE id = ?").bind(buyerTeamId, playerId).run();

  // Contracts
  await c.env.DB.prepare("UPDATE player_contracts SET leave_type = 'transfer', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1")
    .bind(playerId, sellerTeamId).run().catch((e) => logger.warn({ module: "transfers" }, "deactivate seller contract on offer accept", e));
  const season = await c.env.DB.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "transfers" }, "fetch active season for offer accept", e); return null; });
  await c.env.DB.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
    .bind(crypto.randomUUID(), playerId, buyerTeamId, season?.id ?? "unknown", amount).run().catch((e) => logger.warn({ module: "transfers" }, "insert buyer contract on offer accept", e));

  // Update offer + any listings
  await c.env.DB.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId).run();
  await c.env.DB.prepare("UPDATE transfer_listings SET status = 'sold' WHERE player_id = ? AND status = 'active'").bind(playerId).run().catch((e) => logger.warn({ module: "transfers" }, "mark listings sold on offer accept", e));

  // News
  await createTransferNews(c.env.DB, seller?.league_id ?? "", null, "transfer_completed", {
    playerName: `${player?.first_name} ${player?.last_name}`,
    playerAge: player?.age as number,
    playerPosition: player?.position as string,
    teamName: seller?.name ?? "",
    fromTeamName: seller?.name,
    toTeamName: buyer.name,
    fee: amount,
  });

  // transfer notifikace oběma stranám
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
    const pName = `${player?.first_name} ${player?.last_name}`;
    await createNotification(c.env.DB, buyerTeamId, "transfer", `✅ Přestup ${pName} dokončen`, `Koupili jste od ${seller?.name ?? "prodávajícího"} za ${amount.toLocaleString("cs-CZ")} Kč.`, "/dashboard/transfers", pushEnv);
    await createNotification(c.env.DB, sellerTeamId, "transfer", `✅ Prodej ${pName} dokončen`, `${buyer.name} zaplatil ${amount.toLocaleString("cs-CZ")} Kč.`, "/dashboard/transfers", pushEnv);
  } catch (e) { logger.warn({ module: "transfers" }, "transfer accept notifications", e); }

  return c.json({ ok: true });
});

transfersRouter.post("/teams/:teamId/offers/:offerId/reject", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  const body = await c.req.json<{ message?: string }>().catch((e) => { logger.warn({ module: "transfers" }, "parse reject body", e); return {}; });

  // Načteme nabídku pro notifikaci druhé strany
  const offerForNotif = await c.env.DB.prepare(
    "SELECT from_team_id, to_team_id, player_id FROM transfer_offers WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered') AND last_action_by != ?"
  ).bind(offerId, teamId, teamId, teamId).first<{ from_team_id: string; to_team_id: string; player_id: string }>()
    .catch((e) => { logger.warn({ module: "transfers" }, "fetch offer for reject notif", e); return null; });

  // Reject může ten kdo je na tahu — tj. neudělal poslední akci
  await c.env.DB.prepare(
    "UPDATE transfer_offers SET status = 'rejected', reject_message = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered') AND last_action_by != ?"
  ).bind((body as { message?: string }).message ?? null, offerId, teamId, teamId, teamId).run();

  // Notifikace druhé straně
  if (offerForNotif) {
    try {
      const { createNotification } = await import("../community/notifications");
      const pushEnv = { VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: c.env.VAPID_SUBJECT, DB: c.env.DB };
      const otherTeamId = offerForNotif.from_team_id === teamId ? offerForNotif.to_team_id : offerForNotif.from_team_id;
      const playerRow = await c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(offerForNotif.player_id).first<{ first_name: string; last_name: string }>().catch((e) => { logger.warn({ module: "transfers" }, "fetch player for reject notif", e); return null; });
      const pName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "hráče";
      await createNotification(c.env.DB, otherTeamId, "transfer", `❌ Nabídka za ${pName} zamítnuta`, "Druhá strana odmítla nabídku.", "/dashboard/transfers", pushEnv);
    } catch (e) { logger.warn({ module: "transfers" }, "transfer reject notification", e); }
  }

  return c.json({ ok: true });
});

transfersRouter.post("/teams/:teamId/offers/:offerId/counter", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  const body = await c.req.json<{ amount: number }>();
  // Counter může ten kdo je na tahu; nastaví last_action_by na sebe
  await c.env.DB.prepare(
    "UPDATE transfer_offers SET status = 'countered', counter_amount = ?, last_action_by = ? WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered') AND last_action_by != ?"
  ).bind(body.amount, teamId, offerId, teamId, teamId, teamId).run();
  return c.json({ ok: true });
});

transfersRouter.delete("/teams/:teamId/offers/:offerId", async (c) => {
  const teamId = c.req.param("teamId");
  const offerId = c.req.param("offerId");
  // Stáhnout může kdokoliv v nabídce, pokud ještě není vyřešená
  await c.env.DB.prepare(
    "UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND (from_team_id = ? OR to_team_id = ?) AND status IN ('pending','countered')"
  ).bind(offerId, teamId, teamId).run();
  return c.json({ ok: true });
});

export default transfersRouter;
