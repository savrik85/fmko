/**
 * Skauting a jednání s cizími kluby (spec 2026-10-04). Sdílené pro API i web, aby formulář
 * ukazoval stejné cestovné, jaké server strhne, a stavy se jmenovaly všude stejně.
 */

/**
 * Okruhy, kam skaut jezdí, a týdenní cestovné. 100 Kč za kilometr okruhu za týden je odhad
 * ukotvený cenou fanbusu (1 200–3 500 Kč za výjezd), ne číslo z dat.
 */
export const SCOUT_RADIUS_TIERS = [
  { km: 15, label: "Okolí do 15 km", weeklyCost: 1500 },
  { km: 30, label: "Do 30 km", weeklyCost: 3000 },
  { km: 50, label: "Do 50 km", weeklyCost: 5000 },
] as const;

export type ScoutRadiusKm = typeof SCOUT_RADIUS_TIERS[number]["km"];

/** Jak dlouho skaut na úkolu jezdí (počet pracovních pondělí). */
export const SCOUT_WEEKS_OPTIONS = [2, 4, 8] as const;

export const SCOUT_AGE_MIN = 16;
export const SCOUT_AGE_MAX = 36;
/**
 * Úkol jen na hráče do tohoto věku = režim mladých: skaut je hlásí podle odhadu potenciálu,
 * ne podle dnešního hodnocení.
 */
export const SCOUT_YOUTH_AGE_MAX = 21;

export const SCOUT_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type ScoutPosition = typeof SCOUT_POSITIONS[number];

export const SCOUT_POSITION_LABELS: Record<ScoutPosition, string> = {
  GK: "Brankář", DEF: "Obránce", MID: "Záložník", FWD: "Útočník",
};

export function scoutWeeklyCost(radiusKm: number): number | null {
  return SCOUT_RADIUS_TIERS.find((t) => t.km === radiusKm)?.weeklyCost ?? null;
}

export function isYouthScoutTask(ageMax: number): boolean {
  return ageMax <= SCOUT_YOUTH_AGE_MAX;
}

export type ScoutReportSource = "village_club" | "free_agent";
export type ScoutReportStatus =
  | "active" | "negotiating" | "signed" | "gone" | "expired" | "refused" | "closed" | "dismissed";

export const SCOUT_REPORT_STATUS_LABELS: Record<ScoutReportStatus, string> = {
  active: "K mání",
  negotiating: "Jedná se",
  signed: "Podepsal",
  gone: "Sebral ho jiný",
  expired: "Prošlé",
  refused: "Odmítl",
  closed: "Klub nejedná",
  dismissed: "Nezajímá",
};

/** Postoj klubu k prodeji: inzerát = sám prodává, jinak ho klubu vyfukuješ. */
export type AiSellerStance = "listed" | "poached";

export type AiNegotiationStatus =
  | "open" | "agreed" | "signed" | "refused" | "broken_off" | "withdrawn" | "expired";

export const AI_NEGOTIATION_STATUS_LABELS: Record<AiNegotiationStatus, string> = {
  open: "Jedná se",
  agreed: "Klub souhlasí",
  signed: "Podepsal",
  refused: "Hráč odmítl",
  broken_off: "Klub ukončil jednání",
  withdrawn: "Staženo",
  expired: "Vypršelo",
};

export type AiNegotiationEventType =
  | "offer" | "counter" | "agree" | "break_off" | "withdraw" | "expire" | "sign" | "refuse";

/** Ochota hráče přejít (0–3), stejná škála jako zájem hráče u nabídek. */
export const SCOUT_WILLINGNESS_LABELS = ["Nechce se mu", "Váhá", "Zvažuje to", "Přišel by rád"] as const;

export function willingnessFromChance(probability: number): 0 | 1 | 2 | 3 {
  if (probability >= 70) return 3;
  if (probability >= 50) return 2;
  if (probability >= 30) return 1;
  return 0;
}

/**
 * Maximální počet skautů, které klub může zaměstnávat, podle licence hlavního trenéra.
 * Základ = 2 skauti (i bez licence), UEFA B = 3, UEFA A = 4, UEFA Pro = 5.
 */
export function maxScoutsForLicence(licenceLevel: number): number {
  if (licenceLevel >= 4) return 5;
  if (licenceLevel >= 3) return 4;
  if (licenceLevel >= 2) return 3;
  return 2;
}

export type ScoutAssignmentType = "area" | "player" | "match";

export const SCOUT_ASSIGNMENT_TYPE_LABELS: Record<ScoutAssignmentType, string> = {
  area: "Oblastní hledání",
  player: "Sledování hráče",
  match: "Skauting soupeře",
};

