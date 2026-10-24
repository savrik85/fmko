/**
 * Data pro odznaky v menu. Web se na ně ptá při změně stránky a každou minutu,
 * takže tu nesmí být nic navíc. Plné `GET /teams/:teamId/offers` (game.ts) dělá
 * dvanáct dotazů za sebou a k tomu tři až čtyři na každou nabídku (poplatky), a když
 * je v 18:00 databáze vytížená zápasovým kolem, bylo to nejčastější pětistovkou.
 *
 * Odznak nabídek počítá web (`getUnseenOffersCount` v apps/web/src/lib/seen-offers.ts).
 * Potřebuje jen `on_turn` a otisk nabídky: id, stav, částku a kdo táhl naposled.
 * Hodnoty se proto počítají stejně jako v plném přehledu. Kdyby se otisk lišil od toho,
 * co stránka Přestupy označí jako viděné, svítil by odznak i po zhlédnutí nabídek.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireOwnedTeamRead } from "../auth/middleware";
import { resolveClubTeamId } from "../transfers/offer-club-scope";

export const menuBadgesRouter = new Hono<{ Bindings: Bindings }>();

interface OfferBadgeRow {
  id: string;
  status: string;
  offer_amount: number;
  counter_amount: number | null;
  last_action_club_id: string | null;
}

interface BidBadgeRow {
  id: string;
  status: string;
  amount: number;
  counter_amount: number | null;
  last_action_by: string | null;
}

type Role = "buyer" | "seller";

/** Soupisky klubu: A-tým a jeho U21. */
const CLUB_SQUADS = "SELECT id FROM teams WHERE id = ? OR parent_team_id = ?";

/** `last_action_by` drží soupisku (i U21), tah se ale počítá za klub. */
const OFFER_COLUMNS = `o.id, o.status, o.offer_amount, o.counter_amount,
  COALESCE((SELECT COALESCE(la.parent_team_id, la.id) FROM teams la WHERE la.id = o.last_action_by), o.last_action_by)
    AS last_action_club_id`;

const BID_COLUMNS = "b.id, b.status, b.amount, b.counter_amount, b.last_action_by";

/**
 * Na tahu je klub, pokud poslední akce nebyla jeho. Starší nabídky bez `last_action_by`:
 * u čekající je na tahu prodávající, u protinabídky kupující.
 */
function offerOnTurn(row: OfferBadgeRow, clubTeamId: string, role: Role): boolean {
  if (row.last_action_club_id != null) return row.last_action_club_id !== clubTeamId;
  return row.status === "pending" ? role === "seller" : role === "buyer";
}

/** Bidy z trhu: tah podle soupisky, u starých bez `last_action_by` je na tahu prodávající. */
function bidOnTurn(row: BidBadgeRow, teamId: string, role: Role): boolean {
  if (row.last_action_by != null) return row.last_action_by !== teamId;
  return role === "seller";
}

// GET /api/teams/:teamId/menu-badges/offers — aktivní nabídky jen s poli pro odznak.
// Stejné výběry (JOINy, stavy) jako GET /teams/:teamId/offers, aby se počty shodovaly.
menuBadgesRouter.get("/teams/:teamId/menu-badges/offers", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await requireOwnedTeamRead(c, teamId);
  if (denied) return denied;
  const db = c.env.DB;
  const clubTeamId = await resolveClubTeamId(db, teamId) ?? teamId;

  // Jeden balík místo čtyř dotazů za sebou. Chybu nechytáme: web při ní nechá odznak,
  // jak byl, kdežto prázdný seznam by odznak tiše zhasnul.
  const [incoming, outgoing, incomingBids, outgoingBids] = await db.batch([
    db.prepare(
      `SELECT ${OFFER_COLUMNS}
         FROM transfer_offers o JOIN players p ON p.id = o.player_id
        WHERE o.to_team_id IN (${CLUB_SQUADS}) AND o.status IN ('pending','countered')`,
    ).bind(clubTeamId, clubTeamId),
    db.prepare(
      `SELECT ${OFFER_COLUMNS}
         FROM transfer_offers o JOIN players p ON p.id = o.player_id JOIN teams t ON t.id = o.to_team_id
        WHERE o.from_team_id IN (${CLUB_SQUADS}) AND o.status IN ('pending','countered')`,
    ).bind(clubTeamId, clubTeamId),
    db.prepare(
      `SELECT ${BID_COLUMNS}
         FROM transfer_bids b
         JOIN transfer_listings l ON l.id = b.listing_id
         JOIN players p ON p.id = l.player_id
         JOIN teams t ON t.id = b.team_id
        WHERE l.team_id = ? AND b.status IN ('pending','countered') AND l.status = 'active'`,
    ).bind(teamId),
    db.prepare(
      `SELECT ${BID_COLUMNS}
         FROM transfer_bids b
         JOIN transfer_listings l ON l.id = b.listing_id
         JOIN players p ON p.id = l.player_id
         JOIN teams t ON t.id = l.team_id
        WHERE b.team_id = ? AND b.status IN ('pending','countered') AND l.status = 'active'`,
    ).bind(teamId),
  ]);

  const offers = (rows: unknown[], role: Role) =>
    (rows as OfferBadgeRow[]).map((r) => ({ ...r, on_turn: offerOnTurn(r, clubTeamId, role) }));
  const bids = (rows: unknown[], role: Role) =>
    (rows as BidBadgeRow[]).map((r) => ({ ...r, on_turn: bidOnTurn(r, teamId, role) }));

  return c.json({
    incoming: offers(incoming.results, "seller"),
    outgoing: offers(outgoing.results, "buyer"),
    incomingBids: bids(incomingBids.results, "seller"),
    outgoingBids: bids(outgoingBids.results, "buyer"),
  });
});
