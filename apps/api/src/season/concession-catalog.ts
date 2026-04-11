/**
 * Katalog produktů pro vlastní provoz občerstvení (self concession mode).
 * Wholesale ceny, quality tiery, spotřební koeficienty.
 *
 * Každý produkt má 3 quality levely. Level určuje:
 * - wholesale_price (nákupní cena za ks)
 * - base_rate (kolik procent diváků si chce koupit za standardní cenu)
 * - quality_mul (kolik satisfaction dá při vhodném poměru cena/kvalita)
 */

export type ProductKey = "sausage" | "beer" | "lemonade";

export interface ProductQualityTier {
  wholesalePrice: number;   // Kč/ks
  defaultSellPrice: number; // Kč/ks (typická doporučená cena)
  label: string;
}

export interface ProductCatalogEntry {
  key: ProductKey;
  label: string;
  /** Základní podíl diváků kteří si koupí při defaultSellPrice a průměrné spokojenosti */
  baseDemandRate: number;
  /** Cenová elasticita — čím vyšší, tím víc poptávka reaguje na cenu */
  priceElasticity: number;
  tiers: ProductQualityTier[]; // index 0-3, 0 = nenabízí se
}

/**
 * Pivo — nejvyšší demand, vyšší cenová elasticita (lidé rádi šetří), mocné pro satisfaction.
 * Klobása — střední demand, lidé jsou ochotní zaplatit víc za kvalitu.
 * Limonáda — nižší demand (děti, řidiči), menší elasticita.
 */
export const CONCESSION_CATALOG: Record<ProductKey, ProductCatalogEntry> = {
  sausage: {
    key: "sausage",
    label: "Klobása",
    baseDemandRate: 0.35,
    priceElasticity: 0.6,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 15, defaultSellPrice: 30, label: "Kostelecké uzeniny" },
      { wholesalePrice: 25, defaultSellPrice: 45, label: "Místní uzenářství" },
      { wholesalePrice: 40, defaultSellPrice: 65, label: "Premium farmářská" },
    ],
  },
  beer: {
    key: "beer",
    label: "Pivo",
    baseDemandRate: 0.55,
    priceElasticity: 0.8,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 14, defaultSellPrice: 25, label: "Měšťan 11" },
      { wholesalePrice: 20, defaultSellPrice: 35, label: "Kozel 11" },
      { wholesalePrice: 30, defaultSellPrice: 50, label: "Plzeň 12°" },
    ],
  },
  lemonade: {
    key: "lemonade",
    label: "Limonáda",
    baseDemandRate: 0.25,
    priceElasticity: 0.4,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 8, defaultSellPrice: 15, label: "Sirup s vodou" },
      { wholesalePrice: 14, defaultSellPrice: 25, label: "Kofola/Malinovka" },
      { wholesalePrice: 22, defaultSellPrice: 40, label: "Prémiová značka" },
    ],
  },
};

export const CONCESSION_PRODUCT_KEYS: ProductKey[] = ["sausage", "beer", "lemonade"];

export function getProductCatalog(key: string): ProductCatalogEntry | undefined {
  return CONCESSION_CATALOG[key as ProductKey];
}

export function getWholesalePrice(key: string, qualityLevel: number): number {
  const entry = getProductCatalog(key);
  if (!entry) return 0;
  const tier = entry.tiers[Math.max(0, Math.min(3, qualityLevel))];
  return tier?.wholesalePrice ?? 0;
}

export function getDefaultSellPrice(key: string, qualityLevel: number): number {
  const entry = getProductCatalog(key);
  if (!entry) return 0;
  const tier = entry.tiers[Math.max(0, Math.min(3, qualityLevel))];
  return tier?.defaultSellPrice ?? 0;
}
