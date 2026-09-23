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
  /** Hlavní sponzor a stadion: dá se už jednat o prodloužení (poslední sezóna nebo vypršelá smlouva). */
  renewable?: boolean;
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
  bannerOffers: SponsorOffer[];
  maxBanners: number;
  canChangeMainSponsor: boolean;
  season: number;
  /** Běžící jednání s firmami (otevřená nebo přijatá, čekající na podpis). */
  negotiations: Array<{ id: string; sponsorId: number; sponsorName: string; category: "main" | "stadium"; status: "open" | "accepted"; expiresGameDate: string }>;
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

/** Pásma náklonnosti; hranice drží API (apps/api/src/sponsors/overview.ts) i favorLabel. */
export type FavorBand = "loves" | "friendly" | "neutral" | "cold" | "hostile";

export interface FirmFavorItem { sponsorId: number; name: string; ownerName: string | null; favor: number }

export interface FavorChange {
  sponsorId: number;
  sponsorName: string;
  ownerName: string | null;
  delta: number;
  reason: string;
  gameDate: string;
}

export interface SponsorOverview {
  avgFavor: number | null;
  rank: number | null;
  clubsInDistrict: number;
  firmsCount: number;
  bands: Record<FavorBand, number>;
  top: FirmFavorItem[];
  coldest: FirmFavorItem[];
  recentChanges: FavorChange[];
}

/** Skončená smlouva. Celkový výdělek API nevrací (sponzorské příjmy se v transakcích neevidují po sponzorech). */
export interface SponsorHistoryItem {
  id: string;
  sponsorId: number | null;
  sponsorName: string;
  category: SponsorCategory;
  status: "expired" | "terminated";
  seasonsTotal: number;
  monthlyAmount: number;
  /** Sezóna podpisu odvozená z data podpisu; null, když sezóny chybí. */
  signedSeason: number | null;
}
