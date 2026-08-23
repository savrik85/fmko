/**
 * Nabídka si v `from_team_id` / `to_team_id` drží konkrétní soupisku. U U21 je
 * ale trenér, rozpočet i rozhodovací pravomoc na mateřském A-týmu. Tento helper
 * odděluje ID soupisky od ID klubu, aby všechny offer endpointy používaly
 * stejnou autorizaci a stejné pořadí tahů.
 */

export interface TransferOfferTeamRefs {
  from_team_id?: unknown;
  to_team_id?: unknown;
  last_action_by?: unknown;
  status?: unknown;
}

export interface OfferClubScope {
  actorTeamId: string;
  actorClubTeamId: string;
  buyerSquadTeamId: string;
  buyerClubTeamId: string;
  sellerSquadTeamId: string;
  sellerClubTeamId: string;
  lastActionClubTeamId: string | null;
  role: "buyer" | "seller" | null;
  onTurn: boolean;
}

interface TeamScopeRow {
  id: string;
  club_team_id: string;
}

const VIRTUAL_TEAM_ID = "virtual_ai";

/** Vrátí mateřský A-tým; u seniora vrátí jeho vlastní ID. */
export async function resolveClubTeamId(db: D1Database, teamId: string): Promise<string | null> {
  if (teamId === VIRTUAL_TEAM_ID) return VIRTUAL_TEAM_ID;
  const row = await db.prepare(
    "SELECT COALESCE(parent_team_id, id) AS club_team_id FROM teams WHERE id = ?",
  ).bind(teamId).first<{ club_team_id: string }>();
  return row?.club_team_id ?? null;
}

/**
 * Vyřeší obě strany nabídky vůči klubu přihlášeného trenéra.
 *
 * Raw squad ID zůstávají k dispozici pro přesun hráče a kontrakty. Club ID se
 * používají pro oprávnění, tah, finance, události, trenéry a notifikace.
 */
export async function resolveOfferClubScope(
  db: D1Database,
  actorTeamId: string,
  offer: TransferOfferTeamRefs,
): Promise<OfferClubScope | null> {
  const buyerSquadTeamId = String(offer.from_team_id ?? "");
  const sellerSquadTeamId = String(offer.to_team_id ?? "");
  if (!buyerSquadTeamId || !sellerSquadTeamId) return null;

  const rawLastAction = offer.last_action_by == null ? null : String(offer.last_action_by);
  const ids = Array.from(new Set(
    [actorTeamId, buyerSquadTeamId, sellerSquadTeamId, rawLastAction]
      .filter((id): id is string => !!id && id !== VIRTUAL_TEAM_ID),
  ));

  const roots = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await db.prepare(
      `SELECT id, COALESCE(parent_team_id, id) AS club_team_id
       FROM teams WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ).bind(...ids).all<TeamScopeRow>();
    for (const row of rows.results) roots.set(row.id, row.club_team_id);
  }

  const actorClubTeamId = roots.get(actorTeamId);
  if (!actorClubTeamId) return null;

  const buyerClubTeamId = buyerSquadTeamId === VIRTUAL_TEAM_ID
    ? VIRTUAL_TEAM_ID
    : (roots.get(buyerSquadTeamId) ?? buyerSquadTeamId);
  const sellerClubTeamId = roots.get(sellerSquadTeamId) ?? sellerSquadTeamId;
  const lastActionClubTeamId = rawLastAction == null
    ? null
    : rawLastAction === VIRTUAL_TEAM_ID
      ? VIRTUAL_TEAM_ID
      : (roots.get(rawLastAction) ?? rawLastAction);

  const role = actorClubTeamId === buyerClubTeamId
    ? "buyer"
    : actorClubTeamId === sellerClubTeamId
      ? "seller"
      : null;

  const status = String(offer.status ?? "");
  const onTurn = role !== null && (lastActionClubTeamId != null
    ? lastActionClubTeamId !== actorClubTeamId
    : status === "pending"
      ? role === "seller"
      : status === "countered" && role === "buyer");

  return {
    actorTeamId,
    actorClubTeamId,
    buyerSquadTeamId,
    buyerClubTeamId,
    sellerSquadTeamId,
    sellerClubTeamId,
    lastActionClubTeamId,
    role,
    onTurn,
  };
}
