/** Typy stránky /sponzori. Tvar drží API: routes/game.ts (smlouvy, nabídky) a routes/sponsors.ts (firmy, přehled, historie). */

export type SponsorCategory = "main" | "stadium" | "banner";

export interface ActiveContract {
  id: string;
  category: SponsorCategory;
  sponsorId: number | null;
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasonsTotal: number;
  seasonsRemaining: number;
  earlyTerminationFee: number;
  isNamingRights: boolean;
  signedAt: string;
  renewal?: { monthlyAmount: number; winBonus: number; seasons: number; earlyTerminationFee: number } | null;
  /** Proč hlavního sponzora nejde prodloužit/obnovit (je hlavním jinde nebo dal přednost jinému klubu). */
  blockedReason?: string | null;
}

export interface SponsorOffer {
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasons: number;
  earlyTerminationFee: number;
  requirement?: string;
}

export interface SponsorsData {
  mainContract: ActiveContract | null;
  stadiumContract: ActiveContract | null;
  mainExpired?: ActiveContract | null;
  stadiumExpired?: ActiveContract | null;
  bannerContracts: ActiveContract[];
  stadiumName: string | null;
  teamName: string;
  mainOffers: SponsorOffer[];
  stadiumOffers: SponsorOffer[];
  bannerOffers: SponsorOffer[];
  maxBanners: number;
  canChangeMainSponsor: boolean;
  season: number;
}

export interface DistrictFirm {
  sponsorId: number;
  name: string;
  type: string;
  owner: { firstName: string; lastName: string; personality: string } | null;
  favor: number;
  budgetEstimate: { low: number; high: number };
  mainHolder: { teamId: string; teamName: string } | null;
  isMine: boolean;
}

export interface PubEncounter {
  id: string;
  sponsorId: number;
  sponsorName: string;
  ownerName: string;
  personality: string;
  beerCost: number;
}
