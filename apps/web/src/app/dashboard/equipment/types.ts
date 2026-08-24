import type { LockDetailData } from "@/components/ui";

export interface CategoryInfo {
  key: string; label: string; level: number; condition: number; effectiveLevel: number; description: string;
}

export interface UpgradeOption {
  category: string; label: string; currentLevel: number; nextLevel: number; cost: number;
  effect: string; description: string; locked: boolean;
  lockReason?: string; lockDetail?: LockDetailData; lockHint?: string;
}

export interface RepairOption {
  category: string; label: string; level: number; condition: number; cost: number;
}

/** Co můžu s kategorií udělat, když ji vlastním — ceny počítá server. */
export interface SellOption {
  category: string; label: string; level: number; condition: number;
  invested: number;
  pawnQuote: number;
  bazarMin: number; bazarSuggested: number; bazarMax: number;
  /** 0 = stav je dost dobrý, opravovat není co. */
  repairCost: number;
  /** Vyplněné, jen když kategorie zrovna visí v bazaru. */
  listingId: string | null; listedPrice: number | null; listedUntil: string | null;
}

export interface EquipmentEffects {
  trainingMultiplier: number; tacticsTrainingBonus: number; matchTechniqueMod: number; moraleMod: number;
  injurySeverityMod: number; conditionDrainMod: number; teamChemistryMod: number; gkBonus: number;
  injuryDaysReduction?: number; commuteAbsenceMod?: number; attendanceBonus?: number; conditionRegenBonus?: number;
  setPiecesMod?: number; moraleTargetBonus?: number; crowdMod?: number; weatherResistMod?: number; youthTrainingMod?: number;
  equipCareMod?: number; pitchCareMod?: number; pitchHeatingMod?: number; pitchIrrigationMod?: number; hangoverMod?: number;
  lateFatigueMod?: number; raffleIncomePerFan?: number; fanSatisfactionMod?: number; loyaltyMod?: number;
}

export interface EquipmentData {
  categories: CategoryInfo[];
  upgrades: UpgradeOption[];
  repairs: RepairOption[];
  effects: EquipmentEffects;
  sellOptions: SellOption[];
}

export interface BazarListing {
  id: string;
  /** null = virtuální klub ze sousedního okresu, nemá stránku týmu. */
  teamId: string | null;
  teamName: string;
  isAiListing: boolean;
  category: string; categoryLabel: string;
  level: number; levelDescription: string; effect: string;
  /** Živý stav prodávajícího — vybavení mu chátrá dál, dokud se neprodá. */
  condition: number; conditionAtListing: number;
  price: number; expiresAt: string;
  myLevel: number; shopPrice: number; savings: number; repairCostAfterBuy: number;
  canBuy: boolean; blockReason: string | null; lockDetail: LockDetailData | null;
}

export interface MyListing {
  id: string; category: string; categoryLabel: string; level: number;
  price: number; condition: number; conditionAtListing: number; expiresAt: string;
}

export interface SoldRecord {
  category: string; categoryLabel: string; level: number; status: string;
  soldPrice: number | null; soldCondition: number | null;
  resolvedAt: string | null; buyerName: string | null;
}

export interface BazarData {
  listings: BazarListing[];
  myListings: MyListing[];
  history: SoldRecord[];
}

export const EQUIPMENT_ICONS: Record<string, string> = {
  balls: "⚽", jerseys: "👕", training_cones: "🔶", first_aid: "🩺",
  boots_stock: "👟", bibs: "🎽", goalkeeper_gear: "🧤", water_bottles: "🫗", tactics_board: "📋",
  team_van: "🚐", gym_corner: "💪", training_wall: "🧱", club_grill: "🍖",
  fan_drums: "📣", winter_gear: "🧥", video_setup: "📹",
  laundry: "🧺", mower: "🚜", pitch_heating: "🔥", pitch_irrigation: "💧", coffee_maker: "☕",
  sports_drinks: "🥤", raffle: "🎟", pa_system: "🎙", trophy_case: "🏆",
};

export function formatCZK(v: number): string {
  return v.toLocaleString("cs") + " Kč";
}

export function condColor(c: number): string {
  if (c >= 80) return "text-pitch-500";
  if (c >= 50) return "text-gold-600";
  return "text-card-red";
}

export function condBarColor(c: number): string {
  if (c >= 80) return "bg-pitch-400";
  if (c >= 50) return "bg-gold-500";
  return "bg-card-red";
}

/** „za 4 dny" — inzeráty běží v reálném čase, ne herním. */
export function daysLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "vypršel";
  const days = Math.ceil(ms / 86_400_000);
  if (days === 1) return "vyprší zítra";
  return `vyprší za ${days} ${days < 5 ? "dny" : "dní"}`;
}
