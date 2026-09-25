/** Firmy v okrese: filtr a řazení na klientu nad daty z GET /api/teams/:teamId/sponsor-owners. */
import type { DistrictFirm, SponsorsData } from "./sponsor-page-types";
import { sponsorTypeLabel } from "./sponsor-types";

export type FirmFilter = "free" | "taken" | "mine" | "all";
export type FirmSort = "favor" | "budget" | "type";

export const FIRM_FILTERS: ReadonlyArray<{ key: FirmFilter; label: string }> = [
  { key: "free", label: "Volné" },
  { key: "taken", label: "Obsazené" },
  { key: "mine", label: "Moje" },
  { key: "all", label: "Vše" },
];

export const FIRM_SORTS: ReadonlyArray<{ key: FirmSort; label: string }> = [
  { key: "favor", label: "Náklonnost" },
  { key: "budget", label: "Rozpočet" },
  { key: "type", label: "Obor" },
];

/** Firmy, se kterými máme aktivní smlouvu jakékoli kategorie (hlavní, stadion, banner). */
export function mySponsorIdsOf(data: SponsorsData): Set<number> {
  const ids = [data.mainContract?.sponsorId, data.stadiumContract?.sponsorId, ...data.bannerContracts.map((c) => c.sponsorId)];
  return new Set(ids.filter((id): id is number => id != null));
}

/**
 * Volné = nikdo je nemá jako hlavního sponzora. Obsazené = hlavní sponzor jiného klubu.
 * Moje = náš hlavní sponzor nebo jakákoli naše aktivní smlouva.
 */
export function filterFirms(firms: DistrictFirm[], filter: FirmFilter, mySponsorIds: ReadonlySet<number>): DistrictFirm[] {
  switch (filter) {
    case "free": return firms.filter((f) => f.mainHolder === null);
    case "taken": return firms.filter((f) => f.mainHolder !== null && !f.isMine);
    case "mine": return firms.filter((f) => f.isMine || mySponsorIds.has(f.sponsorId));
    case "all": return firms;
  }
}

/** Náklonnost a rozpočet sestupně, obor abecedně; při shodě podle názvu. Nemění vstupní pole. */
export function sortFirms(firms: DistrictFirm[], sort: FirmSort): DistrictFirm[] {
  const byName = (a: DistrictFirm, b: DistrictFirm) => a.name.localeCompare(b.name, "cs");
  const copy = [...firms];
  if (sort === "favor") return copy.sort((a, b) => b.favor - a.favor || byName(a, b));
  if (sort === "budget") return copy.sort((a, b) => b.budgetEstimate.cap.high - a.budgetEstimate.cap.high || byName(a, b));
  return copy.sort((a, b) => sponsorTypeLabel(a.type).localeCompare(sponsorTypeLabel(b.type), "cs") || byName(a, b));
}
