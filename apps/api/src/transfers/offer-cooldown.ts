/**
 * Kdy smí kupec na stejného hráče nabídnout znovu.
 *
 * Odmítnutá nabídka kazí náladu hráči, který chtěl odejít, proto jde další nabídka
 * na stejného hráče až po deseti dnech. Jinak by šlo soupeři rozkládat kádr spamem.
 *
 * Blokuje jen konec, který kupec nezpůsobil: odmítnutí, ukončení jednání prodávajícím
 * a mlčení prodávajícího do konce lhůty. Kupec, který svou nabídku stáhl nebo nechal
 * propadnout protinávrh, hráči nijak neublížil a může nabídnout hned znovu. Stejně tak
 * nabídka, kterou uklidil systém (hráč mezitím odešel), stažení kupce nemá.
 */

export const OFFER_RETRY_COOLDOWN_DAYS = 10;

const DAY_MS = 86_400_000;

export type RetryBlockReason = "rejected" | "ended_by_seller" | "seller_silent";

export interface OfferRetryBlock {
  daysLeft: number;
  reason: RetryBlockReason;
}

interface ClosedOfferRow {
  status: string;
  resolved_at: string | null;
  to_team_id: string;
  /** Klub (A-tým), který udělal poslední tah. */
  last_action_club: string | null;
  /** Klub (A-tým), který nabídku stáhl nebo jednání ukončil; bez záznamu systém. */
  withdrawn_by_club: string | null;
}

function retryBlockReason(row: ClosedOfferRow, buyerClubTeamId: string): RetryBlockReason | null {
  if (row.status === "rejected") return "rejected";
  if (row.status === "withdrawn") {
    return row.withdrawn_by_club != null && row.withdrawn_by_club !== buyerClubTeamId ? "ended_by_seller" : null;
  }
  if (row.status === "expired") {
    // Propadla, protože neodpověděl ten, kdo byl na tahu. Po tahu kupce byl na tahu prodávající.
    // Staré nabídky bez záznamu tahu se počítají jako mlčení prodávajícího, jako dřív.
    return row.last_action_club == null || row.last_action_club === buyerClubTeamId ? "seller_silent" : null;
  }
  return null;
}

/**
 * Vede klub (soupisku) AI trenér? `SELECT *`, ať dotaz funguje i nad databází bez sloupce
 * `user_id` (starší testovací schémata); bez něj se klub bere jako lidský, jako dřív.
 */
async function isAiClub(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first<Record<string, unknown>>();
  return row?.user_id === "ai";
}

/** Blokace další nabídky klubu na hráče, nebo `null`, když nabídnout jde hned. */
export async function offerRetryBlock(
  db: D1Database,
  playerId: string,
  buyerClubTeamId: string,
  now: Date = new Date(),
): Promise<OfferRetryBlock | null> {
  const since = new Date(now.getTime() - OFFER_RETRY_COOLDOWN_DAYS * DAY_MS).toISOString();
  const rows = await db.prepare(
    `SELECT o.status, o.resolved_at, o.to_team_id,
            COALESCE(la.parent_team_id, la.id, o.last_action_by) AS last_action_club,
            (SELECT COALESCE(wt.parent_team_id, wt.id, e.team_id)
               FROM transfer_offer_events e
               LEFT JOIN teams wt ON wt.id = e.team_id
              WHERE e.offer_id = o.id AND e.event_type = 'withdraw'
              ORDER BY e.created_at DESC LIMIT 1) AS withdrawn_by_club
       FROM transfer_offers o
       LEFT JOIN teams la ON la.id = o.last_action_by
      WHERE o.player_id = ?
        AND o.from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
        AND o.status IN ('rejected', 'expired', 'withdrawn')
        AND o.resolved_at > ?
      ORDER BY o.resolved_at DESC`,
  ).bind(playerId, buyerClubTeamId, buyerClubTeamId, since).all<ClosedOfferRow>();

  // Řádky jdou od nejnovějšího, první blokující konec proto blokuje nejdéle.
  for (const row of rows.results) {
    const reason = retryBlockReason(row, buyerClubTeamId);
    if (!reason || !row.resolved_at) continue;
    // AI klub mlčel (výpadek, režim nanečisto): kupec za to nemůže a hráč AI klubu se nezlobí.
    if (reason === "seller_silent" && await isAiClub(db, row.to_team_id)) continue;
    const unblockAt = new Date(row.resolved_at).getTime() + OFFER_RETRY_COOLDOWN_DAYS * DAY_MS;
    return { daysLeft: Math.max(1, Math.ceil((unblockAt - now.getTime()) / DAY_MS)), reason };
  }
  return null;
}

function daysWord(n: number): string {
  return n === 1 ? "den" : n < 5 ? "dny" : "dní";
}

/** Věta pro kupce: proč teď nabídnout nejde a za jak dlouho půjde. */
export function offerRetryBlockMessage(block: OfferRetryBlock): string {
  const wait = `Novou nabídku můžeš poslat za ${block.daysLeft} ${daysWord(block.daysLeft)}.`;
  switch (block.reason) {
    case "rejected": return `Prodávající tvou nabídku na tohoto hráče odmítl. ${wait}`;
    case "ended_by_seller": return `Prodávající s tebou jednání o tomhle hráči ukončil. ${wait}`;
    case "seller_silent": return `Prodávající na tvou nabídku neodpověděl a propadla. ${wait}`;
  }
}
